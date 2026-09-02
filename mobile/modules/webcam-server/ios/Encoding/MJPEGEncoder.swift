import AVFoundation
import CoreImage
import UIKit

/// Fallback profile. Video only, no hardware encode, ~5x the bitrate.
///
/// Kept because it is the diagnostic path: if fMP4 fails in ffmpeg, MJPEG proves
/// whether the problem is the container or the transport. docs/01 §3.
final class MJPEGEncoder {
  private let ciContext = CIContext(options: [.useSoftwareRenderer: false])
  private let quality: CGFloat = 0.7

  func encode(_ pixelBuffer: CVPixelBuffer, mirror: Bool) -> Data? {
    var image = CIImage(cvPixelBuffer: pixelBuffer)
    if mirror {
      image = image.transformed(by: CGAffineTransform(scaleX: -1, y: 1))
        .transformed(by: CGAffineTransform(translationX: image.extent.width, y: 0))
    }
    guard let cg = ciContext.createCGImage(image, from: image.extent) else { return nil }
    return UIImage(cgImage: cg).jpegData(compressionQuality: quality)
  }

  static let boundary = "mobilewebcamframe"

  static func partHeader(length: Int) -> Data {
    "--\(boundary)\r\nContent-Type: image/jpeg\r\nContent-Length: \(length)\r\n\r\n"
      .data(using: .utf8) ?? Data()
  }
}
