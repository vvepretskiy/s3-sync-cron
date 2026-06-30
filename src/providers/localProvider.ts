import fs from 'fs/promises';
import path from 'path';
import type { LocalProviderConfig } from '../schemas/localProviderSchema';
import type { FileEntry, StorageProvider } from '../types';

export class LocalStorageProvider implements StorageProvider {
  constructor(private readonly cfg: LocalProviderConfig) {}

  async *listFiles(since: Date): AsyncIterable<FileEntry> {
    const entries = await this.walkDir(this.cfg.basePath);
    for (const entry of entries) {
      if (entry.lastModified > since) {
        yield entry;
      }
    }
  }

  async getFile(relativeKey: string): Promise<Buffer> {
    return fs.readFile(path.join(this.cfg.basePath, relativeKey));
  }

  async putFile(relativeKey: string, content: Buffer): Promise<void> {
    const dest = path.join(this.cfg.basePath, relativeKey);
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.writeFile(dest, content);
  }

  private async walkDir(dir: string): Promise<FileEntry[]> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const results: FileEntry[] = [];

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await this.walkDir(fullPath)));
      } else if (entry.isFile()) {
        const stat = await fs.stat(fullPath);
        results.push({
          key: path.relative(this.cfg.basePath, fullPath).replace(/\\/g, '/'),
          lastModified: stat.mtime,
          size: stat.size,
        });
      }
    }

    return results;
  }
}
