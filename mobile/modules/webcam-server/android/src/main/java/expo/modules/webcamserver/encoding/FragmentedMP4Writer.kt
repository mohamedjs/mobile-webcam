package expo.modules.webcamserver.encoding

import android.media.MediaCodec
import android.media.MediaFormat
import android.view.Surface
import expo.modules.webcamserver.support.AudioSettings
import expo.modules.webcamserver.support.Log
import expo.modules.webcamserver.support.Telemetry
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.util.concurrent.Executors

interface FragmentedMP4WriterDelegate {
  fun onSegmentProduced(writer: FragmentedMP4Writer, data: ByteArray, isInitializationSegment: Boolean)
  fun onWriterFailed(writer: FragmentedMP4Writer, error: Exception)
}

class FragmentedMP4Writer {
  var delegate: FragmentedMP4WriterDelegate? = null
  private var videoCodec: MediaCodec? = null
  private var inputSurface: Surface? = null
  private val executor = Executors.newSingleThreadExecutor()

  var initializationSegment: ByteArray? = null
    private set

  private var sequenceNumber = 1
  private var baseDecodeTime = 0L
  private var running = false
  private var sps: ByteArray? = null
  private var pps: ByteArray? = null
  private var initSent = false

  private val sampleList = mutableListOf<Mp4BoxBuilder.SampleInfo>()
  private val mdatStream = ByteArrayOutputStream()

  val isRunning: Boolean
    get() = running

  fun getInputSurface(): Surface? = inputSurface

  fun start(
    width: Int,
    height: Int,
    fps: Int,
    bitrate: Int,
    audioSettings: AudioSettings? = null
  ): Surface {
    stop()
    try {
      val format = EncoderSettings.videoFormat(width, height, fps, bitrate)
      val codec = MediaCodec.createEncoderByType(EncoderSettings.MIME_VIDEO)
      codec.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      val surface = codec.createInputSurface()
      codec.start()

      videoCodec = codec
      inputSurface = surface
      running = true
      sequenceNumber = 1
      baseDecodeTime = 0L
      initSent = false
      sps = null
      pps = null
      sampleList.clear()
      mdatStream.reset()

      startDrainLoop(codec, fps)
      Log.info("FragmentedMP4Writer started for ${width}x${height}@$fps")
      return surface
    } catch (e: Exception) {
      Log.error("FragmentedMP4Writer start failed: ${e.message}")
      stop()
      throw e
    }
  }

  fun stop() {
    running = false
    try {
      videoCodec?.stop()
      videoCodec?.release()
    } catch (_: Exception) {}
    videoCodec = null
    try {
      inputSurface?.release()
    } catch (_: Exception) {}
    inputSurface = null
    initializationSegment = null
  }

