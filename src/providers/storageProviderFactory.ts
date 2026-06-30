import type { FtpProviderConfig, S3ProviderConfig } from '../configSchema';
import type { StorageProvider } from '../types';
import { FtpStorageProvider } from './ftpProvider';
import { S3StorageProvider } from './s3Provider';

export type ProviderConfig = S3ProviderConfig | FtpProviderConfig;

/**
 * Implement this interface to register a new storage backend.
 * Call `registerStorageProviderFactory` with your type key and factory instance.
 */
export interface StorageProviderFactory {
  create(cfg: ProviderConfig): StorageProvider;
}

const registry = new Map<string, StorageProviderFactory>();

/** Register a factory for a given provider type key (e.g. 's3', 'ftp'). */
export function registerStorageProviderFactory(
  type: string,
  factory: StorageProviderFactory,
): void {
  registry.set(type, factory);
}

/** Create a StorageProvider by resolving the registered factory for `cfg.type`. */
export function createStorageProvider(cfg: ProviderConfig): StorageProvider {
  const factory = registry.get(cfg.type);
  if (!factory) {
    throw new Error(`No StorageProvider registered for type: "${cfg.type}"`);
  }
  return factory.create(cfg);
}

// ── Built-in provider registrations ──────────────────────────────────────────

registerStorageProviderFactory('s3', {
  create: (cfg) => new S3StorageProvider(cfg as S3ProviderConfig),
});

registerStorageProviderFactory('ftp', {
  create: (cfg) => new FtpStorageProvider(cfg as FtpProviderConfig),
});
