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

export type S3ProviderConfig = z.infer<typeof s3ProviderSchema>;