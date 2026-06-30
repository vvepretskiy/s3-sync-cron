import { describe, expect, it } from 'vitest';
import { configSchema } from '../configSchema';

const REQUIRED = {
  awsRegion: 'us-east-1',
  awsAccessKeyId: 'AKIAIOSFODNN7EXAMPLE',
  awsSecretAccessKey: 'wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY',
  sourceBucket: 'my-source-bucket',
  destBucket: 'my-dest-bucket',
  stateBucket: 'my-state-bucket',
};

describe('configSchema', () => {
  it('parses valid config and applies all defaults', () => {
    const result = configSchema.safeParse(REQUIRED);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.cronSchedule).toBe('*/5 * * * *');
    expect(result.data.logLevel).toBe('info');
    expect(result.data.shutdownTimeoutMs).toBe(10000);
    expect(result.data.sourcePrefix).toBe('');
    expect(result.data.destPrefix).toBe('');
    expect(result.data.stateKey).toBe('s3-sync-cron/state.json');
  });

  it('accepts overrides for every optional field', () => {
    const result = configSchema.safeParse({
      ...REQUIRED,
      sourcePrefix: 'data/incoming/',
      destPrefix: 'data/processed/',
      stateKey: 'custom/state.json',
      cronSchedule: '0 * * * *',
      logLevel: 'debug',
      shutdownTimeoutMs: 5000,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.sourcePrefix).toBe('data/incoming/');
    expect(result.data.cronSchedule).toBe('0 * * * *');
    expect(result.data.logLevel).toBe('debug');
    expect(result.data.shutdownTimeoutMs).toBe(5000);
  });

  it('coerces shutdownTimeoutMs from a string (as env vars are strings)', () => {
    const result = configSchema.safeParse({ ...REQUIRED, shutdownTimeoutMs: '3000' });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shutdownTimeoutMs).toBe(3000);
  });

  it('fails when required fields are missing', () => {
    const result = configSchema.safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = result.error.flatten().fieldErrors;
    expect(errors).toHaveProperty('awsRegion');
    expect(errors).toHaveProperty('awsAccessKeyId');
    expect(errors).toHaveProperty('awsSecretAccessKey');
    expect(errors).toHaveProperty('sourceBucket');
    expect(errors).toHaveProperty('destBucket');
    expect(errors).toHaveProperty('stateBucket');
  });

  it('fails on an invalid logLevel', () => {
    const result = configSchema.safeParse({ ...REQUIRED, logLevel: 'verbose' });
    expect(result.success).toBe(false);
  });

  it('accepts every valid logLevel enum value', () => {
    const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
    for (const level of levels) {
      const r = configSchema.safeParse({ ...REQUIRED, logLevel: level });
      expect(r.success, `"${level}" should be a valid logLevel`).toBe(true);
    }
  });

  it('fails when shutdownTimeoutMs is not a positive number', () => {
    expect(configSchema.safeParse({ ...REQUIRED, shutdownTimeoutMs: '-1' }).success).toBe(false);
    expect(configSchema.safeParse({ ...REQUIRED, shutdownTimeoutMs: '0' }).success).toBe(false);
  });
});
