import { z } from 'zod';

export const configSchema = z.object({
  awsRegion: z.string().min(1),
  awsAccessKeyId: z.string().min(1),
  awsSecretAccessKey: z.string().min(1),
  sourceBucket: z.string().min(1),
  sourcePrefix: z.string().default(''),
  destBucket: z.string().min(1),
  destPrefix: z.string().default(''),
  stateBucket: z.string().min(1),
  stateKey: z.string().default('s3-sync-cron/state.json'),
  cronSchedule: z.string().default('*/5 * * * *'),
  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  shutdownTimeoutMs: z.coerce.number().int().positive().default(10000),
});

export type Config = z.infer<typeof configSchema>;
