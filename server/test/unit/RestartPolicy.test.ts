import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RestartPolicy } from '../../dist/kernel/process/RestartPolicy.js';

test('backoff doubles from the base delay', () => {
  const p = new RestartPolicy({ baseDelayMs: 250, maxDelayMs: 5000 });
  assert.equal(p.recordFailure(1000).delayMs, 250);
  assert.equal(p.recordFailure(1100).delayMs, 500);
  assert.equal(p.recordFailure(1200).delayMs, 1000);
  assert.equal(p.recordFailure(1300).delayMs, 2000);
  assert.equal(p.recordFailure(1400).delayMs, 4000);
});

test('backoff is capped at maxDelayMs', () => {
  const p = new RestartPolicy({ baseDelayMs: 250, maxDelayMs: 5000, maxFailures: 100 });
  let last = 0;
  for (let i = 0; i < 20; i++) last = p.recordFailure(1000 + i).delayMs;
  assert.equal(last, 5000);
});

test('gives up after maxFailures inside the window', () => {
  const p = new RestartPolicy({ maxFailures: 3, windowMs: 60_000 });
  assert.equal(p.recordFailure(0).restart, true);
  assert.equal(p.recordFailure(10).restart, true);
  assert.equal(p.recordFailure(20).restart, true);
  const gaveUp = p.recordFailure(30);
  assert.equal(gaveUp.restart, false);
  assert.match(gaveUp.reason ?? '', /failures within/);
});

test('failures outside the window do not count toward giving up', () => {
  const p = new RestartPolicy({ maxFailures: 3, windowMs: 1000 });
  p.recordFailure(0);
  p.recordFailure(100);
  p.recordFailure(200);
  // 5s later the window has slid past all three
  const decision = p.recordFailure(5000);
  assert.equal(decision.restart, true);
  assert.equal(p.failuresInWindow, 1);
});

test('recordSuccess resets the backoff but not the window', () => {
  const p = new RestartPolicy({ baseDelayMs: 250, maxFailures: 10 });
  p.recordFailure(0);
  p.recordFailure(10);
  assert.equal(p.consecutiveFailures, 2);
  p.recordSuccess();
  assert.equal(p.consecutiveFailures, 0);
  assert.equal(p.recordFailure(20).delayMs, 250, 'backoff restarts from base');
  assert.equal(p.failuresInWindow, 3, 'window still remembers all failures');
});

test('reset clears everything', () => {
  const p = new RestartPolicy();
  p.recordFailure(0);
  p.recordFailure(1);
  p.reset();
  assert.equal(p.consecutiveFailures, 0);
  assert.equal(p.failuresInWindow, 0);
});
