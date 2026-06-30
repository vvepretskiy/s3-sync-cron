import { configSchema } from './configSchema';
export type { Config } from './configSchema';
import type { Config } from './configSchema';

function loadConfig(): Config {
  const sourceType = (process.env.SOURCE_TYPE ?? 's3').toLowerCase();
  const destType = (process.env.DEST_TYPE ?? 's3').toLowerCase();
  const stateType = (process.env.STATE_TYPE ?? 's3').toLowerCase();

  // Shared AWS credentials — used as fallback for all S3 configs
  const awsRegion = process.env.AWS_REGION;
  const awsAccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const awsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;

  const source =
    sourceType === 'ftp'
      ? {
          type: 'ftp' as const,
          host: process.env.SOURCE_FTP_HOST,
          port: process.env.SOURCE_FTP_PORT,
          user: process.env.SOURCE_FTP_USER,
          password: process.env.SOURCE_FTP_PASSWORD,
          basePath: process.env.SOURCE_FTP_BASE_PATH,
          secure: process.env.SOURCE_FTP_SECURE,
        }
      : {
          type: 's3' as const,
          region: process.env.SOURCE_S3_REGION ?? awsRegion,
          accessKeyId: process.env.SOURCE_S3_ACCESS_KEY_ID ?? awsAccessKeyId,
          secretAccessKey: process.env.SOURCE_S3_SECRET_ACCESS_KEY ?? awsSecretAccessKey,
          // Legacy env-var support
          bucket: process.env.SOURCE_S3_BUCKET ?? process.env.SOURCE_BUCKET,
          prefix: process.env.SOURCE_S3_PREFIX ?? process.env.SOURCE_PREFIX,
        };

  const dest =
    destType === 'ftp'
      ? {
          type: 'ftp' as const,
          host: process.env.DEST_FTP_HOST,
          port: process.env.DEST_FTP_PORT,
          user: process.env.DEST_FTP_USER,
          password: process.env.DEST_FTP_PASSWORD,
          basePath: process.env.DEST_FTP_BASE_PATH,
          secure: process.env.DEST_FTP_SECURE,
        }
      : {
          type: 's3' as const,
          region: process.env.DEST_S3_REGION ?? awsRegion,
          accessKeyId: process.env.DEST_S3_ACCESS_KEY_ID ?? awsAccessKeyId,
          secretAccessKey: process.env.DEST_S3_SECRET_ACCESS_KEY ?? awsSecretAccessKey,
          bucket: process.env.DEST_S3_BUCKET ?? process.env.DEST_BUCKET,
          prefix: process.env.DEST_S3_PREFIX ?? process.env.DEST_PREFIX,
        };

  const state =
    stateType === 'file'
      ? {
          type: 'file' as const,
          path: process.env.STATE_FILE_PATH,
        }
      : {
          type: 's3' as const,
          region: process.env.STATE_S3_REGION ?? awsRegion,
          accessKeyId: process.env.STATE_S3_ACCESS_KEY_ID ?? awsAccessKeyId,
          secretAccessKey: process.env.STATE_S3_SECRET_ACCESS_KEY ?? awsSecretAccessKey,
          // Legacy env-var support
          bucket: process.env.STATE_S3_BUCKET ?? process.env.STATE_BUCKET,
          key: process.env.STATE_S3_KEY ?? process.env.STATE_KEY,
        };

  const raw = {
    source,
    dest,
    state,
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
