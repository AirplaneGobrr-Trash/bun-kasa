import { Camera } from "../smartcam/modules/camera.ts";

/**
 * Monkey-patch: SD-card recording *search* (list what recordings exist and when),
 * ported from ref/pytapo/pytapo/__init__.py's getUserID/getRecordingsList/
 * getRecordingsUTC/getRecordings. This only covers metadata search — it does not
 * download or decrypt recording bytes. Actually pulling/decrypting a recording needs
 * pytapo's media_stream/ (its own stream protocol + AES decrypt over a raw TCP
 * connection, unrelated to the SmartCamProtocol/SslAesTransport JSON-RPC channel this
 * project otherwise uses) and is deliberately not ported here — it's a much bigger,
 * separate piece of work. Doesn't touch src/smartcam/modules/camera.ts.
 */

export interface RecordingSearchResult {
  channel?: number;
  startTime?: number;
  endTime?: number;
  [key: string]: unknown;
}

const DEFAULT_END_INDEX = 999999999;

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

function today(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

export class CameraRecordings {
  readonly #rawQuery: RawQuery;
  #userId: string | undefined;

  constructor(rawQuery: RawQuery) {
    this.#rawQuery = rawQuery;
  }

  /** The internal user id playback search calls require. Cached; pass true to refetch. */
  async getUserID(forceReload = false): Promise<string> {
    if (this.#userId && !forceReload) return this.#userId;

    const resp = await this.#rawQuery({ getUserID: { system: { get_user_id: "null" } } });
    const userId = (resp.getUserID as Record<string, unknown> | undefined)?.user_id;
    if (typeof userId !== "string") {
      throw new Error("Failed to retrieve user ID, device responded with no value.");
    }
    this.#userId = userId;
    return userId;
  }

  /** Which dates (YYYYMMDD, UTC camera-local) have any recordings, in `startDate..endDate`. */
  async getRecordingsList(
    startDate = "20000101",
    endDate = today(),
  ): Promise<RecordingSearchResult[]> {
    const resp = await this.#rawQuery({
      searchDateWithVideo: {
        playback: {
          search_year_utility: { channel: [0], end_date: endDate, start_date: startDate },
        },
      },
    });
    const playback = (resp.searchDateWithVideo as Record<string, unknown> | undefined)
      ?.playback as Record<string, unknown> | undefined;
    if (!playback) throw new Error("Video playback is not supported by this camera");
    return (playback.search_results as RecordingSearchResult[] | undefined) ?? [];
  }

  async #searchVideoWithUTC(
    startTime: number,
    endTime: number,
    startIndex: number,
    endIndex: number,
    retry: boolean,
  ): Promise<RecordingSearchResult[]> {
    try {
      const userId = await this.getUserID();
      const resp = await this.#rawQuery({
        searchVideoWithUTC: {
          playback: {
            search_video_with_utc: {
              channel: 0,
              end_time: endTime,
              end_index: endIndex,
              id: userId,
              start_index: startIndex,
              start_time: startTime,
            },
          },
        },
      });
      const playback = (resp.searchVideoWithUTC as Record<string, unknown> | undefined)
        ?.playback as Record<string, unknown> | undefined;
      if (!playback) throw new Error("Video playback is not supported by this camera");
      return (playback.search_video_results as RecordingSearchResult[] | undefined) ?? [];
    } catch (ex) {
      if (!retry) {
        // The cached user id can expire mid-session; refetch once and try again.
        await this.getUserID(true);
        return this.#searchVideoWithUTC(startTime, endTime, startIndex, endIndex, true);
      }
      throw ex;
    }
  }

  /** Recording segments between two unix timestamps (seconds). */
  getRecordingsUTC(
    startTime: number,
    endTime: number,
    startIndex = 0,
    endIndex = DEFAULT_END_INDEX,
  ): Promise<RecordingSearchResult[]> {
    return this.#searchVideoWithUTC(startTime, endTime, startIndex, endIndex, false);
  }

  async #searchVideoOfDay(
    date: string,
    startIndex: number,
    endIndex: number,
    retry: boolean,
  ): Promise<RecordingSearchResult[]> {
    try {
      const userId = await this.getUserID();
      const resp = await this.#rawQuery({
        searchVideoOfDay: {
          playback: {
            search_video_utility: {
              channel: 0,
              date,
              end_index: endIndex,
              id: userId,
              start_index: startIndex,
            },
          },
        },
      });
      const playback = (resp.searchVideoOfDay as Record<string, unknown> | undefined)
        ?.playback as Record<string, unknown> | undefined;
      if (!playback) throw new Error("Video playback is not supported by this camera");
      return (playback.search_video_results as RecordingSearchResult[] | undefined) ?? [];
    } catch (ex) {
      if (!retry) {
        await this.getUserID(true);
        return this.#searchVideoOfDay(date, startIndex, endIndex, true);
      }
      throw ex;
    }
  }

  /** Recording segments for a single date (YYYYMMDD). */
  getRecordings(
    date: string,
    startIndex = 0,
    endIndex = DEFAULT_END_INDEX,
  ): Promise<RecordingSearchResult[]> {
    return this.#searchVideoOfDay(date, startIndex, endIndex, false);
  }
}

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** SD-card recording metadata search (dates/segments, not download/decrypt). */
    readonly recordings: CameraRecordings;
  }
}

const recordingsMap = new WeakMap<Camera, CameraRecordings>();

Object.defineProperty(Camera.prototype, "recordings", {
  configurable: true,
  get(this: Camera): CameraRecordings {
    let instance = recordingsMap.get(this);
    if (!instance) {
      instance = new CameraRecordings(
        this.smartCamDevice.rawQuery.bind(this.smartCamDevice),
      );
      recordingsMap.set(this, instance);
    }
    return instance;
  },
});
