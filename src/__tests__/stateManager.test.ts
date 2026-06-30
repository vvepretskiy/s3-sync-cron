import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncState } from '../types';

// ─── S3StateStore ─────────────────────────────────────────────────────────────────────

const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }));

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
  return { ...actual, S3Client: vi.fn(() => ({ send: mockSend })) };
});

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { S3StateStore } from '../stateStore/s3StateStore';
import { FileStateStore } from '../stateStore/fileStateStore';

const S3_CFG = {
  type: 's3' as const,
  region: 'us-east-1',
  accessKeyId: 'KEY',
  secretAccessKey: 'SECRET',
  bucket: 'test-state-bucket',
  key: 'test/state.json',
};

describe('S3StateStore', () => {
  beforeEach(() => mockSend.mockReset());

  describe('readState', () => {
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

      const store = new S3StateStore(S3_CFG);
      const result = await store.readState();

      expect(result.lastRunTimestamp).toBe('2026-01-01T00:00:00.000Z');
      expect(result.filesProcessed).toBe(10);
    });

    it('returns default (epoch) state on first run (NoSuchKey)', async () => {
      mockSend.mockRejectedValueOnce(
        Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' }),
      );

      const result = await new S3StateStore(S3_CFG).readState();

      expect(result.lastRunTimestamp).toBe(new Date(0).toISOString());
      expect(result.filesProcessed).toBe(0);
    });

    it('returns default state when the S3 body is empty', async () => {
      mockSend.mockResolvedValueOnce({
        Body: { transformToString: vi.fn().mockResolvedValueOnce('') },
      });

      const result = await new S3StateStore(S3_CFG).readState();

      expect(result.lastRunTimestamp).toBe(new Date(0).toISOString());
    });

    it('propagates unexpected S3 errors', async () => {
      mockSend.mockRejectedValueOnce(new Error('InternalError'));

      await expect(new S3StateStore(S3_CFG).readState()).rejects.toThrow('InternalError');
    });
  });

  describe('writeState', () => {
    it('calls PutObjectCommand with SSE-S3, correct bucket/key, and valid JSON body', async () => {
      mockSend.mockResolvedValueOnce({});
      const state: SyncState = {
        lastRunTimestamp: '2026-06-01T10:00:00.000Z',
        filesProcessed: 5,
        lastRunDurationMs: 300,
        lastRunAt: '2026-06-01T10:00:00.000Z',
      };

      await new S3StateStore(S3_CFG).writeState(state);

      expect(mockSend).toHaveBeenCalledOnce();
      const { input } = mockSend.mock.calls[0][0] as { input: Record<string, unknown> };
      expect(input['Bucket']).toBe('test-state-bucket');
      expect(input['Key']).toBe('test/state.json');
      expect(input['ContentType']).toBe('application/json');
      expect(input['ServerSideEncryption']).toBe('AES256');
      const parsed = JSON.parse(input['Body'] as string) as SyncState;
      expect(parsed.filesProcessed).toBe(5);
    });

    it('propagates S3 errors to the caller', async () => {
      mockSend.mockRejectedValueOnce(new Error('NetworkError'));

      await expect(
        new S3StateStore(S3_CFG).writeState({
          lastRunTimestamp: '',
          filesProcessed: 0,
          lastRunDurationMs: 0,
          lastRunAt: '',
        }),
      ).rejects.toThrow('NetworkError');
    });
  });
});

// ─── FileStateStore ────────────────────────────────────────────────────────────────────

const { mockReadFile, mockWriteFile } = vi.hoisted(() => ({
  mockReadFile: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  readFile: mockReadFile,
  writeFile: mockWriteFile,
}));

const FILE_CFG = { type: 'file' as const, path: './test-state.json' };

describe('FileStateStore', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockWriteFile.mockReset();
  });

  describe('readState', () => {
    it('returns parsed state when the file exists', async () => {
      const state: SyncState = {
        lastRunTimestamp: '2026-03-01T00:00:00.000Z',
        filesProcessed: 7,
        lastRunDurationMs: 200,
        lastRunAt: '2026-03-01T00:00:00.000Z',
      };
      mockReadFile.mockResolvedValueOnce(JSON.stringify(state));

      const result = await new FileStateStore(FILE_CFG).readState();

      expect(result.lastRunTimestamp).toBe('2026-03-01T00:00:00.000Z');
      expect(result.filesProcessed).toBe(7);
    });

    it('returns default (epoch) state when file does not exist (ENOENT)', async () => {
      mockReadFile.mockRejectedValueOnce(
        Object.assign(new Error('ENOENT'), { code: 'ENOENT' }),
      );

      const result = await new FileStateStore(FILE_CFG).readState();

      expect(result.lastRunTimestamp).toBe(new Date(0).toISOString());
      expect(result.filesProcessed).toBe(0);
    });

    it('returns default state when file is empty', async () => {
      mockReadFile.mockResolvedValueOnce('');

      const result = await new FileStateStore(FILE_CFG).readState();

      expect(result.lastRunTimestamp).toBe(new Date(0).toISOString());
    });

    it('propagates unexpected read errors', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('PermissionDenied'));

      await expect(new FileStateStore(FILE_CFG).readState()).rejects.toThrow('PermissionDenied');
    });
  });

  describe('writeState', () => {
    it('writes JSON state to the configured path', async () => {
      mockWriteFile.mockResolvedValueOnce(undefined);
      const state: SyncState = {
        lastRunTimestamp: '2026-06-01T10:00:00.000Z',
        filesProcessed: 3,
        lastRunDurationMs: 100,
        lastRunAt: '2026-06-01T10:00:00.000Z',
      };

      await new FileStateStore(FILE_CFG).writeState(state);

      expect(mockWriteFile).toHaveBeenCalledOnce();
      const [path, content] = mockWriteFile.mock.calls[0] as [string, string, string];
      expect(path).toBe('./test-state.json');
      const parsed = JSON.parse(content) as SyncState;
      expect(parsed.filesProcessed).toBe(3);
    });

    it('propagates write errors to the caller', async () => {
      mockWriteFile.mockRejectedValueOnce(new Error('DiskFull'));

      await expect(
        new FileStateStore(FILE_CFG).writeState({
          lastRunTimestamp: '',
          filesProcessed: 0,
          lastRunDurationMs: 0,
          lastRunAt: '',
        }),
      ).rejects.toThrow('DiskFull');
    });
  });
});
