import type {
  Capabilities,
  Health,
  Settings,
  SettingsPatch,
  Telemetry,
} from '@mobile-webcam/shared';

/** The phone as seen from the desktop. The desktop always dials; docs/01 §2. */
export interface PhoneClient {
  health(): Promise<Health>;
  capabilities(): Promise<Capabilities>;
  settings(): Promise<Settings>;
  patchSettings(patch: SettingsPatch): Promise<Settings>;
  telemetry(): Promise<Telemetry>;
  focusAt(x: number, y: number): Promise<void>;
  switchCamera(lens: string): Promise<Capabilities>;
}
