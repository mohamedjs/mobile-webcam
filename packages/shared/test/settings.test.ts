import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SETTINGS,
  SettingsSchema,
  defaultBitrateFor,
  requiresRestart,
  validateAgainstCapabilities,
} from '../dist/index.js';
import type { Capabilities } from '../dist/index.js';

const caps: Capabilities = {
  lenses: [
    { id: 'back-wide', label: '1x Wide', position: 'back', minZoom: 1, maxZoom: 8 },
    { id: 'front', label: 'Front', position: 'front', minZoom: 1, maxZoom: 2 },
  ],
  resolutions: [
    { width: 1280, height: 720, maxFps: 60 },
    { width: 1920, height: 1080, maxFps: 60 },
    { width: 3840, height: 2160, maxFps: 30 },
  ],
  cinematic: {
    supported: true,
    tier: 1,
    resolutions: [{ width: 1920, height: 1080 }],
    maxFps: 30,
    minAperture: 2.0,
    maxAperture: 16,
  },
  stabilization: ['off', 'standard'],
  hdr: true,
  audio: { sampleRates: [44100, 48000], maxChannels: 2 },
};

test('defaults satisfy their own schema', () => {
  assert.doesNotThrow(() => SettingsSchema.parse(DEFAULT_SETTINGS));
});

test('defaults use the rear wide lens', () => {
  assert.equal(DEFAULT_SETTINGS.lens, 'back-wide');
});

test('defaultBitrateFor scales with resolution', () => {
  assert.equal(defaultBitrateFor(1280, 720), 4_000_000);
  assert.equal(defaultBitrateFor(1920, 1080), 8_000_000);
  assert.equal(defaultBitrateFor(3840, 2160), 20_000_000);
});

test('requiresRestart is true for session-level keys only', () => {
  assert.equal(requiresRestart({ resolution: { width: 1280, height: 720 } }), true);
  assert.equal(requiresRestart({ fps: 60 }), true);
  assert.equal(requiresRestart({ lens: 'front' }), true);
  assert.equal(requiresRestart({ cinematic: { enabled: true } }), true);
  assert.equal(requiresRestart({ rotation: 90 }), true);

  assert.equal(requiresRestart({ zoom: 2 }), false);
  assert.equal(requiresRestart({ torch: true }), false);
  assert.equal(requiresRestart({ bitrate: 12_000_000 }), false);
  assert.equal(requiresRestart({ mirror: true }), false);
  assert.equal(requiresRestart({ cinematic: { aperture: 4 } }), false);
});

test('rejects a resolution the device does not offer', () => {
  const issues = validateAgainstCapabilities(
    { resolution: { width: 999, height: 999 } },
    DEFAULT_SETTINGS,
    caps,
  );
  assert.equal(issues.length, 1);
  assert.equal(issues[0]?.field, 'resolution');
});

test('rejects fps above the mode maximum', () => {
  const issues = validateAgainstCapabilities({ fps: 120 }, DEFAULT_SETTINGS, caps);
  assert.ok(issues.some((i) => i.field === 'fps'));
});

test('rejects an unknown lens', () => {
  const issues = validateAgainstCapabilities({ lens: 'back-periscope' }, DEFAULT_SETTINGS, caps);
  assert.equal(issues[0]?.field, 'lens');
});

test('rejects zoom outside the active lens range', () => {
  const issues = validateAgainstCapabilities({ zoom: 20 }, DEFAULT_SETTINGS, caps);
  assert.equal(issues[0]?.field, 'zoom');
});

test('zoom is validated against the lens being switched to, not the current one', () => {
  // front maxZoom is 2; 6 is fine on back-wide but invalid on front
  const issues = validateAgainstCapabilities({ lens: 'front', zoom: 6 }, DEFAULT_SETTINGS, caps);
  assert.equal(issues[0]?.field, 'zoom');
});

test('cinematic clamps resolution and fps', () => {
  const at4k = { ...DEFAULT_SETTINGS, resolution: { width: 3840, height: 2160 } };
  const issues = validateAgainstCapabilities({ cinematic: { enabled: true } }, at4k, caps);
  assert.ok(issues.some((i) => i.field === 'resolution'));
});

test('cinematic rejected outright when unsupported', () => {
  const noCine: Capabilities = { ...caps, cinematic: { ...caps.cinematic, supported: false, tier: 0 } };
  const issues = validateAgainstCapabilities({ cinematic: { enabled: true } }, DEFAULT_SETTINGS, noCine);
  assert.equal(issues[0]?.field, 'cinematic.enabled');
});

test('rejects unsupported stabilization mode', () => {
  const issues = validateAgainstCapabilities({ stabilization: 'cinematic' }, DEFAULT_SETTINGS, caps);
  assert.equal(issues[0]?.field, 'stabilization');
});

test('a valid patch produces no issues', () => {
  const issues = validateAgainstCapabilities(
    { resolution: { width: 1280, height: 720 }, fps: 60, zoom: 3 },
    DEFAULT_SETTINGS,
    caps,
  );
  assert.deepEqual(issues, []);
});
