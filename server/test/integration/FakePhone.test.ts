// End-to-end check of the desktop pipeline against a fake phone.
//
// The fake phone speaks the real wire protocol (/health, /capabilities,
// /settings, /stream.mp4) and streams real fragmented MP4 made by ffmpeg, so the
// desktop's proxy, ffmpeg supervision and restart logic all run for real. Only
// the output goes to a null sink instead of /dev/video9.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn, type ChildProcess } from 'node:child_process';
import type { AddressInfo } from 'node:net';
import { DEFAULT_SETTINGS, PROTOCOL_VERSION } from '@mobile-webcam/shared';
import { EventBus } from '../../dist/kernel/events/EventBus.js';
import { createLogger } from '../../dist/kernel/logging/logger.js';
import { DEFAULT_CONFIG } from '../../dist/modules/config/index.js';
import { DeviceControlModule } from '../../dist/modules/device-control/index.js';
import { PipelineModule } from '../../dist/modules/pipeline/index.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(what: string, cond: () => boolean, timeoutMs = 15_000): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    if (cond()) return;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// ------------------------------------------------------------------ fake phone

class FakePhone {
  settings = structuredClone({
    ...DEFAULT_SETTINGS,
    resolution: { width: 320, height: 240 },
    fps: 15,
    audio: { ...DEFAULT_SETTINGS.audio, enabled: false },
  });
  streaming = true;
  /** Stop writing bytes but keep the socket open (a frozen phone). */
  frozen = false;
  /** Reply to PATCH before the camera is back, like the old phone apps did. */
  answerBeforeRestart = true;
  streamRequests: string[] = [];
  #streams = new Set<{ res: http.ServerResponse; ff: ChildProcess }>();
  #server = http.createServer((req, res) => void this.#handle(req, res));
  port = 0;

