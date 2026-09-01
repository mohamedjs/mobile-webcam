import type { Telemetry, ThermalState } from '@mobile-webcam/shared';

export interface WebcamServerEvents {
  onClientConnected: { clientId: string; profile: 'fmp4' | 'mjpeg' };
  onClientDisconnected: { clientId: string; reason: string };
  onTelemetry: Telemetry;
  onThermalStateChange: { state: ThermalState };
  onServerStateChange: { running: boolean; port: number | null };
  onError: { code: string; message: string; fatal: boolean };
}

export type WebcamServerEventName = keyof WebcamServerEvents;
