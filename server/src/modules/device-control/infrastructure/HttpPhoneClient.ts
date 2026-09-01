import {
  CapabilitiesSchema,
  HealthSchema,
  SettingsSchema,
  TelemetrySchema,
  type Capabilities,
  type Health,
  type Settings,
  type SettingsPatch,
  type Telemetry,
  type WireError,
} from '@mobile-webcam/shared';
import { AppError } from '../../../kernel/errors/AppError.js';
import type { PhoneClient } from '../domain/PhoneClient.js';

export interface HttpPhoneClientOptions {
  baseUrl: () => string;
  token: () => string;
  timeoutMs?: number;
}

export class HttpPhoneClient implements PhoneClient {
  readonly #opts: Required<HttpPhoneClientOptions>;

  constructor(opts: HttpPhoneClientOptions) {
    this.#opts = { timeoutMs: 5000, ...opts };
  }

  async #request<T>(
    path: string,
    schema: { parse: (v: unknown) => T },
    init: RequestInit = {},
  ): Promise<T> {
    const url = `${this.#opts.baseUrl()}${path}`;
    const token = this.#opts.token();
    const headers: Record<string, string> = {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };

    let res: Response;
    try {
      res = await fetch(url, {
        ...init,
        headers,
        signal: AbortSignal.timeout(this.#opts.timeoutMs),
      });
    } catch (cause) {
      // ECONNRESET here means the tunnel reached the phone and the phone refused
      // the port — the app is not serving. docs/06 §4.
      throw new AppError({
        code: 'device_not_found',
        message: `Cannot reach the phone at ${url}. Is the app open and serving?`,
        retryable: true,
        cause,
      });
    }

    if (!res.ok) {
      let wire: WireError | null = null;
      try { wire = (await res.json()) as WireError; } catch { /* non-JSON body */ }
      throw new AppError({
        code: wire?.error ?? 'internal',
        message: wire?.message ?? `${res.status} ${res.statusText} for ${path}`,
        ...(wire?.field ? { field: wire.field } : {}),
        retryable: res.status >= 500,
      });
    }

    if (res.status === 204) return undefined as T;
    return schema.parse(await res.json());
  }

  health(): Promise<Health> {
    return this.#request('/health', HealthSchema);
  }

  capabilities(): Promise<Capabilities> {
    return this.#request('/capabilities', CapabilitiesSchema);
  }

  settings(): Promise<Settings> {
    return this.#request('/settings', SettingsSchema);
  }

  patchSettings(patch: SettingsPatch): Promise<Settings> {
    return this.#request('/settings', SettingsSchema, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  }

  telemetry(): Promise<Telemetry> {
    return this.#request('/telemetry', TelemetrySchema);
  }

  async focusAt(x: number, y: number): Promise<void> {
    await this.#request('/actions/focus', { parse: () => undefined }, {
      method: 'POST',
      body: JSON.stringify({ x, y }),
    });
  }

  switchCamera(lens: string): Promise<Capabilities> {
    return this.#request('/actions/switch-camera', CapabilitiesSchema, {
      method: 'POST',
      body: JSON.stringify({ lens }),
    });
  }
}
