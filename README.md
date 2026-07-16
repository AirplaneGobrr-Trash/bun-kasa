# bun-kasa

Control TP-Link Kasa & Tapo smart plugs, bulbs, strips, hubs, and cameras from Bun, over your
LAN. No cloud, no CLI wrapper, no Python runtime.

It's a TypeScript port of two Python projects, rebuilt for Bun from the transport layer up:
[python-kasa](https://github.com/python-kasa/python-kasa) for the core Device/Module/Protocol/
Transport stack (IOT/SMART/SMARTCAM), and [pytapo](https://github.com/JurajNyiri/pytapo) for
the extra Tapo-camera RPC surface (battery, chime, floodlight, siren, pan/tilt, recordings, ...)
that python-kasa's SMARTCAM component set doesn't cover.

## What it talks to

| Family | Devices | How |
|---|---|---|
| IOT | Legacy Kasa plugs/bulbs/strips (EP10, older HS/KP/KL) | XOR (port 9999) or KLAP v1 |
| SMART | Newer Kasa/Tapo plugs/bulbs/hubs (KP125M, ...) | KLAP v2 or AES handshake over HTTP |
| SMARTCAM | Tapo cameras/doorbells (C100), hubs (H200) | AES/SSL handshake over HTTPS |

For the internals, see [architecture.md](architecture.md) — Device → Module/Feature →
Protocol → Transport.

## Install

```sh
bun add github:AirplaneGobrr-Trash/bun-kasa
```

## Quick start

```ts
import { discover } from "bun-kasa";

const found = await discover({ username: "you@example.com", password: "..." });

for (const device of Object.values(found)) {
  await device.update();
  console.log(`${device.alias} (${device.model}) — ${device.isOn ? "on" : "off"}`);
}
```

If you already know the IP, skip the broadcast:

```ts
import { discoverSingle } from "bun-kasa";

const device = await discoverSingle("10.0.0.42", {
  username: "you@example.com",
  password: "...",
});

if (device) {
  await device.update();
  await device.setState(true); // flip it on
}
```

Every device — plug, bulb, camera, whatever — exposes the same generic `features` map, so you
can introspect a device without knowing its exact capabilities up front:

```ts
for (const feature of device.features.values()) {
  console.log(feature.id, "=", feature.value);
}
// alias: Living Room Lamp
// on_off: true
// brightness: 80
// current_consumption: 4.2
// ...
```

If you already have transport/protocol details for a device, `connect()` skips discovery
entirely and hands you a ready-to-use `Device`.

## Controlling lights

On/off and status are on every `Device`:

```ts
await device.setState(true);   // turn on
await device.setState(false);  // turn off
console.log(device.isOn);
```

Bulbs get a `Light` module, reachable via `device.light` — same shape whether the bulb is a
legacy IOT device or a newer SMART one:

```ts
const light = device.light;
if (light) {
  await light.setBrightness(80);           // 0–100%
  await light.setHsv(280, 100, 90);        // hue °, saturation %, value %
  await light.setRgb(255, 0, 128);         // 0–255 per channel — converted to HSV under the hood
  await light.setColorTemp(4000);          // Kelvin, clamped to the bulb's supported range

  console.log(light.hsv);        // { hue: 280, saturation: 100, value: 90 }
  console.log(light.rgb);        // { red: 255, green: 0, blue: 128 }
  console.log(light.colorTemp);  // 4000
  console.log(light.brightness); // 80
}
```

`device.light` (and the other `CommonModules` getters — `device.energy`, `device.fan`,
`device.led`, `device.alarm`, etc.) returns `undefined` when the device doesn't support that
module at all. Calling `setColorTemp`/`setHsv`/`setRgb` on a bulb that lacks that specific
sub-capability (e.g. color temp on a non-tunable bulb) throws rather than silently no-opping.
For modules not in `CommonModules`, fall back to `device.modules.get(SomeModuleName)`.

## Plugins

Some functionality doesn't live in `src/core`/`src/smart`/`src/iot`/`src/smartcam` — it's
shipped as opt-in monkey-patches under `src/plugins/`, one directory per device family, so
you only pull in what you actually use:

```ts
import { camera } from "bun-kasa/src/plugins/index.ts";

await camera.loadPlugins(); // ONVIF, snapshots, video probing, two-way speaker audio
```

Patches `Camera` (SMARTCAM) with real ONVIF motion/person/tamper events, JPEG snapshot
capture via ffmpeg, RTSP stream probing, and one-way "talk" audio out through the camera's
speaker. Needs local-account credentials (see `src/plugins/camera/localCredentials.ts`) and
`ffmpeg`/`ffprobe` on `PATH` for the snapshot/probe calls. Load only what you need:

```ts
await camera.loadPlugins({ onvif: true, snapshot: true, video: false, speaker: false });
```

`camera.loadPlugins()` is idempotent — safe to call more than once or combine with a partial
call.

## Development

```sh
bun install
bun run typecheck   # tsc --noEmit
bun run lint         # biome check .
bun run lint:fix      # biome check --write .
bun test              # bun:test unit tests
```

`typecheck` and `lint` stay green, always.

`ref/python-kasa/` and `ref/pytapo/` live in the repo as porting references. Both are excluded
from the build and from lint, and neither is imported from.

## Credits

This library exists because of two upstream projects it ports from:

- **[python-kasa](https://github.com/python-kasa/python-kasa)** (GPL-3.0) — the core
  Device/Module/Feature/Protocol/Transport architecture and the IOT/SMART/SMARTCAM device
  support (`src/core/`, `src/iot/`, `src/smart/`, `src/smartcam/`) are a direct port of it.
- **[pytapo](https://github.com/JurajNyiri/pytapo)** (MIT) by [Juraj
  Nyíri](https://github.com/JurajNyiri) — the additional Tapo-camera RPCs in `src/tapo/`
  (battery, chime, floodlight, hub siren, image tuning, pan/tilt, recordings, alarm events)
  are ported from it, since python-kasa's own SMARTCAM component set doesn't cover them.

Neither project is affiliated with this one; all credit for the original protocol
reverse-engineering and API design belongs to their authors and contributors — see
[Credits.md](Credits.md) for the full contributor lists.

## License

GPL-3.0-or-later — see [LICENSE](LICENSE). This is a derivative work of
[python-kasa](https://github.com/python-kasa/python-kasa) (GPL-3.0), so the license carries
forward for the codebase as a whole. `src/tapo/` additionally ports from
[pytapo](https://github.com/JurajNyiri/pytapo), which is MIT-licensed — its original
copyright notice is preserved here per the MIT license's terms:

> Copyright (c) 2020 Juraj Nyíri