  private fun startDrainLoop(codec: MediaCodec, fps: Int) {
    executor.submit {
      val bufferInfo = MediaCodec.BufferInfo()
      val sampleDuration90k = 90000 / (if (fps > 0) fps else 30)

      while (running) {
        try {
          val outputIndex = codec.dequeueOutputBuffer(bufferInfo, 10000)
          if (outputIndex >= 0) {
            val outputBuffer = codec.getOutputBuffer(outputIndex)
            if (outputBuffer != null && bufferInfo.size > 0) {
              val isConfig = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
              val isKey = (bufferInfo.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0

              if (isConfig) {
                extractSpsPps(outputBuffer, bufferInfo)
              } else {
                handleMediaSample(outputBuffer, bufferInfo, isKey, sampleDuration90k)
              }
            }
            codec.releaseOutputBuffer(outputIndex, false)
          } else if (outputIndex == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
            val newFormat = codec.outputFormat
            extractSpsPpsFromFormat(newFormat)
          }
        } catch (_: Exception) {
          if (!running) break
        }
      }
    }
  }

  private fun extractSpsPpsFromFormat(format: MediaFormat) {
    val spsBuf = format.getByteBuffer("csd-0")
    val ppsBuf = format.getByteBuffer("csd-1")
    if (spsBuf != null && ppsBuf != null) {
      val spsBytes = ByteArray(spsBuf.remaining())
      spsBuf.get(spsBytes)
      val ppsBytes = ByteArray(ppsBuf.remaining())
      ppsBuf.get(ppsBytes)
      onSpsPpsFound(spsBytes, ppsBytes)
    }
  }

  private fun extractSpsPps(buffer: ByteBuffer, info: MediaCodec.BufferInfo) {
    buffer.position(info.offset)
    buffer.limit(info.offset + info.size)
    val raw = ByteArray(info.size)
    buffer.get(raw)

    // Parse Annex B start codes 0x00000001
    val startCodes = mutableListOf<Int>()
    for (i in 0 until raw.size - 3) {
      if (raw[i] == 0.toByte() && raw[i + 1] == 0.toByte() &&
        raw[i + 2] == 0.toByte() && raw[i + 3] == 1.toByte()
      ) {
        startCodes.add(i)
      }
    }

    if (startCodes.size >= 2) {
      val spsStart = startCodes[0] + 4
      val spsEnd = startCodes[1]
      val ppsStart = startCodes[1] + 4
      val ppsEnd = raw.size
      val spsData = raw.copyOfRange(spsStart, spsEnd)
      val ppsData = raw.copyOfRange(ppsStart, ppsEnd)
      onSpsPpsFound(spsData, ppsData)
    }
  }

  private fun onSpsPpsFound(spsData: ByteArray, ppsData: ByteArray) {
    if (initSent) return
    sps = spsData
    pps = ppsData
    val width = videoCodec?.outputFormat?.getInteger(MediaFormat.KEY_WIDTH) ?: 1920
    val height = videoCodec?.outputFormat?.getInteger(MediaFormat.KEY_HEIGHT) ?: 1080
    val initSeg = Mp4BoxBuilder.buildInitSegment(width, height, spsData, ppsData)
    initializationSegment = initSeg
    initSent = true
    delegate?.onSegmentProduced(this, initSeg, isInitializationSegment = true)
  }

  private fun handleMediaSample(
    buffer: ByteBuffer,
    info: MediaCodec.BufferInfo,
    isKey: Boolean,
    sampleDuration: Int
  ) {
    buffer.position(info.offset)
    buffer.limit(info.offset + info.size)
    val data = ByteArray(info.size)
    buffer.get(data)

    // Convert Annex B (0x00000001) to AVCC length-prefixed NALUs
    var naluData = data
    if (data.size >= 4 && data[0] == 0.toByte() && data[1] == 0.toByte() &&
      data[2] == 0.toByte() && data[3] == 1.toByte()
    ) {
      val naluLen = data.size - 4
      data[0] = (naluLen shr 24).toByte()
      data[1] = (naluLen shr 16).toByte()
      data[2] = (naluLen shr 8).toByte()
      data[3] = naluLen.toByte()
      naluData = data
    }

    sampleList.add(Mp4BoxBuilder.SampleInfo(naluData.size, sampleDuration, isKey))
    mdatStream.write(naluData)

    // Flush segment every 6 samples (~200ms at 30fps) or on keyframe
    if (sampleList.size >= 6 || (isKey && sampleList.size > 1)) {
      flushSegment()
    }
  }

  private fun flushSegment() {
    if (sampleList.isEmpty() || !initSent) return
    val mdatBytes = mdatStream.toByteArray()
    val segment = Mp4BoxBuilder.buildMediaSegment(
      sequenceNumber = sequenceNumber++,
      baseDecodeTime = baseDecodeTime,
      samples = ArrayList(sampleList),
      data = mdatBytes
    )

    baseDecodeTime += sampleList.sumOf { it.duration.toLong() }
    sampleList.clear()
    mdatStream.reset()

    Telemetry.shared.recordFrame(segment.size)
    delegate?.onSegmentProduced(this, segment, isInitializationSegment = false)
  }
}
