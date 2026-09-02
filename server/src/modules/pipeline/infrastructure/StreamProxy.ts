import net from 'node:net';
import type { Logger } from '../../../kernel/logging/logger.js';

export class StreamProxy {
  readonly #log: Logger;
  #server: net.Server | null = null;
  #port = 0;
  #phoneSocket: net.Socket | null = null;

  constructor(deps: { log: Logger }) {
    this.#log = deps.log.child({ component: 'stream-proxy' });
  }

  get port(): number {
    return this.#port;
  }

  async start(phonePort: number, token?: string): Promise<number> {
    await this.stop();

    return new Promise<number>((resolve, reject) => {
      const server = net.createServer((clientSocket) => {
        this.#log.info('FFmpeg connected to stream proxy');

        // Connect to the phone
        const phoneSocket = net.createConnection({ host: '127.0.0.1', port: phonePort }, () => {
          const authHeader = token ? `Authorization: Bearer ${token}\r\n` : '';
          phoneSocket.write(
            `GET /stream.mp4 HTTP/1.1\r\nHost: 127.0.0.1\r\n${authHeader}\r\n`,
          );
        });
        this.#phoneSocket = phoneSocket;

        let sentHeaderToFfmpeg = false;
        let buf = Buffer.alloc(0);
        let headerNormalized = false;

        phoneSocket.on('data', (chunk) => {
          if (!sentHeaderToFfmpeg) {
            clientSocket.write('HTTP/1.1 200 OK\r\nContent-Type: video/mp4\r\nConnection: close\r\n\r\n');
            sentHeaderToFfmpeg = true;
          }

          if (!headerNormalized) {
            buf = Buffer.concat([buf, chunk]);
            const httpIdx = buf.indexOf('HTTP/1.1 200 OK');
            if (httpIdx >= 0) {
              const endIdx = buf.indexOf('\r\n\r\n', httpIdx);
              if (endIdx >= 0) {
                const clean = Buffer.concat([buf.subarray(0, httpIdx), buf.subarray(endIdx + 4)]);
                clientSocket.write(clean);
                headerNormalized = true;
                buf = Buffer.alloc(0);
                return;
              }
            } else if (buf.length > 32768) {
              // If no stray HTTP header was found within 32KB, pass raw
              clientSocket.write(buf);
              headerNormalized = true;
              buf = Buffer.alloc(0);
              return;
            }
          } else {
            clientSocket.write(chunk);
          }
        });

        phoneSocket.on('error', (err) => {
          this.#log.warn({ err }, 'phone socket error in proxy');
          clientSocket.destroy();
        });

        phoneSocket.on('close', () => {
          clientSocket.end();
        });

        clientSocket.on('error', () => {
          phoneSocket.destroy();
        });

        clientSocket.on('close', () => {
          phoneSocket.destroy();
        });
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        this.#port = addr.port;
        this.#log.info({ port: this.#port }, 'stream proxy listening');
        resolve(this.#port);
      });

      server.on('error', reject);
    });
  }

  async stop(): Promise<void> {
    if (this.#phoneSocket) {
      this.#phoneSocket.destroy();
      this.#phoneSocket = null;
    }
    if (this.#server) {
      await new Promise<void>((r) => this.#server!.close(() => r()));
      this.#server = null;
      this.#port = 0;
    }
  }
}
