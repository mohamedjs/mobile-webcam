import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pino } from 'pino';
import { EventBus } from '../../dist/kernel/events/EventBus.js';

const silent = pino({ level: 'silent' });

test('delivers to subscribers of the matching type only', () => {
  const bus = new EventBus(silent);
  const seen: string[] = [];
  bus.on('device.connected', (e) => seen.push(`connected:${e.udid}`));
  bus.on('device.disconnected', (e) => seen.push(`disconnected:${e.udid}`));

  bus.emit({ type: 'device.connected', udid: 'A', name: 'n', model: 'm', ios: '26' });
  assert.deepEqual(seen, ['connected:A']);
});

test('unsubscribe stops delivery', () => {
  const bus = new EventBus(silent);
  let count = 0;
  const off = bus.on('tunnel.closed', () => count++);
  bus.emit({ type: 'tunnel.closed', reason: 'x' });
  off();
  bus.emit({ type: 'tunnel.closed', reason: 'y' });
  assert.equal(count, 1);
});

test('once fires exactly once', () => {
  const bus = new EventBus(silent);
  let count = 0;
  bus.once('tunnel.closed', () => count++);
  bus.emit({ type: 'tunnel.closed', reason: 'a' });
  bus.emit({ type: 'tunnel.closed', reason: 'b' });
  assert.equal(count, 1);
  assert.equal(bus.handlerCount('tunnel.closed'), 0);
});

test('a throwing handler does not stop the others', () => {
  const bus = new EventBus(silent);
  const seen: string[] = [];
  bus.on('tunnel.closed', () => { throw new Error('boom'); });
  bus.on('tunnel.closed', () => seen.push('second'));
  assert.doesNotThrow(() => bus.emit({ type: 'tunnel.closed', reason: 'r' }));
  assert.deepEqual(seen, ['second']);
});

test('a handler unsubscribing mid-dispatch does not skip siblings', () => {
  const bus = new EventBus(silent);
  const seen: string[] = [];
  const off = bus.on('tunnel.closed', () => { seen.push('first'); off(); });
  bus.on('tunnel.closed', () => seen.push('second'));
  bus.emit({ type: 'tunnel.closed', reason: 'r' });
  assert.deepEqual(seen, ['first', 'second']);
});

test('waitFor resolves on the next matching event', async () => {
  const bus = new EventBus(silent);
  setTimeout(() => bus.emit({ type: 'tunnel.opened', localPort: 8080, devicePort: 8080 }), 5);
  const e = await bus.waitFor('tunnel.opened', 500);
  assert.equal(e.localPort, 8080);
});

test('waitFor rejects on timeout and cleans up', async () => {
  const bus = new EventBus(silent);
  await assert.rejects(() => bus.waitFor('tunnel.opened', 20), /Timed out/);
  assert.equal(bus.handlerCount('tunnel.opened'), 0);
});
