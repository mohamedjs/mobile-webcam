import type { FastifyInstance } from 'fastify';
import { SettingsPatchSchema } from '@mobile-webcam/shared';
import { AppError } from '../../../kernel/errors/AppError.js';
import type { ApiDeps } from '../index.js';

export async function registerApiRoutes(app: FastifyInstance, deps: ApiDeps): Promise<void> {
  const { config, control, pipeline, telemetry, discovery, video, audio, tunnel } = deps;

  app.get('/api/status', async () => ({
    state: pipeline.state,
    degraded: pipeline.degraded,
    profile: pipeline.profile,
    directMode: config.current.directMode,
    device: discovery.device,
    tunnel: { open: tunnel.isOpen, baseUrl: tunnel.baseUrl },
    video: { path: video.path, label: await video.label(), exists: await video.exists() },
    audio: { sink: audio.sinkName, monitor: audio.monitorSource },
    streamUrl: `${tunnel.baseUrl}/stream.mp4`,
  }));

  app.get('/api/capabilities', async (_req, reply) => {
    const caps = control.capabilities;
    if (!caps) return reply.code(503).send({ error: 'device_not_found', message: 'Phone not ready' });
    return caps;
  });

  app.get('/api/settings', async (_req, reply) => {
    const s = control.settings;
    if (!s) return reply.code(503).send({ error: 'device_not_found', message: 'Phone not ready' });
    return s;
  });

  app.patch('/api/settings', async (req, reply) => {
    const parsed = SettingsPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      return reply.code(400).send({
        error: 'invalid_setting',
        message: issue?.message ?? 'Invalid settings patch',
        field: issue?.path.join('.') ?? undefined,
      });
    }
    try {
      await pipeline.applySettings(parsed.data);
      return control.settings;
    } catch (e) {
      if (AppError.is(e)) return reply.code(400).send(e.toWire());
      throw e;
    }
  });

  app.post('/api/stream/start', async (_req, reply) => {
    try {
      await pipeline.start();
      return { state: pipeline.state };
    } catch (e) {
      if (AppError.is(e)) return reply.code(409).send(e.toWire());
      throw e;
    }
  });

  app.post('/api/stream/stop', async () => {
    await pipeline.stop();
    return { state: pipeline.state };
  });

  app.post<{ Body: { x: number; y: number } }>('/api/actions/focus', async (req, reply) => {
    const { x, y } = req.body ?? {};
    if (typeof x !== 'number' || typeof y !== 'number') {
      return reply.code(400).send({ error: 'invalid_setting', message: 'x and y are required' });
    }
    await control.client.focusAt(x, y);
    return reply.code(204).send();
  });

  app.get('/api/telemetry', async () => ({
    latest: telemetry.latest,
    samples: telemetry.samples,
  }));

  app.patch<{ Body: Record<string, unknown> }>('/api/config', async (req) => {
    const allowed = ['autoStart', 'forceMjpeg', 'directMode', 'logLevel', 'token'] as const;
    const patch: Record<string, unknown> = {};
    for (const k of allowed) if (k in (req.body ?? {})) patch[k] = req.body[k];
    return config.update(patch);
  });

  app.get('/api/config', async () => config.current);
}
