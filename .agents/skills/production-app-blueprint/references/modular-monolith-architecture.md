# Layered Modular Monolith Architecture Reference

One process, one deployable, internally divided into bounded-context modules with enforced boundaries, and layered inside each module (`domain` → `application` → `infrastructure`).

---

## 1. Directory Layout (TypeScript / Node.js & Python)

### TypeScript / Node.js Layout

```text
src/
├── main.ts                          # CLI entry: parse args, load config, buildApp(), signals
├── composition-root.ts              # The ONLY place modules & adapters are constructed and wired
├── kernel/                          # Shared primitives; depends on NO module
│   ├── paths/paths.ts               # Per-OS config, data, cache, and log directories
│   ├── events/
│   │   ├── EventBus.ts              # Synchronous typed pub/sub
│   │   └── events.ts                # Discriminated union of all domain/system facts
│   ├── errors/AppError.ts           # Structured error (code, message, retryable, cause)
│   ├── logging/logger.ts            # Structured logger factory
│   ├── process/
│   │   ├── ManagedProcess.ts        # Child process supervisor with exponential backoff
│   │   └── shutdown.ts              # Reverse-order graceful shutdown coordinator
│   └── result/Result.ts             # Ok<T> | Err<E>
└── modules/
    └── <module-name>/
        ├── index.ts                 # Public facade (exports Module class + public types ONLY)
        ├── domain/                  # Pure business rules, entities, Zod schemas, Port interfaces
        ├── application/             # Use cases (orchestrate domain + injected Port interfaces)
        └── infrastructure/          # Concrete adapters (HTTP, filesystem, SQLite, OS CLIs)
```

### Python Layout

```text
src/<app_name>/
├── __init__.py                      # __version__ = "1.0.0"
├── __main__.py                      # Entrypoint calling app.main()
├── app.py                           # CLI parser (run, window, dashboard, selftest, --version)
├── bootstrap.py                     # Composition root: wires all modules and adapters
├── shared/                          # Kernel shared by all modules; imports NO module
│   ├── paths.py                     # Per-OS config/data dirs (XDG / macOS Application Support / APPDATA)
│   ├── events.py                    # In-process EventBus
│   ├── errors.py                    # AppError / NeedsSetup
│   ├── desktop.py                   # Autostart registration (systemd / LaunchAgent / Windows Run key)
│   └── i18n/                        # en.json, ar.json + t()
└── modules/
    └── <module_name>/
        ├── __init__.py              # Public API (the ONLY import surface for other modules)
        ├── domain.py                # Pure domain logic + Protocol ports (ZERO I/O)
        ├── application.py           # Use-case service class
        └── infrastructure/          # Concrete implementations (HTTP, SQLite, OS commands, GUI)
```

---

## 2. Core Kernel Primitives (Copy-Paste Templates)

### 2.1 Per-OS Paths (`kernel/paths/paths.ts`)

```ts
import { homedir } from 'node:os';
import { join } from 'node:path';

export function getAppPaths(appName: string) {
  const home = homedir();
  const slug = appName.toLowerCase();

  if (process.platform === 'win32') {
    const appData = process.env.APPDATA || join(home, 'AppData', 'Roaming');
    const localAppData = process.env.LOCALAPPDATA || join(home, 'AppData', 'Local');
    return {
      configDir: join(appData, appName),
      dataDir: join(localAppData, appName),
      logDir: join(localAppData, appName, 'logs'),
    };
  }

  if (process.platform === 'darwin') {
    const base = join(home, 'Library', 'Application Support', appName);
    return {
      configDir: base,
      dataDir: base,
      logDir: join(home, 'Library', 'Logs', appName),
    };
  }

  // Linux / XDG
  const configHome = process.env.XDG_CONFIG_HOME || join(home, '.config');
  const dataHome = process.env.XDG_DATA_HOME || join(home, '.local', 'share');
  return {
    configDir: join(configHome, slug),
    dataDir: join(dataHome, slug),
    logDir: join(dataHome, slug),
  };
}
```

### 2.2 Typed Event Bus (`kernel/events/EventBus.ts`)

