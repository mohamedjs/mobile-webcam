import type { MetricsSample, ThermalState } from '@mobile-webcam/shared';
import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import type { DeviceControlModule } from '../device-control/index.js';
import type { PipelineModule } from '../pipeline/index.js';

const MAX_SAMPLES = 300;
const SAMPLE_MS = 1000;
/** Consecutive bad samples before acting — one spike must not trigger degradation. */
const DEGRADE_AFTER = 5;

export class TelemetryModule {
  readonly #log: Logger;
  readonly #bus: EventBus;
  readonly #control: DeviceControlModule;
  readonly #pipeline: PipelineModule;

  readonly #samples: MetricsSample[] = [];
  #timer: NodeJS.Timeout | null = null;
  #badStreak = 0;
  #lastDropped = 0;

  constructor(deps: {
    log: Logger;
    bus: EventBus;
    control: DeviceControlModule;
    pipeline: PipelineModule;
  }) {
    this.#log = deps.log.child({ module: 'telemetry' });
    this.#bus = deps.bus;
    this.#control = deps.control;
    this.#pipeline = deps.pipeline;
  }

  get samples(): MetricsSample[] {
    return [...this.#samples];
  }

  get latest(): MetricsSample | null {
    return this.#samples.at(-1) ?? null;
  }

  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => void this.#collect(), SAMPLE_MS);
  }

  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = null;
    }
  }

  async #collect(): Promise<void> {
    if (this.#pipeline.state !== 'STREAMING') return;

    const ff = this.#pipeline.ffmpegStats;
    let thermalState: ThermalState = 'nominal';
    let battery: number | null = null;
    let droppedSegments = 0;

    try {
      const t = await this.#control.client.telemetry();
      thermalState = t.thermalState;
      battery = t.battery;
      droppedSegments = t.droppedSegments;
    } catch {
      // Phone telemetry is best-effort; ffmpeg stats alone are still useful.
    }

    const sample: MetricsSample = {
      at: Date.now(),
      fps: ff.fps,
      bitrate: ff.bitrateKbits * 1000,
      droppedFrames: ff.droppedFrames,
      droppedSegments,
      latencyMs: null,
      thermalState,
      battery,
    };

    this.#samples.push(sample);
    if (this.#samples.length > MAX_SAMPLES) this.#samples.shift();
    this.#bus.emit({ type: 'telemetry.sample', sample });

    await this.#evaluate(sample);
  }

  async #evaluate(sample: MetricsSample): Promise<void> {
    const thermal = sample.thermalState === 'serious' || sample.thermalState === 'critical';
    const newDrops = sample.droppedFrames - this.#lastDropped;
    this.#lastDropped = sample.droppedFrames;
    const dropping = newDrops > 5;

    if (!thermal && !dropping) {
      this.#badStreak = 0;
      return;
    }

    this.#badStreak += 1;
    if (this.#badStreak < DEGRADE_AFTER) return;

    this.#badStreak = 0;
    this.#log.warn({ thermal, newDrops }, 'sustained degradation');
    try {
      await this.#pipeline.degrade(thermal ? 'thermal' : 'drops');
    } catch (e) {
      this.#log.error({ err: e }, 'degrade failed');
    }
  }
}
