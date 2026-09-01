import {
  withInfoPlist,
  type ConfigPlugin,
} from 'expo/config-plugins';

/**
 * Adds the Info.plist keys the native module needs.
 *
 * NSLocalNetworkUsageDescription is REQUIRED even though this app only streams
 * over USB: binding a TCP listener with Network.framework triggers the Local
 * Network permission prompt. If it is denied, NWListener fails to bind while the
 * app still looks healthy, and the desktop sees only "connection reset by peer".
 * That exact failure is why this project exists. docs/02 §3.2.
 */
const withWebcamServer: ConfigPlugin = (config) =>
  withInfoPlist(config, (cfg) => {
    cfg.modResults['NSCameraUsageDescription'] ??=
      'mobile_webcam uses the camera to stream video to your computer over USB.';
    cfg.modResults['NSMicrophoneUsageDescription'] ??=
      'mobile_webcam uses the microphone to stream audio to your computer over USB.';
    cfg.modResults['NSLocalNetworkUsageDescription'] ??=
      'mobile_webcam runs a local server so your computer can read the camera over the USB cable.';

    const modes = new Set<string>(
      (cfg.modResults['UIBackgroundModes'] as string[] | undefined) ?? [],
    );
    // Buys real background time while an audio session is active. docs/05 §F12.
    modes.add('audio');
    cfg.modResults['UIBackgroundModes'] = [...modes];

    cfg.modResults['UIFileSharingEnabled'] = false;
    return cfg;
  });

export default withWebcamServer;
