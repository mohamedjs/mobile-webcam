package expo.modules.webcamserver.encoding

import java.io.ByteArrayOutputStream
import java.nio.ByteBuffer
import java.nio.charset.StandardCharsets

object Mp4BoxBuilder {

  fun buildBox(type: String, data: ByteArray): ByteArray {
    val size = 8 + data.size
    val buf = ByteBuffer.allocate(size)
    buf.putInt(size)
    buf.put(type.toByteArray(StandardCharsets.ISO_8859_1))
    buf.put(data)
    return buf.array()
  }

  fun buildFtyp(): ByteArray {
    val out = ByteArrayOutputStream()
    val buf = ByteBuffer.allocate(16)
    buf.put("isom".toByteArray(StandardCharsets.ISO_8859_1)) // major brand
    buf.putInt(512) // minor version
    buf.put("isom".toByteArray(StandardCharsets.ISO_8859_1)) // compatible brand 1
    buf.put("iso2".toByteArray(StandardCharsets.ISO_8859_1)) // compatible brand 2
    out.write(buf.array())
    return buildBox("ftyp", out.toByteArray())
  }

  fun buildAvcC(sps: ByteArray, pps: ByteArray): ByteArray {
    val size = 7 + sps.size + pps.size
    val buf = ByteBuffer.allocate(size)
    buf.put(0x01.toByte()) // configurationVersion
    buf.put(if (sps.size > 1) sps[1] else 0x42.toByte()) // AVCProfileIndication
    buf.put(if (sps.size > 2) sps[2] else 0x00.toByte()) // profile_compatibility
    buf.put(if (sps.size > 3) sps[3] else 0x1E.toByte()) // AVCLevelIndication
    buf.put(0xFF.toByte()) // lengthSizeMinusOne = 3 (4 bytes NAL length)
    buf.put(0xE1.toByte()) // numOfSequenceParameterSets = 1
    buf.putShort(sps.size.toShort())
    buf.put(sps)
    buf.put(0x01.toByte()) // numOfPictureParameterSets = 1
    buf.putShort(pps.size.toShort())
    buf.put(pps)
    return buildBox("avcC", buf.array())
  }

  fun buildEsds(audioSpecificConfig: ByteArray): ByteArray {
    val out = ByteArrayOutputStream()
    // ES_Descriptor tag 0x03
    val esd = ByteArrayOutputStream()
    esd.write(byteArrayOf(0x00, 0x01, 0x00)) // ES_ID=1, flags=0
    // DecoderConfigDescriptor tag 0x04
    val dcd = ByteArrayOutputStream()
    dcd.write(byteArrayOf(0x40.toByte())) // objectTypeIndication = Audio ISO/IEC 14496-3 (AAC)
    dcd.write(byteArrayOf(0x15.toByte())) // streamType = AudioStream
    dcd.write(byteArrayOf(0x00, 0x00, 0x00)) // bufferSizeDB (24-bit)
    dcd.write(byteArrayOf(0x00, 0x01, 0xF4.toByte(), 0x00)) // maxBitrate (128kbps)
    dcd.write(byteArrayOf(0x00, 0x01, 0xF4.toByte(), 0x00)) // avgBitrate (128kbps)
    // DecoderSpecificInfo tag 0x05
    dcd.write(0x05)
    dcd.write(audioSpecificConfig.size)
    dcd.write(audioSpecificConfig)

    val dcdBytes = dcd.toByteArray()
    esd.write(0x04)
    esd.write(dcdBytes.size)
    esd.write(dcdBytes)

    // SLConfigDescriptor tag 0x06
    esd.write(byteArrayOf(0x06, 0x01, 0x02))

    val esdBytes = esd.toByteArray()
    out.write(byteArrayOf(0x00, 0x00, 0x00, 0x00)) // version(0) + flags(0)
    out.write(0x03)
    out.write(esdBytes.size)
    out.write(esdBytes)
    return buildBox("esds", out.toByteArray())
  }

