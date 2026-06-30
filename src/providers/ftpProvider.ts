import { Client as FtpClient } from 'basic-ftp';
import { Readable, Writable } from 'stream';
import type { FtpProviderConfig } from '../configSchema';
import type { FileEntry, StorageProvider } from '../types';

export class FtpStorageProvider implements StorageProvider {
  constructor(private readonly cfg: FtpProviderConfig) {}

  private async withClient<T>(fn: (client: FtpClient) => Promise<T>): Promise<T> {
    const client = new FtpClient();
    try {
      await client.access({
        host: this.cfg.host,
        port: this.cfg.port,
        user: this.cfg.user,
        password: this.cfg.password,
        secure: this.cfg.secure,
      });
      return await fn(client);
    } finally {
      client.close();
    }
  }

  async *listFiles(since: Date): AsyncIterable<FileEntry> {
    const entries = await this.withClient((client) =>
      this.listRecursive(client, this.cfg.basePath),
    );
    for (const entry of entries) {
      if (entry.lastModified > since) {
        yield entry;
      }
    }
  }

  private async listRecursive(client: FtpClient, dir: string): Promise<FileEntry[]> {
    const normalizedDir = dir.replace(/\/+$/, '') || '/';
    const items = await client.list(normalizedDir);
    const result: FileEntry[] = [];

    for (const item of items) {
      const fullPath = `${normalizedDir}/${item.name}`;
      if (item.type === 2) {
        // Directory — recurse
        const sub = await this.listRecursive(client, fullPath);
        result.push(...sub);
      } else if (item.type === 1) {
        // File
        result.push({
          key: this.toRelativeKey(fullPath),
          lastModified: item.modifiedAt ?? new Date(0),
          size: item.size ?? undefined,
        });
      }
    }
    return result;
  }

  async getFile(relativeKey: string): Promise<Buffer> {
    const remotePath = this.toRemotePath(relativeKey);
    return this.withClient(async (client) => {
      const chunks: Buffer[] = [];
      const writable = new Writable({
        write(chunk: Buffer | string, _encoding, cb) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          cb();
        },
      });
      await client.downloadTo(writable, remotePath);
      return Buffer.concat(chunks);
    });
  }

  async putFile(relativeKey: string, content: Buffer): Promise<void> {
    const remotePath = this.toRemotePath(relativeKey);
    const remoteDir = remotePath.includes('/')
      ? remotePath.substring(0, remotePath.lastIndexOf('/'))
      : this.cfg.basePath;
    await this.withClient(async (client) => {
      await client.ensureDir(remoteDir);
      const readable = Readable.from(content);
      await client.uploadFrom(readable, remotePath);
    });
  }

  private toRelativeKey(fullPath: string): string {
    const base = this.cfg.basePath.replace(/\/+$/, '');
    return fullPath.startsWith(base)
      ? fullPath.slice(base.length).replace(/^\/+/, '')
      : fullPath.replace(/^\/+/, '');
  }

  private toRemotePath(relativeKey: string): string {
    const base = this.cfg.basePath.replace(/\/+$/, '');
    return `${base}/${relativeKey}`;
  }
}
