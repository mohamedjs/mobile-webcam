// Webcamo Keynote Video Renderer (lemo-opuscar inspired Dark Tech Keynote style)
// Usage: node render.mjs [--lang en|ar] [--all] [--preview]
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage, run } from './frames.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ASSETS_DIR = resolve(ROOT, 'site', 'assets');

mkdirSync(ASSETS_DIR, { recursive: true });

const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  return i > 0 && i + 1 < process.argv.length ? process.argv[i + 1] : dflt;
};

const QUICK = process.argv.includes('--preview');
const ALL = process.argv.includes('--all');
const SINGLE_LANG = arg('--lang', 'en');
const LANGUAGES = ALL ? ['en', 'ar'] : [SINGLE_LANG];

async function renderLanguage(lang) {
  console.log(`\n========================================`);
  console.log(`Rendering Webcamo Promo Video [${lang.toUpperCase()}]`);
  console.log(`========================================`);

  const TL = {
    lang,
    fps: QUICK ? 15 : 30,
    total: 28
  };

  const finalMp4 = join(ASSETS_DIR, `intro-${lang}.mp4`);
  const posterJpg = join(ASSETS_DIR, `intro-${lang}.jpg`);
  const pictureMp4 = join(HERE, `temp-${lang}.picture.mp4`);

  // 1. Render Video Track
  await renderPage({
    html: join(HERE, 'animation.html'),
    TL,
    width: 1920,
    height: 1080,
    out: pictureMp4,
    quick: QUICK
  });

  // 2. Synthesize Audio Score using FFmpeg filter complex
  const T = TL.total;
  console.log(`Synthesizing tech score and sound effects for ${T}s...`);

  // Ambient synth pad
  const pad = `aevalsrc='0.04*(sin(2*PI*130.81*t)+0.6*sin(2*PI*196*t)+0.4*sin(2*PI*261.63*t)+0.25*sin(2*PI*392*t))*(0.8+0.2*sin(2*PI*0.1*t))':s=48000:d=${T}`;
  // Scene 1 fan noise
  const fan = `aevalsrc='0.015*sin(2*PI*60*t)+0.01*sin(2*PI*120*t)+0.004*(2*random(0)-1)':s=48000:d=4.5`;
  // USB connect chime at 5.6s
  const usbChime = `aevalsrc='0.25*exp(-10*t)*sin(2*PI*880*t)+0.2*exp(-8*(t-0.08))*gte(t,0.08)*sin(2*PI*1320*t)+0.15*exp(-6*(t-0.16))*gte(t,0.16)*sin(2*PI*1760*t)':s=48000:d=1.5`;
  // Camera shutter click at 12.0s
  const shutter = `aevalsrc='0.3*exp(-45*t)*sin(2*PI*1800*t)+0.2*exp(-30*(t-0.05))*gte(t,0.05)*sin(2*PI*1200*t)':s=48000:d=0.5`;
  // App dock chord at 17.5s
  const appChime = `aevalsrc='0.2*exp(-5*t)*sin(2*PI*523.25*t)+0.15*exp(-5*(t-0.15))*gte(t,0.15)*sin(2*PI*659.25*t)+0.15*exp(-5*(t-0.3))*gte(t,0.3)*sin(2*PI*783.99*t)':s=48000:d=2.0`;
  // Warm finale chord at 22.8s
  const finale = `aevalsrc='0.25*exp(-3*t)*(sin(2*PI*440*t)+sin(2*PI*554.37*t)+sin(2*PI*659.25*t)+sin(2*PI*880*t))':s=48000:d=3.5`;

  const filterComplex = [
    `[1]afade=t=out:st=4.0:d=0.5[fan]`,
    `[2]lowpass=f=2200,afade=t=in:d=1.0,afade=t=out:st=${T - 2.0}:d=2.0[pad]`,
    `[3]adelay=5600:all=1[usb]`,
    `[4]adelay=12000:all=1[cam]`,
    `[5]adelay=17500:all=1[app]`,
    `[6]adelay=22800:all=1[fin]`,
    `[pad][fan][usb][cam][app][fin]amix=inputs=6:normalize=0:duration=first,alimiter=limit=0.95[a]`
  ].join(';');

  // Mux video and audio
  run('ffmpeg', [
    '-v', 'error',
    '-y',
    '-i', pictureMp4,
    '-f', 'lavfi', '-i', fan,
    '-f', 'lavfi', '-i', pad,
    '-f', 'lavfi', '-i', usbChime,
    '-f', 'lavfi', '-i', shutter,
    '-f', 'lavfi', '-i', appChime,
    '-f', 'lavfi', '-i', finale,
    '-filter_complex', filterComplex,
    '-map', '0:v',
    '-map', '[a]',
    '-c:v', 'copy',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-t', String(T),
    '-movflags', '+faststart',
    finalMp4
  ]);

  // 3. Extract crisp poster frame at 24.5s
  run('ffmpeg', [
    '-v', 'error',
    '-y',
    '-ss', '24.5',
    '-i', pictureMp4,
    '-frames:v', '1',
    '-q:v', '2',
    posterJpg
  ]);

  // Clean up temporary picture mp4
  try {
    run('rm', ['-f', pictureMp4]);
  } catch {}

  console.log(`✓ Video ready: ${finalMp4}`);
  console.log(`✓ Poster ready: ${posterJpg}`);
}

for (const lang of LANGUAGES) {
  await renderLanguage(lang);
}
console.log(`\n🎉 All video renderings completed successfully.`);