  fun buildInitSegment(
    width: Int,
    height: Int,
    sps: ByteArray,
    pps: ByteArray,
    audioConfig: ByteArray? = null
  ): ByteArray {
    val ftyp = buildFtyp()

    // mvhd
    val mvhdBuf = ByteBuffer.allocate(108)
    mvhdBuf.putInt(0) // version=0, flags=0
    mvhdBuf.putInt(0) // creation_time
    mvhdBuf.putInt(0) // modification_time
    mvhdBuf.putInt(1000) // timescale
    mvhdBuf.putInt(0) // duration
    mvhdBuf.putInt(0x00010000) // rate 1.0
    mvhdBuf.putShort(0x0100) // volume 1.0
    mvhdBuf.put(ByteArray(10)) // reserved
    // matrix
    mvhdBuf.putInt(0x00010000); mvhdBuf.putInt(0); mvhdBuf.putInt(0)
    mvhdBuf.putInt(0); mvhdBuf.putInt(0x00010000); mvhdBuf.putInt(0)
    mvhdBuf.putInt(0); mvhdBuf.putInt(0); mvhdBuf.putInt(0x40000000)
    mvhdBuf.put(ByteArray(24)) // pre-defined
    mvhdBuf.putInt(3) // next_track_ID
    val mvhd = buildBox("mvhd", mvhdBuf.array())

    // Video Track (trackId = 1)
    val tkhdBuf = ByteBuffer.allocate(92)
    tkhdBuf.putInt(0x00000007) // version=0, flags=track_enabled | in_movie | in_preview
    tkhdBuf.putInt(0); tkhdBuf.putInt(0) // creation/mod
    tkhdBuf.putInt(1) // track_ID = 1
    tkhdBuf.putInt(0) // reserved
    tkhdBuf.putInt(0) // duration
    tkhdBuf.put(ByteArray(8)) // reserved
    tkhdBuf.putShort(0); tkhdBuf.putShort(0) // layer, alt group
    tkhdBuf.putShort(0); tkhdBuf.putShort(0) // volume=0 (video)
    // matrix
    tkhdBuf.putInt(0x00010000); tkhdBuf.putInt(0); tkhdBuf.putInt(0)
    tkhdBuf.putInt(0); tkhdBuf.putInt(0x00010000); tkhdBuf.putInt(0)
    tkhdBuf.putInt(0); tkhdBuf.putInt(0); tkhdBuf.putInt(0x40000000)
    tkhdBuf.putInt(width shl 16)
    tkhdBuf.putInt(height shl 16)
    val tkhd = buildBox("tkhd", tkhdBuf.array())

    // mdhd (90000Hz video clock)
    val mdhdBuf = ByteBuffer.allocate(32)
    mdhdBuf.putInt(0)
    mdhdBuf.putInt(0); mdhdBuf.putInt(0)
    mdhdBuf.putInt(90000) // timescale
    mdhdBuf.putInt(0)
    mdhdBuf.putShort(0x55C4.toShort()) // lang "und"
    mdhdBuf.putShort(0)
    val mdhd = buildBox("mdhd", mdhdBuf.array())

    // hdlr
    val hdlrBuf = ByteBuffer.allocate(33)
    hdlrBuf.putInt(0)
    hdlrBuf.putInt(0) // pre-defined
    hdlrBuf.put("vide".toByteArray(StandardCharsets.ISO_8859_1))
    hdlrBuf.put(ByteArray(12)) // reserved
    hdlrBuf.put("VideoHandler\u0000".toByteArray(StandardCharsets.ISO_8859_1))
    val hdlr = buildBox("hdlr", hdlrBuf.array())

    // vmhd
    val vmhdBuf = ByteBuffer.allocate(12)
    vmhdBuf.putInt(0x00000001) // flags=1
    vmhdBuf.put(ByteArray(8))
    val vmhd = buildBox("vmhd", vmhdBuf.array())

    // dinf -> dref -> url
    val urlBox = buildBox("url ", byteArrayOf(0, 0, 0, 1)) // flags=1 (in same file)
    val drefBuf = ByteArrayOutputStream()
    drefBuf.write(byteArrayOf(0, 0, 0, 0)) // version/flags
    drefBuf.write(ByteBuffer.allocate(4).putInt(1).array()) // entry_count = 1
    drefBuf.write(urlBox)
    val dinf = buildBox("dinf", buildBox("dref", drefBuf.toByteArray()))

    // stbl -> stsd -> avc1 -> avcC
    val avc1Buf = ByteArrayOutputStream()
    val avc1Head = ByteBuffer.allocate(78)
    avc1Head.put(ByteArray(6)) // reserved
    avc1Head.putShort(1) // data_reference_index
    avc1Head.putShort(0); avc1Head.putShort(0) // pre_defined, reserved
    avc1Head.put(ByteArray(12)) // pre_defined
    avc1Head.putShort(width.toShort())
    avc1Head.putShort(height.toShort())
    avc1Head.putInt(0x00480000); avc1Head.putInt(0x00480000) // 72 dpi
    avc1Head.putInt(0) // reserved
    avc1Head.putShort(1) // frame_count
    avc1Head.put(ByteArray(32)) // compressorname
    avc1Head.putShort(0x0018) // depth = 24
    avc1Head.putShort(-1) // pre_defined = -1
    avc1Buf.write(avc1Head.array())
    avc1Buf.write(buildAvcC(sps, pps))
    val avc1 = buildBox("avc1", avc1Buf.toByteArray())

    val stsdBuf = ByteArrayOutputStream()
    stsdBuf.write(byteArrayOf(0, 0, 0, 0))
    stsdBuf.write(ByteBuffer.allocate(4).putInt(1).array())
    stsdBuf.write(avc1)
    val stsd = buildBox("stsd", stsdBuf.toByteArray())

    val stts = buildBox("stts", byteArrayOf(0, 0, 0, 0, 0, 0, 0, 0))
    val stsc = buildBox("stsc", byteArrayOf(0, 0, 0, 0, 0, 0, 0, 0))
    val stsz = buildBox("stsz", byteArrayOf(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0))
    val stco = buildBox("stco", byteArrayOf(0, 0, 0, 0, 0, 0, 0, 0))

    val stblOut = ByteArrayOutputStream()
    stblOut.write(stsd); stblOut.write(stts); stblOut.write(stsc); stblOut.write(stsz); stblOut.write(stco)
    val stbl = buildBox("stbl", stblOut.toByteArray())

    val minfOut = ByteArrayOutputStream()
    minfOut.write(vmhd); minfOut.write(dinf); minfOut.write(stbl)
    val minf = buildBox("minf", minfOut.toByteArray())

    val mdiaOut = ByteArrayOutputStream()
    mdiaOut.write(mdhd); mdiaOut.write(hdlr); mdiaOut.write(minf)
    val mdia = buildBox("mdia", mdiaOut.toByteArray())

    val trakOut = ByteArrayOutputStream()
    trakOut.write(tkhd); trakOut.write(mdia)
    val trak = buildBox("trak", trakOut.toByteArray())

    // mvex -> trex (track 1)
    val trexBuf = ByteBuffer.allocate(32)
    trexBuf.putInt(0) // version/flags
    trexBuf.putInt(1) // track_ID = 1
    trexBuf.putInt(1) // default_sample_description_index = 1
    trexBuf.putInt(3000) // default_sample_duration (for 30fps at 90k)
    trexBuf.putInt(0) // default_sample_size
    trexBuf.putInt(0x01010000) // default_sample_flags (depends_on=2, non_sync)
    val trex1 = buildBox("trex", trexBuf.array())

    val mvexOut = ByteArrayOutputStream()
    mvexOut.write(trex1)
    val mvex = buildBox("mvex", mvexOut.toByteArray())

    val moovOut = ByteArrayOutputStream()
    moovOut.write(mvhd)
    moovOut.write(trak)
    moovOut.write(mvex)
    val moov = buildBox("moov", moovOut.toByteArray())

    val initOut = ByteArrayOutputStream()
    initOut.write(ftyp)
    initOut.write(moov)
    return initOut.toByteArray()
  }

