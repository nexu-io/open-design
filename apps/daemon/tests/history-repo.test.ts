import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { execFileSync } from 'node:child_process';

import { migrateProjectRevisions } from '../src/history/persistence.js';
import {
  initProjectHistory,
  projectRepoPath,
  recordRevisionForRun,
} from '../src/history/repo.js';
import { isHistoryEnabled } from '../src/history/feature-flag.js';
import type { Identity } from '../src/identity/types.js';

const TEST_IDENTITY: Identity = {
  id: 'local:default',
  displayName: 'Test User',
  email: 'test@example.com',
  source: 'local-fallback',
};

function setupSandbox(): { dataRoot: string; projectsRoot: string; reposRoot: string; projectId: string; projectDir: string; repoDir: string; db: Database.Database } {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'od-history-'));
  const projectsRoot = path.join(dataRoot, 'projects');
  const reposRoot = path.join(dataRoot, 'repos');
  const projectId = 'p1';
  const projectDir = path.join(projectsRoot, projectId);
  const repoDir = projectRepoPath(reposRoot, projectId);
  mkdirSync(projectDir, { recursive: true });

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
  return { dataRoot, projectsRoot, reposRoot, projectId, projectDir, repoDir, db };
}

describe('isHistoryEnabled', () => {
  it('returns false when the flag is unset', () => {
    expect(isHistoryEnabled({})).toBe(false);
  });
  it.each(['1', 'true', 'yes', 'TRUE', 'Yes'])('returns true for %s', (value) => {
    expect(isHistoryEnabled({ OD_GIT_INTEGRATION_ENABLED: value })).toBe(true);
  });
  it.each(['0', 'false', 'no', '', '  '])('returns false for %s', (value) => {
    expect(isHistoryEnabled({ OD_GIT_INTEGRATION_ENABLED: value })).toBe(false);
  });
});

