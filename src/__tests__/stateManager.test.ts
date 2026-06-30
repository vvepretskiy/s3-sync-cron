import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../types';

// vi.hoisted ensures mockSend is initialised before vi.mock factories run
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('../s3Client', () => ({
  s3Client: { send: mockSend },
}));

vi.mock('../logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock('../config', () => ({
  config: {
    stateBucket: 'test-state-bucket',
    stateKey: 'test/state.json',
  },
}));

import { readState, writeState } from '../stateManager';

// ─── readState ────────────────────────────────────────────────────────────────

describe('readState', () => {
  beforeEach(() => mockSend.mockReset());

  it('returns parsed state when the file exists in S3', async () => {
    const state: SyncState = {
      lastRunTimestamp: '2026-01-01T00:00:00.000Z',
      filesProcessed: 10,
      lastRunDurationMs: 500,
      lastRunAt: '2026-01-01T00:00:00.000Z',
    };
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: vi.fn().mockResolvedValueOnce(JSON.stringify(state)) },
    });

    const result = await readState();

    expect(result.lastRunTimestamp).toBe('2026-01-01T00:00:00.000Z');
    expect(result.filesProcessed).toBe(10);
  });

  it('returns default (epoch) state on first run (NoSuchKey)', async () => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }),
    );

    const result = await readState();

    expect(result.lastRunTimestamp).toBe(new Date(0).toISOString());
    expect(result.filesProcessed).toBe(0);
  });

  it('returns default state when the S3 body is empty', async () => {
    mockSend.mockResolvedValueOnce({
      Body: { transformToString: vi.fn().mockResolvedValueOnce('') },
    });

    const result = await readState();

    expect(result.lastRunTimestamp).toBe(new Date(0).toISOString());
  });

  it('propagates unexpected S3 errors', async () => {
    mockSend.mockRejectedValueOnce(new Error('InternalError'));

    await expect(readState()).rejects.toThrow('InternalError');
  });
});

// ─── writeState ───────────────────────────────────────────────────────────────

describe('writeState', () => {
  beforeEach(() => mockSend.mockReset());

  it('calls PutObjectCommand with SSE-S3, correct bucket/key, and valid JSON body', async () => {
    mockSend.mockResolvedValueOnce({});
    const state: SyncState = {
      lastRunTimestamp: '2026-06-01T10:00:00.000Z',
      filesProcessed: 5,
      lastRunDurationMs: 300,
      lastRunAt: '2026-06-01T10:00:00.000Z',
    };

    await writeState(state);

    expect(mockSend).toHaveBeenCalledOnce();
    const { input } = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
    expect(input['Bucket']).toBe('test-state-bucket');
    expect(input['Key']).toBe('test/state.json');
    expect(input['ContentType']).toBe('application/json');
    expect(input['ServerSideEncryption']).toBe('AES256');
    const parsed = JSON.parse(input['Body'] as string) as SyncState;
    expect(parsed.filesProcessed).toBe(5);
    expect(parsed.lastRunTimestamp).toBe('2026-06-01T10:00:00.000Z');
  });

  it('propagates S3 errors to the caller', async () => {
    mockSend.mockRejectedValueOnce(new Error('NetworkError'));

    await expect(
      writeState({ lastRunTimestamp: '', filesProcessed: 0, lastRunDurationMs: 0, lastRunAt: '' }),
    ).rejects.toThrow('NetworkError');
  });
});
