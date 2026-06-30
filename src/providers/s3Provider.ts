import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { S3ProviderConfig } from '../schemas/index';
import type { FileEntry, StorageProvider } from '../types';

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly prefix: string;

  constructor(cfg: S3ProviderConfig) {
    this.bucket = cfg.bucket;
    this.prefix = cfg.prefix;
    this.client = new S3Client({
      region: cfg.region,
      credentials: {
        accessKeyId: cfg.accessKeyId,
        secretAccessKey: cfg.secretAccessKey,
      },
      maxAttempts: 3,
    });
  }

  async *listFiles(since: Date): AsyncIterable<FileEntry> {
    let continuationToken: string | undefined;

    do {
      const response = await this.client.send(
        new ListObjectsV2Command({
          Bucket: this.bucket,
          Prefix: this.prefix || undefined,
          ContinuationToken: continuationToken,
        }),
      );

      for (const obj of response.Contents ?? []) {
        if (!obj.Key || !obj.LastModified) continue;
        if (obj.LastModified <= since) continue;
        yield {
          key: this.toRelativeKey(obj.Key),
          lastModified: obj.LastModified,
          size: obj.Size,
        };
      }

      continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
    } while (continuationToken);
  }

  async getFile(relativeKey: string): Promise<Buffer> {
    const fullKey = this.toFullKey(relativeKey);
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: fullKey }),
    );
    const bytes = await response.Body?.transformToByteArray();
    if (!bytes) throw new Error(`Empty body for S3 key: ${fullKey}`);
    return Buffer.from(bytes);
  }

  async putFile(relativeKey: string, content: Buffer): Promise<void> {
    const fullKey = this.toFullKey(relativeKey);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: fullKey,
        Body: content,
        // SSE-S3 encryption for copied objects at rest
        ServerSideEncryption: 'AES256',
      }),
    );
  }

  /** Strip the configured prefix to get a path relative to the provider root */
  private toRelativeKey(fullKey: string): string {
    if (!this.prefix) return fullKey;
    return fullKey.startsWith(this.prefix)
      ? fullKey.slice(this.prefix.length).replace(/^\/+/, '')
      : fullKey;
  }

  /** Reconstruct the full S3 key from a relative path */
  private toFullKey(relativeKey: string): string {
    if (!this.prefix) return relativeKey;
    const base = this.prefix.endsWith('/') ? this.prefix : `${this.prefix}/`;
    return `${base}${relativeKey}`;
  }
}
