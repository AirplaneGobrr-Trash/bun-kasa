import type { Credentials } from "../../core/credentials.ts";
import { Camera, StreamResolution } from "../../smartcam/modules/camera.ts";
import { resolveLocalCredentials } from "./localCredentials.ts";

/**
 * Monkey-patch: validates streamRtspUrl() is actually playable by shelling out to
 * ffprobe, rather than opening/decoding the RTSP stream in-process. Confirms the
 * stream works end-to-end against real hardware without a hand-rolled RTSP client.
 */

export interface StreamProbeResult {
  codec?: string;
  width?: number;
  height?: number;
  frameRate?: string;
  raw: unknown;
}

declare module "../../smartcam/modules/camera.ts" {
  interface Camera {
    /**
     * Probe the RTSP stream with ffprobe and report codec/resolution, or `undefined`
     * if ffprobe isn't on PATH. Throws if ffprobe runs but can't connect/parse the stream.
     */
    probeStream(
      credentials?: Credentials,
      options?: { streamResolution?: StreamResolution },
    ): Promise<StreamProbeResult | undefined>;
  }
}

Camera.prototype.probeStream = async function (
  this: Camera,
  credentials?: Credentials,
  options?: { streamResolution?: StreamResolution },
): Promise<StreamProbeResult | undefined> {
  const rtspUrl = this.streamRtspUrl(resolveLocalCredentials(credentials), {
    streamResolution: options?.streamResolution ?? StreamResolution.HD,
  });
  if (!rtspUrl) {
    throw new Error(
      "probeStream requires local-account credentials and the camera to be on",
    );
  }

  let proc: Bun.Subprocess<"ignore", "pipe", "pipe">;
  try {
    proc = Bun.spawn(
      [
        "ffprobe",
        "-v",
        "quiet",
        "-rtsp_transport",
        "tcp",
        "-print_format",
        "json",
        "-show_streams",
        "-select_streams",
        "v:0",
        rtspUrl,
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
  } catch {
    return undefined; // ffprobe not installed / not on PATH
  }

  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  if (code !== 0) {
    throw new Error(
      `ffprobe exited with code ${code} probing ${this.device.host}: ${stderr.trim()}`,
    );
  }

  const parsed = JSON.parse(stdout) as { streams?: Record<string, unknown>[] };
  const stream = parsed.streams?.[0];
  if (!stream)
    throw new Error(`ffprobe returned no video stream for ${this.device.host}`);

  return {
    codec: stream.codec_name as string | undefined,
    width: stream.width as number | undefined,
    height: stream.height as number | undefined,
    frameRate: stream.avg_frame_rate as string | undefined,
    raw: stream,
  };
};
