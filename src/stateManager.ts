import type { FileStateConfig, S3StateConfig } from './schemas/index';
import { FileStateStore } from './stateStore/fileStateStore';
import { S3StateStore } from './stateStore/s3StateStore';
import type { StateStore } from './types';

export type StateConfig = S3StateConfig | FileStateConfig;

/**
 * Implement this interface to register a new state-store backend.
 * Call `registerStateStoreFactory` with your type key and factory instance.
 */
export interface StateStoreFactory {
  create(cfg: StateConfig): StateStore;
}

const registry = new Map<string, StateStoreFactory>();

/** Register a factory for a given state-store type key (e.g. 's3', 'file'). */
export function registerStateStoreFactory(type: string, factory: StateStoreFactory): void {
  registry.set(type, factory);
}

/** Create a StateStore by resolving the registered factory for `cfg.type`. */
export function createStateStore(cfg: StateConfig): StateStore {
  const factory = registry.get(cfg.type);
  if (!factory) {
    throw new Error(`No StateStore registered for type: "${cfg.type}"`);
  }
  return factory.create(cfg);
}

// ── Built-in state-store registrations ───────────────────────────────────────

registerStateStoreFactory('s3', {
  create: (cfg) => new S3StateStore(cfg as S3StateConfig),
});

registerStateStoreFactory('file', {
  create: (cfg) => new FileStateStore(cfg as FileStateConfig),
});
