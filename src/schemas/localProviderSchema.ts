import { z } from 'zod';

// ── Local filesystem provider ─────────────────────────────────────────────────
export const localProviderSchema = z.object({
  type: z.literal('local'),
  /** Absolute or relative path to the root directory */
  basePath: z.string().min(1),
});

export type LocalProviderConfig = z.infer<typeof localProviderSchema>;
