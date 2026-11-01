import { chromium } from 'playwright';
import { spawn, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) {
    console.error(`${cmd} failed with status ${r.status}`);
    process.exit(1);
  }
}

export async function renderPage({ html, TL, width = 1920, height = 1080, out, quick = false }) {
  const browser = await chromium.launch({
    args: ['--disable-web-security', '--allow-file-access-from-files']
  });
  const page = await browser.newPage({
    viewport: { width, height },
    deviceScaleFactor: 1
  });

  page.on('pageerror', e => console.error('Browser page error:', e.message));
  page.on('console', msg => {
    if (msg.type() === 'error') console.error('Console error:', msg.text());
  });

  await page.goto(pathToFileURL(html).href);
  await page.evaluate(async tl => {
    if (window.ready) await window.ready;
    if (window.setup) window.setup(tl);
  }, TL);

  const frames = Math.ceil(TL.total * TL.fps);
  const ff = spawn('ffmpeg', [
    '-v', 'error',
    '-y',
    '-f', 'image2pipe',
    '-framerate', String(TL.fps),
    '-c:v', 'mjpeg',
    '-i', '-',
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    '-crf', quick ? '26' : '18',
    '-preset', quick ? 'ultrafast' : 'medium',
    '-vf', `scale=${width}:${height}:flags=lanczos`,
    out
  ], { stdio: ['pipe', 'inherit', 'inherit'] });

  const done = new Promise((resolve, reject) => {
    ff.on('close', code => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });

  const t0 = Date.now();
  console.log(`Rendering ${frames} frames at ${width}x${height} (${TL.fps} fps)...`);

  for (let f = 0; f < frames; f++) {
    await page.evaluate(t => window.render(t), f / TL.fps);
    const jpg = await page.screenshot({ type: 'jpeg', quality: quick ? 85 : 96 });
    if (!ff.stdin.write(jpg)) {
      await new Promise(r => ff.stdin.once('drain', r));
    }
    if (f % Math.max(1, Math.floor(TL.fps / 2)) === 0 || f === frames - 1) {
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      process.stdout.write(`\r[${((f / frames) * 100).toFixed(0)}%] Frame ${f + 1}/${frames} (${elapsed}s)`);
    }
  }

  ff.stdin.end();
  await done;
  await browser.close();
  console.log(`\nFinished rendering video track: ${frames} frames in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
