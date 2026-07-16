import { Camera } from "../../smartcam/modules/camera.ts";
import { makeAudioTs } from "./speaker/mpegts.ts";
import { AudioPacer } from "./speaker/pacer.ts";
import { type WriteFrame, runTalkChannel } from "./speaker/talkChannel.ts";

/**
 * Monkey-patch: two-way "talk" audio, ported from ref/camera/Camera.ts's audio methods
 * onto the existing `Camera` module. Speaks the proprietary port-8800 protocol (digest
 * auth derived from the *cloud* password — distinct from the local account used for
 * ONVIF/RTSP, see localCredentials.ts), not the JSON-RPC securePassthrough channel.
 * Doesn't touch src/smartcam/modules/camera.ts.
 */

export interface PlayAudioOptions {
  volume?: number;
  trailingMs?: number;
}

export class CameraSpeaker {
  readonly #camera: Camera;
  #write: WriteFrame | null = null;
  #audioBusy = false;
  #audioRetryDelay = 1000;
  #kaPts90k = 0;
  #kaTimer: ReturnType<typeof setInterval> | null = null;
  #pacer: AudioPacer | null = null;

  constructor(camera: Camera) {
    this.#camera = camera;
  }

  #startKeepalive(): void {
    this.#kaTimer = setInterval(() => {
      // The pacer (once preloaded) already streams its own filler frames — don't double up.
      if (!this.#write || this.#audioBusy || this.#pacer?.running) return;
      const silence = Buffer.alloc(160, 0xd5);
      this.#write(makeAudioTs(silence, this.#kaPts90k));
      this.#kaPts90k = (this.#kaPts90k + 1800) & 0x1fffffff;
    }, 5000);
  }

  #stopKeepalive(): void {
    if (this.#kaTimer) {
      clearInterval(this.#kaTimer);
      this.#kaTimer = null;
    }
  }

  #connectInternal(
    cloudPassword: string,
    onReconnectError?: (err: Error) => void,
  ): Promise<void> {
    if (this.#write) return Promise.resolve();
    const onDisconnect = (): void => {
      this.#stopKeepalive();
      this.#write = null;
      if (this.#audioRetryDelay === 0) return;
      const delay = this.#audioRetryDelay;
      setTimeout(() => {
        this.#connectInternal(cloudPassword, onReconnectError).catch((ex: unknown) => {
          this.#audioRetryDelay = Math.min(this.#audioRetryDelay * 2, 30_000);
          onReconnectError?.(ex instanceof Error ? ex : new Error(String(ex)));
          onDisconnect();
        });
      }, delay);
      this.#audioRetryDelay = Math.min(this.#audioRetryDelay * 2, 30_000);
    };

    return new Promise<void>((resolve, reject) => {
      runTalkChannel(
        this.#camera.device.host,
        cloudPassword,
        (write) => {
          this.#write = write;
          this.#kaPts90k = 0;
          this.#audioRetryDelay = 1000;
          this.#startKeepalive();
          resolve();
        },
        onDisconnect,
      ).catch(reject);
    });
  }

  /**
   * Open the two-way talk audio channel. Requires the *cloud* account password
   * (falls back to `device.credentials?.password` if not passed explicitly).
   * Auto-reconnects with exponential backoff until `disconnect()` is called.
   */
  connect(
    cloudPassword?: string,
    options?: { onReconnectError?: (err: Error) => void },
  ): Promise<void> {
    const password = cloudPassword ?? this.#camera.device.credentials?.password;
    if (!password) {
      return Promise.reject(
        new Error(
          `speaker.connect requires the cloud account password for ${this.#camera.device.host}`,
        ),
      );
    }
    this.#audioRetryDelay = 1000;
    return this.#connectInternal(password, options?.onReconnectError);
  }

  disconnect(): void {
    this.#stopKeepalive();
    this.#audioRetryDelay = 0;
    this.#write = null;
    this.#pacer?.stop();
    this.#pacer = null;
  }

  /**
   * Start a continuous, real-time filler-frame loop so a later `play()` call
   * starts with no ffmpeg/network spin-up delay.
   */
  async preload(): Promise<void> {
    if (this.#pacer?.running) return;
    if (!this.#write) {
      throw new Error(`preload requires connect() first for ${this.#camera.device.host}`);
    }
    if (this.#audioBusy)
      throw new Error(`cannot preload — audio busy on ${this.#camera.device.host}`);
    this.#pacer ??= new AudioPacer((tsData) => this.#write?.(tsData));
    await this.#pacer.start();
  }

  cancelPreload(): void {
    this.#pacer?.stop();
  }

  async play(source: string, options: PlayAudioOptions = {}): Promise<void> {
    const { volume = 1.0, trailingMs = 300 } = options;
    if (!this.#write) {
      throw new Error(
        `Audio not connected — call connect() first for ${this.#camera.device.host}`,
      );
    }
    if (this.#pacer?.running) {
      return this.#pacer.play(source, volume, trailingMs);
    }
    if (this.#audioBusy)
      throw new Error(`Already playing audio on ${this.#camera.device.host}`);
    this.#audioBusy = true;
    const pacer = new AudioPacer((tsData) => this.#write?.(tsData));
    try {
      await pacer.play(source, volume, trailingMs);
    } finally {
      pacer.stop();
      this.#audioBusy = false;
    }
  }

  /** @internal used by group.ts to fan a single decode out to multiple cameras. */
  _beginGroup(): void {
    if (!this.#write)
      throw new Error(`[${this.#camera.device.host}] audio not connected`);
    if (this.#audioBusy)
      throw new Error(`[${this.#camera.device.host}] already playing audio`);
    if (this.#pacer?.running) {
      throw new Error(
        `[${this.#camera.device.host}] audio preload active — cancel it first`,
      );
    }
    this.#audioBusy = true;
    this.#stopKeepalive();
  }

  /** @internal used by group.ts. */
  _endGroup(): void {
    this.#audioBusy = false;
    if (this.#write) this.#startKeepalive();
  }

  /** @internal used by group.ts to write a pre-built TS packet directly. */
  _writeTs(data: Buffer): void {
    this.#write?.(data);
  }
}

declare module "../../smartcam/modules/camera.ts" {
  interface Camera {
    /** Two-way "talk" audio (connect/play/preload/disconnect). */
    readonly speaker: CameraSpeaker;
  }
}

const speakerMap = new WeakMap<Camera, CameraSpeaker>();

Object.defineProperty(Camera.prototype, "speaker", {
  configurable: true,
  get(this: Camera): CameraSpeaker {
    let instance = speakerMap.get(this);
    if (!instance) {
      instance = new CameraSpeaker(this);
      speakerMap.set(this, instance);
    }
    return instance;
  },
});
