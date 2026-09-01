# 04 — Server Structure (Modular Monolith)

## 1. What "modular monolith" means here

One process, one deployable, one repository — internally divided into modules with
enforced boundaries, so it could be split later but never pays distributed-system
costs now.

**The rules, in order of importance:**

1. **A module is a folder with an `index.ts`. That file is its entire public API.**
   Importing `modules/pipeline/internal/FfmpegProcess` from another module is a
   lint error.
2. **Modules never import each other's internals, and never share mutable state.**
   They communicate through injected interfaces or the event bus.
3. **Dependencies point inward.** `domain/` knows nothing about `infrastructure/`.
   A domain file must never import `child_process`, `fastify`, or `pino`.
4. **One module owns each piece of state.** Two modules writing the same state is
   the bug this architecture exists to prevent.
5. **The event bus carries facts, not commands.** `device.connected` is a fact.
   `startStreaming` is a command and belongs in a direct interface call.

There is no dependency-injection framework. Composition happens in one file,
`src/composition-root.ts`, which constructs every module and wires them together.
A DI container for seven modules is ceremony.

## 2. File tree

```
server/
├── package.json
├── tsconfig.json
├── src/
│   ├── main.ts                       # entry: load config, build, start, signals
│   ├── composition-root.ts           # the only place modules are wired together
│   │
│   ├── kernel/                       # shared by all modules; depends on nothing
│   │   ├── events/
│   │   │   ├── EventBus.ts           # typed pub/sub over EventEmitter
│   │   │   └── events.ts             # the exhaustive event union
│   │   ├── errors/
│   │   │   ├── AppError.ts           # code + message + cause + retryable
│   │   │   └── codes.ts
│   │   ├── logging/logger.ts         # pino instance factory
│   │   ├── process/
│   │   │   ├── ManagedProcess.ts     # spawn + restart + backoff + log capture
│   │   │   └── shutdown.ts           # ordered graceful shutdown
│   │   └── result/Result.ts          # Ok/Err, for expected failures
│   │
│   ├── modules/
│   │   ├── config/
│   │   │   ├── index.ts              # ConfigModule
│   │   │   ├── domain/schema.ts      # Zod schema + defaults
│   │   │   └── infrastructure/FileConfigStore.ts   # atomic write
│   │   │
│   │   ├── discovery/
│   │   │   ├── index.ts              # DiscoveryModule
│   │   │   ├── domain/
│   │   │   │   ├── Device.ts         # udid, name, model, iosVersion
│   │   │   │   └── DevicePort.ts     # interface the domain depends on
│   │   │   ├── application/WatchDevices.ts        # 2 s poll, emits facts
│   │   │   └── infrastructure/LibimobiledeviceAdapter.ts  # idevice_id, ideviceinfo
│   │   │
│   │   ├── tunnel/
│   │   │   ├── index.ts              # TunnelModule
│   │   │   ├── domain/Tunnel.ts      # localPort, devicePort, state
│   │   │   ├── application/
│   │   │   │   ├── OpenTunnel.ts
│   │   │   │   └── CloseTunnel.ts
│   │   │   └── infrastructure/IproxyProcess.ts    # ManagedProcess wrapper
│   │   │
│   │   ├── device-control/
│   │   │   ├── index.ts              # DeviceControlModule
│   │   │   ├── domain/
│   │   │   │   ├── Settings.ts       # re-exported from packages/shared
│   │   │   │   └── PhoneClient.ts    # interface
│   │   │   ├── application/
│   │   │   │   ├── FetchCapabilities.ts
│   │   │   │   ├── ApplySettings.ts  # decides restart-required
│   │   │   │   └── HealthCheck.ts    # + protocol version gate
│   │   │   └── infrastructure/HttpPhoneClient.ts  # fetch over the tunnel
│   │   │
│   │   ├── pipeline/
│   │   │   ├── index.ts              # PipelineModule — owns the state machine
│   │   │   ├── domain/
│   │   │   │   ├── PipelineState.ts  # the enum from 01 §7
│   │   │   │   ├── StreamProfile.ts  # fmp4 | mjpeg
│   │   │   │   └── FfmpegArgs.ts     # pure arg construction — unit tested
│   │   │   ├── application/
│   │   │   │   ├── StartStream.ts
│   │   │   │   ├── StopStream.ts
│   │   │   │   ├── RestartStream.ts  # reconfiguration path
│   │   │   │   └── DegradeQuality.ts # thermal/drop response
│   │   │   └── infrastructure/
│   │   │       ├── FfmpegProcess.ts
│   │   │       └── PlaceholderFeed.ts  # colour bars while disconnected
│   │   │
│   │   ├── video-device/
│   │   │   ├── index.ts              # VideoDeviceModule
│   │   │   ├── domain/VirtualCamera.ts
│   │   │   └── infrastructure/
│   │   │       ├── V4l2LoopbackAdapter.ts   # modprobe state, v4l2loopback-ctl
│   │   │       └── DeviceProbe.ts           # find our device by card_label
│   │   │
│   │   ├── audio-device/
│   │   │   ├── index.ts              # AudioDeviceModule
│   │   │   ├── domain/VirtualMicrophone.ts
│   │   │   └── infrastructure/PactlAdapter.ts   # load/unload null sink
│   │   │
│   │   ├── telemetry/
│   │   │   ├── index.ts              # TelemetryModule
│   │   │   ├── domain/Metrics.ts     # ring buffer, 300 samples
│   │   │   └── application/CollectMetrics.ts    # ffmpeg stderr + /telemetry
│   │   │
│   │   └── api/
│   │       ├── index.ts              # ApiModule — Fastify
│   │       ├── routes/
│   │       │   ├── status.routes.ts
│   │       │   ├── settings.routes.ts
│   │       │   ├── stream.routes.ts
│   │       │   └── ws.routes.ts
│   │       ├── schemas/              # Zod → Fastify JSON schema
│   │       └── static/               # the local control UI
│   │
├── test/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
└── scripts/
    ├── setup-linux.sh
    └── doctor.sh
```

