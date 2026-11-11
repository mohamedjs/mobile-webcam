import net from 'node:net';
import type { Logger } from '../../../kernel/logging/logger.js';

/** No bytes from the phone for this long while connected = a dead stream. */
const STALL_MS = 5000;
/** Header block larger than this is not an HTTP response. */
const MAX_HEADER_BYTES = 16 * 1024;

export interface StreamProxyOptions {
  /** The phone's port on this machine (the tunnel's local end). */
  phonePort: number;
  token?: string;
  /** Called once per connection when the phone stops sending bytes. */
  onStall?: () => void;
}

/**
 * Sits between ffmpeg and the phone for the fMP4 profile.
 *
 * ffmpeg's HTTP client has no idle timeout for a response that never ends, so a
 * phone that stops writing without closing the socket freezes the picture
 * forever. The proxy watches the bytes and drops the connection when they stop,
 * which makes ffmpeg exit and lets the pipeline restart cleanly.
 *
 * It forwards the phone's real status line: a 409 or 503 from the phone must
 * reach ffmpeg (and the pipeline's error handling) as an HTTP error, not as a
 * 200 followed by garbage.
 */
export class StreamProxy {
  readonly #log: Logger;
  #server: net.Server | null = null;
  #port = 0;
  #sockets = new Set<net.Socket>();
  #lastDataAt = 0;
  #bytes = 0;

  constructor(deps: { log: Logger }) {
    this.#log = deps.log.child({ component: 'stream-proxy' });
  }

  get port(): number {
    return this.#port;
  }

  /** Epoch ms of the last byte from the phone, 0 if none yet. */
  get lastDataAt(): number {
    return this.#lastDataAt;
  }

  get bytes(): number {
    return this.#bytes;
  }

  async start(opts: StreamProxyOptions): Promise<number> {
    await this.stop();
    this.#lastDataAt = 0;
    this.#bytes = 0;

    const server = net.createServer((client) => this.#handle(client, opts));
    this.#server = server;

    return new Promise<number>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        this.#port = addr.port;
        this.#log.debug({ port: this.#port }, 'stream proxy listening');
        resolve(this.#port);
      });
    });
  }

  #handle(client: net.Socket, opts: StreamProxyOptions): void {
    this.#sockets.add(client);
    const phone = net.createConnection({ host: '127.0.0.1', port: opts.phonePort });
    this.#sockets.add(phone);
    phone.setNoDelay(true);
    client.setNoDelay(true);

    let headerDone = false;
    let head = Buffer.alloc(0);
    let stalled = false;
    let watchdog: NodeJS.Timeout | null = null;

    const closeBoth = () => {
      if (watchdog) clearInterval(watchdog);
      watchdog = null;
      phone.destroy();
      client.destroy();
      this.#sockets.delete(phone);
      this.#sockets.delete(client);
    };

    phone.on('connect', () => {
      const auth = opts.token ? `Authorization: Bearer ${opts.token}\r\n` : '';
      phone.write(`GET /stream.mp4 HTTP/1.1\r\nHost: 127.0.0.1\r\n${auth}Connection: close\r\n\r\n`);
      this.#lastDataAt = Date.now();
      watchdog = setInterval(() => {
        if (stalled || Date.now() - this.#lastDataAt < STALL_MS) return;
        stalled = true;
        this.#log.warn({ idleMs: Date.now() - this.#lastDataAt }, 'phone stopped sending; dropping the stream');
        closeBoth();
        opts.onStall?.();
      }, 1000);
    });

    phone.on('data', (chunk: Buffer) => {
      this.#lastDataAt = Date.now();
      this.#bytes += chunk.length;
      if (headerDone) {
        client.write(chunk);
        return;
      }

      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end < 0) {
        if (head.length > MAX_HEADER_BYTES) {
          this.#log.warn('phone sent no HTTP header; dropping the stream');
          closeBoth();
        }
        return;
      }

      headerDone = true;
      const statusLine = head.subarray(0, head.indexOf('\r\n')).toString('latin1');
      const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(statusLine)?.[1] ?? 0);
      const body = head.subarray(end + 4);
      head = Buffer.alloc(0);

      if (status !== 200) {
        this.#log.warn({ status: statusLine, body: body.toString('utf8').slice(0, 200) }, 'phone refused the stream');
        client.write(
          `HTTP/1.1 ${status || 502} ${status ? 'Phone Error' : 'Bad Gateway'}\r\n`
          + `Content-Type: application/json\r\nContent-Length: ${body.length}\r\nConnection: close\r\n\r\n`,
        );
        client.end(body);
        phone.destroy();
        return;
      }

      client.write('HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nConnection: close\r\n\r\n');
      if (body.length > 0) client.write(body);
    });

    phone.on('error', (err) => {
      this.#log.warn({ err: err.message }, 'phone socket error');
      closeBoth();
    });
    phone.on('close', () => {
      if (watchdog) clearInterval(watchdog);
      client.end();
      this.#sockets.delete(phone);
    });
    client.on('error', () => closeBoth());
    client.on('close', () => closeBoth());
  }

  async stop(): Promise<void> {
    for (const s of this.#sockets) s.destroy();
    this.#sockets.clear();
    const server = this.#server;
    this.#server = null;
    this.#port = 0;
    if (server) await new Promise<void>((r) => server.close(() => r()));
  }
}