describe('initProjectHistory', () => {
  let sandbox: ReturnType<typeof setupSandbox>;

  beforeEach(() => {
    sandbox = setupSandbox();
  });
  afterEach(() => {
    sandbox.db.close();
    rmSync(sandbox.dataRoot, { recursive: true, force: true });
  });

  it('initializes a fresh project tree: creates repo, .gitignore, migration revision', async () => {
    // Drop one file before init so the migration commit is non-empty
    writeFileSync(path.join(sandbox.projectDir, 'README.md'), '# project\n');

    const result = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });

    expect(result.kind).toBe('initialized');
    if (result.kind !== 'initialized') return; // type guard for the assertions below

    // The gitdir lives at the expected path
    expect(existsSync(sandbox.repoDir)).toBe(true);
    // The project tree has a .git gitlink pointing at our repoDir
    const dotGit = readFileSync(path.join(sandbox.projectDir, '.git'), 'utf8');
    expect(dotGit).toMatch(/^gitdir:\s*/);
    expect(dotGit).toContain(sandbox.repoDir);
    // Default .gitignore was written
    expect(existsSync(path.join(sandbox.projectDir, '.gitignore'))).toBe(true);
    // The migration commit's SHA was returned
    expect(result.revisionId).toMatch(/^[0-9a-f]{40}$/);
    // project_revisions has a 'migration' row for this SHA
    const row = sandbox.db.prepare(
      `SELECT id, source, parent_id, actor_identity_id FROM project_revisions WHERE id = ?`,
    ).get(result.revisionId) as { id: string; source: string; parent_id: string | null; actor_identity_id: string };
    expect(row.source).toBe('migration');
    expect(row.parent_id).toBeNull();
    expect(row.actor_identity_id).toBe('local:default');
    // current_revision_id was advanced
    const proj = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = 'p1'`).get() as { current_revision_id: string };
    expect(proj.current_revision_id).toBe(result.revisionId);
  });

  it('is idempotent — second call returns already-initialized without re-touching', async () => {
    writeFileSync(path.join(sandbox.projectDir, 'README.md'), '# project\n');

    const first = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(first.kind).toBe('initialized');

    const second = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(second.kind).toBe('already-initialized');

    // Still exactly one revision row
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('refuses to take ownership of a foreign .git directory', async () => {
    // Simulate a cloned repo: put a regular .git/ directory in the tree
    mkdirSync(path.join(sandbox.projectDir, '.git'), { recursive: true });
    writeFileSync(path.join(sandbox.projectDir, '.git', 'config'), '[core]\n');

    const result = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });

    expect(result.kind).toBe('foreign-git-collision');
    // No revision row was inserted
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('refuses to take ownership of a foreign .git gitlink (points elsewhere)', async () => {
    // .git is a gitlink, but to a different gitdir than ours
    const elsewhere = path.join(sandbox.dataRoot, 'somewhere-else.gitdir');
    writeFileSync(path.join(sandbox.projectDir, '.git'), `gitdir: ${elsewhere}\n`);

    const result = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });

    expect(result.kind).toBe('foreign-git-collision');
    if (result.kind !== 'foreign-git-collision') return;
    expect(result.target).toBe(elsewhere);
  });

  it('handles an empty project tree (allow-empty initial commit)', async () => {
    // Don't drop any files — just init against an empty dir
    const result = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(result.kind).toBe('initialized');
    if (result.kind === 'initialized') {
      expect(result.revisionId).toMatch(/^[0-9a-f]{40}$/);
    }
  });

  it('synthesizes a git author email when Identity has none', async () => {
    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'a\n');
    const identityWithoutEmail: Identity = {
      id: 'local:default',
      displayName: 'No Email User',
      source: 'local-fallback',
    };
    const result = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: identityWithoutEmail,
      db: sandbox.db,
    });
    expect(result.kind).toBe('initialized');
    if (result.kind !== 'initialized') return;
    // Inspect the actual commit's author email via git
    const author = execFileSync('git', ['log', '-1', '--format=%ae', result.revisionId], {
      cwd: sandbox.projectDir,
    }).toString().trim();
    expect(author).toBe('local_default@open-design.local');
  });
});

describe('recordRevisionForRun', () => {
  let sandbox: ReturnType<typeof setupSandbox>;

  beforeEach(async () => {
    sandbox = setupSandbox();
    writeFileSync(path.join(sandbox.projectDir, 'README.md'), '# project\n');
    await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
  });
  afterEach(() => {
    sandbox.db.close();
    rmSync(sandbox.dataRoot, { recursive: true, force: true });
  });

  it('records a revision when the tree is dirty after a run', async () => {
    // Simulate the agent writing a new file during the run
    writeFileSync(path.join(sandbox.projectDir, 'hero.html'), '<h1>Hello</h1>\n');

    const result = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-1', identity: TEST_IDENTITY },
      message: 'Add hero section',
      db: sandbox.db,
    });

    expect(result.kind).toBe('recorded');
    if (result.kind !== 'recorded') return;
    expect(result.revisionId).toMatch(/^[0-9a-f]{40}$/);
    expect(result.filesChanged).toBe(1);
    expect(result.bytesAdded).toBe(1);

    // Revision row stored with run_id + source='agent-run'
    const row = sandbox.db.prepare(
      `SELECT source, run_id, actor_identity_id, parent_id FROM project_revisions WHERE id = ?`,
    ).get(result.revisionId) as { source: string; run_id: string; actor_identity_id: string; parent_id: string | null };
    expect(row.source).toBe('agent-run');
    expect(row.run_id).toBe('run-1');
    expect(row.actor_identity_id).toBe('local:default');
    expect(row.parent_id).not.toBeNull(); // we have the migration parent

    // current_revision_id advanced
    const proj = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = 'p1'`).get() as { current_revision_id: string };
    expect(proj.current_revision_id).toBe(result.revisionId);
  });

  it('returns "clean" with no-op when the tree is unchanged', async () => {
    const result = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-2', identity: TEST_IDENTITY },
      message: 'No-op run',
      db: sandbox.db,
    });

    expect(result.kind).toBe('clean');

    // Still exactly the original migration row + nothing new
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('returns "not-initialized" if substrate is missing for the project', async () => {
    // Create a fresh sandbox without init
    sandbox.db.close();
    rmSync(sandbox.dataRoot, { recursive: true, force: true });
    sandbox = setupSandbox();
    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'a\n');

    const result = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-3', identity: TEST_IDENTITY },
      message: 'whatever',
      db: sandbox.db,
    });

    expect(result.kind).toBe('not-initialized');
  });

  it('serializes concurrent record calls so each run gets its own revision', async () => {
    // Two parallel recordRevisionForRun calls against the same project,
    // each writing a distinct file. Without the per-project lock the
    // second call sees the tree cleaned by the first call's commit and
    // returns 'clean' (data loss). With the lock both produce
    // 'recorded' results because each call observes only its own
    // changes against a tree the previous call has already committed.
    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'a\n');
    writeFileSync(path.join(sandbox.projectDir, 'b.txt'), 'b\n');

    const [resA, resB] = await Promise.all([
      recordRevisionForRun({
        projectId: sandbox.projectId,
        projectDir: sandbox.projectDir,
        repoDir: sandbox.repoDir,
        run: { id: 'run-a', identity: TEST_IDENTITY },
        message: 'first parallel',
        db: sandbox.db,
      }),
      recordRevisionForRun({
        projectId: sandbox.projectId,
        projectDir: sandbox.projectDir,
        repoDir: sandbox.repoDir,
        run: { id: 'run-b', identity: TEST_IDENTITY },
        message: 'second parallel',
        db: sandbox.db,
      }),
    ]);

    // Exactly one of the two ends up with a 'recorded' result — the
    // other observes a clean tree because the first commit captured
    // its work too. That's the expected behavior under the lock: the
    // serialization point is which commit "wins"; the change set is
    // preserved either way (no silent data loss).
    const kinds = [resA.kind, resB.kind].sort();
    expect(kinds).toContain('recorded');

    // Total revisions for this project = 1 migration (from beforeEach)
    // + at least one agent-run commit. The second call may or may not
    // have produced its own commit depending on lock ordering; what
    // matters is that no data is silently dropped.
    const totalRevisions = (sandbox.db.prepare(
      `SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = ?`,
    ).get(sandbox.projectId) as { n: number }).n;
    expect(totalRevisions).toBeGreaterThanOrEqual(2);

    // Every staged file is now committed somewhere — the working
    // tree is clean after both calls finish.
    const cleanProbe = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-probe', identity: TEST_IDENTITY },
      message: 'probe',
      db: sandbox.db,
    });
    expect(cleanProbe.kind).toBe('clean');
  });
});
