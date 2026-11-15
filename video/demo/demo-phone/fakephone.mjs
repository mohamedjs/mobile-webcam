// Filming only: a stand-in phone that speaks Webcamo's real wire protocol
// (/health, /capabilities, /settings, /stream.mp4) and streams fragmented MP4
// encoded by ffmpeg from a generated demo feed, at whatever resolution and fps
// the dashboard asks for. Same behaviour as the phone apps: a restart-requiring
// PATCH restarts the "camera" before answering and drops old stream clients.
import http from 'node:http';
import { spawn } from 'node:child_process';

const PORT = Number(process.env.PORT || 18080);
let settings = {
  lens: 'back-wide', resolution: { width: 1920, height: 1080 }, fps: 30, bitrate: 8000000,
  cinematic: { enabled: false, aperture: 2.8 }, blurFallback: { enabled: false, intensity: 0.6 },
  zoom: 1, torch: false, mirror: false, rotation: 0, stabilization: 'standard', hdr: false,
  lockLens: false, exposure: { mode: 'auto', bias: 0, locked: false },
  focus: { mode: 'auto', locked: false }, whiteBalance: { mode: 'auto', locked: false },
  audio: { enabled: false, sampleRate: 48000, channels: 1, bitrate: 128000 },
};
const caps = {
  lenses: [
    { id: 'back-wide', label: '1x Wide', position: 'back', minZoom: 1, maxZoom: 8 },
    { id: 'back-ultrawide', label: '0.5x Ultra Wide', position: 'back', minZoom: 1, maxZoom: 2 },
    { id: 'front', label: 'Front', position: 'front', minZoom: 1, maxZoom: 4 },
  ],
  resolutions: [
    { width: 1280, height: 720, maxFps: 60 },
    { width: 1920, height: 1080, maxFps: 60 },
  ],
  cinematic: { supported: false, tier: 0, resolutions: [], maxFps: 30, minAperture: 2, maxAperture: 16 },
  stabilization: ['off', 'standard'], hdr: false,
  audio: { supported: false, sampleRates: [48000], maxChannels: 1 },
};
const streams = new Set();

// The demo picture: a soft moving gradient with the live settings drawn on it.
function feedArgs() {
  const { width: w, height: h } = settings.resolution;
  const z = settings.zoom.toFixed(1), ev = settings.exposure.bias;
  const label = `Webcamo demo feed  ${w}x${h}  ${settings.fps} fps  lens ${settings.lens}  zoom ${z}x`;
  return [
    '-hide_banner', '-loglevel', 'error', '-re',
    '-f', 'lavfi', '-i', `color=c=0x1e40af:s=${w}x${h}:r=${settings.fps}`,
    '-vf', `eq=brightness=${(ev * 0.08).toFixed(2)},drawbox=x=0:y=ih*2/3:w=iw:h=ih/3:color=0x0ea5e9@0.35:t=fill,drawbox=x=(iw/2-ih/6)+sin(t)*ih/6:y=ih/3:w=ih/3:h=ih/3:color=white@0.30:t=fill,` +
      `drawtext=text='${label}':fontcolor=white:fontsize=${Math.round(h / 28)}:x=(w-text_w)/2:y=h-${Math.round(h / 9)}:box=1:boxcolor=black@0.35:boxborderw=14,` +
      `drawtext=text='%{localtime\\:%H\\\\\\:%M\\\\\\:%S}':fontcolor=white:fontsize=${Math.round(h / 22)}:x=(w-text_w)/2:y=${Math.round(h / 10)}`,
    '-c:v', 'libx264', '-preset', 'ultrafast', '-tune', 'zerolatency', '-g', String(settings.fps),
    '-b:v', String(settings.bitrate), '-pix_fmt', 'yuv420p',
    '-f', 'mp4', '-movflags', 'frag_every_frame+empty_moov+default_base_moof', '-',
  ];
}

const restartKeys = ['lens', 'resolution', 'fps', 'bitrate'];
function dropStreams() { for (const s of streams) { s.ff.kill('SIGKILL'); s.sock.destroy(); } streams.clear(); }

http.createServer(async (req, res) => {
  const json = (status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  const url = req.url || '/';
  if (url === '/health') return json(200, { ok: true, app: 'webcamo', version: '1.0.0', protocol: 1,
    device: { model: 'Pixel 9 Pro', ios: 'Android 16', platform: 'android', osVersion: '16', name: 'Demo phone' },
    streaming: true, battery: 0.86, thermalState: 'nominal' });
  if (url === '/capabilities') return json(200, caps);
  if (url === '/telemetry') return json(200, { fps: settings.fps, bitrate: settings.bitrate, droppedFrames: 0,
    droppedSegments: 0, thermalState: 'nominal', battery: 0.86, clients: streams.size, audioLevel: 0 });
  if (url === '/settings' && req.method === 'GET') return json(200, settings);
  if (url === '/settings' && req.method === 'PATCH') {
    let body = ''; for await (const c of req) body += c;
    const patch = JSON.parse(body || '{}');
    const restart = restartKeys.some((k) => patch[k] !== undefined);
    settings = { ...settings, ...patch,
      resolution: { ...settings.resolution, ...(patch.resolution || {}) },
      exposure: { ...settings.exposure, ...(patch.exposure || {}) } };
    if (restart) { dropStreams(); await new Promise((r) => setTimeout(r, 600)); }
    return json(200, settings);
  }
  if (url === '/stream.mp4') {
    const sock = req.socket;
    sock.write('HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nConnection: close\r\n\r\n');
    const ff = spawn('ffmpeg', feedArgs());
    const entry = { ff, sock }; streams.add(entry);
    ff.stdout.on('data', (c) => sock.write(c));
    const done = () => { ff.kill('SIGKILL'); streams.delete(entry); };
    sock.on('close', done); sock.on('error', done); ff.on('exit', () => sock.destroy());
    return;
  }
  json(404, { error: 'internal', message: 'no route' });
}).listen(PORT, '127.0.0.1', () => console.log(`demo phone on 127.0.0.1:${PORT}`));
