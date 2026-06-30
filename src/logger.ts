import pino from 'pino';
import { config } from './config';

export const logger = pino({
  level: config.logLevel,
  // Redact sensitive credential fields at any depth in logged objects
  redact: {
    paths: [
      'awsAccessKeyId',
      'awsSecretAccessKey',
      'config.awsAccessKeyId',
      'config.awsSecretAccessKey',
      '*.awsAccessKeyId',
      '*.awsSecretAccessKey',
    ],
    censor: '[REDACTED]',
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    pid: process.pid,
    service: 's3-sync-cron',
  },
});
