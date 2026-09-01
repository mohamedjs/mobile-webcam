import { requireNativeModule } from 'expo-modules-core';
import type {
  Capabilities,
  Settings,
  SettingsPatch,
  Telemetry,
} from '@mobile-webcam/shared';

export interface StartServerResult {
  port: number;
  token: string;
}

export interface WebcamServerAPI {
  startServer(port: number, token: string): Promise<StartServerResult>;
  stopServer(): Promise<void>;
  isRunning(): boolean;

  getCapabilities(): Promise<Capabilities>;
  getSettings(): Promise<Settings>;
  /** Returns the FULL effective settings — the phone is the authority on what
   *  was actually applied. A requested 4K60 may come back as 4K30. */
  updateSettings(patch: SettingsPatch): Promise<Settings>;
  openSystemVideoEffects(): void;

  focusAt(x: number, y: number): Promise<void>;
  setLens(lensId: string): Promise<Capabilities>;
  getTelemetry(): Promise<Telemetry>;

  addListener(event: string, listener: (payload: never) => void): { remove(): void };
}

/**
 * The ONLY file allowed to touch the native module directly. Everything else
 * goes through the feature hooks.
 */
export const WebcamServer = requireNativeModule<WebcamServerAPI>('WebcamServer');
