import { describe, expect, it } from 'vitest';
import { configSchema } from '../schemas/index';

const S3_SOURCE = {
  type: 's3' as const,
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'my-source-bucket',
};

const S3_DEST = {
  type: 's3' as const,
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'my-dest-bucket',
};

const S3_STATE = {
  type: 's3' as const,
  region: 'us-east-1',
  accessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  secretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  bucket: 'my-state-bucket',
};

const FTP_PROVIDER = {
  type: 'ftp' as const,
  host: 'ftp.example.com',
  user: 'ftpuser',
  password: 's3cr3t',
};

const BASE = { source: S3_SOURCE, dest: S3_DEST, state: S3_STATE };

describe('configSchema', () => {
  it('parses a valid all-S3 config and applies defaults', () => {
    const result = configSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cronSchedule).toBe('*/5 * * * *');
    expect(result.data.logLevel).toBe('info');
    expect(result.data.shutdownTimeoutMs).toBe(10000);
    expect(result.data.source.type).toBe('s3');
    expect(result.data.dest.type).toBe('s3');
    expect(result.data.state.type).toBe('s3');
  });

  it('S3 provider defaults prefix to empty string', () => {
    const result = configSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.source.type !== 's3') return;
    expect(result.data.source.prefix).toBe('');
  });

  it('S3 state store defaults key to s3-sync-cron/state.json', () => {
    const result = configSchema.safeParse(BASE);
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.state.type !== 's3') return;
    expect(result.data.state.key).toBe('s3-sync-cron/state.json');
  });

  it('accepts FTP as source with S3 dest', () => {
    const result = configSchema.safeParse({ ...BASE, source: FTP_PROVIDER });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.source.type).toBe('ftp');
    expect(result.data.dest.type).toBe('s3');
  });

  it('accepts FTP as dest with S3 source', () => {
    const result = configSchema.safeParse({ ...BASE, dest: FTP_PROVIDER });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.dest.type).toBe('ftp');
  });

  it('accepts FTP as both source and dest', () => {
    const result = configSchema.safeParse({ ...BASE, source: FTP_PROVIDER, dest: FTP_PROVIDER });
    expect(result.success).toBe(true);
  });

  it('accepts file-based state store', () => {
    const result = configSchema.safeParse({ ...BASE, state: { type: 'file' } });
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.state.type !== 'file') return;
    expect(result.data.state.path).toBe('./sync-state.json');
  });

  it('FTP provider defaults port to 21 and secure to false', () => {
    const result = configSchema.safeParse({ ...BASE, source: FTP_PROVIDER });
    expect(result.success).toBe(true);
    if (!result.success) return;
    if (result.data.source.type !== 'ftp') return;
    expect(result.data.source.port).toBe(21);
    expect(result.data.source.secure).toBe(false);
  });

  it('accepts overrides for top-level optional fields', () => {
    const result = configSchema.safeParse({
      ...BASE,
      cronSchedule: '0 * * * *',
      logLevel: 'debug',
      shutdownTimeoutMs: 5000,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cronSchedule).toBe('0 * * * *');
    expect(result.data.logLevel).toBe('debug');
    expect(result.data.shutdownTimeoutMs).toBe(5000);
  });

  it('coerces shutdownTimeoutMs from a string', () => {
    const result = configSchema.safeParse({ ...BASE, shutdownTimeoutMs: '3000' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shutdownTimeoutMs).toBe(3000);
  });

  it('fails when source is missing', () => {
    const { source: _s, ...rest } = BASE;
    const result = configSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('fails when dest is missing', () => {
    const { dest: _d, ...rest } = BASE;
    const result = configSchema.safeParse(rest);
    expect(result.success).toBe(false);
  });

  it('fails on an invalid logLevel', () => {
    const result = configSchema.safeParse({ ...BASE, logLevel: 'verbose' });
    expect(result.success).toBe(false);
  });

  it('accepts every valid logLevel enum value', () => {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
    for (const level of levels) {
      const r = configSchema.safeParse({ ...BASE, logLevel: level });
      expect(r.success, `"${level}" should be a valid logLevel`).toBe(true);
    }
  });

  it('fails when shutdownTimeoutMs is not a positive number', () => {
    expect(configSchema.safeParse({ ...BASE, shutdownTimeoutMs: '-1' }).success).toBe(false);
    expect(configSchema.safeParse({ ...BASE, shutdownTimeoutMs: '0' }).success).toBe(false);
  });
});


