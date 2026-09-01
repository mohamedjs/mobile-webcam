import { requireNativeViewManager } from 'expo-modules-core';
import type { ViewProps } from 'react-native';

export interface WebcamPreviewProps extends ViewProps {
  /** 'fill' crops to the view, 'fit' letterboxes. */
  resizeMode?: 'fill' | 'fit';
}

// The view is registered by `View(WebcamPreviewView.self)` INSIDE the module
// definition, so it is looked up under the MODULE's name — `Name("WebcamServer")`
// — not under the Swift class name. Asking for 'WebcamPreview' throws
// "view manager not found" at runtime. See docs/09 §4.
const NativeView = requireNativeViewManager<WebcamPreviewProps>('WebcamServer');

/** AVCaptureVideoPreviewLayer wrapped as an ExpoView. Never touches JS frames. */
export function WebcamPreview(props: WebcamPreviewProps) {
  return <NativeView resizeMode="fill" {...props} />;
}
