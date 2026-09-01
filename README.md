# mobile_webcam

Turn an iPhone into a 1080p USB webcam and microphone on Linux, with on-device
resolution control, Cinematic (shallow depth-of-field) video, and lens selection.
Output is consumable by OBS, Google Meet, Zoom, and any other V4L2 application.

- **Mobile app** — Expo SDK 56 / React Native 0.85, with a custom native Swift module.
- **Desktop service** — Node.js modular monolith running on the Linux host.
- **Transport** — USB cable via `usbmuxd`. No Wi-Fi, no cloud, no subscription.

## Status

Implemented. The desktop service builds and runs on Linux; the iOS app and its
Swift native module are written but **have never been compiled** — that needs
macOS (see below).

| Part | State |
|---|---|
| `packages/shared` | Builds, 13 tests passing |
| `server` | Builds, 13 tests passing, boots and serves its API |
| `scripts` | `doctor.sh` verified against a real Ubuntu 24.04 host |
| `mobile` (TS/React) | Typechecks clean |
| `mobile/modules/webcam-server` (Swift, ~2,100 lines) | **Never compiled — no Xcode on Linux** |

`docs/` remains the specification; the code follows it.

## Build and run

### Desktop (Linux)

```bash
npm install
npm run build
npm run setup:linux     # one-time: v4l2loopback + PipeWire sink (asks before each sudo)
npm run doctor          # verify the host
cd server && npm start  # control UI at http://127.0.0.1:47800
```

### Mobile (needs macOS or EAS)

Expo Go **cannot** run this app — it opens a listening socket and drives
`AVCaptureSession` from custom Swift. A development build is mandatory.

```bash
cd mobile
npx expo prebuild --clean
eas build --profile development --platform ios   # or: npx expo run:ios on a Mac
npx expo start --dev-client
```

The Swift compiles for the first time during that step, so expect to fix
compiler diagnostics on the first pass — it has only been checked statically.

## Read the docs in order

| Doc | Purpose |
|---|---|
| [00-overview.md](docs/00-overview.md) | Problem, goals, hard constraints, glossary |
| [01-architecture.md](docs/01-architecture.md) | The USB invariant, components, protocol, sequences |
| [02-tech-stack.md](docs/02-tech-stack.md) | Every dependency, version policy, prerequisites |
| [03-mobile-structure.md](docs/03-mobile-structure.md) | Expo app file tree, feature modules |
| [04-server-structure.md](docs/04-server-structure.md) | Node modular monolith, module boundaries |
| [05-features.md](docs/05-features.md) | Feature specs with acceptance criteria |
| [06-linux-integration.md](docs/06-linux-integration.md) | v4l2loopback, PipeWire, OBS, Meet |
| [07-roadmap.md](docs/07-roadmap.md) | Phased delivery plan |
| [08-running.md](docs/08-running.md) | **How to run it, and how to set up the iPhone app** |
| [09-native-module.md](docs/09-native-module.md) | How the Swift module compiles and reaches JavaScript |

**Implementers: read `00` and `01` before writing a single line.** `01` contains a
directional constraint that, if violated, produces an architecture that cannot
work over a cable.
