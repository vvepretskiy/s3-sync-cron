import { z } from 'zod';
export const fileStateSchema = z.object({
  type: z.literal('file'),
  /** Local path for the state JSON file */
  path: z.string().default('./sync-state.json'),
});
