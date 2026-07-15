import { promises as fsp } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createCreatorPerformanceSnapshot,
  deleteCreatorPerformanceSnapshot,
  getCreatorPerformanceProjectData,
} from '../src/creator-performance/store.js';

let dataDir = '';

const VALID_METRICS = { views: 10, likes: 5 } as const;

beforeEach(async () => {
  dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'od-creator-performance-store-'));
});

afterEach(async () => {
  await fsp.rm(dataDir, { recursive: true, force: true });
});

describe('creator performance store', () => {
  it('creates snapshots with server identity and defaults capturedAt', async () => {
    const snapshot = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1',
      metrics: { ...VALID_METRICS },
    });
    expect(snapshot).toMatchObject({
      id: expect.stringMatching(/^creator-performance:/),
      projectId: 'project-1',
      releaseId: 'creator-release:1',
      source: 'manual',
      metrics: { views: 10, likes: 5 },
    });
    expect(snapshot.capturedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/);
    expect(snapshot.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/);
    expect(snapshot.capturedAt).toBe(snapshot.createdAt);
  });

  it('returns snapshots sorted by capturedAt descending after reload', async () => {
    await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: 1 }, capturedAt: '2026-07-01T00:00:00.000Z',
    });
    await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: 2 }, capturedAt: '2026-07-03T00:00:00.000Z',
    });
    await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: 3 }, capturedAt: '2026-07-02T00:00:00.000Z',
    });

    const reloaded = await getCreatorPerformanceProjectData(dataDir, 'project-1');
    expect(reloaded.snapshots.map((snapshot) => snapshot.capturedAt)).toEqual([
      '2026-07-03T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ]);

    // 重启后（重新读取）顺序仍倒序。
    const afterRestart = await getCreatorPerformanceProjectData(dataDir, 'project-1');
    expect(afterRestart.snapshots.map((snapshot) => snapshot.capturedAt)).toEqual([
      '2026-07-03T00:00:00.000Z',
      '2026-07-02T00:00:00.000Z',
      '2026-07-01T00:00:00.000Z',
    ]);
  });

  it('rejects empty metrics and every negative, fractional, unsafe, or non-number metric', async () => {
    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: {},
    })).rejects.toThrow('at least one metric is required');

    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: -1 },
    })).rejects.toThrow('metric views must be a non-negative integer');

    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: 1.5 },
    })).rejects.toThrow('metric views must be a non-negative integer');

    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: Number.MAX_SAFE_INTEGER + 1 },
    })).rejects.toThrow('metric views must be a non-negative integer');

    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: 'x' as never },
    })).rejects.toThrow('metric views must be a non-negative integer');

    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: NaN },
    })).rejects.toThrow('metric views must be a non-negative integer');

    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: Infinity },
    })).rejects.toThrow('metric views must be a non-negative integer');

    await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { weird: 1 } as never,
    })).rejects.toThrow('unknown metric field: weird');
  });

  it('trims note and omits an empty note', async () => {
    const withNote = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { ...VALID_METRICS }, note: '  复盘笔记  ',
    });
    expect(withNote.note).toBe('复盘笔记');

    const emptyNote = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:2', metrics: { ...VALID_METRICS }, note: '   ',
    });
    expect(emptyNote.note).toBeUndefined();

    const noNote = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:3', metrics: { ...VALID_METRICS },
    });
    expect(noNote.note).toBeUndefined();
  });

  it('ignores forged id, projectId, source, and createdAt fields', async () => {
    const snapshot = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1',
      metrics: { ...VALID_METRICS },
      capturedAt: '2026-07-10T00:00:00.000Z',
    } as never);
    const forged = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      id: 'forged-id',
      projectId: 'other-project',
      releaseId: 'creator-release:1',
      source: 'system' as never,
      capturedAt: '2026-07-10T00:00:00.000Z',
      metrics: { ...VALID_METRICS },
      createdAt: '2000-01-01T00:00:00.000Z',
    } as never);

    expect(forged.id).not.toBe('forged-id');
    expect(forged.id).toMatch(/^creator-performance:/);
    expect(forged.projectId).toBe('project-1');
    expect(forged.source).toBe('manual');
    expect(forged.createdAt).not.toBe('2000-01-01T00:00:00.000Z');
    expect(snapshot.projectId).toBe('project-1');
  });

  it('uses write-temp then rename and cleans temp after rename failure', async () => {
    const renameError = new Error('rename failed');
    const rename = vi.spyOn(fsp, 'rename').mockRejectedValueOnce(renameError);
    const unlink = vi.spyOn(fsp, 'unlink');

    try {
      await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
        releaseId: 'creator-release:1', metrics: { ...VALID_METRICS },
      })).rejects.toBe(renameError);
      const temporaryFile = rename.mock.calls[0]![0];
      expect(String(temporaryFile)).toContain('.tmp');
      expect(unlink).toHaveBeenCalledWith(temporaryFile);
    } finally {
      rename.mockRestore();
      unlink.mockRestore();
    }
  });

  it('recovers ENOENT, invalid JSON, and invalid top-level data but propagates EACCES', async () => {
    // ENOENT → 空集合。
    await expect(getCreatorPerformanceProjectData(dataDir, 'project-1')).resolves.toEqual({ snapshots: [] });

    // 非法 JSON → 空集合（降级）。
    const file = path.join(dataDir, 'creator-performance', 'project-1.json');
    await fsp.mkdir(path.dirname(file), { recursive: true });
    await fsp.writeFile(file, '{not-json', 'utf8');
    await expect(getCreatorPerformanceProjectData(dataDir, 'project-1')).resolves.toEqual({ snapshots: [] });

    // 顶层结构非法（snapshots 非数组）→ 空集合。
    await fsp.writeFile(file, JSON.stringify({ snapshots: [{ id: 123 }] }), 'utf8');
    await expect(getCreatorPerformanceProjectData(dataDir, 'project-1')).resolves.toEqual({ snapshots: [] });

    // 其他 I/O 错误（EACCES）必须原样传播，且不写入替换内容。
    const readError = Object.assign(new Error('permission denied'), { code: 'EACCES' });
    const readFile = vi.spyOn(fsp, 'readFile').mockRejectedValueOnce(readError);
    const writeFile = vi.spyOn(fsp, 'writeFile');
    try {
      await expect(createCreatorPerformanceSnapshot(dataDir, 'project-1', {
        releaseId: 'creator-release:1', metrics: { ...VALID_METRICS },
      })).rejects.toBe(readError);
      expect(writeFile).not.toHaveBeenCalled();
    } finally {
      readFile.mockRestore();
      writeFile.mockRestore();
    }
  });

  it('deletes only the requested snapshot and returns false for an absent id', async () => {
    const first = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: 1 },
    });
    const second = await createCreatorPerformanceSnapshot(dataDir, 'project-1', {
      releaseId: 'creator-release:1', metrics: { views: 2 },
    });

    await expect(deleteCreatorPerformanceSnapshot(dataDir, 'project-1', first.id)).resolves.toBe(true);
    await expect(deleteCreatorPerformanceSnapshot(dataDir, 'project-1', first.id)).resolves.toBe(false);

    const remaining = await getCreatorPerformanceProjectData(dataDir, 'project-1');
    expect(remaining.snapshots.map((snapshot) => snapshot.id)).toEqual([second.id]);
  });
});
