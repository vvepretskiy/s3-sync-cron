import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { config } from './config';
import { logger } from './logger';
import { s3Client } from './s3Client';
import type { SyncState } from './types';

/** Default: epoch — first run will copy all existing files */
const DEFAULT_STATE: SyncState = {
  lastRunTimestamp: new Date(0).toISOString(),
  filesProcessed: 0,
  lastRunDurationMs: 0,
  lastRunAt: new Date(0).toISOString(),
};

export async function readState(): Promise<SyncState> {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: config.stateBucket,
        Key: config.stateKey,
      }),
    );

    const body = await response.Body?.transformToString();
    if (!body) {
      logger.warn('State file body is empty — using defaults');
      return { ...DEFAULT_STATE };
    }

    return JSON.parse(body) as SyncState;
  } catch (err: unknown) {
    const name = (err as { name?: string }).name ?? '';
    if (name === 'NoSuchKey' || name === 'NotFound') {
      logger.info(
        { stateBucket: config.stateBucket, stateKey: config.stateKey },
        'No state file found — starting from epoch (all existing files will be copied)',
      );
      return { ...DEFAULT_STATE };
    }
    throw err;
  }
}

export async function writeState(state: SyncState): Promise<void> {
  await s3Client.send(
    new PutObjectCommand({
      Bucket: config.stateBucket,
      Key: config.stateKey,
      Body: JSON.stringify(state, null, 2),
      ContentType: 'application/json',
      // SSE-S3 encryption for state file at rest
      ServerSideEncryption: 'AES256',
    }),
  );
  logger.debug({ stateKey: config.stateKey }, 'State file written to S3');
}
