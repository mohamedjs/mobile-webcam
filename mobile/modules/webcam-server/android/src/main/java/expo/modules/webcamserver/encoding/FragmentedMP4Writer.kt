package expo.modules.webcamserver.encoding

import android.media.MediaCodec
import android.media.MediaFormat
import android.view.Surface
import expo.modules.webcamserver.support.AudioSettings
import expo.modules.webcamserver.support.Log
import expo.modules.webcamserver.support.Telemetry
import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer

interface FragmentedMP4WriterDelegate {
  fun onSegmentProduced(writer: FragmentedMP4Writer, data: ByteArray, isInitializationSegment: Boolean)
  fun onWriterFailed(writer: FragmentedMP4Writer, error: Exception)
}

/**
 * H.264 MediaCodec encoder -> fragmented MP4 (video only; audio is not
 * implemented on Android and any audio settings are ignored).
 *
 * Every start() creates a new [EncodeSession] with its own drain thread. A
 * drain loop only ever looks at its own session's `active` flag, so a loop
 * from a previous start can never keep running (or block the new one) after a
 * restart. stop() signals the loop and waits for it to exit before the codec
 * is stopped and released.
 */
class FragmentedMP4Writer {
  var delegate: FragmentedMP4WriterDelegate? = null

  @Volatile
  var initializationSegment: ByteArray? = null
    private set

  private val lock = Any()
  private var session: EncodeSession? = null
  private var generation = 0

  val isRunning: Boolean
    get() = synchronized(lock) { session?.active == true }

  fun getInputSurface(): Surface? = synchronized(lock) { session?.surface }

  private class EncodeSession(
    val generation: Int,
    val codec: MediaCodec,
    val surface: Surface,
    val width: Int,
    val height: Int,
    val fps: Int
  ) {
    @Volatile var active = true
    var thread: Thread? = null

    // Drain-thread-only state.
    var initSent = false
    var sawKeyFrame = false
    var sequenceNumber = 1
    var firstPtsUs = -1L
    var lastDecodeTime90k = -1L
    var lastPtsUs = -1L
    var lastDuration90k = 0
  }

