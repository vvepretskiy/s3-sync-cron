import { z } from 'zod';
import { s3ProviderSchema } from './s3ProviderSchema';
import { ftpProviderSchema } from './ftpProviderSchema';
import { localProviderSchema } from './localProviderSchema';
import { s3StateSchema } from './s3StateSchema';
import { fileStateSchema } from './fileStateSchema';

// ── Provider ──────────────────────────────────────────────────────────────────
export const providerSchema = z.discriminatedUnion('type', [
  s3ProviderSchema,
  ftpProviderSchema,
  localProviderSchema,
]);

export const stateSchema = z.discriminatedUnion('type', [s3StateSchema, fileStateSchema]);

// ── Root config ───────────────────────────────────────────────────────────────
export const configSchema = z.object({
  source: providerSchema,
  dest: providerSchema,
  state: stateSchema,
  cronSchedule: z.string().default('*/5 * * * *'),
  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  shutdownTimeoutMs: z.coerce.number().int().positive().default(10000),
});

export type Config = z.infer<typeof configSchema>;
export type S3ProviderConfig = z.infer<typeof s3ProviderSchema>;
export type FtpProviderConfig = z.infer<typeof ftpProviderSchema>;
export type S3StateConfig = z.infer<typeof s3StateSchema>;
export type FileStateConfig = z.infer<typeof fileStateSchema>;
export type LocalProviderConfig = z.infer<typeof localProviderSchema>;
