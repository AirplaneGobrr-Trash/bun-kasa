import { SmartModule } from "../smartmodule.ts";

/** A single trigger log entry. */
export interface LogEntry {
  id: number;
  eventId: string;
  timestamp: number;
  event: string;
}

function parseLogEntry(raw: Record<string, unknown>): LogEntry {
  return {
    id: raw.id as number,
    eventId: raw.eventId as string,
    timestamp: raw.timestamp as number,
    event: raw.event as string,
  };
}

/** Implementation of trigger logs. */
export class TriggerLogs extends SmartModule {
  static override readonly requiredComponent = "trigger_log";
  override minimumUpdateIntervalSecs = 60 * 60;

  override query(): Record<string, unknown> {
    return { get_trigger_logs: { start_id: 0 } };
  }

  get logs(): LogEntry[] {
    return (this.data.logs as Record<string, unknown>[]).map(parseLogEntry);
  }
}
