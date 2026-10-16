import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { closeDatabase, getProject, insertProject, listProjects, listUnboundProjects, listWorkspaceProjects, ensureWorkspaceProject, insertConversation, upsertMessage, recordProjectUserQuery, openDatabase, updateProject } from '../src/db.js';

describe('project user-query recency', () => {
  let dir: string;
  beforeEach(() => { dir = mkdtempSync(path.join(os.tmpdir(), 'od-project-recency-')); });
  afterEach(() => { closeDatabase(); rmSync(dir, { recursive: true, force: true }); });
  const seed = () => {
    const db = openDatabase(dir, { dataDir: dir });
    insertProject(db, { id: 'p', name: 'Project', createdAt: 1, updatedAt: 2 });
    return db;
  };

  it('persists a monotonic send timestamp without changing content activity', () => {
    const db = seed();
    expect(getProject(db, 'p')?.lastUserQueryAt).toBeNull();
    updateProject(db, 'p', { lastUserQueryAt: 100 });
    expect(getProject(db, 'p')).toMatchObject({ lastUserQueryAt: 100, updatedAt: 2 });
    updateProject(db, 'p', { lastUserQueryAt: 50 });
    updateProject(db, 'p', { name: 'Renamed' });
    expect(getProject(db, 'p')?.lastUserQueryAt).toBe(100);
    expect(listProjects(db)[0]?.lastUserQueryAt).toBe(100);
    expect(listUnboundProjects(db)[0]?.lastUserQueryAt).toBe(100);
    ensureWorkspaceProject(db, { projectId: 'p', workspaceId: 'ws', visibility: 'personal', resourceState: 'active' });
    expect(listWorkspaceProjects(db, 'ws')[0]?.lastUserQueryAt).toBe(100);
    closeDatabase();
    expect(getProject(openDatabase(dir, { dataDir: dir }), 'p')?.lastUserQueryAt).toBe(100);
  });

  it('backfills legacy sends once across all conversations without reading payloads', () => {
    const db = seed();
    for (const id of ['c1', 'c2']) {
      insertConversation(db, { id, projectId: 'p', title: id, createdAt: 1, updatedAt: 1 });
    }
    upsertMessage(db, 'c1', { id: 'u1', role: 'user', content: 'first', createdAt: 10 });
    upsertMessage(db, 'c2', { id: 'u2', role: 'user', content: 'second', createdAt: 20 });
    upsertMessage(db, 'c2', { id: 'a1', role: 'assistant', content: 'reply', createdAt: 30 });
    db.exec('ALTER TABLE projects DROP COLUMN last_user_query_at');
    closeDatabase();
    const migrated = openDatabase(dir, { dataDir: dir });
    expect(getProject(migrated, 'p')?.lastUserQueryAt).toBe(20);
    // A later history write must not become a new send on the next startup.
    upsertMessage(migrated, 'c2', { id: 'import', role: 'user', content: 'history', createdAt: 50 });
    closeDatabase();
    expect(getProject(openDatabase(dir, { dataDir: dir }), 'p')?.lastUserQueryAt).toBe(20);
  });

  it('does not let a failed metadata write throw or change saved messages', () => {
    const db = seed();
    insertConversation(db, { id: 'c', projectId: 'p', title: 'Chat', createdAt: 1, updatedAt: 1 });
    upsertMessage(db, 'c', { id: 'u', role: 'user', content: 'saved', createdAt: 10 });
    db.pragma('query_only = ON');
    expect(() => recordProjectUserQuery(db, 'p', 20)).not.toThrow();
    expect(db.prepare('SELECT content FROM messages WHERE id = ?').get('u')).toEqual({ content: 'saved' });
    db.pragma('query_only = OFF');
  });

  it('ignores invalid recency metadata', () => {
    const db = seed();
    for (const lastUserQueryAt of [NaN, Infinity, -1, '100', null]) {
      updateProject(db, 'p', { lastUserQueryAt });
    }
    expect(getProject(db, 'p')?.lastUserQueryAt).toBeNull();
  });
});
