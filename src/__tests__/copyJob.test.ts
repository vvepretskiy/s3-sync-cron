import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../types';

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));
const { mockReadState, mockWriteState } = vi.hoisted(() => ({
  mockReadState: vi.fn<() => Promise<SyncState>>(),
  mockWriteState: vi.fn<(s: SyncState) => Promise<void>>(),
}));

vi.mock('../s3Client', () => ({ s3Client: { send: mockSend } }));
vi.mock('../stateManager', () => ({ readState: mockReadState, writeState: mockWriteState }));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));
vi.mock('../config', () => ({
  config: {
    sourceBucket: 'src-bucket',
    sourcePrefix: 'incoming/',
    destBucket: 'dst-bucket',
    destPrefix: 'processed/',
    stateBucket: 'state-bucket',
    stateKey: 's3-sync-cron/state.json',
  },
}));

import { runCopyJob } from '../copyJob';

const EPOCH_STATE: SyncState = {
  lastRunTimestamp: new Date(0).toISOString(),
  filesProcessed: 0,
  lastRunDurationMs: 0,
  lastRunAt: new Date(0).toISOString(),
};

describe('runCopyJob', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWriteState.mockResolvedValue(undefined);
  });

  // ── time-based filtering ────────────────────────────────────────────────────

  it('copies files modified after lastRunTimestamp and skips older ones', async () => {
    const lastRun = new Date('2026-06-01T10:00:00.000Z');
    mockReadState.mockResolvedValueOnce({
      ...EPOCH_STATE,
      lastRunTimestamp: lastRun.toISOString(),
    });

    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'incoming/old.txt', LastModified: new Date('2026-06-01T09:00:00.000Z') },
          { Key: 'incoming/new.txt', LastModified: new Date('2026-06-01T11:00:00.000Z') },
        ],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({}); // CopyObject for new.txt

    const result = await runCopyJob();

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.failed).toBe(0);
    expect(mockWriteState).toHaveBeenCalledOnce();
  });

  it('copies all files on first run (epoch state)', async () => {
    mockReadState.mockResolvedValueOnce(EPOCH_STATE);

    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'incoming/a.txt', LastModified: new Date('2020-01-01T00:00:00.000Z') },
          { Key: 'incoming/b.txt', LastModified: new Date('2020-01-02T00:00:00.000Z') },
        ],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({}) // CopyObject a.txt
      .mockResolvedValueOnce({}); // CopyObject b.txt

    const result = await runCopyJob();

    expect(result.copied).toBe(2);
    expect(result.skipped).toBe(0);
  });

  // ── security: key validation ────────────────────────────────────────────────

  it('skips objects with path-traversal keys', async () => {
    mockReadState.mockResolvedValueOnce(EPOCH_STATE);

    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: '../../../etc/passwd', LastModified: new Date() },
          { Key: 'incoming/safe.txt', LastModified: new Date() },
        ],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({}); // CopyObject for safe.txt only

    const result = await runCopyJob();

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(1); // path-traversal key was skipped
  });

  // ── error handling ──────────────────────────────────────────────────────────

  it('skips AccessDenied files, counts them as failed, and continues', async () => {
    mockReadState.mockResolvedValueOnce(EPOCH_STATE);

    mockSend
      .mockResolvedValueOnce({
        Contents: [
          { Key: 'incoming/denied.txt', LastModified: new Date() },
          { Key: 'incoming/allowed.txt', LastModified: new Date() },
        ],
        IsTruncated: false,
      })
      .mockRejectedValueOnce(
        Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' }),
      )
      .mockResolvedValueOnce({}); // CopyObject for allowed.txt

    const result = await runCopyJob();

    expect(result.copied).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedKeys).toContain('incoming/denied.txt');
    expect(mockWriteState).toHaveBeenCalledOnce();
  });

  it('calls process.exit(1) when the source bucket does not exist', async () => {
    mockReadState.mockResolvedValueOnce(EPOCH_STATE);
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('NoSuchBucket'), { name: 'NoSuchBucket' }),
    );

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: number): never => {
        throw new Error('process.exit called');
      });

    await expect(runCopyJob()).rejects.toThrow('process.exit called');
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  // ── pagination ──────────────────────────────────────────────────────────────

  it('follows NextContinuationToken across multiple pages', async () => {
    mockReadState.mockResolvedValueOnce(EPOCH_STATE);

    mockSend
      // Page 1
      .mockResolvedValueOnce({
        Contents: [{ Key: 'incoming/page1.txt', LastModified: new Date() }],
        IsTruncated: true,
        NextContinuationToken: 'tok-abc',
      })
      .mockResolvedValueOnce({}) // CopyObject page1.txt
      // Page 2
      .mockResolvedValueOnce({
        Contents: [{ Key: 'incoming/page2.txt', LastModified: new Date() }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({}); // CopyObject page2.txt

    const result = await runCopyJob();

    expect(result.copied).toBe(2);
    expect(mockWriteState).toHaveBeenCalledOnce();
  });

  // ── state persistence ───────────────────────────────────────────────────────

  it('writes updated state with filesProcessed and a recent lastRunTimestamp', async () => {
    const before = Date.now();
    mockReadState.mockResolvedValueOnce(EPOCH_STATE);

    mockSend
      .mockResolvedValueOnce({
        Contents: [{ Key: 'incoming/file.txt', LastModified: new Date() }],
        IsTruncated: false,
      })
      .mockResolvedValueOnce({});

    await runCopyJob();

    expect(mockWriteState).toHaveBeenCalledOnce();
    const [writtenState] = mockWriteState.mock.calls[0] as [SyncState];
    expect(new Date(writtenState.lastRunTimestamp).getTime()).toBeGreaterThanOrEqual(before);
    expect(writtenState.filesProcessed).toBe(1);
  });
});
