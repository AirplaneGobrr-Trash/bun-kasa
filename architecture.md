# bun-kasa architecture

`bun-kasa` is a TypeScript/Bun port of [python-kasa](https://github.com/python-kasa/python-kasa),
controlling TP-Link Kasa/Tapo smart-home devices (plugs, bulbs, strips, hubs, cameras) over
their local-network protocols. It is a library only — no CLI, no fixture-based test suite (yet).

## Layers

Request flow, outermost to innermost:

```
connect() / discover()          src/connect.ts, src/discover.ts
        │
        ▼
   Device                       src/core/device.ts (abstract base)
   ├─ IotDevice                 src/iot/iotdevice.ts
   ├─ SmartDevice                src/smart/smartdevice.ts
   │    └─ SmartCamDevice        src/smartcam/smartcamdevice.ts
        │
        ▼
   Module / Feature             src/core/module.ts, src/core/feature.ts
   (one Module instance per capability the device reports; each Module
    exposes 1+ Features, which are the generic get/set surface)
        │
        ▼
   Protocol                     src/protocols/*.ts
   (batches module queries into one device request per update() cycle,
    demultiplexes the response, translates device error codes)
        │
        ▼
   Transport                    src/transports/*.ts
   (owns the wire format: handshake/auth, encryption, HTTP or raw TCP)
```

## The three device families

python-kasa (and this port) support three protocol families, each with its own
Device/Module/Protocol/Transport stack. A device belongs to exactly one family.

| Family | Devices | Protocol | Transport | Encryption |
|---|---|---|---|---|
| **IOT** | Legacy Kasa plugs/bulbs/strips (e.g. EP10, older HS/KP/KL models) | `IotProtocol` | `XorTransport` or `KlapTransport` (v1) | XOR (port 9999) or KLAP v1 |
| **SMART** | Newer Kasa/Tapo plugs/bulbs/hubs (e.g. KP125M) | `SmartProtocol` | `KlapTransportV2` or `AesTransport` | KLAP v2 or RSA/AES handshake, over HTTP |
| **SMARTCAM** | Tapo cameras/doorbells (e.g. C100), and hubs like H200 | `SmartCamProtocol` (extends `SmartProtocol`) | `SslAesTransport` | Tapo AES/SSL handshake, over HTTPS |

`SmartCamDevice extends SmartDevice` — SMARTCAM reuses almost all of SMART's device/module
machinery (component negotiation, `initializeModules()`, feature registration) and only
overrides the handful of methods that differ (device-info shape, child enumeration, camera-
specific components). See [C100_FILES.md](C100_FILES.md) for the exact file list.

IOT is architecturally the odd one out: it doesn't do component negotiation. Each concrete
IOT device class (`IotPlug`, `IotBulb`, ...) has a **static** list of supported modules,
because legacy firmware doesn't report capabilities the way SMART/SMARTCAM do.

## Module registration (the extensibility seam)

SMART and SMARTCAM modules are **not** hardcoded per device class. Each family has a
`registry.ts` (`src/smart/registry.ts`, `src/smartcam/registry.ts`) exporting a flat array of
module classes. During `device.update()`, `initializeModules()` walks that array and
instantiates whichever modules the device's reported `components` (a capability list from the
device itself) actually support — this is python's `__init_subclass__` auto-registration
pattern, replaced with an explicit array since TS has no runtime subclass hooks.

**This is the intended extension point.** Adding support for a new capability on an existing
family means: write one new module file implementing the family's module base class
(`SmartModule` or a `SmartCamModule`/`DetectionModule` subclass), add one line to that
family's `registry.ts`. Nothing else needs to change — the module will auto-activate on any
device that reports the matching `requiredComponent`.

A `Feature` is the generic, introspectable read/write surface for a module — e.g.
`brightness`, `state`, `current_consumption`. `device.features` returns every feature across
every active module, keyed by id, regardless of which module owns it. This is why
[test.ts](test.ts)'s "dump every feature's value" loop is a decent generic smoke test: it
exercises every module's `attributeGetter` without needing per-module test code.

