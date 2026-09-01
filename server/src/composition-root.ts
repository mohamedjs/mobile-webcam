import { EventBus } from './kernel/events/EventBus.js';
import { createLogger, type Logger } from './kernel/logging/logger.js';
import { ShutdownCoordinator } from './kernel/process/shutdown.js';
import { ConfigModule, type AppConfig } from './modules/config/index.js';
import { DiscoveryModule } from './modules/discovery/index.js';
import { TunnelModule } from './modules/tunnel/index.js';
import { DeviceControlModule } from './modules/device-control/index.js';
import { VideoDeviceModule } from './modules/video-device/index.js';
import { AudioDeviceModule } from './modules/audio-device/index.js';
import { PipelineModule } from './modules/pipeline/index.js';
import { TelemetryModule } from './modules/telemetry/index.js';
import { ApiModule } from './modules/api/index.js';

export interface App {
  log: Logger;
  bus: EventBus;
  config: ConfigModule;
  discovery: DiscoveryModule;
  tunnel: TunnelModule;
  control: DeviceControlModule;
  video: VideoDeviceModule;
  audio: AudioDeviceModule;
  pipeline: PipelineModule;
  telemetry: TelemetryModule;
  api: ApiModule;
  shutdown: ShutdownCoordinator;
}

/**
 * The ONLY place modules are wired together. No DI container: for nine modules
 * a container is ceremony, and an explicit graph is greppable.
 */
export function buildApp(configModule: ConfigModule, config: AppConfig, log: Logger): App {
  const bus = new EventBus(log);
  const shutdown = new ShutdownCoordinator(log);

  const tunnel = new TunnelModule({ log, bus, config });
  const video = new VideoDeviceModule({ log, bus, config });
  const audio = new AudioDeviceModule({ log, bus, config });

  const control = new DeviceControlModule({
    log,
    bus,
    baseUrl: () => tunnel.baseUrl,
    token: () => configModule.current.token,
  });

  const pipeline = new PipelineModule({ log, bus, config, tunnel, control, video, audio });
  const telemetry = new TelemetryModule({ log, bus, control, pipeline });
  const discovery = new DiscoveryModule({ log, bus, config });

  const api = new ApiModule({
    log, bus,
    config: configModule,
    discovery, tunnel, control, video, audio, pipeline, telemetry,
  });

  return {
    log, bus, config: configModule,
    discovery, tunnel, control, video, audio, pipeline, telemetry, api, shutdown,
  };
}

export { createLogger };
