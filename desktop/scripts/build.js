// The main process is plain CommonJS, so "build" only syntax-checks it with
// the Node that runs npm. Nothing is emitted.
'use strict';
const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');

const src = join(__dirname, '..', 'src');
const files = readdirSync(src).filter((f) => f.endsWith('.js'));
for (const f of files) execFileSync(process.execPath, ['--check', join(src, f)], { stdio: 'inherit' });
console.log(`checked ${files.length} files in src/`);
