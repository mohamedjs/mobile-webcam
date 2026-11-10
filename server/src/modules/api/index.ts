import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import type { EventBus } from '../../kernel/events/EventBus.js';
import type { Logger } from '../../kernel/logging/logger.js';
import type { ConfigModule } from '../config/index.js';
import type { DiscoveryModule } from '../discovery/index.js';
import type { TunnelModule } from '../tunnel/index.js';
import type { DeviceControlModule } from '../device-control/index.js';
import type { VideoDeviceModule } from '../video-device/index.js';
import type { AudioDeviceModule } from '../audio-device/index.js';
import type { PipelineModule } from '../pipeline/index.js';
import type { TelemetryModule } from '../telemetry/index.js';
import { registerApiRoutes } from './routes/api.routes.js';
import { registerWsRoutes } from './routes/ws.routes.js';

export interface ApiDeps {
  log: Logger;
  bus: EventBus;
  config: ConfigModule;
  discovery: DiscoveryModule;
  tunnel: TunnelModule;
  control: DeviceControlModule;
  video: VideoDeviceModule;
  audio: AudioDeviceModule;
  pipeline: PipelineModule;
  telemetry: TelemetryModule;
}

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * True when a request targets this loopback API and, if sent by a browser,
 * comes from the control UI's own origin. Non-browser clients (curl, the CLI)
 * send no Origin header and are allowed.
 */
export function isAllowedLocalRequest(
  host: string | undefined,
  origin: string | undefined,
  port: number,
): boolean {
  if (!host) return false;
  const allowedHosts = [...LOOPBACK_HOSTS].map((h) => `${h}:${port}`);
  if (!allowedHosts.includes(host.toLowerCase())) return false;
  if (origin === undefined) return true;
  return allowedHosts.some((h) => origin.toLowerCase() === `http://${h}`);
}

export class ApiModule {
  readonly #app: FastifyInstance;
  readonly #deps: ApiDeps;
  readonly #log: Logger;

  constructor(deps: ApiDeps) {
    this.#deps = deps;
    this.#log = deps.log.child({ module: 'api' });
    this.#app = Fastify({ logger: false });
  }

  async start(port: number): Promise<void> {
    // Binding to loopback is not enough on its own: any web page open in the
    // user's browser can still send simple POSTs (CSRF), open the WebSocket
    // (no CORS on WS), or read responses via DNS rebinding. Accept only
    // requests addressed to a loopback host, and only same-origin browsers.
    this.#app.addHook('onRequest', async (req, reply) => {
      if (!isAllowedLocalRequest(req.headers.host, req.headers.origin, port)) {
        return reply.code(403).send({ error: 'forbidden', message: 'Cross-origin request rejected' });
      }
    });

    await this.#app.register(fastifyWebsocket);

    const here =
      typeof __dirname === 'string'
        ? __dirname
        : dirname(fileURLToPath(import.meta.url));
    const staticRoot = existsSync(join(here, 'static'))
      ? join(here, 'static')
      : join(here, 'modules', 'api', 'static');
    await this.#app.register(fastifyStatic, { root: staticRoot, prefix: '/' });

    await registerApiRoutes(this.#app, this.#deps);
    await registerWsRoutes(this.#app, this.#deps);

    this.#app.setErrorHandler((err, _req, reply) => {
      this.#log.error({ err }, 'unhandled request error');
      const message = err instanceof Error ? err.message : String(err);
      void reply.code(500).send({ error: 'internal', message });
    });

    // Loopback only. The control API must never be reachable off-box. docs/04 §7.
    await this.#app.listen({ port, host: '127.0.0.1' });
    this.#log.info({ url: `http://127.0.0.1:${port}` }, 'control API listening');
  }

  async stop(): Promise<void> {
    await this.#app.close();
  }
}
