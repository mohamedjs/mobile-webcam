// Post-tsc build step: copy the control UI next to the compiled code and emit
// the single-file bundle the desktop packages ship. Written in Node instead of
// `mkdir -p && cp -r` because npm runs scripts through cmd.exe on Windows.
import { cpSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const staticSrc = join(root, 'src/modules/api/static');

for (const dest of ['dist/modules/api/static', 'dist/static']) {
  mkdirSync(join(root, dest), { recursive: true });
  cpSync(staticSrc, join(root, dest), { recursive: true });
}

await build({
  entryPoints: [join(root, 'src/main.ts')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: join(root, 'dist/webcamo-bundle.cjs'),
  logOverride: { 'empty-import-meta': 'silent' },
  logLevel: 'warning',
});
