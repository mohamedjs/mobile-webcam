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
    await this.#app.register(fastifyWebsocket);

    const here = dirname(fileURLToPath(import.meta.url));
    await this.#app.register(fastifyStatic, { root: join(here, 'static'), prefix: '/' });

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
