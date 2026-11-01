import { chromium } from 'playwright';
import { pathToFileURL } from 'node:url';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const htmlPath = resolve(HERE, 'animation.html');

async function capture() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(htmlPath).href);
  await page.evaluate(async () => {
    if (window.ready) await window.ready;
    if (window.setup) window.setup({ lang: 'en', fps: 30, total: 28 });
  });

  const timestamps = [
    { t: 2.2, name: 'scene1.jpg' },
    { t: 8.0, name: 'scene2.jpg' },
    { t: 14.5, name: 'scene3.jpg' },
    { t: 19.5, name: 'scene4.jpg' },
    { t: 25.0, name: 'scene5.jpg' }
  ];

  for (const { t, name } of timestamps) {
    await page.evaluate(time => window.render(time), t);
    const outPath = resolve(HERE, name);
    await page.screenshot({ path: outPath, quality: 95 });
    console.log(`Saved ${name} at t=${t}s`);
  }

  await browser.close();
}

capture().catch(console.error);
