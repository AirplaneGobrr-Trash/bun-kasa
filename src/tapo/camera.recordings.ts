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

declare module "../smartcam/modules/camera.ts" {
  interface Camera {
    /** The internal user id playback search calls require. Cached; pass true to refetch. */
    getUserID(forceReload?: boolean): Promise<string>;
    /** Which dates (YYYYMMDD, UTC camera-local) have any recordings, in `startDate..endDate`. */
    getRecordingsList(
      startDate?: string,
      endDate?: string,
    ): Promise<RecordingSearchResult[]>;
    /** Recording segments between two unix timestamps (seconds). */
    getRecordingsUTC(
      startTime: number,
      endTime: number,
      startIndex?: number,
      endIndex?: number,
    ): Promise<RecordingSearchResult[]>;
    /** Recording segments for a single date (YYYYMMDD). */
    getRecordings(
      date: string,
      startIndex?: number,
      endIndex?: number,
    ): Promise<RecordingSearchResult[]>;
  }
}

const DEFAULT_END_INDEX = 999999999;
const userIdCache = new WeakMap<Camera, string>();

function today(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
}

Camera.prototype.getUserID = async function (
  this: Camera,
  forceReload = false,
): Promise<string> {
  const cached = userIdCache.get(this);
  if (cached && !forceReload) return cached;

  const resp = await this.smartCamDevice.rawQuery({
    getUserID: { system: { get_user_id: "null" } },
  });
  const userId = (resp.getUserID as Record<string, unknown> | undefined)?.user_id;
  if (typeof userId !== "string") {
    throw new Error("Failed to retrieve user ID, device responded with no value.");
  }
  userIdCache.set(this, userId);
  return userId;
};

Camera.prototype.getRecordingsList = async function (
  this: Camera,
  startDate = "20000101",
  endDate = today(),
): Promise<RecordingSearchResult[]> {
  const resp = await this.smartCamDevice.rawQuery({
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
};

type RawQuery = (request: Record<string, unknown>) => Promise<Record<string, unknown>>;

async function searchVideoWithUTC(
  camera: Camera,
  rawQuery: RawQuery,
  startTime: number,
  endTime: number,
  startIndex: number,
  endIndex: number,
  retry: boolean,
): Promise<RecordingSearchResult[]> {
  try {
    const userId = await camera.getUserID();
    const resp = await rawQuery({
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
      await camera.getUserID(true);
      return searchVideoWithUTC(
        camera,
        rawQuery,
        startTime,
        endTime,
        startIndex,
        endIndex,
        true,
      );
    }
    throw ex;
  }
}

Camera.prototype.getRecordingsUTC = function (
  this: Camera,
  startTime: number,
  endTime: number,
  startIndex = 0,
  endIndex = DEFAULT_END_INDEX,
): Promise<RecordingSearchResult[]> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return searchVideoWithUTC(
    this,
    rawQuery,
    startTime,
    endTime,
    startIndex,
    endIndex,
    false,
  );
};

async function searchVideoOfDay(
  camera: Camera,
  rawQuery: RawQuery,
  date: string,
  startIndex: number,
  endIndex: number,
  retry: boolean,
): Promise<RecordingSearchResult[]> {
  try {
    const userId = await camera.getUserID();
    const resp = await rawQuery({
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
      await camera.getUserID(true);
      return searchVideoOfDay(camera, rawQuery, date, startIndex, endIndex, true);
    }
    throw ex;
  }
}

Camera.prototype.getRecordings = function (
  this: Camera,
  date: string,
  startIndex = 0,
  endIndex = DEFAULT_END_INDEX,
): Promise<RecordingSearchResult[]> {
  const rawQuery = this.smartCamDevice.rawQuery.bind(this.smartCamDevice);
  return searchVideoOfDay(this, rawQuery, date, startIndex, endIndex, false);
};