  async listen(): Promise<void> {
    await new Promise<void>((r) => this.#server.listen(0, '127.0.0.1', () => r()));
    this.port = (this.#server.address() as AddressInfo).port;
  }

  capabilities() {
    return {
      lenses: [{ id: 'back-wide', label: 'Wide', position: 'back', minZoom: 1, maxZoom: 5 }],
      resolutions: [
        { width: 320, height: 240, maxFps: 30 },
        { width: 640, height: 480, maxFps: 30 },
      ],
      cinematic: {
        supported: false, tier: 0, resolutions: [], maxFps: 30, minAperture: 2, maxAperture: 16,
      },
      stabilization: ['off'],
      hdr: false,
      audio: { supported: false, sampleRates: [48000], maxChannels: 1 },
    };
  }

  /** The phone restarts its camera: drop every stream, come back after `ms`. */
  restartCamera(ms: number): void {
    this.streaming = false;
    this.dropStreams();
    setTimeout(() => { this.streaming = true; }, ms);
  }

  dropStreams(): void {
    for (const s of this.#streams) { s.ff.kill('SIGKILL'); s.res.socket?.destroy(); }
    this.#streams.clear();
  }

  async #handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    const url = req.url ?? '/';
    if (req.method === 'GET' && url === '/health') {
      return json(200, {
        ok: true, app: 'mobile_webcam', version: '1.0.0', protocol: PROTOCOL_VERSION,
        device: { model: 'Fake', ios: '0', name: 'Fake phone', platform: 'ios' },
        streaming: this.streaming, battery: 1, thermalState: 'nominal',
      });
    }
    if (req.method === 'GET' && url === '/capabilities') return json(200, this.capabilities());
    if (req.method === 'GET' && url === '/settings') return json(200, this.settings);
    if (req.method === 'GET' && url === '/telemetry') {
      return json(200, {
        fps: 15, bitrate: 1_000_000, droppedFrames: 0, droppedSegments: 0,
        thermalState: 'nominal', battery: 1, clients: this.#streams.size, audioLevel: 0,
      });
    }
    if (req.method === 'PATCH' && url === '/settings') {
      let body = '';
      for await (const c of req) body += c;
      const patch = JSON.parse(body);
      const restart = patch.resolution || patch.fps || patch.bitrate || patch.lens;
      this.settings = { ...this.settings, ...patch, resolution: { ...this.settings.resolution, ...patch.resolution } };
      if (restart) {
        this.restartCamera(1500);
        if (!this.answerBeforeRestart) await sleep(1500);
      }
      return json(200, this.settings);
    }
    if (req.method === 'GET' && url === '/stream.mp4') {
      const { width, height } = this.settings.resolution;
      this.streamRequests.push(`${width}x${height}`);
      if (!this.streaming) return json(409, { error: 'capture_failed', message: 'Camera is not running' });
      // Like the phone apps: a raw header, then the body until the socket
      // closes — no chunked encoding.
      const sock = req.socket;
      sock.write('HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nConnection: close\r\n\r\n');
      const ff = spawn('ffmpeg', [
        '-hide_banner', '-loglevel', 'error', '-re',
        '-f', 'lavfi', '-i', `testsrc=size=${width}x${height}:rate=${this.settings.fps}`,
        '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', '15',
        '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-',
      ]);
      const entry = { res, ff };
      this.#streams.add(entry);
      ff.stdout.on('data', (chunk: Buffer) => { if (!this.frozen) sock.write(chunk); });
      const done = () => { ff.kill('SIGKILL'); this.#streams.delete(entry); };
      sock.on('close', done);
      sock.on('error', done);
      ff.on('exit', () => sock.destroy());
      return;
    }
    json(404, { error: 'internal', message: 'no route' });
  }

  async close(): Promise<void> {
    this.dropStreams();
    this.#server.closeAllConnections();
    await new Promise<void>((r) => this.#server.close(() => r()));
  }
}

// ---------------------------------------------------------------- the desktop

const phone = new FakePhone();
await phone.listen();

const log = createLogger({ level: process.env.TEST_LOG ?? 'silent', pretty: false });
const bus = new EventBus(log);
const config = { ...DEFAULT_CONFIG, localPort: phone.port, token: '', autoStart: true, forceMjpeg: false, directMode: false };
const tunnel = {
  baseUrl: `http://127.0.0.1:${phone.port}`,
  isOpen: true,
  async open() {},
  async close() {},
};
const control = new DeviceControlModule({ log, bus, baseUrl: () => tunnel.baseUrl, token: () => '' });
const video = {
  path: '/dev/null',
  async exists() { return true; },
  async ensure() {},
  async forceFormat(width: number, height: number) { return { width, height }; },
  async actualFormat() { return null; },
  async pinCaps() {},
};
const audio = { sinkName: 'test', monitorSource: 'test.monitor', async ensure() {}, async release() {} };

const pipeline = new PipelineModule({
  log, bus, config: config as never, tunnel: tunnel as never, control,
  video: video as never, audio: audio as never, outputPlatform: 'win32',
});

const errors: string[] = [];
bus.on('pipeline.error', (e) => errors.push(`${e.code}: ${e.message}`));

after(async () => {
  await pipeline.shutdown();
  await phone.close();
});

/** ffmpeg is producing frames right now (its frame counter keeps moving). */
async function framesFlowing(): Promise<void> {
  await waitFor('ffmpeg fps > 0', () => pipeline.state === 'STREAMING' && pipeline.ffmpegStats.fps > 0);
}

test('connects and streams', async () => {
  bus.emit({ type: 'device.connected', udid: 'fake', name: 'Fake', model: 'Fake', ios: '0', platform: 'ios' });
  await waitFor('STREAMING', () => pipeline.state === 'STREAMING');
  await framesFlowing();
});

test('resolution change from the dashboard survives a slow camera restart', async () => {
  const before = phone.streamRequests.length;
  await pipeline.applySettings({ resolution: { width: 640, height: 480 } });
  assert.equal(pipeline.state, 'STREAMING');
  await framesFlowing();
  assert.equal(control.settings?.resolution.width, 640);
  // No 409 storm: the desktop waited for the camera instead of guessing.
  const after = phone.streamRequests.slice(before);
  assert.ok(after.length >= 1 && after.length <= 2, `stream requests after PATCH: ${after.join(',')}`);
  assert.equal(after.at(-1), '640x480');
});

test('resolution change works with a phone that answers after restarting', async () => {
  phone.answerBeforeRestart = false;
  await pipeline.applySettings({ resolution: { width: 320, height: 240 } });
  await framesFlowing();
  assert.equal(phone.streamRequests.at(-1), '320x240');
});

test('phone restarting its own camera (settings changed on the phone) reconnects', async () => {
  const before = phone.streamRequests.length;
  phone.settings = { ...phone.settings, resolution: { width: 640, height: 480 } };
  phone.restartCamera(1500);
  await waitFor('a new stream request', () => phone.streamRequests.length > before && phone.streaming);
  await framesFlowing();
  await waitFor('desktop picked up the phone resolution', () => control.settings?.resolution.width === 640);
});

test('a frozen stream is dropped and reconnected', async () => {
  const before = phone.streamRequests.length;
  phone.frozen = true;
  await waitFor('reconnect after stall', () => phone.streamRequests.length > before, 15_000);
  phone.frozen = false;
  await framesFlowing();
});

test('no errors were reported to the user', () => {
  assert.deepEqual(errors, []);
});
