import { CopyObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { config } from './config';
import { logger } from './logger';
import { s3Client } from './s3Client';
import { readState, writeState } from './stateManager';
import type { CopyResult, SyncState } from './types';

/**
 * Security: allow only safe characters in S3 keys.
 * Rejects path traversal sequences and special shell characters.
 */
const SAFE_KEY_REGEX = /^[a-zA-Z0-9\-_./ ]+$/;

function isSafeKey(key: string): boolean {
  if (key.includes('..') || key.startsWith('/') || key.includes('//')) {
    return false;
  }
  return SAFE_KEY_REGEX.test(key);
}

/**
 * Strips the source prefix from a key and prepends the destination prefix,
 * normalising any double slashes.
 */
function buildDestKey(
  sourceKey: string,
  sourcePrefix: string,
  destPrefix: string,
): string {
  const relative = sourceKey.startsWith(sourcePrefix)
    ? sourceKey.slice(sourcePrefix.length)
    : sourceKey;

  const clean = relative.replace(/^\/+/, '');

  if (!destPrefix) return clean;

  const prefix = destPrefix.endsWith('/') ? destPrefix : `${destPrefix}/`;
  return `${prefix}${clean}`;
}

export async function runCopyJob(): Promise<CopyResult> {
  const startTime = Date.now();
  const result: CopyResult = {
    copied: 0,
    skipped: 0,
    failed: 0,
    failedKeys: [],
    durationMs: 0,
  };

  // Read persisted state to determine the copy window
  const state = await readState();
  const lastRunDate = new Date(state.lastRunTimestamp);
  // Capture job-start time before any I/O — used as the new lastRunTimestamp
  const jobStartTimestamp = new Date().toISOString();

  logger.info(
    {
      lastRunTimestamp: state.lastRunTimestamp,
      sourceBucket: config.sourceBucket,
      sourcePrefix: config.sourcePrefix || '(root)',
    },
    'Copy job started',
  );

  let continuationToken: string | undefined;
  let totalListed = 0;

  try {
    do {
      const listResponse = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: config.sourceBucket,
          Prefix: config.sourcePrefix || undefined,
          ContinuationToken: continuationToken,
        }),
      );

      const objects = listResponse.Contents ?? [];
      totalListed += objects.length;

      for (const obj of objects) {
        const key = obj.Key;
        const lastModified = obj.LastModified;

        if (!key || !lastModified) continue;

        // Security: validate key before it is used in a copy command
        if (!isSafeKey(key)) {
          logger.warn({ key }, 'Skipping object — key contains unsafe characters');
          result.skipped++;
          continue;
        }

        // Time-based filter: only copy objects modified after the last run
        if (lastModified <= lastRunDate) {
          result.skipped++;
          continue;
        }

        const destKey = buildDestKey(key, config.sourcePrefix, config.destPrefix);

        try {
          await s3Client.send(
            new CopyObjectCommand({
              // CopySource format: bucket/key (key must be URL-encoded)
              CopySource: `${config.sourceBucket}/${key
                .split('/')
                .map(encodeURIComponent)
                .join('/')}`,
              Bucket: config.destBucket,
              Key: destKey,
              // SSE-S3 encryption for copied objects at rest
              ServerSideEncryption: 'AES256',
            }),
          );

          result.copied++;
          logger.debug({ sourceKey: key, destKey }, 'File copied');
        } catch (copyErr: unknown) {
          const errName = (copyErr as { name?: string }).name ?? '';
          if (errName === 'AccessDenied') {
            logger.warn({ key }, 'AccessDenied on file — skipping');
            result.failed++;
            result.failedKeys.push(key);
          } else {
            // Re-throw unexpected errors (e.g. NoSuchKey mid-run, network issues)
            throw copyErr;
          }
        }
      }

      continuationToken = listResponse.IsTruncated
        ? listResponse.NextContinuationToken
        : undefined;
    } while (continuationToken);
  } catch (err: unknown) {
    const errName = (err as { name?: string }).name ?? '';
    if (errName === 'NoSuchBucket') {
      logger.fatal(
        { bucket: config.sourceBucket },
        'Source bucket does not exist — terminating',
      );
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
      totalListed,
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
  await writeState(newState);

  return result;
}
