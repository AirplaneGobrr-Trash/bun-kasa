import { Camera } from "../../smartcam/modules/camera.ts";
import { makeAudioTs } from "./speaker/mpegts.ts";
import { AudioPacer } from "./speaker/pacer.ts";
import { type WriteFrame, runTalkChannel } from "./speaker/talkChannel.ts";

/**
 * Monkey-patch: two-way "talk" audio, ported from ref/camera/Camera.ts's audio methods
 * onto the existing `Camera` module. Speaks the proprietary port-8800 protocol (digest
 * auth derived from the *cloud* password — distinct from the local account used for
 * ONVIF/RTSP, see localCredentials.ts), not the JSON-RPC securePassthrough channel.
 * Doesn't touch src/smartcam/modules/camera.ts. Per-instance state lives in a WeakMap
 * since prototype patches can't add real instance fields to an existing class.
 */

export interface PlayAudioOptions {
  volume?: number;
  trailingMs?: number;
}

interface SpeakerState {
  write: WriteFrame | null;
  audioBusy: boolean;
  audioRetryDelay: number;
  kaPts90k: number;
  kaTimer: ReturnType<typeof setInterval> | null;
  pacer: AudioPacer | null;
}

const stateMap = new WeakMap<Camera, SpeakerState>();

function getState(camera: Camera): SpeakerState {
  let state = stateMap.get(camera);
  if (!state) {
    state = {
      write: null,
      audioBusy: false,
      audioRetryDelay: 1000,
      kaPts90k: 0,
      kaTimer: null,
      pacer: null,
    };
    stateMap.set(camera, state);
  }
  return state;
}

declare module "../../smartcam/modules/camera.ts" {
  interface Camera {
    /**
     * Open the two-way talk audio channel. Requires the *cloud* account password
     * (falls back to `device.credentials?.password` if not passed explicitly).
     * Auto-reconnects with exponential backoff until `disconnectAudio()` is called.
     */
    connectAudio(
      cloudPassword?: string,
      options?: { onReconnectError?: (err: Error) => void },
    ): Promise<void>;
    disconnectAudio(): void;
    /**
     * Start a continuous, real-time filler-frame loop so a later `playAudio()` call
     * starts with no ffmpeg/network spin-up delay.
     */
    preloadAudio(): Promise<void>;
    cancelPreload(): void;
    playAudio(source: string, options?: PlayAudioOptions): Promise<void>;
    /** @internal used by cameraGroup.ts to fan a single decode out to multiple cameras. */
    _beginGroupAudio(): void;
    /** @internal used by cameraGroup.ts. */
    _endGroupAudio(): void;
    /** @internal used by cameraGroup.ts to write a pre-built TS packet directly. */
    _writeTs(data: Buffer): void;
  }
}

function startKeepalive(state: SpeakerState): void {
  state.kaTimer = setInterval(() => {
    // The pacer (once preloaded) already streams its own filler frames — don't double up.
    if (!state.write || state.audioBusy || state.pacer?.running) return;
    const silence = Buffer.alloc(160, 0xd5);
    state.write(makeAudioTs(silence, state.kaPts90k));
    state.kaPts90k = (state.kaPts90k + 1800) & 0x1fffffff;
  }, 5000);
}

function stopKeepalive(state: SpeakerState): void {
  if (state.kaTimer) {
    clearInterval(state.kaTimer);
    state.kaTimer = null;
  }
}

function connectAudioInternal(
  camera: Camera,
  state: SpeakerState,
  cloudPassword: string,
  onReconnectError?: (err: Error) => void,
): Promise<void> {
  if (state.write) return Promise.resolve();
  const onDisconnect = (): void => {
    stopKeepalive(state);
    state.write = null;
    if (state.audioRetryDelay === 0) return;
    const delay = state.audioRetryDelay;
    setTimeout(() => {
      connectAudioInternal(camera, state, cloudPassword, onReconnectError).catch(
        (ex: unknown) => {
          state.audioRetryDelay = Math.min(state.audioRetryDelay * 2, 30_000);
          onReconnectError?.(ex instanceof Error ? ex : new Error(String(ex)));
          onDisconnect();
        },
      );
    }, delay);
    state.audioRetryDelay = Math.min(state.audioRetryDelay * 2, 30_000);
  };

  return new Promise<void>((resolve, reject) => {
    runTalkChannel(
      camera.device.host,
      cloudPassword,
      (write) => {
        state.write = write;
        state.kaPts90k = 0;
        state.audioRetryDelay = 1000;
        startKeepalive(state);
        resolve();
      },
      onDisconnect,
    ).catch(reject);
  });
}

Camera.prototype.connectAudio = function (
  this: Camera,
  cloudPassword?: string,
  options?: { onReconnectError?: (err: Error) => void },
): Promise<void> {
  const password = cloudPassword ?? this.device.credentials?.password;
  if (!password) {
    return Promise.reject(
      new Error(
        `connectAudio requires the cloud account password for ${this.device.host}`,
      ),
    );
  }
  const state = getState(this);
  state.audioRetryDelay = 1000;
  return connectAudioInternal(this, state, password, options?.onReconnectError);
};

Camera.prototype.disconnectAudio = function (this: Camera): void {
  const state = getState(this);
  stopKeepalive(state);
  state.audioRetryDelay = 0;
  state.write = null;
  state.pacer?.stop();
  state.pacer = null;
};

Camera.prototype._beginGroupAudio = function (this: Camera): void {
  const state = getState(this);
  if (!state.write) throw new Error(`[${this.device.host}] audio not connected`);
  if (state.audioBusy) throw new Error(`[${this.device.host}] already playing audio`);
  if (state.pacer?.running) {
    throw new Error(`[${this.device.host}] audio preload active — cancel it first`);
  }
  state.audioBusy = true;
  stopKeepalive(state);
};

Camera.prototype._endGroupAudio = function (this: Camera): void {
  const state = getState(this);
  state.audioBusy = false;
  if (state.write) startKeepalive(state);
};

Camera.prototype._writeTs = function (this: Camera, data: Buffer): void {
  getState(this).write?.(data);
};

Camera.prototype.preloadAudio = async function (this: Camera): Promise<void> {
  const state = getState(this);
  if (state.pacer?.running) return;
  if (!state.write) {
    throw new Error(`[${this.device.host}] preloadAudio requires connectAudio() first`);
  }
  if (state.audioBusy)
    throw new Error(`[${this.device.host}] cannot preload — audio busy`);
  state.pacer ??= new AudioPacer((tsData) => state.write?.(tsData));
  await state.pacer.start();
};

Camera.prototype.cancelPreload = function (this: Camera): void {
  getState(this).pacer?.stop();
};

Camera.prototype.playAudio = async function (
  this: Camera,
  source: string,
  options: PlayAudioOptions = {},
): Promise<void> {
  const { volume = 1.0, trailingMs = 300 } = options;
  const state = getState(this);
  if (!state.write) {
    throw new Error(
      `Audio not connected — call connectAudio() first for ${this.device.host}`,
    );
  }
  if (state.pacer?.running) {
    return state.pacer.play(source, volume, trailingMs);
  }
  if (state.audioBusy) throw new Error(`Already playing audio on ${this.device.host}`);
  state.audioBusy = true;
  const pacer = new AudioPacer((tsData) => state.write?.(tsData));
  try {
    await pacer.play(source, volume, trailingMs);
  } finally {
    pacer.stop();
    state.audioBusy = false;
  }
};
