import { readFile, writeFile } from 'fs/promises';
import type { FileStateConfig } from '../configSchema';
import { logger } from '../logger';
import type { StateStore, SyncState } from '../types';

const DEFAULT_STATE: SyncState = {
  lastRunTimestamp: new Date(0).toISOString(),
  filesProcessed: 0,
  lastRunDurationMs: 0,
  lastRunAt: new Date(0).toISOString(),
};

export class FileStateStore implements StateStore {
  private readonly path: string;

  constructor(cfg: FileStateConfig) {
    this.path = cfg.path;
  }

  async readState(): Promise<SyncState> {
    try {
      const content = await readFile(this.path, 'utf8');
      if (!content.trim()) {
        logger.warn('State file is empty — using defaults');
        return { ...DEFAULT_STATE };
      }
      return JSON.parse(content) as SyncState;
    } catch (err: unknown) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        logger.info(
          { statePath: this.path },
          'No state file found — starting from epoch (all existing files will be copied)',
        );
        return { ...DEFAULT_STATE };
      }
      throw err;
    }
  }

  async writeState(state: SyncState): Promise<void> {
    await writeFile(this.path, JSON.stringify(state, null, 2), 'utf8');
    logger.debug({ statePath: this.path }, 'State file written to disk');
  }
}