## TypeScript vs. Python structural differences

- **No multiple inheritance.** Python mixes in behavior like `class Emeter(Usage,
  EnergyInterface)`. TS equivalents in `src/interfaces/*.ts` are plain interfaces; shared
  default logic is a standalone exported helper function (e.g. `initializeEnergyFeatures()`)
  that concrete modules call explicitly rather than inherit.
- **No runtime subclass hooks.** Python's `__init_subclass__` auto-registration becomes the
  explicit `registry.ts` arrays described above.
- **Widened visibility.** Several `Device`/`Module` members that Python treats as
  convention-private are `public` here (e.g. `Device.lastUpdate`, `Module.addFeature`),
  because TS's `protected` only allows access within the same class hierarchy, not across
  sibling parent/child device instances (power-strip sockets, hub-attached children) the way
  Python's duck-typed privacy does.
- **`ModuleName<T>`** is a branded string (`string & { __brand: T }`) standing in for
  Python's `ModuleName(str, Generic[T])` — static typing only, no runtime effect.
- **`Device` has direct getters for `CommonModules`** (`device.light`, `device.energy`,
  `device.fan`, etc., in `src/core/device.ts`), each just `this.modules.get(CommonModules.X)`.
  Deliberate deviation from python-kasa, which only exposes `dev.modules[Module.X]` — added
  because the `.modules.get(CommonModules.X)` call site was judged too noisy for the handful
  of well-known cross-family modules. Family-specific modules (not in `CommonModules`) still
  go through `.modules.get()`. `IotStripPlug`'s legacy own-LED stub is named `ledState`, not
  `led`, to avoid colliding with this getter.

## Known sharp edges (found via real-hardware testing, see git history)

- **`SmartDevice.queryHelper()`** returns the full `{method: value}` response object, not
  unwrapped — every module's `.call(method)` indexes `result[method]` itself. Getting this
  wrong silently breaks any code path that calls `.call()` and reads its result.
- **`HttpClient.post()`**'s `json` option only stringifies when the value isn't already a
  string — some transports (`SslAesTransport`, `SslTransport`) need to pass an
  already-serialized JSON string through untouched because they sign the exact serialized
  bytes before sending.
- **UDP discovery races.** Some devices answer both legacy (port 9999, unauthenticated) and
  new-discovery (port 20002/20004, KLAP/AES) probes, sometimes without actually being
  provisioned for the newer scheme. `src/discover.ts` prefers a legacy response over a
  new-discovery one for this reason — see the comments in `DiscoverySession`.

## Where to look for X

- Add a new device model: check `src/connect.ts`'s `SUPPORTED_DEVICE_TYPES` /
  `getDeviceClassFromFamily`, and the family's device-type detection
  (`getDeviceTypeFromSysInfo` for IOT, `components`/`device_type` string matching for
  SMART/SMARTCAM).
- Add a new capability/module: write the module, register it in the family's `registry.ts`.
  See [C100_FILES.md](C100_FILES.md) for a concrete example scoped to SMARTCAM.
- Change wire-level behavior (encryption, handshake, retries): `src/transports/*.ts` and
  `src/protocols/*.ts`.
- Change discovery behavior: `src/discover.ts`.
- Add functionality with no python-kasa counterpart (nothing to port, so the module/
  registry pattern above doesn't apply): `src/plugins/` — monkey-patches applied via
  `declare module` + prototype assignment, loaded explicitly via `loadPlugins()`
  (`src/plugins/index.ts`), so the module they patch (e.g. `src/smartcam/modules/
  camera.ts`) stays a 1:1 mirror of upstream. See [C100_FILES.md](C100_FILES.md)'s
  "Camera plugins" section for the concrete example (snapshot/ONVIF/video-probe/speaker).
