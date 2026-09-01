import { createLogger } from './kernel/logging/logger.js';
import { ConfigModule } from './modules/config/index.js';
import { EventBus } from './kernel/events/EventBus.js';
import { buildApp } from './composition-root.js';

async function main(): Promise<void> {
  // Bootstrap logger before config is readable; replaced once the level is known.
  const bootLog = createLogger({ level: 'info', pretty: process.stdout.isTTY });
  const bootBus = new EventBus(bootLog);

  const configModule = new ConfigModule({ log: bootLog, bus: bootBus });
  const config = await configModule.load();

  const log = createLogger({ level: config.logLevel, pretty: process.stdout.isTTY });
  const app = buildApp(configModule, config, log);

  log.info(
    { video: app.video.path, sink: app.audio.sinkName, control: config.controlPort },
    'mobile_webcam starting',
  );

  // Create virtual devices BEFORE anything can consume them. Chrome enumerates
  // devices at page load, so they must exist before the user opens a tab.
  // docs/06 §5.2.
  if (!config.directMode) {
    try {
      await app.video.ensure();
    } catch (e) {
      log.error({ err: e }, 'video device unavailable — run: npm run setup:linux');
    }
    try {
      await app.audio.ensure();
    } catch (e) {
      log.error({ err: e }, 'audio sink unavailable — is PipeWire running?');
    }
  }

  await app.api.start(config.controlPort);
  app.telemetry.start();
  app.discovery.start();

  // Reverse of startup order.
  app.shutdown.register('api', () => app.api.stop());
  app.shutdown.register('telemetry', () => app.telemetry.stop());
  app.shutdown.register('discovery', () => app.discovery.stop());
  app.shutdown.register('pipeline', () => app.pipeline.shutdown());
  app.shutdown.register('tunnel', () => app.tunnel.close('shutdown'));
  // v4l2loopback is deliberately left loaded: unloading it while an application
  // holds the device wedges the kernel module. docs/04 §8.
  app.shutdown.register('audio', () => app.audio.release());
  app.shutdown.install();

  log.info(`control UI: http://127.0.0.1:${config.controlPort}`);
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
