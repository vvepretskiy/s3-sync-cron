import { z } from 'zod';

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

export type FtpProviderConfig = z.infer<typeof ftpProviderSchema>;