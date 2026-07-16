import { type ChildProcess, spawn } from "node:child_process";
import { makeAudioTs } from "./mpegts.ts";
import { FRAME, FRAME_MS, SILENCE } from "./pacer.ts";

/** Ported near-verbatim from ref/camera/speaker/surroundPacer.ts. */

export type ChannelName = "FL" | "FR" | "FC" | "LFE" | "BL" | "BR" | "SL" | "SR";

/** Standard channel order ffmpeg uses when decoding to these layouts — matches libavutil's default. */
export const SURROUND_LAYOUTS = {
  stereo: ["FL", "FR"],
  quad: ["FL", "FR", "BL", "BR"],
  "5.1": ["FL", "FR", "FC", "LFE", "BL", "BR"],
  "7.1": ["FL", "FR", "FC", "LFE", "BL", "BR", "SL", "SR"],
} as const satisfies Record<string, readonly ChannelName[]>;

export type SurroundLayout = keyof typeof SURROUND_LAYOUTS;

export type WriteFrame = (tsData: Buffer) => void;

/** Picks the smallest standard layout that covers every requested channel. */
export function inferLayout(channels: ChannelName[]): SurroundLayout {
  for (const layout of Object.keys(SURROUND_LAYOUTS) as SurroundLayout[]) {
    const set: readonly string[] = SURROUND_LAYOUTS[layout];
    if (channels.every((c) => set.includes(c))) return layout;
  }
  throw new Error(`No standard layout covers channels: ${channels.join(", ")}`);
}

/**
 * Decodes one source into `channelCount` interleaved 20ms G.711 output-channel queues
 * via a single ffmpeg process running `audioFilter` — one decode, so every output
 * channel is sample-accurate relative to the others. A-law is 1 byte/sample with no
 * cross-sample dependencies, so de-interleaving raw bytes by `index % channelCount`
 * is all that's needed to split channels back out.
 */
class MultiChannelDecodeSource {
  readonly #ff: ChildProcess;
  readonly #queues: Buffer[][];
  #leftover = Buffer.alloc(0);
  #done = false;
  #error: Error | null = null;

  constructor(source: string, channelCount: number, audioFilter: string) {
    this.#queues = Array.from({ length: channelCount }, () => []);
    const isUrl = source.startsWith("http://") || source.startsWith("https://");

    this.#ff = spawn("ffmpeg", [
      "-loglevel",
      "quiet",
      ...(isUrl ? ["-reconnect", "1", "-reconnect_streamed", "1"] : []),
      "-i",
      source,
      "-af",
      audioFilter,
      // -channel_layout is required, not just -ac: ffmpeg's implicit default layout
      // for a bare channel count can silently differ from the one the filter chain
      // actually produced (e.g. its default 4-channel remix isn't "quad" and drops
      // the back-left channel), even when the layout name and the count agree.
      "-ar",
      "8000",
      "-ac",
      String(channelCount),
      "-channel_layout",
      `${channelCount}c`,
      "-acodec",
      "pcm_alaw",
      "-f",
      "alaw",
      "pipe:1",
    ]);

    this.#ff.stdout?.on("data", (chunk: Buffer) => {
      this.#leftover = Buffer.concat([this.#leftover, chunk]);
      const blockBytes = FRAME * channelCount;
      while (this.#leftover.length >= blockBytes) {
        const block = this.#leftover.subarray(0, blockBytes);
        for (let c = 0; c < channelCount; c++) {
          const chBuf = Buffer.alloc(FRAME);
          for (let i = 0; i < FRAME; i++) chBuf[i] = block[i * channelCount + c] ?? 0;
          this.#queues[c]?.push(chBuf);
        }
        this.#leftover = this.#leftover.subarray(blockBytes);
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
  get finished(): boolean {
    return this.#done && this.#queues.every((q) => q.length === 0);
  }
  /** Next frame per channel (index-aligned with the caller's channel order). */
  shiftAll(): (Buffer | undefined)[] {
    return this.#queues.map((q) => q.shift());
  }
  kill(): void {
    this.#ff.kill();
  }
}

/**
 * Like AudioPacer, but paces N output channels off one shared clock and one shared
 * decode, fanning each channel out to its own list of writers. Because every channel
 * is drained from the same tick against the same decoded source, cameras assigned to
 * different channels stay in lockstep the way they would behind a real AVR.
 *
 * Each output channel should map to exactly one camera (see CameraGroup.playSurroundAudio,
 * which uses ffmpeg's `pan` filter to mix any logical channels sharing a physical camera
 * into a single output channel) — a camera fed by more than one writer would get two
 * independent, unsynchronized 20ms frames per tick instead of one, causing stutter.
 */
export class SurroundPacer {
  readonly #writers: readonly WriteFrame[][];
  #interval: ReturnType<typeof setInterval> | null = null;
  #t0 = 0;
  #frameN = 0;
  #pts90k = 0;
  #trailingMs = 300;
  #source: MultiChannelDecodeSource | null = null;
  #resolve: (() => void) | null = null;
  #reject: ((e: Error) => void) | null = null;

  /** `writers[i]` are the sinks for output channel `i`. */
  constructor(writers: readonly WriteFrame[][]) {
    this.#writers = writers;
  }

  get running(): boolean {
    return this.#interval !== null;
  }

  start(): void {
    if (this.#interval) return;
    this.#t0 = performance.now();
    this.#frameN = 0;
    this.#interval = setInterval(() => this.#tick(), 10);
  }

  stop(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = null;
    }
    this.#source?.kill();
    this.#source = null;
    const reject = this.#reject;
    this.#resolve = null;
    this.#reject = null;
    reject?.(new Error("SurroundPacer stopped"));
  }

  #tick(): void {
    const due = Math.floor((performance.now() - this.#t0) / FRAME_MS);
    while (this.#frameN < due) {
      let payloads: (Buffer | undefined)[] = this.#writers.map(() => undefined);
      if (this.#source) {
        payloads = this.#source.shiftAll();
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
      for (let c = 0; c < this.#writers.length; c++) {
        const ts = makeAudioTs(payloads[c] ?? SILENCE, this.#pts90k);
        for (const write of this.#writers[c] ?? []) write(ts);
      }
      this.#pts90k = (this.#pts90k + 1800) & 0x1fffffff;
      this.#frameN++;
    }
  }

  /** Decode `source` through `audioFilter` into `channelCount` channels and feed them into this loop. */
  play(
    source: string,
    channelCount: number,
    audioFilter: string,
    trailingMs: number,
  ): Promise<void> {
    if (this.#source) {
      return Promise.reject(new Error("SurroundPacer is already playing a source"));
    }
    if (channelCount !== this.#writers.length) {
      return Promise.reject(
        new Error(
          `channelCount (${channelCount}) doesn't match writers count (${this.#writers.length})`,
        ),
      );
    }
    this.start();
    this.#trailingMs = trailingMs;
    this.#source = new MultiChannelDecodeSource(source, channelCount, audioFilter);
    return new Promise((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
  }
}
