import type { Camera } from "../../smartcam/modules/camera.ts";
import type { PlayAudioOptions } from "./speaker.ts";
import { AudioPacer } from "./speaker/pacer.ts";
import {
  type ChannelName,
  SURROUND_LAYOUTS,
  type SurroundLayout,
  SurroundPacer,
  inferLayout,
} from "./speaker/surroundPacer.ts";

/**
 * Ported from ref/camera/CameraGroup.ts, adapted to operate over this repo's `Camera`
 * SMARTCAM module (via camera.speaker.ts's monkey-patched audio methods) instead of the
 * reference's standalone Camera class. LED/privacy/motion/alarm/day-night/info control
 * aren't re-ported here — those already exist as native, first-class modules in this repo
 * (Led, LensMask, MotionDetection, Alarm — see src/smartcam/modules/), reachable directly
 * off each device's `.modules` map, so a group wrapper for them would just be indirection.
 *
 * Doesn't patch Camera itself — call `loadPlugins()` (or at least
 * `loadPlugins({ onvif: true, snapshot: true, speaker: true })`) before using a
 * CameraGroup, the same as any other consumer of these capabilities.
 */

export type SurroundChannelMap = Partial<Record<ChannelName, Camera[]>>;

export interface PlaySurroundAudioOptions extends PlayAudioOptions {
  /** Standard layout to decode into. Defaults to the smallest layout covering channelMap's keys. */
  layout?: SurroundLayout;
  /**
   * Upmix a mono/stereo source into `layout` using ffmpeg's `surround` filter (real
   * decorrelated rear channels, not a plain duplicate). Set false if the source is
   * already authored in `layout` (e.g. a real 5.1 file).
   */
  upmix?: boolean;
}

export class CameraGroup {
  readonly #cams: Camera[] = [];
  #pacer: AudioPacer | null = null;
  #preloadClaimed: Camera[] = [];

