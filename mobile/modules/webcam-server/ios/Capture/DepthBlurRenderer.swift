import Metal
import AVFoundation
import CoreImage
import Vision

/// Tiers 2 and 3 of Cinematic: background blur when native Cinematic is absent.
///
/// Metal-backed CIContext. Rendering in software cannot hold 1080p30.
final class DepthBlurRenderer {
  private let ciContext: CIContext
  private let requestHandler = VNSequenceRequestHandler()
  private var segmentationRequest: VNGeneratePersonSegmentationRequest = {
    let r = VNGeneratePersonSegmentationRequest()
    r.qualityLevel = .fast
    r.outputPixelFormat = kCVPixelFormatType_OneComponent8
    return r
  }()

  init() {
    if let device = MTLCreateSystemDefaultDevice() {
      ciContext = CIContext(mtlDevice: device, options: [.cacheIntermediates: false])
    } else {
      ciContext = CIContext(options: [.useSoftwareRenderer: false])
      Log.warn("no Metal device; blur will be slow")
    }
  }

  /// Tier 2 — blur driven by the dual camera's depth map.
  func renderWithDepth(
    image: CVPixelBuffer,
    depth: AVDepthData,
    intensity: Double
  ) -> CVPixelBuffer? {
    let source = CIImage(cvPixelBuffer: image)
    let converted = depth.converting(toDepthDataType: kCVPixelFormatType_DisparityFloat32)
    let depthImage = CIImage(cvPixelBuffer: converted.depthDataMap)
      .transformed(by: CGAffineTransform(
        scaleX: source.extent.width / CGFloat(CVPixelBufferGetWidth(converted.depthDataMap)),
        y: source.extent.height / CGFloat(CVPixelBufferGetHeight(converted.depthDataMap))))

    guard let filter = CIFilter(name: "CIMaskedVariableBlur") else { return nil }
    filter.setValue(source, forKey: kCIInputImageKey)
    filter.setValue(depthImage, forKey: "inputMask")
    filter.setValue(intensity * 20.0, forKey: kCIInputRadiusKey)

    return render(filter.outputImage, like: image)
  }

  /// Tier 3 — blur everything outside the person mask. Works on any device;
  /// edges around hair can artefact, and the UI says so.
  func renderWithSegmentation(image: CVPixelBuffer, intensity: Double) -> CVPixelBuffer? {
    do {
      try requestHandler.perform([segmentationRequest], on: image)
    } catch {
      Log.warn("segmentation failed: \(error.localizedDescription)")
      return nil
    }
    guard let mask = segmentationRequest.results?.first?.pixelBuffer else { return nil }

    let source = CIImage(cvPixelBuffer: image)
    var maskImage = CIImage(cvPixelBuffer: mask)
    maskImage = maskImage.transformed(by: CGAffineTransform(
      scaleX: source.extent.width / maskImage.extent.width,
      y: source.extent.height / maskImage.extent.height))

    let blurred = source.clampedToExtent()
      .applyingGaussianBlur(sigma: intensity * 25.0)
      .cropped(to: source.extent)

    guard let blend = CIFilter(name: "CIBlendWithMask") else { return nil }
    blend.setValue(source, forKey: kCIInputImageKey)
    blend.setValue(blurred, forKey: kCIInputBackgroundImageKey)
    blend.setValue(maskImage, forKey: kCIInputMaskImageKey)

    return render(blend.outputImage, like: image)
  }

  private var pixelBufferPool: CVPixelBufferPool?
  private var poolWidth: Int = 0
  private var poolHeight: Int = 0

  private func render(_ image: CIImage?, like template: CVPixelBuffer) -> CVPixelBuffer? {
    guard let image else { return nil }
    
    let width = CVPixelBufferGetWidth(template)
    let height = CVPixelBufferGetHeight(template)
    let format = CVPixelBufferGetPixelFormatType(template)

    if pixelBufferPool == nil || poolWidth != width || poolHeight != height {
      let poolAttributes: [String: Any] = [
        kCVPixelBufferPoolMinimumBufferCountKey as String: 3
      ]
      let bufferAttributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: format,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferIOSurfacePropertiesKey as String: [:]
      ]
      CVPixelBufferPoolCreate(kCFAllocatorDefault, poolAttributes as CFDictionary, bufferAttributes as CFDictionary, &pixelBufferPool)
      poolWidth = width
      poolHeight = height
    }

    guard let pool = pixelBufferPool else { return nil }
    var output: CVPixelBuffer?
    CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, pool, &output)
    
    guard let output else { return nil }
    ciContext.render(image, to: output)
    return output
  }
}
