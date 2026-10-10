// #8230 自由画布 v1 — 画布布局跟着 tabs JSON 一起落库并原样取回。
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, insertProject, listTabs, openDatabase, setTabs } from '../src/db.js';

describe('project canvas layout persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-project-canvas-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('round-trips canvas nodes and viewport alongside file tabs', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Project', createdAt: now, updatedAt: now });

    setTabs(db, 'proj-1', {
      tabs: ['a.html'],
      active: 'a.html',
      canvas: {
        nodes: [
          { id: 'n1', ref: 'a.html', x: 0, y: 0, w: 320, h: 240, z: 0 },
          { id: 'n2', ref: 'b.html', x: 360, y: 0, w: 320, h: 240, z: 1 },
        ],
        viewport: { x: -40, y: 12, zoom: 0.75 },
      },
    });

    expect(listTabs(db, 'proj-1')).toEqual({
      tabs: ['a.html'],
      active: 'a.html',
      canvas: {
        nodes: [
          { id: 'n1', ref: 'a.html', x: 0, y: 0, w: 320, h: 240, z: 0 },
          { id: 'n2', ref: 'b.html', x: 360, y: 0, w: 320, h: 240, z: 1 },
        ],
        viewport: { x: -40, y: 12, zoom: 0.75 },
      },
      hasSavedState: true,
      updatedAt: expect.any(Number),
    });
  });

  it('drops an invalid canvas payload while keeping the file tabs', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Project', createdAt: now, updatedAt: now });

    setTabs(db, 'proj-1', {
      tabs: ['a.html'],
      active: 'a.html',
      // 整块坏掉（nodes 不是数组、也没视口）→ 归一化返回 null，画布字段不落库。
      canvas: { nodes: 'nope' } as never,
    });

    expect(listTabs(db, 'proj-1')).toEqual({
      tabs: ['a.html'],
      active: 'a.html',
      hasSavedState: true,
      updatedAt: expect.any(Number),
    });
  });

  it('removes the canvas when a later save omits it', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Project', createdAt: now, updatedAt: now });

    setTabs(db, 'proj-1', {
      tabs: ['a.html'],
      active: 'a.html',
      canvas: { nodes: [{ id: 'n1', ref: 'a.html', x: 0, y: 0, w: 320, h: 240, z: 0 }] },
    });
    setTabs(db, 'proj-1', { tabs: ['a.html'], active: 'a.html' });

    expect(listTabs(db, 'proj-1')).toEqual({
      tabs: ['a.html'],
      active: 'a.html',
      hasSavedState: true,
      updatedAt: expect.any(Number),
    });
  });
});
