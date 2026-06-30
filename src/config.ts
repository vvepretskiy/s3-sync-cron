import { configSchema } from './configSchema';
export type { Config } from './configSchema';
import type { Config } from './configSchema';

// Shared AWS fallback credentials from top-level env vars
interface SharedAws {
  region: string | undefined;
  accessKeyId: string | undefined;
  secretAccessKey: string | undefined;
}

type ProviderType = 's3' | 'ftp';
type StateType = 's3' | 'file';

type EnvReader = (prefix: string, shared: SharedAws) => Record<string, unknown>;

/**
 * Maps provider type → function that reads its raw config from env vars.
 * `prefix` is the env-var namespace (e.g. 'SOURCE', 'DEST').
 * Add one entry here to support a new StorageProvider type.
 */
const providerEnvReaders: Record<ProviderType, EnvReader> = {
  s3: (prefix, shared) => ({
    type: 's3',
    region: process.env[`${prefix}_S3_REGION`] ?? shared.region,
    accessKeyId: process.env[`${prefix}_S3_ACCESS_KEY_ID`] ?? shared.accessKeyId,
    secretAccessKey: process.env[`${prefix}_S3_SECRET_ACCESS_KEY`] ?? shared.secretAccessKey,
    // Legacy env-var support (e.g. SOURCE_BUCKET, DEST_PREFIX)
    bucket: process.env[`${prefix}_S3_BUCKET`] ?? process.env[`${prefix}_BUCKET`],
    prefix: process.env[`${prefix}_S3_PREFIX`] ?? process.env[`${prefix}_PREFIX`],
  }),
  ftp: (prefix) => ({
    type: 'ftp',
    host: process.env[`${prefix}_FTP_HOST`],
    port: process.env[`${prefix}_FTP_PORT`],
    user: process.env[`${prefix}_FTP_USER`],
    password: process.env[`${prefix}_FTP_PASSWORD`],
    basePath: process.env[`${prefix}_FTP_BASE_PATH`],
    secure: process.env[`${prefix}_FTP_SECURE`],
  }),
};

/**
 * Maps state-store type → env-var reader.
 * Add one entry here to support a new StateStore type.
 */
const stateEnvReaders: Record<StateType, EnvReader> = {
  s3: (prefix, shared) => ({
    type: 's3',
    region: process.env[`${prefix}_S3_REGION`] ?? shared.region,
    accessKeyId: process.env[`${prefix}_S3_ACCESS_KEY_ID`] ?? shared.accessKeyId,
    secretAccessKey: process.env[`${prefix}_S3_SECRET_ACCESS_KEY`] ?? shared.secretAccessKey,
    // Legacy env-var support (e.g. STATE_BUCKET, STATE_KEY)
    bucket: process.env[`${prefix}_S3_BUCKET`] ?? process.env[`${prefix}_BUCKET`],
    key: process.env[`${prefix}_S3_KEY`] ?? process.env[`${prefix}_KEY`],
  }),
  file: (prefix) => ({
    type: 'file',
    path: process.env[`${prefix}_FILE_PATH`],
  }),
};

function readProviderEnv(type: ProviderType, prefix: string, shared: SharedAws): Record<string, unknown> {
  const reader = providerEnvReaders[type];
  if (!reader) {
    throw new Error(
      `Unknown SOURCE/DEST type: "${type}". Known types: ${Object.keys(providerEnvReaders).join(', ')}`,
    );
  }
  return reader(prefix, shared);
}

function readStateEnv(type: StateType, prefix: string, shared: SharedAws): Record<string, unknown> {
  const reader = stateEnvReaders[type];
  if (!reader) {
    throw new Error(
      `Unknown STATE type: "${type}". Known types: ${Object.keys(stateEnvReaders).join(', ')}`,
    );
  }
  return reader(prefix, shared);
}

function loadConfig(): Config {
  const sourceType = (process.env.SOURCE_TYPE ?? 's3').toLowerCase() as ProviderType;
  const destType = (process.env.DEST_TYPE ?? 's3').toLowerCase() as ProviderType;
  const stateType = (process.env.STATE_TYPE ?? 's3').toLowerCase() as StateType;

  const shared: SharedAws = {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  };

  const raw = {
    source: readProviderEnv(sourceType, 'SOURCE', shared),
    dest: readProviderEnv(destType, 'DEST', shared),
    state: readStateEnv(stateType, 'STATE', shared),
    cronSchedule: process.env.CRON_SCHEDULE,
    logLevel: process.env.LOG_LEVEL,
    shutdownTimeoutMs: process.env.SHUTDOWN_TIMEOUT_MS,
  };

  const result = configSchema.safeParse(raw);
  if (!result.success) {
    // Use console.error here — logger is not yet initialised
    console.error(
      'Invalid configuration:\n',
      JSON.stringify(result.error.flatten().fieldErrors, null, 2),
    );
    process.exit(1);
  }

  return result.data;
}

export const config = loadConfig();
