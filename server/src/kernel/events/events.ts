import type {
  Capabilities,
  MetricsSample,
  PipelineState,
  Settings,
} from '@mobile-webcam/shared';

/**
 * The exhaustive event union. Events are FACTS about things that already
 * happened — never commands. `device.connected` is a fact; "start streaming" is
 * a command and belongs in a direct interface call. See docs/04 §1 rule 5.
 */
export type AppEvent =
  | { type: 'device.connected'; udid: string; name: string; model: string; ios: string }
  | { type: 'device.disconnected'; udid: string }
  | { type: 'tunnel.opened'; localPort: number; devicePort: number }
  | { type: 'tunnel.closed'; reason: string }
  | { type: 'tunnel.failed'; error: string }
  | { type: 'phone.ready'; capabilities: Capabilities }
  | { type: 'phone.settings.changed'; settings: Settings }
  | { type: 'phone.protocol.mismatch'; expected: number; actual: number }
  | { type: 'video.device.ready'; path: string; label: string }
  | { type: 'video.device.lost'; path: string }
  | { type: 'audio.sink.ready'; sinkName: string; moduleId: number }
  | { type: 'audio.sink.lost'; sinkName: string }
  | { type: 'pipeline.state.changed'; from: PipelineState; to: PipelineState }
  | { type: 'pipeline.error'; code: string; message: string; fatal: boolean }
  | { type: 'telemetry.sample'; sample: MetricsSample }
  | { type: 'telemetry.degraded'; reason: 'thermal' | 'drops'; action: string };

export type AppEventType = AppEvent['type'];

export type EventOf<T extends AppEventType> = Extract<AppEvent, { type: T }>;