## 3. Module responsibilities and ownership

| Module | Owns | Depends on | Emits |
|---|---|---|---|
| `config` | The persisted config file | — | `config.changed` |
| `discovery` | Which devices exist | `config` | `device.connected`, `device.disconnected` |
| `tunnel` | The `iproxy` process | `config` | `tunnel.opened`, `tunnel.closed`, `tunnel.failed` |
| `device-control` | Phone settings + capabilities | `tunnel` | `phone.ready`, `phone.settings.changed`, `phone.protocol.mismatch` |
| `video-device` | `/dev/videoN` lifecycle | `config` | `video.device.ready`, `video.device.lost` |
| `audio-device` | The PipeWire null sink | `config` | `audio.sink.ready`, `audio.sink.lost` |
| `pipeline` | **The state machine and the ffmpeg process** | all of the above | `pipeline.state.changed`, `pipeline.error` |
| `telemetry` | Metrics ring buffer | `pipeline`, `device-control` | `telemetry.sample`, `telemetry.degraded` |
| `api` | HTTP/WS surface on 47800 | all | — |

`pipeline` is the only module that may call `StartStream`. Nothing else starts
ffmpeg. If a second code path can spawn ffmpeg, two processes eventually write to
the same V4L2 device and the output tears.

## 4. Event bus

```ts
export type AppEvent =
  | { type: 'device.connected';        udid: string; name: string; model: string }
  | { type: 'device.disconnected';     udid: string }
  | { type: 'tunnel.opened';           localPort: number; devicePort: number }
  | { type: 'tunnel.closed';           reason: string }
  | { type: 'tunnel.failed';           error: string }
  | { type: 'phone.ready';             capabilities: Capabilities }
  | { type: 'phone.settings.changed';  settings: Settings }
  | { type: 'phone.protocol.mismatch'; expected: number; actual: number }
  | { type: 'video.device.ready';      path: string; label: string }
  | { type: 'video.device.lost';       path: string }
  | { type: 'audio.sink.ready';        sinkName: string; moduleId: number }
  | { type: 'audio.sink.lost';         sinkName: string }
  | { type: 'pipeline.state.changed';  from: PipelineState; to: PipelineState }
  | { type: 'pipeline.error';          code: string; message: string; fatal: boolean }
  | { type: 'telemetry.sample';        sample: MetricsSample }
  | { type: 'telemetry.degraded';      reason: 'thermal' | 'drops'; action: string };
```

`EventBus.emit` is typed on this union — an unlisted event is a compile error. The
bus is **synchronous**; handlers must not do slow work inline, they schedule it.

## 5. The ffmpeg invocation

Built by the pure function `FfmpegArgs.build(profile, settings, targets)`. It has
no side effects and is unit tested against fixtures — the single highest-value
test in the server.

**Primary profile (fMP4, video + audio):**

```bash
ffmpeg -hide_banner -loglevel warning -stats \
  -fflags +genpts -use_wallclock_as_timestamps 1 \
  -headers "Authorization: Bearer <TOKEN>\r\n" \
  -i "http://127.0.0.1:8080/stream.mp4" \
  -map 0:v:0 -vf "format=yuv420p" -f v4l2 /dev/video9 \
  -map 0:a:0 -f pulse -device "mobile_webcam_mic" "mobile_webcam"
```

