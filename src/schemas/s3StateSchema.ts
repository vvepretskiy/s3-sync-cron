import { z } from 'zod';

// ── State store ───────────────────────────────────────────────────────────────
export const s3StateSchema = z.object({
  type: z.literal('s3'),
  region: z.string().min(1),
  accessKeyId: z.string().min(1),
  secretAccessKey: z.string().min(1),
  bucket: z.string().min(1),
  key: z.string().default('s3-sync-cron/state.json'),
});

export type S3StateConfig = z.infer<typeof s3StateSchema>;