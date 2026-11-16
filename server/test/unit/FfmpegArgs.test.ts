import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS } from '@mobile-webcam/shared';
import { buildFfmpegArgs } from '../../dist/modules/pipeline/index.js';

const build = (profile: 'fmp4' | 'mjpeg') =>
  buildFfmpegArgs({
    profile,
    baseUrl: 'http://127.0.0.1:18080',
    token: '',
    settings: DEFAULT_SETTINGS,
    targets: { videoDevice: '/dev/video9', platform: 'linux' },
  });

// After -i these would configure the output, and the H.264 decoder would fall
// back to frame threading: one frame of delay per core (~400 ms measured on a
// 12-core laptop at 30 fps).
for (const profile of ['fmp4', 'mjpeg'] as const) {
  test(`decoder threading is set before the input (${profile})`, () => {
    const args = build(profile);
    const input = args.indexOf('-i');
    assert.ok(input > 0);
    for (const opt of ['-threads', '-thread_type', '-flags:v']) {
      const at = args.indexOf(opt);
      assert.ok(at >= 0 && at < input, `${opt} must come before -i`);
    }
    assert.equal(args[args.indexOf('-thread_type') + 1], 'slice');
  });
}
