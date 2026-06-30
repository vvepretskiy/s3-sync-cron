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

/** A single file entry returned by a StorageProvider */
export interface FileEntry {
  /** Path relative to the provider's configured base path / prefix */
  key: string;
  lastModified: Date;
  size?: number;
}

/** Abstraction over any file storage backend (S3, FTP, …) */
export interface StorageProvider {
  /**
   * Yields files modified strictly after `since`.
   * Keys are relative to the provider's configured prefix / base path.
   */
  listFiles(since: Date): AsyncIterable<FileEntry>;
  /** Download a file by its relative key */
  getFile(relativeKey: string): Promise<Buffer>;
  /** Upload a file at its relative key */
  putFile(relativeKey: string, content: Buffer): Promise<void>;
}

/** Abstraction over sync-state persistence backends */
export interface StateStore {
  readState(): Promise<SyncState>;
  writeState(state: SyncState): Promise<void>;
}