  fun buildMediaSegment(
    sequenceNumber: Int,
    baseDecodeTime: Long,
    samples: List<SampleInfo>,
    data: ByteArray
  ): ByteArray {
    // mfhd
    val mfhdBuf = ByteBuffer.allocate(8)
    mfhdBuf.putInt(0) // version=0, flags=0
    mfhdBuf.putInt(sequenceNumber)
    val mfhd = buildBox("mfhd", mfhdBuf.array())

    // tfhd
    val tfhdBuf = ByteBuffer.allocate(8)
    tfhdBuf.putInt(0x00020000) // default-base-is-moof
    tfhdBuf.putInt(1) // track_ID = 1
    val tfhd = buildBox("tfhd", tfhdBuf.array())

    // tfdt (version 1: 64-bit decode time)
    val tfdtBuf = ByteBuffer.allocate(12)
    tfdtBuf.putInt(0x01000000) // version 1
    tfdtBuf.putLong(baseDecodeTime)
    val tfdt = buildBox("tfdt", tfdtBuf.array())

    // trun
    // flags: data-offset-present(0x01) | sample-duration-present(0x100) | sample-size-present(0x200) | sample-flags-present(0x400)
    val trunFlags = 0x00000701
    val trunHeaderSize = 16
    val trunEntrySize = 12 // duration(4) + size(4) + flags(4)
    val trunSize = trunHeaderSize + samples.size * trunEntrySize

    // Predict total moof size to compute data-offset (moof.size + 8 bytes of mdat header)
    // We construct traf and moof with dummy offset, then fix up
    var dummyMoofSize = 8 + mfhd.size + 8 + tfhd.size + tfdt.size + 8 + trunSize
    val dataOffset = dummyMoofSize + 8

    val trunBuf = ByteBuffer.allocate(trunSize)
    trunBuf.putInt(trunFlags)
    trunBuf.putInt(samples.size)
    trunBuf.putInt(dataOffset)
    for (s in samples) {
      trunBuf.putInt(s.duration)
      trunBuf.putInt(s.size)
      trunBuf.putInt(if (s.isSync) 0x02000000 else 0x01010000)
    }
    val trun = buildBox("trun", trunBuf.array())

    val trafOut = ByteArrayOutputStream()
    trafOut.write(tfhd)
    trafOut.write(tfdt)
    trafOut.write(trun)
    val traf = buildBox("traf", trafOut.toByteArray())

    val moofOut = ByteArrayOutputStream()
    moofOut.write(mfhd)
    moofOut.write(traf)
    val moof = buildBox("moof", moofOut.toByteArray())

    val mdat = buildBox("mdat", data)

    val segmentOut = ByteArrayOutputStream()
    segmentOut.write(moof)
    segmentOut.write(mdat)
    return segmentOut.toByteArray()
  }

  data class SampleInfo(
    val size: Int,
    val duration: Int,
    val isSync: Boolean
  )
}
