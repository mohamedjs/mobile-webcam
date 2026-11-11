import type { ExpoConfig } from 'expo/config';

/**
 * NOTE: this app CANNOT run in Expo Go. It opens a listening TCP socket and
 * drives camera and audio through custom native modules (Swift on iOS, Kotlin on Android).
 * Use `expo prebuild` + an EAS/native development build.
 */
const config: ExpoConfig = {
  name: 'webcamo',
  slug: 'webcamo',
  version: '1.0.0',
  orientation: 'portrait',
  icon: './assets/images/icon.png',
  scheme: 'mobilewebcam',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.mobilewebcam.app',
    supportsTablet: true,
    infoPlist: {
      NSCameraUsageDescription:
        'webcamo uses the camera to stream video to your computer over USB.',
      NSMicrophoneUsageDescription:
        'webcamo uses the microphone to stream audio to your computer over USB.',
      NSLocalNetworkUsageDescription:
        'webcamo runs a local server so your computer can read the camera over the USB cable.',
      UIBackgroundModes: ['audio'],
      UIFileSharingEnabled: false,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  android: {
    package: 'com.mobilewebcam.app',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.INTERNET',
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ],
  },
  plugins: [
    [
      'expo-build-properties',
      {
        ios: { deploymentTarget: '16.4' },
        // compileSdk / targetSdk come from React Native's defaults (37 / 36).
        // Pinning them lower breaks AAR metadata checks for current libraries
        // (react-native-screens) and falls behind Play's target-API rule.
        android: {
          minSdkVersion: 26,
        },
      },
    ],
    './modules/webcam-server/plugin',
    'expo-router',
    'expo-secure-store',
  ],
  experiments: { typedRoutes: true },
};

export default config;
