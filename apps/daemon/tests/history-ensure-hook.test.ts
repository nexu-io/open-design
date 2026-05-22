import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, existsSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { ensureProject, setProjectEnsuredHook } from '../src/projects.js';
import { migrateProjectRevisions } from '../src/history/persistence.js';
import { installHistoryEnsureHook } from '../src/history/ensure-hook.js';

function freshSandbox(): { dataRoot: string; projectsRoot: string; reposRoot: string; db: Database.Database } {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'od-ensure-hook-'));
  const projectsRoot = path.join(dataRoot, 'projects');
  const reposRoot = path.join(dataRoot, 'repos');
  mkdirSync(projectsRoot, { recursive: true });
  mkdirSync(reposRoot, { recursive: true });

  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
  `);
  migrateProjectRevisions(db);
  return { dataRoot, projectsRoot, reposRoot, db };
}

describe('installHistoryEnsureHook', () => {
  let sandbox: ReturnType<typeof freshSandbox>;

  beforeEach(() => {
    sandbox = freshSandbox();
  });

  afterEach(() => {
    setProjectEnsuredHook(null);
    sandbox.db.close();
    rmSync(sandbox.dataRoot, { recursive: true, force: true });
  });

  it('is a no-op when OD_GIT_INTEGRATION_ENABLED is unset', async () => {
    installHistoryEnsureHook({ db: sandbox.db, reposRoot: sandbox.reposRoot, env: {} });

    const dir = await ensureProject(sandbox.projectsRoot, 'p1');

    expect(existsSync(dir)).toBe(true);                                         // dir was created
    expect(existsSync(path.join(dir, '.git'))).toBe(false);                     // no substrate init
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('initializes the substrate when the flag is on and project is fresh', async () => {
    installHistoryEnsureHook({
      db: sandbox.db,
      reposRoot: sandbox.reposRoot,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    const dir = await ensureProject(sandbox.projectsRoot, 'p1');

    expect(existsSync(path.join(dir, '.git'))).toBe(true);                      // gitlink written
    expect(existsSync(path.join(sandbox.reposRoot, 'p1.gitdir'))).toBe(true);   // gitdir created
    const row = sandbox.db.prepare(
      `SELECT source, run_id, actor_identity_id FROM project_revisions WHERE project_id = 'p1'`,
    ).get() as { source: string; run_id: string | null; actor_identity_id: string };
    expect(row.source).toBe('migration');
    expect(row.run_id).toBeNull();
    expect(row.actor_identity_id).toBe('local:default');
  });

  it('is idempotent — re-ensuring an initialized project does not duplicate revisions', async () => {
    installHistoryEnsureHook({
      db: sandbox.db,
      reposRoot: sandbox.reposRoot,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    await ensureProject(sandbox.projectsRoot, 'p1');
    await ensureProject(sandbox.projectsRoot, 'p1');
    await ensureProject(sandbox.projectsRoot, 'p1');

    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('skips linked-folder projects (metadata.baseDir set)', async () => {
    installHistoryEnsureHook({
      db: sandbox.db,
      reposRoot: sandbox.reposRoot,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    // Create a "user folder" outside the projects root with its own preexisting content
    const userFolder = path.join(sandbox.dataRoot, 'my-existing-project');
    mkdirSync(userFolder, { recursive: true });
    writeFileSync(path.join(userFolder, 'README.md'), '# user-owned\n');

    await ensureProject(sandbox.projectsRoot, 'p1', { baseDir: userFolder });

    // No substrate init should have run against the user's folder
    expect(existsSync(path.join(userFolder, '.git'))).toBe(false);
    expect(existsSync(path.join(sandbox.reposRoot, 'p1.gitdir'))).toBe(false);
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('does not throw when a foreign .git is present (collision is logged, ensure still returns dir)', async () => {
    installHistoryEnsureHook({
      db: sandbox.db,
      reposRoot: sandbox.reposRoot,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    // Pre-create the project dir with a foreign .git
    const dir = path.join(sandbox.projectsRoot, 'p1');
    mkdirSync(path.join(dir, '.git'), { recursive: true });

    const returned = await ensureProject(sandbox.projectsRoot, 'p1');

    expect(returned).toBe(dir);                                                 // contract preserved
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions`).get() as { n: number };
    expect(count.n).toBe(0);                                                    // no migration row inserted
  });

  it('propagates hook errors instead of swallowing them', async () => {
    // When OD_GIT_INTEGRATION_ENABLED is on, init failures (git missing,
    // EACCES on gitdir, SQLite errors) are contract violations — the
    // user opted into history and expects it to work. ensureProject
    // must surface those errors rather than returning a silently
    // broken directory.
    setProjectEnsuredHook(async () => {
      throw new Error('boom');
    });

    await expect(ensureProject(sandbox.projectsRoot, 'p1')).rejects.toThrow('boom');
  });

  it('surfaces a real initProjectHistory failure when the substrate cannot be created', async () => {
    // Forcing initProjectHistory to fail: point reposRoot at a path
    // that exists as a regular file, so `fs.mkdir(path.dirname(repoDir))`
    // fails with ENOTDIR. ensureProject must propagate the error.
    const blockingFile = path.join(sandbox.dataRoot, 'blocked-repos');
    writeFileSync(blockingFile, 'this-is-a-file-not-a-dir');
    installHistoryEnsureHook({
      db: sandbox.db,
      reposRoot: blockingFile,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    await expect(ensureProject(sandbox.projectsRoot, 'p1')).rejects.toThrow();
  });
});
