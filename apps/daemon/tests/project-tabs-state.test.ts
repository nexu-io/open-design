import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertProject,
  listTabs,
  openDatabase,
  setTabs,
} from '../src/db.js';

describe('project tabs state persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-project-tabs-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('round-trips browser workspace tabs alongside file tabs', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Project',
      createdAt: now,
      updatedAt: now,
    });

    setTabs(db, 'proj-1', {
      tabs: ['deck.html'],
      active: '__browser__:1',
      browserTabs: [
        {
          id: '__browser__:1',
          insertAfter: 'deck.html',
          label: 'Browser',
          title: 'SVG Repo',
          url: 'https://www.svgrepo.com/',
          iconUrl: 'https://www.svgrepo.com/favicon.ico',
        },
      ],
    });

    expect(listTabs(db, 'proj-1')).toEqual({
      tabs: ['deck.html'],
      active: '__browser__:1',
      browserTabs: [
        {
          id: '__browser__:1',
          insertAfter: 'deck.html',
          label: 'Browser',
          title: 'SVG Repo',
          url: 'https://www.svgrepo.com/',
          iconUrl: 'https://www.svgrepo.com/favicon.ico',
        },
      ],
      hasSavedState: true,
      updatedAt: expect.any(Number),
    });
  });

  it('removes browser workspace tabs when the saved state omits them', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Project',
      createdAt: now,
      updatedAt: now,
    });

    setTabs(db, 'proj-1', {
      tabs: [],
      active: '__browser__:1',
      browserTabs: [{ id: '__browser__:1', label: 'Browser' }],
    });
    setTabs(db, 'proj-1', { tabs: [], active: '__design_files__' });

    expect(listTabs(db, 'proj-1')).toEqual({
      tabs: [],
      active: '__design_files__',
      hasSavedState: true,
      updatedAt: expect.any(Number),
    });
  });

  // Clients order their local tab cache against this row by `updatedAt`, and
  // stamp the cache when the change happened. If the row is stamped when the
  // (debounced) write arrives instead, an older state that lands after a newer
  // local change looks newer and wins the next restore.
  it('stores the writer-supplied change time instead of the arrival time', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Project', createdAt: now, updatedAt: now });

    const changedAt = now - 60_000;
    setTabs(db, 'proj-1', {
      tabs: ['secondary.png'],
      active: 'secondary.png',
      updatedAt: changedAt,
    });

    expect(listTabs(db, 'proj-1')).toMatchObject({
      tabs: ['secondary.png'],
      active: 'secondary.png',
      updatedAt: changedAt,
    });
  });

  it('falls back to the arrival time for a missing or invalid change time and clamps future ones', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Project', createdAt: now, updatedAt: now });

    for (const updatedAt of [undefined, Number.NaN, -1, 0, 'yesterday', now + 3_600_000]) {
      const before = Date.now();
      setTabs(db, 'proj-1', {
        tabs: ['index.html'],
        active: 'index.html',
        ...(updatedAt === undefined ? {} : { updatedAt: updatedAt as number }),
      });
      const after = Date.now();
      const stored = listTabs(db, 'proj-1').updatedAt;
      expect(stored).toBeGreaterThanOrEqual(before);
      expect(stored).toBeLessThanOrEqual(after);
    }
  });
});
