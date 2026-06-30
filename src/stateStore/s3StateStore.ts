import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import type { S3StateConfig } from '../configSchema';
import { logger } from '../logger';
import type { StateStore, SyncState } from '../types';

const DEFAULT_STATE: SyncState = {
  lastRunTimestamp: new Date(0).toISOString(),
  filesProcessed: 0,
  lastRunDurationMs: 0,
  lastRunAt: new Date(0).toISOString(),
};

export class S3StateStore implements StateStore {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly key: string;

  constructor(cfg: S3StateConfig) {
    this.bucket = cfg.bucket;
    this.key = cfg.key;
    this.client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      maxAttempts: 3,
    });
  }

  async readState(): Promise<SyncState> {
    try {
      const response = await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: this.key }),
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
          { stateBucket: this.bucket, stateKey: this.key },
          'No state file found — starting from epoch (all existing files will be copied)',
        );
        return { ...DEFAULT_STATE };
      }
      throw err;
    }
  }

  async writeState(state: SyncState): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        Body: JSON.stringify(state, null, 2),
        ContentType: 'application/json',
        // SSE-S3 encryption for state file at rest
        ServerSideEncryption: 'AES256',
      }),
    );
    logger.debug({ stateKey: this.key }, 'State file written to S3');
  }
}
