import type { FastifyInstance } from 'fastify';
import type { ApiDeps } from '../index.js';

/** Pushes state + telemetry to the control UI. No polling. */
export async function registerWsRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const sockets = new Set<{ send: (data: string) => void }>();

  const broadcast = (payload: unknown): void => {
    const data = JSON.stringify(payload);
    for (const s of sockets) {
      try { s.send(data); } catch { /* client vanished mid-send */ }
    }
  };

  deps.bus.on('pipeline.state.changed', (e) =>
    broadcast({ type: 'state', from: e.from, to: e.to }));
  deps.bus.on('telemetry.sample', (e) =>
    broadcast({ type: 'telemetry', sample: e.sample }));
  deps.bus.on('phone.settings.changed', (e) =>
    broadcast({ type: 'settings', settings: e.settings }));
  deps.bus.on('device.connected', (e) =>
    broadcast({ type: 'device', connected: true, name: e.name, model: e.model, ios: e.ios }));
  deps.bus.on('device.disconnected', () =>
    broadcast({ type: 'device', connected: false }));
  deps.bus.on('pipeline.error', (e) =>
    broadcast({ type: 'error', code: e.code, message: e.message, fatal: e.fatal }));
  deps.bus.on('telemetry.degraded', (e) =>
    broadcast({ type: 'degraded', reason: e.reason, action: e.action }));

  app.get('/api/ws', { websocket: true }, (socket) => {
    sockets.add(socket);
    socket.send(JSON.stringify({ type: 'state', from: null, to: deps.pipeline.state }));
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => sockets.delete(socket));
  });
}
