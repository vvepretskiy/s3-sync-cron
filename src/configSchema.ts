import { z } from 'zod';

// ── S3 provider ───────────────────────────────────────────────────────────────
export const s3ProviderSchema = z.object({
  type: z.literal('s3'),
  region: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
  /** Prefix / "folder" within the bucket — defaults to bucket root */
  prefix: z.string().default(''),
});

// ── FTP provider ──────────────────────────────────────────────────────────────
export const ftpProviderSchema = z.object({
  type: z.literal('ftp'),
  host: z.string().min(1),
  port: z.coerce.number().int().positive().default(21),
  user: z.string().min(1),
  password: z.string().min(1),
  /** Root directory on the FTP server */
  basePath: z.string().default('/'),
  /** Enable explicit FTPS (AUTH TLS) */
  secure: z.coerce.boolean().default(false),
});

export const providerSchema = z.discriminatedUnion('type', [
  s3ProviderSchema,
  ftpProviderSchema,
]);

// ── State store ───────────────────────────────────────────────────────────────
export const s3StateSchema = z.object({
  type: z.literal('s3'),
  region: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
  key: z.string().default('s3-sync-cron/state.json'),
});

export const fileStateSchema = z.object({
  type: z.literal('file'),
  /** Local path for the state JSON file */
  path: z.string().default('./sync-state.json'),
});

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
