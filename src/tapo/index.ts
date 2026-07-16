/**
 * Monkey-patches ported from pytapo (ref/pytapo/), a separate unofficial Tapo camera
 * client with a different/broader RPC surface than python-kasa's smartcam component
 * set — distinct lineage from ref/python-kasa/, kept in its own folder so the two
 * reference ports never mix.
 *
 * Unlike src/plugins/ (opt-in via loadPlugins()), everything here is applied
 * unconditionally as an import side effect — there is no loader to call. src/index.ts
 * imports this module for that reason.
 */

import "./camera.maintenance.ts";
import "./camera.imagetuning.ts";
import "./camera.alarmevents.ts";
import "./camera.recordings.ts";
import "./camera.floodlight.ts";
import "./camera.hubsiren.ts";
import "./camera.chime.ts";
import "./camera.battery.ts";
import "./camera.misc.ts";
import "./pantilt.motor.ts";
