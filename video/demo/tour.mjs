// Films the REAL product, clip by clip, with a fake cursor gliding to each target.
//   node tour.mjs tour.json [clipId …]   → clips/<id>/0000.jpg … (fps from tour.json, default 15)
//
// tour.json
// {
//   "fps": 15, "size": [1440, 810],
//   // pick ONE target:
//   "url": "http://localhost:5173",                       // a web app (Playwright Chromium)
//   "electron": { "cwd": "..", "args": ["."], "env": {} }, // a desktop app (Playwright _electron)
//   "login": [steps…],                                    // web only: run once, not filmed, state saved
//   "clips": [ { "id": "home", "seconds": 9,
//       "env": { … },                 // electron: extra env for this clip (e.g. a demo mode)
//       "path": "/dashboard",         // web: page to open
//       "before": "shell cmd", "after": "shell cmd",      // e.g. start/stop a demo device
//       "setup": [steps…],            // runs before filming (cut off by the default skip)
//       "steps": [steps…] } ] }      // the filmed part
// steps: { "wait": ms } { "move": sel } { "click": sel } { "hover": sel } { "type": [sel, text] }
//        { "scroll": px } { "eval": "js" }
// Recording starts when the window opens; by default only the last `seconds` (≈ the steps) are kept.
import { chromium, _electron } from 'playwright';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, execSync } from 'node:child_process';

const tour = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const only = process.argv.slice(3);
const [W, H] = tour.size || [1440, 810];
const size = { width: W, height: H };
const fps = tour.fps || 15;

const CURSOR = `(() => { if (document.getElementById('__cur')) return;
  const c = document.createElement('div'); c.id = '__cur';
  c.style.cssText = 'position:fixed;left:0;top:0;width:28px;height:28px;margin:-14px 0 0 -14px;border-radius:50%;background:rgba(255,197,77,.9);box-shadow:0 0 0 6px rgba(255,197,77,.35),0 6px 14px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;transition:transform .12s';
  document.documentElement.appendChild(c); window.__curXY = [innerWidth / 2, innerHeight / 2];
  c.style.left = innerWidth / 2 + 'px'; c.style.top = innerHeight / 2 + 'px'; })()`;

async function glide(p, sel) {
  const loc = p.locator(sel).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox(); if (!box) { console.warn('  not found:', sel); return null; }
  const to = [box.x + box.width / 2, box.y + box.height / 2];
  await p.evaluate(async ([x, y]) => {
    const c = document.getElementById('__cur'), [x0, y0] = window.__curXY, t0 = performance.now(), D = 650;
    await new Promise(res => { const f = now => { const k = Math.min(1, (now - t0) / D), e = 1 - Math.pow(1 - k, 3);
      c.style.left = x0 + (x - x0) * e + 'px'; c.style.top = y0 + (y - y0) * e + 'px'; k < 1 ? requestAnimationFrame(f) : res(); }; requestAnimationFrame(f); });
    window.__curXY = [x, y];
  }, to);
  return to;
}
const tap = p => p.evaluate(() => { const c = document.getElementById('__cur'); c.style.transform = 'scale(.7)'; setTimeout(() => (c.style.transform = ''), 160); });

async function run(p, steps = []) {
  for (const s of steps) {
    if (s.wait) await p.waitForTimeout(s.wait);
    if (s.move) await glide(p, s.move);
    if (s.hover) { await glide(p, s.hover); await p.hover(s.hover); }
    if (s.click) { await glide(p, s.click); await tap(p); await p.click(s.click); await p.waitForTimeout(400); }
    if (s.type) { await glide(p, s.type[0]); await tap(p); await p.click(s.type[0]); await p.keyboard.type(s.type[1], { delay: 70 }); }
    if (s.scroll) { await p.evaluate(y => window.scrollBy({ top: y, behavior: 'smooth' }), s.scroll); await p.waitForTimeout(900); }
    if (s.eval) await p.evaluate(s.eval);
  }
}

const state = 'tour_state.json';
let browser = null;
if (tour.url) {
  browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  if (tour.login) {
    const c = await browser.newContext({ viewport: size }); const p = await c.newPage();
    await p.goto(tour.url, { waitUntil: 'networkidle' }); await run(p, tour.login); await c.storageState({ path: state }); await c.close();
  }
}

fs.mkdirSync('raw', { recursive: true });
for (const clip of tour.clips) {
  if (only.length && !only.includes(clip.id)) continue;
  if (clip.before) execSync(clip.before, { stdio: 'inherit' });
  let p, close;
  if (tour.electron) {
    const e = tour.electron;
    const app = await _electron.launch({ args: e.args || ['.'], cwd: path.resolve(e.cwd || '.'),
      ...(e.executablePath ? { executablePath: path.resolve(e.executablePath) } : {}),
      env: { ...process.env, ...(e.env || {}), ...(clip.env || {}) }, recordVideo: { dir: 'raw', size } });
    p = await app.firstWindow();
    // make the content exactly the video size (the window frame is not filmed)
    await app.evaluate(({ BrowserWindow }, [w, h]) => { const win = BrowserWindow.getAllWindows()[0]; win.setContentSize(w, h); }, [W, H]).catch(() => {});
    close = () => app.close();
  } else {
    const ctx = await browser.newContext({ viewport: size, permissions: ['microphone', 'camera'],
      storageState: fs.existsSync(state) ? state : undefined, recordVideo: { dir: 'raw', size } });
    p = await ctx.newPage();
    await p.goto(new URL(clip.path || '/', tour.url).href, { waitUntil: 'networkidle' });
    close = () => ctx.close();
  }
  await p.waitForLoadState('networkidle').catch(() => {});
  await p.waitForTimeout(1200);
  await p.evaluate(CURSOR);
  await run(p, clip.setup);
  const t0 = Date.now(); await run(p, clip.steps);
  const left = clip.seconds * 1000 - (Date.now() - t0); if (left > 0) await p.waitForTimeout(left);
  const video = p.video();
  await close();
  if (clip.after) execSync(clip.after, { stdio: 'inherit' });
  const webm = await video.path();
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', webm]).toString());
  const skip = clip.skip ?? Math.max(0, dur - clip.seconds - 0.3);
  const dir = `clips/${clip.id}`; fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', String(skip), '-i', webm, '-t', String(clip.seconds),
    '-vf', `fps=${fps}`, '-q:v', '2', '-start_number', '0', `${dir}/%04d.jpg`]);
  console.log(clip.id, fs.readdirSync(dir).length, 'frames', `(video ${dur.toFixed(1)} s, kept the last ${clip.seconds} s)`);
}
if (browser) await browser.close();
