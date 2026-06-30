import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockReaddir, mockStat, mockReadFile, mockMkdir, mockWriteFile } = vi.hoisted(() => ({
  mockReaddir: vi.fn(),
  mockStat: vi.fn(),
  mockReadFile: vi.fn(),
  mockMkdir: vi.fn(),
  mockWriteFile: vi.fn(),
}));

vi.mock('fs/promises', () => ({
  default: {
    readdir: mockReaddir,
    stat: mockStat,
    readFile: mockReadFile,
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
  },
}));

import { LocalStorageProvider } from '../providers/localProvider';

const BASE = '/data/source';

const LOCAL_CFG = { type: 'local' as const, basePath: BASE };

beforeEach(() => {
  mockReaddir.mockReset();
  mockStat.mockReset();
  mockReadFile.mockReset();
  mockMkdir.mockReset();
  mockWriteFile.mockReset();
});

describe('LocalStorageProvider', () => {
  describe('listFiles', () => {
    it('yields files modified after `since`', async () => {
      const old = new Date('2024-01-01T00:00:00Z');
      const recent = new Date('2026-01-01T00:00:00Z');
      const since = new Date('2025-01-01T00:00:00Z');

      mockReaddir.mockResolvedValueOnce([
        { name: 'a.txt', isDirectory: () => false, isFile: () => true },
        { name: 'b.txt', isDirectory: () => false, isFile: () => true },
      ]);
      mockStat
        .mockResolvedValueOnce({ mtime: old, size: 10 })   // a.txt — too old
        .mockResolvedValueOnce({ mtime: recent, size: 20 }); // b.txt — recent

      const provider = new LocalStorageProvider(LOCAL_CFG);
      const results: { key: string }[] = [];
      for await (const entry of provider.listFiles(since)) {
        results.push(entry);
      }

      expect(results).toHaveLength(1);
      expect(results[0].key).toBe('b.txt');
    });

    it('recurses into subdirectories', async () => {
      const recent = new Date('2026-01-01T00:00:00Z');
      const since = new Date('2025-01-01T00:00:00Z');

      // Root listing: one dir, one file
      mockReaddir
        .mockResolvedValueOnce([
          { name: 'subdir', isDirectory: () => true, isFile: () => false },
          { name: 'root.txt', isDirectory: () => false, isFile: () => true },
        ])
        // subdir listing
        .mockResolvedValueOnce([
          { name: 'nested.txt', isDirectory: () => false, isFile: () => true },
        ]);

      mockStat
        .mockResolvedValueOnce({ mtime: recent, size: 5 })  // root.txt
        .mockResolvedValueOnce({ mtime: recent, size: 8 }); // nested.txt

      const provider = new LocalStorageProvider(LOCAL_CFG);
      const results: { key: string }[] = [];
      for await (const entry of provider.listFiles(since)) {
        results.push(entry);
      }

      expect(results).toHaveLength(2);
      expect(results.map((r) => r.key).sort()).toEqual(['root.txt', 'subdir/nested.txt']);
    });

    it('yields nothing when directory is empty', async () => {
      mockReaddir.mockResolvedValueOnce([]);

      const provider = new LocalStorageProvider(LOCAL_CFG);
      const results: unknown[] = [];
      for await (const entry of provider.listFiles(new Date(0))) {
        results.push(entry);
      }

      expect(results).toHaveLength(0);
    });
  });

  describe('getFile', () => {
    it('reads the file at basePath + relativeKey', async () => {
      const buf = Buffer.from('hello');
      mockReadFile.mockResolvedValueOnce(buf);

      const provider = new LocalStorageProvider(LOCAL_CFG);
      const result = await provider.getFile('subdir/file.txt');

      expect(mockReadFile).toHaveBeenCalledWith(`${BASE}/subdir/file.txt`);
      expect(result).toBe(buf);
    });
  });

  describe('putFile', () => {
    it('creates parent directories then writes the file', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const content = Buffer.from('world');
      const provider = new LocalStorageProvider(LOCAL_CFG);
      await provider.putFile('a/b/c.txt', content);

      expect(mockMkdir).toHaveBeenCalledWith(`${BASE}/a/b`, { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith(`${BASE}/a/b/c.txt`, content);
    });

    it('creates parent dir for a top-level file', async () => {
      mockMkdir.mockResolvedValueOnce(undefined);
      mockWriteFile.mockResolvedValueOnce(undefined);

      const provider = new LocalStorageProvider(LOCAL_CFG);
      await provider.putFile('top.txt', Buffer.from('x'));

      expect(mockMkdir).toHaveBeenCalledWith(BASE, { recursive: true });
    });
  });
});