```ts
export type Handler<E> = (event: E) => void;

export class EventBus<AppEvent extends { type: string }> {
  readonly #handlers = new Map<string, Set<Handler<any>>>();

  on<T extends AppEvent['type']>(
    type: T,
    handler: Handler<Extract<AppEvent, { type: T }>>,
  ): () => void {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler);
    return () => set?.delete(handler);
  }

  emit(event: AppEvent): void {
    const set = this.#handlers.get(event.type);
    if (!set) return;
    for (const handler of set) {
      try {
        handler(event);
      } catch (err) {
        console.error(`[EventBus] handler failed on ${event.type}:`, err);
      }
    }
  }
}
```

---

## 3. Inside a Module: `domain` → `application` → `infrastructure`

### Example Module: `discovery`

1. **`modules/discovery/domain/Device.ts` (Pure Domain + Port Interface):**
   ```ts
   export interface Device {
     readonly id: string;
     readonly name: string;
     readonly platform: 'ios' | 'android';
   }

   export interface DevicePort {
     list(): Promise<Device[]>;
   }
   ```
2. **`modules/discovery/application/WatchDevices.ts` (Application Use Case):**
   ```ts
   import type { Device, DevicePort } from '../domain/Device.js';

   export class WatchDevices {
     constructor(
       private readonly port: DevicePort,
       private readonly onConnected: (d: Device) => void,
       private readonly onDisconnected: (id: string) => void,
     ) {}
     // Polls this.port.list() and invokes callbacks on state transitions
   }
   ```
3. **`modules/discovery/infrastructure/CompositeDeviceAdapter.ts` (Infrastructure):**
   ```ts
   import type { Device, DevicePort } from '../domain/Device.js';

   export class CompositeDeviceAdapter implements DevicePort {
     constructor(private readonly adapters: DevicePort[]) {}
     async list(): Promise<Device[]> {
       const results = await Promise.allSettled(this.adapters.map((a) => a.list()));
       return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
     }
   }
   ```
4. **`modules/discovery/index.ts` (Public Facade):**
   ```ts
   export type { Device, DevicePort } from './domain/Device.js';
   export { WatchDevices } from './application/WatchDevices.js';
   export { CompositeDeviceAdapter } from './infrastructure/CompositeDeviceAdapter.js';
   ```

---

## 4. Automated Architecture Boundary Test

Every modular monolith MUST include an automated architecture test that fails CI if:
1. Any `domain` file imports `infrastructure`, `application`, or I/O modules (`node:child_process`, `node:fs`, `node:http`, `fastify`, `subprocess`, `socket`).
2. Any module reaches into another module's internal files (`modules/other/infrastructure/...`) instead of importing its public package root (`modules/other/index.js` or `modules.other`).

### TypeScript Architecture Test (`test/unit/architecture.test.ts`)

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.ts') ? [p] : [];
  });
}

test('Modular monolith boundary rules', () => {
  const srcDir = join(process.cwd(), 'src');
  const files = walk(srcDir);

  for (const file of files) {
    const rel = relative(srcDir, file);
    const content = readFileSync(file, 'utf8');
    const imports = [...content.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);

    // Rule 1: domain/ files must never import infrastructure, application, or Node I/O
    if (rel.includes('/domain/')) {
      for (const imp of imports) {
        assert.ok(
          !imp.includes('infrastructure') &&
            !imp.includes('application') &&
            !imp.startsWith('node:fs') &&
            !imp.startsWith('node:child_process') &&
            !imp.startsWith('node:http'),
          `Domain purity violation in ${rel}: forbidden import "${imp}"`,
        );
      }
    }

    // Rule 2: Cross-module imports must go through modules/<other>/index.js
    const modMatch = /^modules\/([^/]+)\//.exec(rel);
    if (modMatch) {
      const currentMod = modMatch[1];
      for (const imp of imports) {
        const crossMatch = /modules\/([^/]+)\/(.+)/.exec(imp);
        if (crossMatch && crossMatch[1] !== currentMod) {
          assert.equal(
            crossMatch[2],
            'index.js',
            `Boundary violation in ${rel}: imported internal path "${imp}" of module "${crossMatch[1]}"`,
          );
        }
      }
    }
  }
});
```
