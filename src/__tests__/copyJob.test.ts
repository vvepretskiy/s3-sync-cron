import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileEntry, StateStore, StorageProvider, SyncState } from '../types';

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn(), fatal: vi.fn() },
}));

import { runCopyJob } from '../copyJob';

const EPOCH_STATE: SyncState = {
  lastRunTimestamp: new Date(0).toISOString(),
  filesProcessed: 0,
  lastRunDurationMs: 0,
  lastRunAt: new Date(0).toISOString(),
};

function makeSource(files: FileEntry[] = []): StorageProvider {
  return {
    async *listFiles(_since: Date) {
      for (const f of files) yield f;
    },
    getFile: vi.fn().mockResolvedValue(Buffer.from('content')),
    putFile: vi.fn().mockResolvedValue(undefined),
  };
}

function makeDest(): StorageProvider {
  return {
    async *listFiles(_since: Date) { /* unused */ },
    getFile: vi.fn(),
    putFile: vi.fn().mockResolvedValue(undefined),
  };
}

function makeStateStore(state: SyncState = EPOCH_STATE): StateStore {
  return {
    readState: vi.fn().mockResolvedValue(state),
    writeState: vi.fn().mockResolvedValue(undefined),
  };
}

describe('runCopyJob', () => {
  // ── basic copy behaviour ───────────────────────────────────────────────────────────────

  it('copies all files yielded by the source provider', async () => {
    const files: FileEntry[] = [
      { key: 'a.txt', lastModified: new Date() },
      { key: 'b.txt', lastModified: new Date() },
    ];
    const source = makeSource(files);
    const dest = makeDest();
    const stateStore = makeStateStore();

    const result = await runCopyJob(source, dest, stateStore);

    expect(result.copied).toBe(2);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
    expect(dest.putFile).toHaveBeenCalledTimes(2);
    expect(stateStore.writeState).toHaveBeenCalledOnce();
  });

  it('copies nothing when the source yields no files', async () => {
    const result = await runCopyJob(makeSource([]), makeDest(), makeStateStore());
    expect(result.copied).toBe(0);
  });

  // ── security: key validation ───────────────────────────────────────────────────────────

  it('skips files with path-traversal keys', async () => {
    const files: FileEntry[] = [
      { key: '../../etc/passwd', lastModified: new Date() },
      { key: 'safe.txt', lastModified: new Date() },
    ];
    const source = makeSource(files);
    const dest = makeDest();

    const result = await runCopyJob(source, dest, makeStateStore());

    expect(result.copied).toBe(1);
    expect(result.skipped).toBe(1);
    expect(dest.putFile).toHaveBeenCalledOnce();
    expect(dest.putFile).toHaveBeenCalledWith('safe.txt', expect.any(Buffer));
  });

  // ── error handling ───────────────────────────────────────────────────────────────

  it('skips AccessDenied files, counts them as failed, and continues', async () => {
    const files: FileEntry[] = [
      { key: 'denied.txt', lastModified: new Date() },
      { key: 'allowed.txt', lastModified: new Date() },
    ];
    const source: StorageProvider = {
      async *listFiles(_since: Date) {
        for (const f of files) yield f;
      },
      getFile: vi
        .fn()
        .mockRejectedValueOnce(Object.assign(new Error('AccessDenied'), { name: 'AccessDenied' }))
        .mockResolvedValueOnce(Buffer.from('ok')),
      putFile: vi.fn().mockResolvedValue(undefined),
    };
    const dest = makeDest();
    const stateStore = makeStateStore();

    const result = await runCopyJob(source, dest, stateStore);

    expect(result.copied).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.failedKeys).toContain('denied.txt');
    expect(stateStore.writeState).toHaveBeenCalledOnce();
  });

  it('calls process.exit(1) when the source throws NoSuchBucket', async () => {
    const source: StorageProvider = {
      async *listFiles(_since: Date) {
        throw Object.assign(new Error('NoSuchBucket'), { name: 'NoSuchBucket' });
      },
      getFile: vi.fn(),
      putFile: vi.fn(),
    };

    const exitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((_code?: number): never => {
        throw new Error('process.exit called');
      });

    await expect(runCopyJob(source, makeDest(), makeStateStore())).rejects.toThrow(
      'process.exit called',
    );
    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it('re-throws unexpected errors from dest.putFile', async () => {
    const source = makeSource([{ key: 'file.txt', lastModified: new Date() }]);
    const dest: StorageProvider = {
      async *listFiles(_since: Date) { /* unused */ },
      getFile: vi.fn(),
      putFile: vi.fn().mockRejectedValue(new Error('NetworkError')),
    };

    await expect(runCopyJob(source, dest, makeStateStore())).rejects.toThrow('NetworkError');
  });

  // ── state persistence ───────────────────────────────────────────────────────────

  it('writes updated state with filesProcessed and a recent lastRunTimestamp', async () => {
    const before = Date.now();
    const stateStore = makeStateStore();

    await runCopyJob(
      makeSource([{ key: 'file.txt', lastModified: new Date() }]),
      makeDest(),
      stateStore,
    );

    expect(stateStore.writeState).toHaveBeenCalledOnce();
    const [written] = (stateStore.writeState as ReturnType<typeof vi.fn>).mock.calls[0] as [
      SyncState,
    ];
    expect(new Date(written.lastRunTimestamp).getTime()).toBeGreaterThanOrEqual(before);
    expect(written.filesProcessed).toBe(1);
  });
});
