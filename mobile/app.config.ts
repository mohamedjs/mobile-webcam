import type { ExpoConfig } from 'expo/config';

/**
 * NOTE: this app CANNOT run in Expo Go. It opens a listening TCP socket and
 * drives AVCaptureSession through custom Swift — both need native code.
 * Use `expo prebuild` + an EAS development build. docs/00 §5 C2.
 */
const config: ExpoConfig = {
  name: 'webcamo',
  slug: 'webcamo',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'mobilewebcam',
  userInterfaceStyle: 'dark',
  // New Architecture is the default in SDK 56 — no legacy bridge fallback exists.
  ios: {
    bundleIdentifier: 'com.mobilewebcam.app',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'mobile_webcam uses the camera to stream video to your computer over USB.',
      NSMicrophoneUsageDescription:
        'mobile_webcam uses the microphone to stream audio to your computer over USB.',
      // Required even over USB: binding a TCP listener triggers the Local Network
      // prompt, and denying it makes the server silently fail to bind. docs/02 §3.2.
      NSLocalNetworkUsageDescription:
        'mobile_webcam runs a local server so your computer can read the camera over the USB cable.',
      UIBackgroundModes: ['audio'],
      UIFileSharingEnabled: false,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    ['expo-build-properties', { ios: { deploymentTarget: '16.4' } }],
    './modules/webcam-server/plugin',
    'expo-router',
    'expo-secure-store',
  ],
  experiments: { typedRoutes: true },
};

export default config;
