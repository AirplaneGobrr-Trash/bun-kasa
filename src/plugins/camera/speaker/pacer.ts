import { type ChildProcess, spawn } from "node:child_process";
import { makeAudioTs } from "./mpegts.ts";

/** Ported near-verbatim from ref/camera/speaker/pacer.ts. */

export const FRAME = 160; // 20ms @ 8kHz G.711 A-law
export const FRAME_MS = 20;
export const SILENCE = Buffer.alloc(FRAME, 0xd5); // A-law silence byte

export type WriteFrame = (tsData: Buffer) => void;

/** Decodes one audio source into 20ms G.711 frames for AudioPacer to pull from. */
class DecodeSource {
  readonly #ff: ChildProcess;
  #frameQueue: Buffer[] = [];
  #leftover = Buffer.alloc(0);
  #done = false;
  #error: Error | null = null;

  constructor(source: string, volume: number) {
    const isUrl = source.startsWith("http://") || source.startsWith("https://");
    this.#ff = spawn("ffmpeg", [
      "-loglevel",
      "quiet",
      ...(isUrl ? ["-reconnect", "1", "-reconnect_streamed", "1"] : []),
      "-i",
      source,
      "-af",
      `volume=${volume}`,
      "-ar",
      "8000",
      "-ac",
      "1",
      "-acodec",
      "pcm_alaw",
      "-f",
      "alaw",
      "pipe:1",
    ]);

    this.#ff.stdout?.on("data", (chunk: Buffer) => {
      this.#leftover = Buffer.concat([this.#leftover, chunk]);
      while (this.#leftover.length >= FRAME) {
        this.#frameQueue.push(Buffer.from(this.#leftover.subarray(0, FRAME)));
        this.#leftover = this.#leftover.subarray(FRAME);
      }
    });
    this.#ff.stdout?.on("end", () => {
      this.#done = true;
    });
    this.#ff.on("error", (e: Error) => {
      this.#error = e;
      this.#done = true;
    });
  }

  get error(): Error | null {
    return this.#error;
  }
  /** True once ffmpeg has exited and every decoded frame has been drained. */
  get finished(): boolean {
    return this.#done && this.#frameQueue.length === 0;
  }
  /** Next frame if one's ready, else undefined — caller fills the gap with silence. */
  shift(): Buffer | undefined {
    return this.#frameQueue.shift();
  }
  kill(): void {
    this.#ff.kill();
  }
}

/**
 * Owns a continuous, real-time-paced write loop to one or more cameras. While idle
 * it streams near-silent filler frames — that's what keeps the loop (and, for a
 * live URL, the network connection) warm. `play()` swaps a decoded source into
 * that same already-running loop, so playback starts with no ffmpeg/network
 * spin-up delay, then falls back to filler frames automatically once it drains.
 */
export class AudioPacer {
  readonly #write: WriteFrame;
  #interval: ReturnType<typeof setInterval> | null = null;
  #t0 = 0;
  #frameN = 0;
  #pts90k = 0;
  #trailingMs = 300;
  #source: DecodeSource | null = null;
  #resolve: (() => void) | null = null;
  #reject: ((e: Error) => void) | null = null;
  #started: Promise<void> | null = null;
  #startedResolve: (() => void) | null = null;

  constructor(write: WriteFrame) {
    this.#write = write;
  }

  get running(): boolean {
    return this.#interval !== null;
  }

  /**
   * Begin the continuous filler loop. Idempotent — safe to call repeatedly. Resolves
   * once the loop has actually fired its first tick, i.e. filler frames are really
   * flowing to the camera(s), not just once the interval is scheduled.
   */
  start(): Promise<void> {
    if (this.#interval) return this.#started ?? Promise.resolve();
    this.#t0 = performance.now();
    this.#frameN = 0;
    this.#started = new Promise((resolve) => {
      this.#startedResolve = resolve;
    });
    this.#interval = setInterval(() => this.#tick(), 10);
    return this.#started;
  }

  /** Stop the loop entirely, aborting any in-flight decode. */
  stop(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
    this.#source?.kill();
    this.#source = null;
    this.#started = null;
    this.#startedResolve = null;
    const reject = this.#reject;
    this.#resolve = null;
    this.#reject = null;
    reject?.(new Error("AudioPacer stopped"));
  }

  #tick(): void {
    if (this.#startedResolve) {
      this.#startedResolve();
      this.#startedResolve = null;
    }
    const due = Math.floor((performance.now() - this.#t0) / FRAME_MS);
    while (this.#frameN < due) {
      let payload: Buffer = SILENCE;
      if (this.#source) {
        payload = this.#source.shift() ?? SILENCE;
        if (this.#source.finished) {
          const err = this.#source.error;
          const resolve = this.#resolve;
          const reject = this.#reject;
          this.#source = null;
          this.#resolve = null;
          this.#reject = null;
          if (err) reject?.(err);
          else setTimeout(() => resolve?.(), this.#trailingMs);
        }
      }
      this.#write(makeAudioTs(payload, this.#pts90k));
      this.#pts90k = (this.#pts90k + 1800) & 0x1fffffff;
      this.#frameN++;
    }
  }

  /** Decode `source` and feed it into this loop (starting the loop if it isn't already). */
  play(source: string, volume: number, trailingMs: number): Promise<void> {
    if (this.#source)
      return Promise.reject(new Error("AudioPacer is already playing a source"));
    this.start();
    this.#trailingMs = trailingMs;
    this.#source = new DecodeSource(source, volume);
    return new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }
}
