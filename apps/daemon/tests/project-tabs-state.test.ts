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
});
