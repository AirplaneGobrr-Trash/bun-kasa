import type { Credentials } from "../../core/credentials.ts";
import { Camera, StreamResolution } from "../../smartcam/modules/camera.ts";
import { resolveLocalCredentials } from "./localCredentials.ts";

/**
 * Monkey-patch: still-image snapshot capture, ported from ref/camera/Camera.ts's
 * snapshot() — a one-shot ffmpeg grab against the local RTSP stream (streamRtspUrl()
 * already builds that URL; ffmpeg just needs one keyframe out of it). Doesn't touch
 * src/smartcam/modules/camera.ts.
 */

export class CameraSnapshot {
  readonly #camera: Camera;

  constructor(camera: Camera) {
    this.#camera = camera;
  }

  /**
   * Capture a single JPEG frame from the camera's RTSP stream via ffmpeg.
   * `resolution` (e.g. "1280:720") scales the capture down via ffmpeg's `scale` filter.
   * Requires `ffmpeg` on PATH and local-account credentials (see localCredentials.ts).
   */
  get(credentials?: Credentials, options?: { resolution?: string }): Promise<Buffer> {
    // streamRtspUrl() falls back to *cloud* credentials via the private getCredentials()
    // helper when none are passed — RTSP needs the separate local-account credentials
    // instead (see localCredentials.ts), so always resolve and pass them explicitly.
    const rtspUrl = this.#camera.streamRtspUrl(resolveLocalCredentials(credentials), {
      streamResolution: StreamResolution.HD,
    });
    if (!rtspUrl) {
      return Promise.reject(
        new Error(
          "snapshot.get requires local-account credentials and the camera to be on",
        ),
      );
    }

    return new Promise((resolve, reject) => {
      const proc = Bun.spawn(
        [
          "ffmpeg",
          "-loglevel",
          "quiet",
          "-rtsp_transport",
          "tcp",
          "-analyzeduration",
          "0",
          "-probesize",
          "32",
          "-i",
          rtspUrl,
          "-frames:v",
          "1",
          ...(options?.resolution ? ["-vf", `scale=${options.resolution}`] : []),
          "-f",
          "image2",
          "-vcodec",
          "mjpeg",
          "pipe:1",
        ],
        { stdout: "pipe", stderr: "ignore" },
      );

      (async () => {
        try {
          const chunks: Uint8Array[] = [];
          for await (const chunk of proc.stdout) chunks.push(chunk);
          const code = await proc.exited;
          if (code !== 0) {
            reject(
              new Error(`ffmpeg exited with code ${code} while capturing a snapshot`),
            );
            return;
          }
          resolve(Buffer.concat(chunks));
        } catch (ex) {
          reject(ex instanceof Error ? ex : new Error(String(ex)));
        }
      })();
    });
  }
}

declare module "../../smartcam/modules/camera.ts" {
  interface Camera {
    /** Still-image snapshot capture over the local RTSP stream via ffmpeg. */
    readonly snapshot: CameraSnapshot;
  }
}

const snapshotMap = new WeakMap<Camera, CameraSnapshot>();

Object.defineProperty(Camera.prototype, "snapshot", {
  configurable: true,
  get(this: Camera): CameraSnapshot {
    let instance = snapshotMap.get(this);
    if (!instance) {
      instance = new CameraSnapshot(this);
      snapshotMap.set(this, instance);
    }
    return instance;
  },
});
