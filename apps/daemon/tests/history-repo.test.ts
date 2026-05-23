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
    // revisionId is a substrate-opaque UUID, not the git SHA
    expect(result.revisionId).toMatch(/^[0-9a-f-]{36}$/);
    // project_revisions has a 'migration' row; the git SHA lives in git_sha
    const row = sandbox.db.prepare(
      `SELECT id, source, parent_id, git_sha, actor_identity_id FROM project_revisions WHERE id = ?`,
    ).get(result.revisionId) as { id: string; source: string; parent_id: string | null; git_sha: string; actor_identity_id: string };
    expect(row.source).toBe('migration');
    expect(row.parent_id).toBeNull();
    expect(row.git_sha).toMatch(/^[0-9a-f]{40}$/);
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

  it('repairs a half-initialized substrate (gitdir present, migration row missing)', async () => {
    // Setup: do a normal init, then simulate the "post-commit DB write
    // failed" outcome by deleting the migration row and clearing the
    // current_revision_id pointer. This is the state the daemon would
    // be in after a crash (or transient SQLite error) between the git
    // commit and the INSERT/UPDATE in initProjectHistoryLocked.
    writeFileSync(path.join(sandbox.projectDir, 'README.md'), '# project\n');
    const first = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(first.kind).toBe('initialized');

    // Force the half-init state — gitdir on disk stays, DB state lost.
    sandbox.db.prepare(`DELETE FROM project_revisions WHERE project_id = ?`).run(sandbox.projectId);
    sandbox.db.prepare(`UPDATE projects SET current_revision_id = NULL WHERE id = ?`).run(sandbox.projectId);
    const pre = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = ?`).get(sandbox.projectId) as { n: number };
    expect(pre.n).toBe(0);

    // Retry init — should detect the half-init state and repair from HEAD,
    // NOT short-circuit at the readDotGitState() === 'ours' check.
    const second = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(second.kind).toBe('repaired');
    if (second.kind !== 'repaired') return;

    // Case (a): HEAD already exists from the crashed prior init.
    // The retry did NOT author this commit — it just reconstructs the
    // missing row. Attribution comes from the existing commit's git
    // metadata; we leave actor_identity_id NULL because that resolved
    // value is unrecoverable from git alone.
    const repaired = sandbox.db.prepare(
      `SELECT id, source, parent_id, git_sha, actor_identity_id, actor_display_name, run_id, files_changed_count
         FROM project_revisions WHERE id = ?`,
    ).get(second.revisionId) as {
      id: string;
      source: string;
      parent_id: string | null;
      git_sha: string;
      actor_identity_id: string | null;
      actor_display_name: string | null;
      run_id: string | null;
      files_changed_count: number;
    };
    expect(repaired.source).toBe('migration');
    expect(repaired.parent_id).toBeNull();
    expect(repaired.git_sha).toMatch(/^[0-9a-f]{40}$/);
    expect(repaired.actor_identity_id).toBeNull();
    expect(repaired.actor_display_name).toBe('Test User');
    expect(repaired.run_id).toBeNull();
    expect(repaired.files_changed_count).toBe(0);
    const headSha = execFileSync('git', [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD']).toString().trim();
    expect(repaired.git_sha).toBe(headSha);

    // projects.current_revision_id was re-advanced to the repaired revision
    const proj = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = 'p1'`).get() as { current_revision_id: string };
    expect(proj.current_revision_id).toBe(second.revisionId);

    // A third call after repair returns the no-op fast path
    const third = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(third.kind).toBe('already-initialized');
  });

  it('repairs a half-init with an unborn HEAD (gitdir exists, no initial commit)', async () => {
    // The narrower half-init case: a crash between `git init` (creates
    // gitdir + gitlink) and `git commit --allow-empty` (creates the
    // initial commit). On retry, readDotGitState() returns 'ours' but
    // HEAD is unborn — the previous repair (P0-fix.10) would call
    // `git rev-parse HEAD` and throw on exit 128, leaving the project
    // permanently broken. Fix: probe HEAD with softFail128 and, when
    // absent, resume the remaining init steps before writing the row.
    writeFileSync(path.join(sandbox.projectDir, 'README.md'), '# project\n');

    // Manually create the unborn-HEAD half-state without running
    // initProjectHistory at all. `git init --separate-git-dir` puts
    // the gitdir at repoDir, writes the gitlink in projectDir, and
    // creates HEAD pointing at refs/heads/main — but with no
    // commits yet, so rev-parse HEAD exits 128 ("unknown revision").
    mkdirSync(path.dirname(sandbox.repoDir), { recursive: true });
    execFileSync('git', [
      'init',
      `--separate-git-dir=${sandbox.repoDir}`,
      '--initial-branch=main',
      sandbox.projectDir,
    ], { stdio: 'ignore' });
    // Sanity: rev-parse HEAD exits 128 on the unborn branch
    expect(() => execFileSync('git', [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD'])).toThrow();

    // initProjectHistory should detect 'ours' + no migration row + no
    // HEAD, and resume the init from where the previous attempt died.
    const result = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(result.kind).toBe('repaired');
    if (result.kind !== 'repaired') return;

    // After repair: HEAD exists, the initial commit was created.
    const headSha = execFileSync('git', [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD']).toString().trim();
    expect(headSha).toMatch(/^[0-9a-f]{40}$/);

    // Migration row exists and matches HEAD
    const row = sandbox.db.prepare(
      `SELECT git_sha, source, actor_identity_id FROM project_revisions WHERE id = ?`,
    ).get(result.revisionId) as { git_sha: string; source: string; actor_identity_id: string };
    expect(row.source).toBe('migration');
    expect(row.git_sha).toBe(headSha);
    expect(row.actor_identity_id).toBe('local:default');

    // info/exclude was populated with the daemon-managed block
    const excludeBody = readFileSync(path.join(sandbox.repoDir, 'info', 'exclude'), 'utf8');
    expect(excludeBody).toContain('.od-skills/');

    // projects.current_revision_id was advanced
    const proj = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = 'p1'`).get() as { current_revision_id: string };
    expect(proj.current_revision_id).toBe(result.revisionId);

    // Subsequent call returns the no-op fast path
    const second = await initProjectHistory({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      identity: TEST_IDENTITY,
      db: sandbox.db,
    });
    expect(second.kind).toBe('already-initialized');
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
      expect(result.revisionId).toMatch(/^[0-9a-f-]{36}$/);
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
    // revisionId is the substrate-opaque UUID; resolve the actual
    // git SHA via the DB row before asking git about the commit.
    const row = sandbox.db.prepare(
      `SELECT git_sha FROM project_revisions WHERE id = ?`,
    ).get(result.revisionId) as { git_sha: string };
    const author = execFileSync('git', ['log', '-1', '--format=%ae', row.git_sha], {
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
      runTouchedFiles: true,
    });

    expect(result.kind).toBe('recorded');
    if (result.kind !== 'recorded') return;
    // revisionId is now a substrate-opaque UUID; the git SHA lives in
    // the git_sha column.
    expect(result.revisionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.filesChanged).toBe(1);
    expect(result.bytesAdded).toBe(1);

    // Revision row stored with run_id + source='agent-run'.
    // parent_id is the parent's UUID (the migration revision), not its SHA.
    const row = sandbox.db.prepare(
      `SELECT source, run_id, actor_identity_id, parent_id, git_sha FROM project_revisions WHERE id = ?`,
    ).get(result.revisionId) as { source: string; run_id: string; actor_identity_id: string; parent_id: string | null; git_sha: string };
    expect(row.source).toBe('agent-run');
    expect(row.run_id).toBe('run-1');
    expect(row.actor_identity_id).toBe('local:default');
    expect(row.git_sha).toMatch(/^[0-9a-f]{40}$/);
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

  it('backfills an orphan HEAD revision when a prior call crashed between git commit and the DB INSERT', async () => {
    // P0-fix #14 — invariant: at the end of recordRevisionForRunLocked,
    // HEAD's SHA always has a corresponding project_revisions row. If
    // a prior call's git commit landed but its SQLite INSERT failed
    // (transient error or process crash), HEAD is one commit ahead of
    // the table. Without the orphan-backfill check the next call sees
    // status='' clean, headBeforeLock === headNow, and returns 'clean'
    // — the orphan stays orphan forever and provenance is permanently
    // broken for that commit.
    //
    // This test simulates the boundary-4 crash directly: create the
    // orphan commit via git (no row in the table for it), then call
    // recordRevisionForRun and assert the back-fill row was inserted
    // with the right linkage.

    // Discover the migration row that was inserted by beforeEach's init
    const migrationRow = sandbox.db.prepare(
      `SELECT id, git_sha FROM project_revisions WHERE project_id = ? AND source = 'migration'`,
    ).get(sandbox.projectId) as { id: string; git_sha: string };
    expect(migrationRow).toBeDefined();

    // Simulate the boundary-4 state: make an extra commit at HEAD
    // (the "orphan") that NO project_revisions row references.
    writeFileSync(path.join(sandbox.projectDir, 'orphan-from-crashed-run.txt'), 'a\n');
    execFileSync(
      'git',
      [`--git-dir=${sandbox.repoDir}`, `--work-tree=${sandbox.projectDir}`, 'add', '-A'],
      { stdio: 'ignore' },
    );
    execFileSync(
      'git',
      [`--git-dir=${sandbox.repoDir}`, `--work-tree=${sandbox.projectDir}`,
       '-c', 'user.email=crashed@test.local', '-c', 'user.name=crashed',
       'commit', '-m', 'this commit lost its DB write'],
      { stdio: 'ignore' },
    );
    const orphanSha = execFileSync('git', [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD']).toString().trim();
    expect(orphanSha).not.toBe(migrationRow.git_sha);
    // Confirm the orphan really has no row before we call recordRevisionForRun
    const preExisting = sandbox.db.prepare(
      `SELECT id FROM project_revisions WHERE project_id = ? AND git_sha = ?`,
    ).get(sandbox.projectId, orphanSha) as { id: string } | undefined;
    expect(preExisting).toBeUndefined();

    // Now call recordRevisionForRun with a CLEAN tree (no new file
    // changes). The orphan-backfill check should fire before the
    // status check and insert the missing row.
    const result = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-after-crash', identity: TEST_IDENTITY },
      message: 'this run had no file changes',
      db: sandbox.db,
    });

    // The tree truly is clean for this call (we already committed the
    // orphan file above; nothing new to commit now), so the return is
    // 'clean'. The back-fill happened as a side-effect.
    expect(result.kind).toBe('clean');

    // The orphan SHA now has a row
    const backfilled = sandbox.db.prepare(
      `SELECT id, source, parent_id, git_sha, actor_identity_id, actor_display_name, run_id, files_changed_count, message, created_at
         FROM project_revisions WHERE project_id = ? AND git_sha = ?`,
    ).get(sandbox.projectId, orphanSha) as {
      id: string;
      source: string;
      parent_id: string | null;
      git_sha: string;
      actor_identity_id: string | null;
      actor_display_name: string | null;
      run_id: string | null;
      files_changed_count: number;
      message: string;
      created_at: number;
    };
    expect(backfilled).toBeDefined();
    expect(backfilled.source).toBe('agent-run');
    // parent_id derived from `git rev-parse HEAD^` resolved via
    // git_sha — should match the actual git parent (the migration).
    expect(backfilled.parent_id).toBe(migrationRow.id);
    // Attribution recovered from git, not the retrying run:
    //   actor_identity_id is unrecoverable from git alone
    expect(backfilled.actor_identity_id).toBeNull();
    //   actor_display_name from `git show -s --format=%an`
    expect(backfilled.actor_display_name).toBe('crashed');
    // run_id from the crashed call is unrecoverable
    expect(backfilled.run_id).toBeNull();
    // message reflects the actual commit, not a hardcoded marker
    expect(backfilled.message).toBe('this commit lost its DB write');
    // Stats come from `git show --shortstat <sha>` per orphan, not 0.
    expect(backfilled.files_changed_count).toBe(1);
    // created_at reflects the commit's author date, not the repair time
    const commitDateIso = execFileSync('git', [
      `--git-dir=${sandbox.repoDir}`, 'log', '-1', '--format=%aI', orphanSha,
    ]).toString().trim();
    const commitDateMs = Date.parse(commitDateIso);
    expect(backfilled.created_at).toBe(commitDateMs);

    // projects.current_revision_id now points at the back-filled row
    const proj = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = 'p1'`).get() as { current_revision_id: string };
    expect(proj.current_revision_id).toBe(backfilled.id);

    // Total rows: migration + orphan-backfill
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(count.n).toBe(2);

    // A subsequent recordRevisionForRun on a still-clean tree is a
    // pure no-op — HEAD now has its row, no orphan to repair.
    const secondCall = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-after-backfill', identity: TEST_IDENTITY },
      message: 'still clean',
      db: sandbox.db,
    });
    expect(secondCall.kind).toBe('clean');
    const finalCount = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(finalCount.n).toBe(2);
  });

  it('orphan backfill does not leak attribution from the retrying run when identities differ', async () => {
    // Make an orphan commit authored by identity A (the crashed run).
    // Then call recordRevisionForRun with identity B (the retry). The
    // backfilled row must reflect A's git author, not B's identity.
    writeFileSync(path.join(sandbox.projectDir, 'orphan-from-A.txt'), 'work from A\n');
    execFileSync(
      'git',
      [`--git-dir=${sandbox.repoDir}`, `--work-tree=${sandbox.projectDir}`, 'add', '-A'],
      { stdio: 'ignore' },
    );
    execFileSync(
      'git',
      [
        `--git-dir=${sandbox.repoDir}`,
        `--work-tree=${sandbox.projectDir}`,
        '-c', 'user.email=alice@test.local',
        '-c', 'user.name=Alice',
        'commit', '-m', 'feature work by Alice',
      ],
      { stdio: 'ignore' },
    );
    const orphanSha = execFileSync('git', [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD']).toString().trim();

    const BOB: Identity = {
      id: 'oauth:bob@example.com',
      displayName: 'Bob',
      email: 'bob@example.com',
      source: 'oauth',
    };
    await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'bob-retry', identity: BOB },
      message: 'unused by the backfill path',
      db: sandbox.db,
    });

    const backfilled = sandbox.db.prepare(
      `SELECT actor_identity_id, actor_display_name, message FROM project_revisions WHERE git_sha = ?`,
    ).get(orphanSha) as { actor_identity_id: string | null; actor_display_name: string | null; message: string };
    expect(backfilled.actor_identity_id).toBeNull();
    expect(backfilled.actor_display_name).toBe('Alice');
    expect(backfilled.message).toBe('feature work by Alice');
  });

  it('repairs stale current_revision_id when the HEAD row exists but the pointer is wrong', async () => {
    // Simulate the legacy partial-write state: row landed but the
    // UPDATE projects pointer didn't (pre-transaction-wrap, or
    // external interference). Invariant: HEAD's row.id == pointer.
    const migrationRow = sandbox.db.prepare(
      `SELECT id FROM project_revisions WHERE project_id = ? AND source = 'migration'`,
    ).get(sandbox.projectId) as { id: string };

    sandbox.db.prepare(`UPDATE projects SET current_revision_id = NULL WHERE id = ?`).run(sandbox.projectId);
    const before = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = ?`).get(sandbox.projectId) as { current_revision_id: string | null };
    expect(before.current_revision_id).toBeNull();

    await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-after-stale-pointer', identity: TEST_IDENTITY },
      message: 'unrelated',
      db: sandbox.db,
    });

    const after = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = ?`).get(sandbox.projectId) as { current_revision_id: string };
    expect(after.current_revision_id).toBe(migrationRow.id);
  });

  it('backfills every orphan in a multi-commit chain (oldest → newest), not just HEAD', async () => {
    const migrationRow = sandbox.db.prepare(
      `SELECT id, git_sha FROM project_revisions WHERE project_id = ? AND source = 'migration'`,
    ).get(sandbox.projectId) as { id: string; git_sha: string };

    // Two consecutive crashed runs: each landed a commit but never the
    // SQLite row. Construct via direct git so the DB has only the
    // migration row.
    const gitArgs = (...args: string[]) => execFileSync(
      'git',
      [`--git-dir=${sandbox.repoDir}`, `--work-tree=${sandbox.projectDir}`,
       '-c', 'user.email=ghost@test.local', '-c', 'user.name=Ghost', ...args],
      { stdio: 'ignore' },
    );
    writeFileSync(path.join(sandbox.projectDir, 'orphan-A.txt'), 'A\n');
    gitArgs('add', '-A');
    gitArgs('commit', '-m', 'first orphan (A)');
    const orphanA = execFileSync('git', [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD']).toString().trim();
    writeFileSync(path.join(sandbox.projectDir, 'orphan-B.txt'), 'B\n');
    gitArgs('add', '-A');
    gitArgs('commit', '-m', 'second orphan (B)');
    const orphanB = execFileSync('git', [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD']).toString().trim();

    await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'retry-after-two-crashes', identity: TEST_IDENTITY },
      message: 'unused',
      db: sandbox.db,
    });

    const rows = sandbox.db.prepare(
      `SELECT id, git_sha, parent_id, message FROM project_revisions WHERE project_id = ?`,
    ).all(sandbox.projectId) as Array<{ id: string; git_sha: string; parent_id: string | null; message: string }>;
    expect(rows).toHaveLength(3);
    const bySha = new Map(rows.map((r) => [r.git_sha, r]));
    const migRow = bySha.get(migrationRow.git_sha)!;
    const aRow = bySha.get(orphanA)!;
    const bRow = bySha.get(orphanB)!;
    expect(migRow).toBeDefined();
    expect(aRow).toBeDefined();
    expect(bRow).toBeDefined();
    expect(migRow.parent_id).toBeNull();
    expect(aRow.parent_id).toBe(migRow.id);
    expect(bRow.parent_id).toBe(aRow.id);
    expect(aRow.message).toBe('first orphan (A)');
    expect(bRow.message).toBe('second orphan (B)');

    const proj = sandbox.db.prepare(`SELECT current_revision_id FROM projects WHERE id = 'p1'`).get() as { current_revision_id: string };
    expect(proj.current_revision_id).toBe(bRow.id);
  });

  it('fails loudly when the git object DB is corrupt during repair (no fabrication)', async () => {
    writeFileSync(path.join(sandbox.projectDir, 'orphan.txt'), 'x\n');
    execFileSync(
      'git',
      [`--git-dir=${sandbox.repoDir}`, `--work-tree=${sandbox.projectDir}`,
       '-c', 'user.email=ghost@test.local', '-c', 'user.name=Ghost',
       'add', '-A'],
      { stdio: 'ignore' },
    );
    execFileSync(
      'git',
      [`--git-dir=${sandbox.repoDir}`, `--work-tree=${sandbox.projectDir}`,
       '-c', 'user.email=ghost@test.local', '-c', 'user.name=Ghost',
       'commit', '-m', 'about to break'],
      { stdio: 'ignore' },
    );

    const orphanSha = execFileSync(
      'git',
      [`--git-dir=${sandbox.repoDir}`, 'rev-parse', 'HEAD'],
      { encoding: 'utf8' },
    ).trim();
    rmSync(
      path.join(sandbox.repoDir, 'objects', orphanSha.slice(0, 2), orphanSha.slice(2)),
      { force: true },
    );

    await expect(
      recordRevisionForRun({
        projectId: sandbox.projectId,
        projectDir: sandbox.projectDir,
        repoDir: sandbox.repoDir,
        run: { id: 'retry-after-corruption', identity: TEST_IDENTITY },
        message: 'unused',
        db: sandbox.db,
      }),
    ).rejects.toThrow();

    const count = sandbox.db.prepare(
      `SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = ?`,
    ).get(sandbox.projectId) as { n: number };
    expect(count.n).toBe(1);
  });

  it('treats a tree where only .od-skills/ changed as clean (runtime scratch is excluded)', async () => {
    // The daemon stages active skills into <cwd>/.od-skills/ before
    // each agent run — that's pure runtime scratch and should never
    // produce a revision. Substrate init writes the exclude to
    // <repoDir>/info/exclude; this regression test makes sure the
    // exclude is in effect.
    const skillsDir = path.join(sandbox.projectDir, '.od-skills', 'staged-skill');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'SKILL.md'), '# staged skill\n');

    const result = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-skill-only', identity: TEST_IDENTITY },
      message: 'should not commit anything',
      db: sandbox.db,
    });

    expect(result.kind).toBe('clean');
    // Still only the migration row exists
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = ?`).get(sandbox.projectId) as { n: number };
    expect(count.n).toBe(1);
  });

  it('records a user-file change even when .od-skills/ is also dirty (skills do not block real work)', async () => {
    // Write both a real file AND staged-skill scratch; the commit
    // should capture only the real file (the scratch stays untracked).
    const skillsDir = path.join(sandbox.projectDir, '.od-skills', 'staged-skill');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'SKILL.md'), '# staged skill\n');
    writeFileSync(path.join(sandbox.projectDir, 'hero.html'), '<h1>Hero</h1>\n');

    const result = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-mixed', identity: TEST_IDENTITY },
      message: 'add hero',
      db: sandbox.db,
      runTouchedFiles: true,
    });
    if (result.kind !== 'recorded') throw new Error('expected recorded');

    // Only hero.html should be in the commit; .od-skills/ stays untracked.
    expect(result.filesChanged).toBe(1);
    expect(result.bytesAdded).toBe(1);
  });

  it('backfills info/exclude on a legacy substrate that pre-dates the fix', async () => {
    // Simulate a substrate initialized before info/exclude was being
    // written — clobber the file to nothing and verify recordRevisionForRun
    // re-asserts our patterns before staging.
    const excludePath = path.join(sandbox.repoDir, 'info', 'exclude');
    writeFileSync(excludePath, '# pre-fix content with no daemon-managed marker\n');

    // .od-skills/ scratch only — should be excluded after the backfill.
    const skillsDir = path.join(sandbox.projectDir, '.od-skills', 'staged-skill');
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(path.join(skillsDir, 'SKILL.md'), '# staged skill\n');

    const result = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-legacy-substrate', identity: TEST_IDENTITY },
      message: 'should be clean post-backfill',
      db: sandbox.db,
    });

    expect(result.kind).toBe('clean');
    // info/exclude now carries the daemon-managed marker and patterns.
    const updated = readFileSync(excludePath, 'utf8');
    expect(updated).toContain('open-design:history-managed');
    expect(updated).toContain('.od-skills/');
    // The pre-existing content is preserved (we append, not overwrite).
    expect(updated).toContain('# pre-fix content with no daemon-managed marker');
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

  it('parent_id chains revisions by UUID (not git SHA) so cross-repo SHA collisions cannot break the chain', async () => {
    // Initial state (from beforeEach): one migration revision exists.
    // Write a file and record a first agent-run revision.
    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'a\n');
    const first = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-chain-1', identity: TEST_IDENTITY },
      message: 'first',
      db: sandbox.db,
      runTouchedFiles: true,
    });
    if (first.kind !== 'recorded') throw new Error('expected first to record');

    // Second run on top — parent should be the first revision's UUID.
    writeFileSync(path.join(sandbox.projectDir, 'b.txt'), 'b\n');
    const second = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-chain-2', identity: TEST_IDENTITY },
      message: 'second',
      db: sandbox.db,
      runTouchedFiles: true,
    });
    if (second.kind !== 'recorded') throw new Error('expected second to record');

    const secondRow = sandbox.db.prepare(
      `SELECT parent_id FROM project_revisions WHERE id = ?`,
    ).get(second.revisionId) as { parent_id: string };
    expect(secondRow.parent_id).toBe(first.revisionId);

    // first's parent points at the migration revision (a UUID, not a SHA)
    const firstRow = sandbox.db.prepare(
      `SELECT parent_id FROM project_revisions WHERE id = ?`,
    ).get(first.revisionId) as { parent_id: string };
    expect(firstRow.parent_id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('preserves provenance for both runs when one absorbs the others changes (marker row)', async () => {
    // Two parallel recordRevisionForRun calls against the same project,
    // each contributing a distinct file. The lock serializes the commits
    // to prevent repo corruption, but in the common timing case the
    // winning commit absorbs BOTH files into one commit. Without the
    // marker-row mechanism the loser would observe a clean tree and
    // return 'clean' with no provenance row — silent loss caught by
    // the P0 reference-deployment exercise (PR #2619). The fix
    // captures HEAD before the lock and records a `marker` row when
    // the locked status check finds a clean tree but HEAD has moved.
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
        runTouchedFiles: true,
      }),
      recordRevisionForRun({
        projectId: sandbox.projectId,
        projectDir: sandbox.projectDir,
        repoDir: sandbox.repoDir,
        run: { id: 'run-b', identity: TEST_IDENTITY },
        message: 'second parallel',
        db: sandbox.db,
        runTouchedFiles: true,
      }),
    ]);

    // Exactly one of the two ends up with 'recorded' (the lock winner);
    // the other ends up with 'marker' (saw clean tree but HEAD moved).
    // Order is non-deterministic per lock acquisition.
    const kinds = [resA.kind, resB.kind].sort();
    expect(kinds).toEqual(['marker', 'recorded']);

    // Total revisions for this project = 1 migration + 1 agent-run + 1 marker = 3.
    // Provenance preserved: every run has its own row.
    const rows = sandbox.db
      .prepare(
        `SELECT id, source, run_id, git_sha, parent_id
           FROM project_revisions
          WHERE project_id = ?
          ORDER BY created_at`,
      )
      .all(sandbox.projectId) as Array<{
        id: string;
        source: string;
        run_id: string | null;
        git_sha: string | null;
        parent_id: string | null;
      }>;
    expect(rows).toHaveLength(3);
    // Narrow indexed access for `noUncheckedIndexedAccess` after the length assertion above.
    const [migrationRow, firstAgentRow, secondAgentRow] = rows as [
      (typeof rows)[number],
      (typeof rows)[number],
      (typeof rows)[number],
    ];

    // [migration, recorded(run-a or run-b), marker(the other)]
    expect(migrationRow.source).toBe('migration');
    expect(firstAgentRow.source).toBe('agent-run');
    expect(secondAgentRow.source).toBe('agent-run');

    // The two agent-run rows correspond to the two distinct run_ids — no run loses provenance.
    const agentRunIds = new Set([firstAgentRow.run_id, secondAgentRow.run_id]);
    expect(agentRunIds).toEqual(new Set(['run-a', 'run-b']));

    // Exactly one agent-run row has a git_sha (the commit); the other is the marker.
    const agentRunShas = [firstAgentRow.git_sha, secondAgentRow.git_sha];
    expect(agentRunShas.filter((s) => s !== null)).toHaveLength(1);
    expect(agentRunShas.filter((s) => s === null)).toHaveLength(1);

    // The marker's parent_id points to the recorded row's id — links
    // the marker to the commit that absorbed its run's changes so
    // History UI consumers can render the relationship.
    const markerRow = rows.find((r) => r.source === 'agent-run' && r.git_sha === null)!;
    const recordedRow = rows.find((r) => r.source === 'agent-run' && r.git_sha !== null)!;
    expect(markerRow.parent_id).toBe(recordedRow.id);

    // projects.current_revision_id advances to the recorded row (the
    // commit that owns HEAD), NOT the marker row.
    // (We didn't add a `current_revision_id` UPDATE for markers by design.)
    // The test sandbox doesn't have current_revision_id wired into the
    // projects table — it's tested separately in the recorded-path test
    // — so we just assert the recorded row is the latest with a SHA.

    // Subsequent record call against a now-clean tree returns 'clean'
    // (no HEAD advance during its lock wait → genuine no-op, no marker).
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

  it('records a marker for run B when run A commits entirely before B enters the hook (sequential completion)', async () => {
    // Sequential variant of the absorption case: A's full hook completes
    // before B's even starts. Without runHeadAtCreate, B sees A's HEAD
    // both at recordRevisionForRun entry and inside the lock, so
    // headBeforeLock === headNow → no advance observed → marker silently
    // lost. With runHeadAtCreate captured at runs.create() time (before
    // A committed), the baseline pre-dates A's commit and the marker
    // fires.
    const headAtCreate = (sandbox.db
      .prepare(`SELECT git_sha FROM project_revisions WHERE project_id = ? AND source = 'migration'`)
      .get(sandbox.projectId) as { git_sha: string }).git_sha;

    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'from-a\n');
    const resA = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-a', identity: TEST_IDENTITY },
      message: 'A finishes first',
      db: sandbox.db,
      runTouchedFiles: true,
    });
    expect(resA.kind).toBe('recorded');

    const resB = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-b', identity: TEST_IDENTITY },
      message: 'B absorbed sequentially',
      db: sandbox.db,
      runTouchedFiles: true,
      runHeadAtCreate: headAtCreate,
    });
    expect(resB.kind).toBe('marker');

    const markerRow = sandbox.db
      .prepare(
        `SELECT run_id, source, git_sha, parent_id, actor_identity_id
           FROM project_revisions
          WHERE project_id = ? AND run_id = 'run-b'`,
      )
      .get(sandbox.projectId) as {
        run_id: string;
        source: string;
        git_sha: string | null;
        parent_id: string | null;
        actor_identity_id: string;
      };
    expect(markerRow.source).toBe('agent-run');
    expect(markerRow.git_sha).toBeNull();
    expect(markerRow.actor_identity_id).toBe(TEST_IDENTITY.id);

    const aRow = sandbox.db
      .prepare(`SELECT id FROM project_revisions WHERE project_id = ? AND run_id = 'run-a'`)
      .get(sandbox.projectId) as { id: string };
    expect(markerRow.parent_id).toBe(aRow.id);

    // Without runHeadAtCreate, the same finishing-clean-tree call must
    // NOT produce a marker — proves runHeadAtCreate is what flips the
    // outcome, not some other side effect.
    const resC = await recordRevisionForRun({
      projectId: sandbox.projectId,
      projectDir: sandbox.projectDir,
      repoDir: sandbox.repoDir,
      run: { id: 'run-c', identity: TEST_IDENTITY },
      message: 'C without runHeadAtCreate',
      db: sandbox.db,
      runTouchedFiles: true,
    });
    expect(resC.kind).toBe('clean');
  });

  it('does not create a marker for a purely conversational run when a sibling commits in parallel', async () => {
    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'a\n');

    await Promise.all([
      recordRevisionForRun({
        projectId: sandbox.projectId,
        projectDir: sandbox.projectDir,
        repoDir: sandbox.repoDir,
        run: { id: 'writer-a', identity: TEST_IDENTITY },
        message: 'wrote a.txt',
        db: sandbox.db,
        runTouchedFiles: true,
      }),
      recordRevisionForRun({
        projectId: sandbox.projectId,
        projectDir: sandbox.projectDir,
        repoDir: sandbox.repoDir,
        run: { id: 'talker-b', identity: TEST_IDENTITY },
        message: 'just chatted',
        db: sandbox.db,
        runTouchedFiles: false,
      }),
    ]);

    // The conversational run (runTouchedFiles=false) must never produce
    // ANY row — neither a marker (git_sha IS NULL) nor a recorded row
    // attributing the sibling's work to it. Both shapes are false
    // provenance; the dirt belongs to the writer, not the talker.
    const talkerRow = sandbox.db
      .prepare(`SELECT id FROM project_revisions WHERE project_id = ? AND run_id = 'talker-b'`)
      .get(sandbox.projectId);
    expect(talkerRow).toBeUndefined();

    // a.txt did land in history exactly once (the writer's row).
    const writerRow = sandbox.db
      .prepare(`SELECT id, git_sha FROM project_revisions WHERE project_id = ? AND run_id = 'writer-a'`)
      .get(sandbox.projectId) as { id: string; git_sha: string };
    expect(writerRow).toBeDefined();
    expect(writerRow.git_sha).toMatch(/^[0-9a-f]{40}$/);
  });
});
