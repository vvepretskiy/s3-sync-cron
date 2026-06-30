import { logger } from './logger';
import type { CopyResult, StateStore, StorageProvider, SyncState } from './types';

/**
 * Security: allow only safe characters in relative file keys.
 * Rejects path traversal sequences and special shell characters.
 */
const SAFE_KEY_REGEX = /^[a-zA-Z0-9\-_./ ]+$/;

function isSafeKey(key: string): boolean {
  if (key.includes('..') || key.startsWith('/') || key.includes('//')) {
    return false;
  }
  return SAFE_KEY_REGEX.test(key);
}

export async function runCopyJob(
  source: StorageProvider,
  dest: StorageProvider,
  stateStore: StateStore,
): Promise<CopyResult> {
  const startTime = Date.now();
  const result: CopyResult = {
    copied: 0,
    skipped: 0,
    failed: 0,
    failedKeys: [],
    durationMs: 0,
  };

  const state = await stateStore.readState();
  const since = new Date(state.lastRunTimestamp);
  // Capture job-start time before any I/O — used as the new lastRunTimestamp
  const jobStartTimestamp = new Date().toISOString();

  logger.info({ lastRunTimestamp: state.lastRunTimestamp }, 'Copy job started');

  try {
    for await (const file of source.listFiles(since)) {
      // Security: validate relative key before use
      if (!isSafeKey(file.key)) {
        logger.warn({ key: file.key }, 'Skipping file — key contains unsafe characters');
        result.skipped++;
        continue;
      }

      try {
        const content = await source.getFile(file.key);
        await dest.putFile(file.key, content);
        result.copied++;
        logger.debug({ key: file.key }, 'File synced');
      } catch (err: unknown) {
        const name = (err as { name?: string }).name ?? '';
        if (name === 'AccessDenied') {
          logger.warn({ key: file.key }, 'AccessDenied — skipping file');
          result.failed++;
          result.failedKeys.push(file.key);
        } else {
          throw err;
        }
      }
    }
  } catch (err: unknown) {
    const name = (err as { name?: string }).name ?? '';
    if (name === 'NoSuchBucket') {
      logger.fatal({ err }, 'Source bucket does not exist — terminating');
      process.exit(1);
    }
    throw err;
  }

  result.durationMs = Date.now() - startTime;

  logger.info(
    {
      copied: result.copied,
      skipped: result.skipped,
      failed: result.failed,
      durationMs: result.durationMs,
    },
    'Copy job completed',
  );

  // Persist updated state so the next tick only copies newly modified files
  const newState: SyncState = {
    lastRunTimestamp: jobStartTimestamp,
    filesProcessed: result.copied,
    lastRunDurationMs: result.durationMs,
    lastRunAt: jobStartTimestamp,
  };
  await stateStore.writeState(newState);

  return result;
}

