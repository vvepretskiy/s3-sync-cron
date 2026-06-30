import { configSchema } from './configSchema';
export type { Config } from './configSchema';
import type { Config } from './configSchema';

function loadConfig(): Config {
  const raw = {
    awsRegion: process.env.AWS_REGION,
    awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
    awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    sourceBucket: process.env.SOURCE_BUCKET,
    sourcePrefix: process.env.SOURCE_PREFIX,
    destBucket: process.env.DEST_BUCKET,
    destPrefix: process.env.DEST_PREFIX,
    stateBucket: process.env.STATE_BUCKET,
    stateKey: process.env.STATE_KEY,
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
