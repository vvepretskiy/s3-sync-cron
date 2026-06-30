export interface SyncState {
  /** ISO 8601 — files with LastModified > this value will be copied */
  lastRunTimestamp: string;
  filesProcessed: number;
  lastRunDurationMs: number;
  lastRunAt: string;
}

export interface CopyResult {
  copied: number;
  skipped: number;
  failed: number;
  failedKeys: string[];
  durationMs: number;
}
