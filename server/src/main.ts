import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import { createLogger } from './kernel/logging/logger.js';
import { ConfigModule } from './modules/config/index.js';
import { EventBus } from './kernel/events/EventBus.js';
import { buildApp } from './composition-root.js';
import { NativeWindowLauncher } from './modules/window/infrastructure/NativeWindowLauncher.js';

const run = promisify(execFile);

const WEBCAMO_VERSION = '0.1.0';

async function getVersion(): Promise<string> {
  return process.env.WEBCAMO_VERSION ?? WEBCAMO_VERSION;
}

async function isDaemonRunning(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const req = http.get(`http://127.0.0.1:${port}/api/status`, { timeout: 1500 }, (res) => {
      resolve(res.statusCode === 200);
      res.resume();
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function runDoctor(controlPort: number): Promise<void> {
  console.log('webcamo doctor');
  console.log('==============');
  let pass = 0;
  let fail = 0;

  const ok = (msg: string) => { console.log(`\x1b[32m[PASS]\x1b[0m ${msg}`); pass++; };
  const bad = (msg: string, hint: string) => {
    console.log(`\x1b[31m[FAIL]\x1b[0m ${msg}`);
    console.log(`       → ${hint}`);
    fail++;
  };
  const info = (msg: string) => { console.log(`\x1b[33m[INFO]\x1b[0m ${msg}`); };

  // 1. ffmpeg
  try {
    await run('ffmpeg', ['-version'], { timeout: 3000 });
    ok('ffmpeg installed');
  } catch {
    bad('ffmpeg not found', 'Install ffmpeg (apt install ffmpeg / brew install ffmpeg / choco install ffmpeg)');
  }

  // 2. iOS iproxy
  try {
    await run('iproxy', ['--version'], { timeout: 3000 });
    ok('iproxy installed (iOS USB tunnel)');
  } catch {
    info('iproxy not found (optional if only using Android: apt install libusbmuxd-tools / brew install libimobiledevice)');
  }

  // 3. Android adb
  try {
    await run('adb', ['version'], { timeout: 3000 });
    ok('adb installed (Android USB tunnel)');
  } catch {
    info('adb not found (optional if only using iOS: apt install adb / brew install android-platform-tools)');
  }

  // 4. Platform virtual camera & audio
  if (process.platform === 'linux') {
    try {
      const { stdout } = await run('lsmod', [], { timeout: 3000 });
      if (stdout.includes('v4l2loopback')) {
        ok('v4l2loopback module loaded');
      } else {
        bad('v4l2loopback not loaded', 'Run: npm run setup:linux or sudo modprobe v4l2loopback');
      }
    } catch {
      bad('Could not inspect kernel modules', 'Ensure /proc/modules is readable');
    }

    try {
      const { stdout } = await run('pactl', ['list', 'short', 'sinks'], { timeout: 3000 });
      if (stdout.includes('mobile_webcam')) {
        ok('PipeWire null sink "mobile_webcam_mic" present');
      } else {
        info('PipeWire null sink will be auto-created at server launch');
      }
    } catch {
      bad('pactl not working', 'Ensure PipeWire / PulseAudio is running: pactl info');
    }
  } else if (process.platform === 'darwin') {
    info('macOS virtual camera: OBS Virtual Camera or WebcamoExtension supported');
  } else if (process.platform === 'win32') {
    info('Windows virtual camera: OBS Virtual Camera or DirectShow supported');
  }

  // 5. Desktop window browser
  const launcher = new NativeWindowLauncher({ log: createLogger({ level: 'silent', pretty: false }) });
  const chromium = launcher.findChromium();
  if (chromium) {
    ok(`Chromium app window runtime found: ${chromium}`);
  } else {
    info('No dedicated Chromium runtime found; will fallback to default browser');
  }

  // 6. Check running daemon
  const running = await isDaemonRunning(controlPort);
  if (running) {
    ok(`Webcamo daemon is actively running on 127.0.0.1:${controlPort}`);
  } else {
    info(`No daemon currently running on 127.0.0.1:${controlPort} (run: webcamo run)`);
  }

  console.log('==============');
  console.log(`${pass} passed, ${fail} failed`);
  if (fail > 0) process.exit(1);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--version') || args.includes('-v')) {
    const version = await getVersion();
    console.log(version);
    process.exit(0);
  }

  // Bootstrap logger before config is readable
  const bootLog = createLogger({ level: 'info', pretty: process.stdout.isTTY });
  const bootBus = new EventBus(bootLog);

  const configModule = new ConfigModule({ log: bootLog, bus: bootBus });
  const config = await configModule.load();

  const command = args.find((a) => !a.startsWith('-')) ?? 'run';

  if (command === 'doctor') {
    await runDoctor(config.controlPort);
    process.exit(0);
  }

  const controlUrl = `http://127.0.0.1:${config.controlPort}`;
  const noWindow = args.includes('--no-window') || args.includes('--headless') || process.env.NODE_ENV === 'test';

  if (command === 'dashboard' || command === 'window' || command === 'run') {
    const running = await isDaemonRunning(config.controlPort);
    if (running) {
      if (!noWindow) {
        bootLog.info({ url: controlUrl }, 'Webcamo daemon already active; opening desktop window');
        const launcher = new NativeWindowLauncher({ log: bootLog });
        await launcher.openAppWindowOrBrowser(controlUrl);
      } else {
        bootLog.info({ url: controlUrl }, 'Webcamo daemon already active');
      }
      return;
    }
    if (!noWindow) {
      bootLog.info({ url: controlUrl }, 'Starting Webcamo daemon and opening desktop window');
    }
  }

  const log = createLogger({ level: config.logLevel, pretty: process.stdout.isTTY });
  const app = buildApp(configModule, config, log);

  log.info(
    { video: app.video.path, sink: app.audio.sinkName, control: config.controlPort },
    'mobile_webcam starting',
  );

  // Create virtual devices BEFORE anything can consume them. Chrome enumerates
  // devices at page load, so they must exist before the user opens a tab.
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
  app.shutdown.register('audio', () => app.audio.release());
  app.shutdown.install();

  log.info(`control UI: ${controlUrl}`);

  // Open native app window unless running headless or explicitly suppressed
  if (!noWindow) {
    try {
      await app.window.openAppWindowOrBrowser(controlUrl);
    } catch (err) {
      log.warn({ err }, 'Could not open native window; open browser manually at ' + controlUrl);
    }
  }
}

main().catch((e) => {
  console.error('fatal:', e);
  process.exit(1);
});
