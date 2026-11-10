import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isAllowedLocalRequest } from '../../dist/modules/api/index.js';

const PORT = 47800;

test('allows loopback hosts without an Origin (curl, CLI)', () => {
  assert.equal(isAllowedLocalRequest('127.0.0.1:47800', undefined, PORT), true);
  assert.equal(isAllowedLocalRequest('localhost:47800', undefined, PORT), true);
  assert.equal(isAllowedLocalRequest('[::1]:47800', undefined, PORT), true);
});

test('allows the control UI own origin', () => {
  assert.equal(isAllowedLocalRequest('127.0.0.1:47800', 'http://127.0.0.1:47800', PORT), true);
});

test('rejects cross-origin browser requests (CSRF, WebSocket hijack)', () => {
  assert.equal(isAllowedLocalRequest('127.0.0.1:47800', 'https://evil.example', PORT), false);
  assert.equal(isAllowedLocalRequest('127.0.0.1:47800', 'null', PORT), false);
  assert.equal(isAllowedLocalRequest('127.0.0.1:47800', 'http://127.0.0.1:3000', PORT), false);
});

test('rejects non-loopback Host headers (DNS rebinding)', () => {
  assert.equal(isAllowedLocalRequest('evil.example:47800', undefined, PORT), false);
  assert.equal(isAllowedLocalRequest('127.0.0.1:9999', undefined, PORT), false);
  assert.equal(isAllowedLocalRequest(undefined, undefined, PORT), false);
});
