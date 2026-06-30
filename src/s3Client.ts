import { S3Client } from '@aws-sdk/client-s3';
import { config } from './config';

export const s3Client = new S3Client({
  region: config.awsRegion,
  credentials: {
    accessKeyId: config.awsAccessKeyId,
    secretAccessKey: config.awsSecretAccessKey,
  },
  // SDK v3 built-in retry with exponential backoff (handles SlowDown / throttling)
  maxAttempts: 3,
});
