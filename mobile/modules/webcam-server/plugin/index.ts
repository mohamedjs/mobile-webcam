import {
  withInfoPlist,
  withAndroidManifest,
  createRunOncePlugin,
  type ConfigPlugin,
} from 'expo/config-plugins';

/**
 * Adds Info.plist keys for iOS and AndroidManifest permissions/features for Android.
 *
 * NSLocalNetworkUsageDescription is REQUIRED on iOS: binding a TCP listener with
 * Network.framework triggers the Local Network permission prompt even over USB.
 */
const withWebcamServerPlugin: ConfigPlugin = (config) => {
  config = withInfoPlist(config, (cfg) => {
    cfg.modResults['NSCameraUsageDescription'] ??=
      'webcamo uses the camera to stream video to your computer over USB.';
    cfg.modResults['NSMicrophoneUsageDescription'] ??=
      'webcamo uses the microphone to stream audio to your computer over USB.';
    cfg.modResults['NSLocalNetworkUsageDescription'] ??=
      'webcamo runs a local server so your computer can read the camera over the USB cable.';

    const modes = new Set<string>(
      (cfg.modResults['UIBackgroundModes'] as string[] | undefined) ?? [],
    );
    modes.add('audio');
    cfg.modResults['UIBackgroundModes'] = [...modes];
    cfg.modResults['UIFileSharingEnabled'] = false;
    return cfg;
  });

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;

    const requiredPermissions = [
      'android.permission.CAMERA',
      'android.permission.RECORD_AUDIO',
      'android.permission.INTERNET',
      'android.permission.WAKE_LOCK',
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_CAMERA',
      'android.permission.FOREGROUND_SERVICE_MICROPHONE',
    ];

    manifest['uses-permission'] ??= [];
    for (const permission of requiredPermissions) {
      if (!manifest['uses-permission'].some((p) => p.$?.['android:name'] === permission)) {
        manifest['uses-permission'].push({
          $: { 'android:name': permission },
        });
      }
    }

    manifest['uses-feature'] ??= [];
    if (!manifest['uses-feature'].some((f) => f.$?.['android:name'] === 'android.hardware.camera')) {
      manifest['uses-feature'].push({
        $: {
          'android:name': 'android.hardware.camera',
          'android:required': 'true',
        },
      });
    }

    return cfg;
  });

  return config;
};

export default createRunOncePlugin(withWebcamServerPlugin, 'webcam-server', '1.0.0');