**Fallback profile (MJPEG, video only):**

```bash
ffmpeg -hide_banner -loglevel warning -stats \
  -f mjpeg -i "http://127.0.0.1:8080/stream.mjpeg" \
  -vf "scale=1920:1080,format=yuv420p" -f v4l2 /dev/video9
```

Notes that matter:

- `format=yuv420p` is **required**. V4L2 consumers reject the encoder's native
  pixel format and the failure appears as a black frame in Zoom, not an error.
- Do not add `-re`. The source is live; `-re` re-paces it and adds latency.
- `-use_wallclock_as_timestamps 1` protects against timestamp gaps when the phone
  drops frames under thermal pressure.
- ffmpeg's `stats` output on stderr is parsed by `telemetry`. Do not silence it.
- **Do not add `-reconnect 1 -reconnect_streamed 1`.** Reconnection is owned by the
  `pipeline` module, not by ffmpeg — see the note below.

### 5.1 Reconnection is the pipeline's job, not ffmpeg's

ffmpeg's built-in HTTP reconnect flags are deliberately omitted. If both ffmpeg and
`pipeline` react to the same EOF, they race, and the damage is not merely duplicated
effort:

- On a restart-requiring change ([01 §5.5](01-architecture.md)), the new stream
  carries **different codec parameters**. ffmpeg reconnecting on its own splices a
  fresh initialisation segment into one continuous output, producing exactly the
  corrupt-output failure the reconfiguration protocol exists to prevent.
- Only `pipeline` can restart the **output** side — re-pinning the V4L2 caps and
  re-establishing the audio target. ffmpeg reconnecting its input while the output
  is stale leaves a half-configured pipeline.

Therefore: ffmpeg exits on EOF, `pipeline` observes the exit, and `pipeline` decides
whether to respawn. One owner, one code path.

## 6. Process supervision

`ManagedProcess` wraps every child (`iproxy`, `ffmpeg`).

- Exponential backoff on restart: 250 ms → 500 ms → 1 s → 2 s → 4 s, capped at 5 s.
- After 10 consecutive failures within 60 s, stop and emit `pipeline.error` with
  `fatal: true`. **Never restart forever in a hot loop** — it hides the real cause
  and burns CPU.
- stdout/stderr are line-buffered into the logger, tagged with the child name.
- On shutdown: `SIGTERM`, wait 3 s, then `SIGKILL`. ffmpeg needs the grace period
  to release the V4L2 device; killing it hard can leave the device unusable until
  the module is reloaded.

## 7. Local control API — `127.0.0.1:47800`

Bound to loopback only. Never `0.0.0.0`.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/status` | Pipeline state, device, video/audio device paths |
| `GET` | `/api/capabilities` | Cached from the phone |
| `GET` | `/api/settings` | Current settings |
| `PATCH` | `/api/settings` | Proxied to the phone; may trigger a restart |
| `POST` | `/api/stream/start` | |
| `POST` | `/api/stream/stop` | |
| `GET` | `/api/telemetry` | Last 300 samples |
| `GET` | `/api/logs?tail=200` | |
| `WS` | `/api/ws` | State changes + telemetry pushed at 1 Hz |
| `GET` | `/` | The static control UI |

## 8. Startup sequence — `main.ts`

```
1. Load + validate config (Zod). Invalid config → exit 1 with the field name.
2. Build the logger.
3. Construct modules via composition-root.
4. video-device: ensure /dev/videoN exists with the right label and caps.
5. audio-device: ensure the null sink exists.
6. api: bind 127.0.0.1:47800.
7. discovery: begin polling.
8. Register shutdown handlers for SIGINT/SIGTERM.
9. If config.autoStart: wait for phone.ready, then StartStream.
```

Graceful shutdown runs in reverse: stop ffmpeg, close the tunnel, unload the audio
sink, close the API. **The v4l2loopback module is deliberately left loaded** —
unloading it while an application holds the device wedges the kernel module.

## 9. Testing

| Level | Scope | Approach |
|---|---|---|
| Unit | `FfmpegArgs`, settings validation, state-machine transitions, backoff | Pure functions, no I/O. |
| Integration | Modules against fake adapters | Fake `PhoneClient` serving a canned fMP4 fixture; fake `pactl`/`v4l2` adapters. |
| Contract | Wire schemas | The same Zod schemas validate mobile fixtures and server fixtures. |
| Smoke | `scripts/doctor.sh` | Checks iproxy, module, sink, ffmpeg, device permissions and prints one actionable line per failure. |

Minimum bar before any feature is considered done: `FfmpegArgs.build` has a test
for every profile, and the state machine has a test for every transition
including the failure edges.