  addCam(cam: Camera): this {
    if (!this.#cams.includes(cam)) this.#cams.push(cam);
    return this;
  }

  removeCam(cam: Camera): this {
    const i = this.#cams.indexOf(cam);
    if (i !== -1) this.#cams.splice(i, 1);
    return this;
  }

  get cameras(): readonly Camera[] {
    return this.#cams;
  }

  // ── Audio ─────────────────────────────────────────────────────────────────────
  async connectAudio(cloudPassword?: string): Promise<void> {
    await Promise.all(this.#cams.map((c) => c.connectAudio(cloudPassword)));
  }

  disconnectAudio(): void {
    for (const cam of this.#cams) cam.disconnectAudio();
    this.cancelPreload();
  }

  /**
   * Start a continuous, real-time write loop fanned out to every connected camera in
   * the group, streaming near-silent filler frames — no source, no decoding. That's
   * what stays "spun up": a later playAudio() call hot-swaps a decoded source into this
   * already-running loop instead of starting one from scratch, so playback begins
   * almost instantly across the whole group.
   */
  async preloadAudio(): Promise<void> {
    if (this.#pacer?.running) return;
    const claimed: Camera[] = [];
    for (const cam of this.#cams) {
      try {
        cam._beginGroupAudio();
        claimed.push(cam);
      } catch {
        // camera not ready for group audio (not connected / already busy) — skip it
      }
    }
    this.#preloadClaimed = claimed;
    this.#pacer = new AudioPacer((tsData) => {
      for (const cam of claimed) cam._writeTs(tsData);
    });
    await this.#pacer.start();
  }

  /** Stop the preload loop started via preloadAudio() and release the claimed cameras. */
  cancelPreload(): void {
    this.#pacer?.stop();
    this.#pacer = null;
    for (const cam of this.#preloadClaimed) cam._endGroupAudio();
    this.#preloadClaimed = [];
  }

  /** Decodes source once with ffmpeg and fans out the same TS frames to all cameras in sync. */
  async playAudio(
    source: string,
    { volume = 1.0, trailingMs = 300 }: PlayAudioOptions = {},
  ): Promise<void> {
    if (this.#pacer?.running) {
      await this.#pacer.play(source, volume, trailingMs);
      return;
    }
    const ready: Camera[] = [];
    for (const cam of this.#cams) {
      try {
        cam._beginGroupAudio();
        ready.push(cam);
      } catch {
        // camera not ready for group audio — skip it
      }
    }
    if (ready.length === 0) throw new Error("No cameras available for audio");
    const pacer = new AudioPacer((tsData) => {
      for (const cam of ready) cam._writeTs(tsData);
    });
    try {
      await pacer.play(source, volume, trailingMs);
    } finally {
      pacer.stop();
      for (const cam of ready) cam._endGroupAudio();
    }
  }

  /**
   * Decodes `source` once into a real surround field and mixes it down onto your
   * physical cameras — e.g. `{ FL: [cam1], FR: [cam2], BL: [cam3], BR: [cam4] }`, or
   * with fewer speakers than channels, `{ FL: [cam1], FC: [cam1], FR: [cam2], ... }` to
   * blend center into the left camera. A camera named under multiple channels is NOT
   * sent multiple independent streams (that desyncs its PTS and stutters) — its assigned
   * channels are equal-power mixed into one output channel by ffmpeg's `pan` filter
   * before encoding, so every physical camera gets exactly one clean feed, all drained
   * from the same tick against the same decode.
   */
  async playSurroundAudio(
    source: string,
    channelMap: SurroundChannelMap,
    {
      volume = 1.0,
      trailingMs = 300,
      upmix = true,
      layout,
    }: PlaySurroundAudioOptions = {},
  ): Promise<void> {
    const keys = Object.keys(channelMap) as ChannelName[];
    if (keys.length === 0) throw new Error("channelMap must assign at least one channel");
    const resolvedLayout = layout ?? inferLayout(keys);
    const layoutChannels: readonly ChannelName[] = SURROUND_LAYOUTS[resolvedLayout];

    // Group by physical camera so each one becomes exactly one pan output channel,
    // even when it's named under several logical channels (e.g. phantom center).
    const camChannels = new Map<Camera, ChannelName[]>();
    for (const name of keys) {
      for (const cam of channelMap[name] ?? []) {
        const list = camChannels.get(cam);
        if (list) list.push(name);
        else camChannels.set(cam, [name]);
      }
    }
    const outputCams = [...camChannels.keys()];
    if (outputCams.length === 0)
      throw new Error("channelMap must assign at least one camera");

    const ready: Camera[] = [];
    for (const cam of outputCams) {
      try {
        cam._beginGroupAudio();
        ready.push(cam);
      } catch {
        // camera not ready for group audio — skip it
      }
    }
    if (ready.length === 0) throw new Error("No cameras available for surround audio");
    const readySet = new Set(ready);
    const readyCams = outputCams.filter((cam) => readySet.has(cam));

    const panTerms = readyCams.map((cam, i) => {
      const names = camChannels.get(cam) ?? [];
      const gain = 1 / Math.sqrt(names.length); // equal-power mix when a camera doubles up
      const terms = names
        .map((name) => `${gain}*c${layoutChannels.indexOf(name)}`)
        .join("+");
      return `c${i}=${terms}`;
    });
    const audioFilter = [
      `volume=${volume}`,
      ...(upmix && resolvedLayout !== "stereo"
        ? [`surround=chl_out=${resolvedLayout}`]
        : []),
      `pan=${readyCams.length}c|${panTerms.join("|")}`,
    ].join(",");

    const writers = readyCams.map((cam) => [(ts: Buffer) => cam._writeTs(ts)]);
    const pacer = new SurroundPacer(writers);
    try {
      await pacer.play(source, readyCams.length, audioFilter, trailingMs);
    } finally {
      pacer.stop();
      for (const cam of ready) cam._endGroupAudio();
    }
  }

  // ── Snapshots ─────────────────────────────────────────────────────────────────
  snapshot(): Promise<{ host: string; image: Buffer }[]> {
    return Promise.all(
      this.#cams.map(async (c) => ({
        host: c.device.host,
        image: await c.getSnapshot(),
      })),
    );
  }

  // ── ONVIF events ──────────────────────────────────────────────────────────────
  startEvents(): void {
    for (const cam of this.#cams) cam.startEvents();
  }

  stopEvents(): void {
    for (const cam of this.#cams) cam.stopEvents();
  }
}
