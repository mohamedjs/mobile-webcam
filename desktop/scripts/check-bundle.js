// Fails early (and clearly) when the server bundle has not been built yet.
// Written in Node so it behaves the same under cmd.exe on Windows.
'use strict';
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const dist = join(__dirname, '..', '..', 'server', 'dist');
const missing = ['webcamo-bundle.cjs', join('static', 'index.html')].filter((f) => !existsSync(join(dist, f)));
if (missing.length) {
  console.error(`\nWebcamo server bundle not found: ${missing.map((f) => join(dist, f)).join(', ')}`);
  console.error('Build the server first, from the repository root:\n\n  npm ci && npm run build\n');
  process.exit(1);
}
