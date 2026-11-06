import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  deleteProject,
  deleteWorkspaceProject,
  ensureWorkspaceProject,
  insertProject,
  onProjectCatalogMutation,
  openDatabase,
  rebindWorkspaceProject,
  updateProject,
  updateWorkspaceProject,
} from '../src/db.js';
import { createProjectCatalogEvents } from '../src/routes/project-catalog-events.js';

const WINDOW_MS = 250;

describe('createProjectCatalogEvents', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses a burst of mutations into one signal at the end of the window', () => {
    const catalog = createProjectCatalogEvents({ windowMs: WINDOW_MS });
    const sink = vi.fn();
    catalog.subscribe(sink);

    for (let i = 0; i < 20; i += 1) catalog.notify();
    vi.advanceTimersByTime(WINDOW_MS - 1);
    expect(sink).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink.mock.calls[0]![0]).toMatchObject({ type: 'project-catalog-changed' });
  });

  it('announces a later mutation again once the window has closed', () => {
    const catalog = createProjectCatalogEvents({ windowMs: WINDOW_MS });
    const sink = vi.fn();
    catalog.subscribe(sink);

    catalog.notify();
    vi.advanceTimersByTime(WINDOW_MS);
    catalog.notify();
    vi.advanceTimersByTime(WINDOW_MS);

    expect(sink).toHaveBeenCalledTimes(2);
  });

  it('keeps delivering to healthy subscribers when one sink throws', () => {
    const catalog = createProjectCatalogEvents({ windowMs: WINDOW_MS });
    const healthy = vi.fn();
    catalog.subscribe(() => {
      throw new Error('closed socket');
    });
    catalog.subscribe(healthy);

    catalog.notify();
    vi.advanceTimersByTime(WINDOW_MS);
    catalog.notify();
    vi.advanceTimersByTime(WINDOW_MS);

    expect(healthy).toHaveBeenCalledTimes(2);
  });

  it('stops delivering after unsubscribe and sends nothing when nobody changed', () => {
    const catalog = createProjectCatalogEvents({ windowMs: WINDOW_MS });
    const sink = vi.fn();
    const unsubscribe = catalog.subscribe(sink);

    vi.advanceTimersByTime(WINDOW_MS * 4);
    expect(sink).not.toHaveBeenCalled();

    unsubscribe();
    catalog.notify();
    vi.advanceTimersByTime(WINDOW_MS);
    expect(sink).not.toHaveBeenCalled();
  });
});

describe('onProjectCatalogMutation', () => {
  function openDb() {
    const db = new Database(':memory:');
    db.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, skill_id TEXT,
        design_system_id TEXT, pending_prompt TEXT, metadata_json TEXT,
        applied_plugin_snapshot_id TEXT, custom_instructions TEXT, created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
    `);
    return db;
  }

  const project = (id: string) => ({ id, name: id, createdAt: 1, updatedAt: 1 });

  it('fires for every write that changes what the project list shows', () => {
    const db = openDb();
    const listener = vi.fn();
    onProjectCatalogMutation(db as never, listener);

    insertProject(db as never, project('p1'));
    expect(listener).toHaveBeenCalledTimes(1);

    updateProject(db as never, 'p1', { name: 'renamed' });
    expect(listener).toHaveBeenCalledTimes(2);

    deleteProject(db as never, 'p1');
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('stays silent when an update targets a project that does not exist', () => {
    const db = openDb();
    const listener = vi.fn();
    onProjectCatalogMutation(db as never, listener);

    expect(updateProject(db as never, 'missing', { name: 'x' })).toBeNull();

    expect(listener).not.toHaveBeenCalled();
  });

  it('is scoped to the database it was registered on and can be removed', () => {
    const watched = openDb();
    const other = openDb();
    const listener = vi.fn();
    const off = onProjectCatalogMutation(watched as never, listener);

    insertProject(other as never, project('p1'));
    expect(listener).not.toHaveBeenCalled();

    off();
    insertProject(watched as never, project('p2'));
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('onProjectCatalogMutation for workspace bindings', () => {
  let dir: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'od-catalog-binding-'));
    db = openDatabase(dir, { dataDir: dir });
    insertProject(db, { id: 'p1', name: 'p1', createdAt: 1, updatedAt: 1 });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dir, { recursive: true, force: true });
  });

  it('fires when a project is bound, shared, moved between workspaces, and unbound', () => {
    const listener = vi.fn();
    onProjectCatalogMutation(db, listener);

    ensureWorkspaceProject(db, { projectId: 'p1', workspaceId: 'ws-a', visibility: 'personal' });
    expect(listener).toHaveBeenCalledTimes(1);

    updateWorkspaceProject(db, 'ws-a', 'p1', { visibility: 'team' });
    expect(listener).toHaveBeenCalledTimes(2);

    rebindWorkspaceProject(db, 'p1', { workspaceId: 'ws-b' });
    expect(listener).toHaveBeenCalledTimes(3);

    deleteWorkspaceProject(db, 'ws-b', 'p1');
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('stays silent for binding rewrites that change nothing the list shows', () => {
    ensureWorkspaceProject(db, { projectId: 'p1', workspaceId: 'ws-a', visibility: 'team' });
    const listener = vi.fn();
    onProjectCatalogMutation(db, listener);

    updateWorkspaceProject(db, 'ws-a', 'p1', { visibility: 'team', version: 7 });
    rebindWorkspaceProject(db, 'p1', { workspaceId: 'ws-a' });
    ensureWorkspaceProject(db, { projectId: 'p1', workspaceId: 'ws-a', visibility: 'team' });
    deleteWorkspaceProject(db, 'ws-a', 'someone-elses-project');

    expect(listener).not.toHaveBeenCalled();
  });
});