  @Suppress("UNUSED_PARAMETER")
  fun start(
    width: Int,
    height: Int,
    fps: Int,
    bitrate: Int,
    audioSettings: AudioSettings? = null
  ): Surface {
    stop()
    var codec: MediaCodec? = null
    var surface: Surface? = null
    try {
      val format = EncoderSettings.videoFormat(width, height, fps, bitrate)
      val c = MediaCodec.createEncoderByType(EncoderSettings.MIME_VIDEO)
      codec = c
      c.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE)
      val s = c.createInputSurface()
      surface = s
      c.start()

      val gen: Int
      synchronized(lock) {
        generation += 1
        gen = generation
      }
      val es = EncodeSession(gen, c, s, width, height, if (fps > 0) fps else 30)
      val t = Thread({ drainLoop(es) }, "WebcamoEncoderDrain-$gen")
      es.thread = t
      synchronized(lock) { session = es }
      t.start()

      Log.info("FragmentedMP4Writer started for ${width}x${height}@$fps (gen $gen)")
      return s
    } catch (e: Exception) {
      Log.error("FragmentedMP4Writer start failed: ${e.message}")
      try { codec?.release() } catch (_: Exception) {}
      try { surface?.release() } catch (_: Exception) {}
      synchronized(lock) { session = null }
      throw e
    }
  }

  fun stop() {
    val es = synchronized(lock) {
      val current = session
      session = null
      current
    }
    initializationSegment = null
    if (es == null) return

    es.active = false
    val t = es.thread
    if (t != null && t !== Thread.currentThread()) {
      try {
        t.join(1000)
      } catch (_: InterruptedException) {
        Thread.currentThread().interrupt()
      }
      if (t.isAlive) Log.warn("encoder drain loop (gen ${es.generation}) did not exit within 1s")
    }
    try { es.codec.stop() } catch (_: Exception) {}
    try { es.codec.release() } catch (_: Exception) {}
    try { es.surface.release() } catch (_: Exception) {}
  }

  // MARK: - Drain loop

  private fun drainLoop(es: EncodeSession) {
    val info = MediaCodec.BufferInfo()
    while (es.active) {
      try {
        val index = es.codec.dequeueOutputBuffer(info, 10_000)
        if (!es.active) {
          if (index >= 0) {
            try { es.codec.releaseOutputBuffer(index, false) } catch (_: Exception) {}
          }
          break
        }
        when {
          index >= 0 -> {
            val buffer = es.codec.getOutputBuffer(index)
            if (buffer != null && info.size > 0) {
              val isConfig = (info.flags and MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0
              val isKey = (info.flags and MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0
              val data = ByteArray(info.size)
              buffer.position(info.offset)
              buffer.limit(info.offset + info.size)
              buffer.get(data)
              if (isConfig) {
                handleConfig(es, data)
              } else {
                handleMediaSample(es, data, info.presentationTimeUs, isKey)
              }
            }
            es.codec.releaseOutputBuffer(index, false)
            if ((info.flags and MediaCodec.BUFFER_FLAG_END_OF_STREAM) != 0) break
          }
          index == MediaCodec.INFO_OUTPUT_FORMAT_CHANGED -> {
            extractSpsPpsFromFormat(es, es.codec.outputFormat)
          }
          else -> { /* INFO_TRY_AGAIN_LATER / INFO_OUTPUT_BUFFERS_CHANGED */ }
        }
      } catch (e: Exception) {
        if (!es.active) break
        // The codec is broken (not just stopped by us): report and exit; never spin.
        Log.error("encoder drain failed: ${e.message}")
        es.active = false
        delegate?.onWriterFailed(this, e)
        break
      }
    }
    Log.debug("encoder drain loop exited (gen ${es.generation})")
  }

  private fun isCurrent(es: EncodeSession): Boolean = es.active && synchronized(lock) { session === es }

  // MARK: - Codec config (SPS/PPS)

  private fun extractSpsPpsFromFormat(es: EncodeSession, format: MediaFormat) {
    val csd0 = format.getByteBuffer("csd-0") ?: return
    val csd1 = format.getByteBuffer("csd-1")
    val bytes = ByteArrayOutputStream()
    bytes.write(bufferBytes(csd0))
    if (csd1 != null) bytes.write(bufferBytes(csd1))
    handleConfig(es, bytes.toByteArray())
  }

  private fun bufferBytes(buf: ByteBuffer): ByteArray {
    val dup = buf.duplicate()
    val out = ByteArray(dup.remaining())
    dup.get(out)
    return out
  }

  /** Accepts Annex-B or AVCC-ish config data; finds the first SPS (7) and PPS (8). */
  private fun handleConfig(es: EncodeSession, data: ByteArray) {
    var sps: ByteArray? = null
    var pps: ByteArray? = null
    val nals = splitAnnexB(data)
    if (nals != null) {
      for (r in nals) {
        if (r[1] <= r[0]) continue
        when (data[r[0]].toInt() and 0x1f) {
          7 -> if (sps == null) sps = data.copyOfRange(r[0], r[1])
          8 -> if (pps == null) pps = data.copyOfRange(r[0], r[1])
        }
      }
    }
    if (sps != null && pps != null) onSpsPpsFound(es, sps, pps)
  }

  private fun onSpsPpsFound(es: EncodeSession, sps: ByteArray, pps: ByteArray) {
    if (es.initSent || !isCurrent(es)) return
    val initSeg = Mp4BoxBuilder.buildInitSegment(es.width, es.height, sps, pps)
    es.initSent = true
    initializationSegment = initSeg
    delegate?.onSegmentProduced(this, initSeg, isInitializationSegment = true)
  }

  // MARK: - Samples

  private fun handleMediaSample(es: EncodeSession, data: ByteArray, ptsUs: Long, isKey: Boolean) {
    val nals = splitAnnexB(data)
    val avcc: ByteArray
    if (nals == null) {
      // Already length-prefixed (AVCC): pass through untouched.
      avcc = data
    } else {
      val out = ByteArrayOutputStream(data.size + 16)
      var sps: ByteArray? = null
      var pps: ByteArray? = null
      for (r in nals) {
        val len = r[1] - r[0]
        if (len <= 0) continue
        when (data[r[0]].toInt() and 0x1f) {
          7 -> { if (sps == null) sps = data.copyOfRange(r[0], r[1]) }
          8 -> { if (pps == null) pps = data.copyOfRange(r[0], r[1]) }
          9 -> {}
          else -> {
            out.write((len ushr 24) and 0xff)
            out.write((len ushr 16) and 0xff)
            out.write((len ushr 8) and 0xff)
            out.write(len and 0xff)
            out.write(data, r[0], len)
          }
        }
      }
      // Some encoders only send SPS/PPS in-band with the first IDR.
      if (!es.initSent && sps != null && pps != null) onSpsPpsFound(es, sps, pps)
      avcc = out.toByteArray()
    }

    if (avcc.isEmpty() || !es.initSent || !isCurrent(es)) return
    if (!es.sawKeyFrame) {
      if (!isKey) return // a decoder needs to start on an IDR
      es.sawKeyFrame = true
    }

    // Real timestamps on a 90 kHz clock, decode time kept strictly monotonic.
    val defaultDuration = 90_000 / es.fps
    if (es.firstPtsUs < 0) es.firstPtsUs = ptsUs
    var decodeTime = (ptsUs - es.firstPtsUs) * 9 / 100
    if (es.lastDecodeTime90k >= 0 && decodeTime <= es.lastDecodeTime90k) {
      decodeTime = es.lastDecodeTime90k + 1
    }
    // The duration of this frame is not known until the next one arrives, so
    // use the previous inter-frame delta (sane-clamped) as the estimate.
    val duration = if (es.lastPtsUs >= 0 && ptsUs > es.lastPtsUs) {
      val delta = ((ptsUs - es.lastPtsUs) * 9 / 100).toInt()
      if (delta in 1..(defaultDuration * 4)) delta else defaultDuration
    } else if (es.lastDuration90k > 0) {
      es.lastDuration90k
    } else {
      defaultDuration
    }
    es.lastPtsUs = ptsUs
    es.lastDecodeTime90k = decodeTime
    es.lastDuration90k = duration

    // One fragment per frame (lowest latency, matches iOS).
    val segment = Mp4BoxBuilder.buildMediaSegment(
      sequenceNumber = es.sequenceNumber++,
      baseDecodeTime = decodeTime,
      samples = listOf(Mp4BoxBuilder.SampleInfo(avcc.size, duration, isKey)),
      data = avcc
    )
    Telemetry.shared.recordFrame(segment.size)
    delegate?.onSegmentProduced(this, segment, isInitializationSegment = false)
  }

  companion object {
    /**
     * Splits Annex-B data on every 3- or 4-byte start code. Returns a list of
     * [payloadStart, payloadEnd) pairs, or null when the data does not start
     * with a start code (i.e. it is already length-prefixed).
     */
    fun splitAnnexB(d: ByteArray): List<IntArray>? {
      val n = d.size
      // Locate start codes: (prefixBegin, payloadStart).
      val codes = ArrayList<IntArray>()
      var i = 0
      while (i + 2 < n) {
        if (d[i].toInt() == 0 && d[i + 1].toInt() == 0 && d[i + 2].toInt() == 1) {
          var begin = i
          val floor = if (codes.isEmpty()) 0 else codes[codes.size - 1][1]
          while (begin > floor && d[begin - 1].toInt() == 0) begin--
          codes.add(intArrayOf(begin, i + 3))
          i += 3
        } else {
          i++
        }
      }
      if (codes.isEmpty() || codes[0][0] != 0) return null
      val out = ArrayList<IntArray>(codes.size)
      for (k in codes.indices) {
        val start = codes[k][1]
        val end = if (k + 1 < codes.size) codes[k + 1][0] else n
        if (end > start) out.add(intArrayOf(start, end))
      }
      return out
    }
  }
}
