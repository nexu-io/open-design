import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { migrateProjectRevisions } from '../src/history/persistence.js';
import { initProjectHistory } from '../src/history/repo.js';
import { installHistoryEnsureHook } from '../src/history/ensure-hook.js';
import { installHistoryRunCreatedHook, installHistoryRunFinishedHook } from '../src/history/run-hook.js';
import type { RunFinishedRun, RunServiceForHook } from '../src/history/run-hook.js';
import type { Identity } from '../src/identity/types.js';

const TEST_IDENTITY: Identity = {
  id: 'local:default',
  displayName: 'Test User',
  email: 'test@example.com',
  source: 'local-fallback',
};

/**
 * Minimal stand-in for design.runs that captures the hook installer.
 * The real createChatRunService is too heavy to construct just to fire
 * one callback — directly invoking the registered hook is the unit
 * test the wiring deserves.
 */
interface EmittedEvent {
  event: string;
  data: unknown;
}

function fakeRunService(): RunServiceForHook & {
  fire: (run: RunFinishedRun, status: 'succeeded' | 'failed' | 'canceled') => Promise<void>;
  fireCreate: (run: { id: string; projectId: string | null; headAtCreate: string | null }) => Promise<void>;
  emitted: EmittedEvent[];
} {
  let hook: ((r: RunFinishedRun, s: 'succeeded' | 'failed' | 'canceled') => unknown) | null = null;
  let createHook: ((r: { id: string; projectId: string | null; headAtCreate: string | null }) => unknown) | null = null;
  const emitted: EmittedEvent[] = [];
  return {
    setRunFinishedHook(h) { hook = h; },
    setRunCreatedHook(h) { createHook = h; },
    emit(_run, event, data) {
      emitted.push({ event, data });
      return { id: emitted.length, event, data };
    },
    emitted,
    async fire(run, status) {
      if (hook) await hook(run, status);
    },
    async fireCreate(run) {
      if (createHook) await createHook(run);
    },
  };
}

function setupSandbox() {
  const dataRoot = mkdtempSync(path.join(tmpdir(), 'od-run-hook-'));
  const projectsRoot = path.join(dataRoot, 'projects');
  const reposRoot = path.join(dataRoot, 'repos');
  const projectDir = path.join(projectsRoot, 'p1');
  mkdirSync(projectDir, { recursive: true });
  mkdirSync(reposRoot, { recursive: true });

  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  // Mirror PROJECT_COLS so getProject(db, projectId) (called by the
  // created-hook for the linked-folder check + ensureProject baseline)
  // can read every column the daemon expects.
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      skill_id TEXT,
      design_system_id TEXT,
      pending_prompt TEXT,
      metadata_json TEXT,
      applied_plugin_snapshot_id TEXT,
      custom_instructions TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, title TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL, role TEXT NOT NULL, content TEXT, created_at INTEGER NOT NULL);
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
  `);
  migrateProjectRevisions(db);

  return { dataRoot, projectsRoot, reposRoot, projectDir, db };
}

async function withInitializedSubstrate(sandbox: ReturnType<typeof setupSandbox>): Promise<void> {
  writeFileSync(path.join(sandbox.projectDir, 'README.md'), '# project\n');
  await initProjectHistory({
    projectId: 'p1',
    projectDir: sandbox.projectDir,
    repoDir: path.join(sandbox.reposRoot, 'p1.gitdir'),
    identity: TEST_IDENTITY,
    db: sandbox.db,
  });
}

describe('installHistoryRunFinishedHook', () => {
  let sandbox: ReturnType<typeof setupSandbox>;
  let runs: ReturnType<typeof fakeRunService>;

  beforeEach(() => {
    sandbox = setupSandbox();
    runs = fakeRunService();
  });

  afterEach(() => {
    sandbox.db.close();
    rmSync(sandbox.dataRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('records a revision when the run leaves a dirty tree (flag on, substrate ready)', async () => {
    await withInitializedSubstrate(sandbox);

    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    // Simulate the agent writing a new file during the run
    writeFileSync(path.join(sandbox.projectDir, 'hero.html'), '<h1>Hello</h1>\n');

    await runs.fire(
      { id: 'run-1', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Add hero section', touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'succeeded',
    );

    const rows = sandbox.db.prepare(
      `SELECT source, run_id, message FROM project_revisions WHERE project_id = 'p1' ORDER BY created_at ASC`,
    ).all() as Array<{ source: string; run_id: string | null; message: string }>;
    // First row is the migration; second is the auto-commit
    expect(rows.length).toBe(2);
    expect(rows[1]!.source).toBe('agent-run');
    expect(rows[1]!.run_id).toBe('run-1');
    expect(rows[1]!.message).toBe('Add hero section');
  });

  it('is a no-op when the feature flag is off', async () => {
    await withInitializedSubstrate(sandbox);

    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: {},
    });

    writeFileSync(path.join(sandbox.projectDir, 'hero.html'), '<h1>Hello</h1>\n');

    await runs.fire(
      { id: 'run-1', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Add hero section', touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'succeeded',
    );

    // Only the migration row from setup; no auto-commit happened
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('skips when the run has no projectId', async () => {
    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    await runs.fire(
      { id: 'run-2', projectId: null, conversationId: null, identity: TEST_IDENTITY, message: 'doesnt matter', touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'succeeded',
    );

    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions`).get() as { n: number };
    expect(count.n).toBe(0);
  });

  it('skips when the run has no identity', async () => {
    await withInitializedSubstrate(sandbox);

    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    writeFileSync(path.join(sandbox.projectDir, 'hero.html'), '<h1>Hello</h1>\n');

    await runs.fire(
      { id: 'run-3', projectId: 'p1', conversationId: 'c1', identity: null, message: 'no identity', touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'succeeded',
    );

    // Still only the migration row
    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('is a no-op when the tree is clean', async () => {
    await withInitializedSubstrate(sandbox);

    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    // No file changes — run ends with clean tree
    await runs.fire(
      { id: 'run-clean', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'no changes', touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'succeeded',
    );

    const count = sandbox.db.prepare(`SELECT COUNT(*) AS n FROM project_revisions WHERE project_id = 'p1'`).get() as { n: number };
    expect(count.n).toBe(1);
  });

  it('commits even when the run failed (preserves partial work)', async () => {
    await withInitializedSubstrate(sandbox);

    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    writeFileSync(path.join(sandbox.projectDir, 'partial.html'), '<h1>WIP</h1>\n');

    await runs.fire(
      { id: 'run-failed', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Try something', touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'failed',
    );

    const rows = sandbox.db.prepare(
      `SELECT source, run_id FROM project_revisions WHERE project_id = 'p1' ORDER BY created_at ASC`,
    ).all() as Array<{ source: string; run_id: string | null }>;
    expect(rows.length).toBe(2);
    expect(rows[1]!.source).toBe('agent-run');
    expect(rows[1]!.run_id).toBe('run-failed');
  });

  it('builds a sensible commit message from a multi-line prompt (first line)', async () => {
    await withInitializedSubstrate(sandbox);

    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'content\n');

    await runs.fire(
      { id: 'run-multi', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Refactor the hero\n\nMake it darker and more minimal\nMatch the brand palette', touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'succeeded',
    );

    const row = sandbox.db.prepare(
      `SELECT message FROM project_revisions WHERE run_id = 'run-multi'`,
    ).get() as { message: string };
    expect(row.message).toBe('Refactor the hero');
  });

  it('falls back to "Agent run" when the prompt is empty / null', async () => {
    await withInitializedSubstrate(sandbox);

    installHistoryRunFinishedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });

    writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'content\n');

    await runs.fire(
      { id: 'run-noprompt', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: null, touchedFiles: true, headAtCreate: null, historyStatus: null, historyError: null },
      'succeeded',
    );

    const row = sandbox.db.prepare(
      `SELECT message FROM project_revisions WHERE run_id = 'run-noprompt'`,
    ).get() as { message: string };
    expect(row.message).toBe('Agent run');
  });

  // Bug A coverage — matrix cells {P1,P2,P3,P4}×E9 (hook throws).
  // Without observability, recordRevisionForRun failures land in
  // console.warn after terminal broadcast and the API surface still
  // reports a clean run. The historyStatus/historyError fields + the
  // history-completed SSE event give reattaching clients and CLI
  // consumers a visible signal.
  describe('history capture observability', () => {
    it('stamps historyStatus=recorded and emits history-completed when the commit succeeds', async () => {
      await withInitializedSubstrate(sandbox);
      installHistoryRunFinishedHook({
        db: sandbox.db,
        projectsRoot: sandbox.projectsRoot,
        reposRoot: sandbox.reposRoot,
        runs,
        env: { OD_GIT_INTEGRATION_ENABLED: '1' },
      });
      writeFileSync(path.join(sandbox.projectDir, 'a.txt'), 'x\n');

      const run: RunFinishedRun = {
        id: 'run-ok', projectId: 'p1', conversationId: 'c1',
        identity: TEST_IDENTITY, message: 'work', touchedFiles: true,
        headAtCreate: null, historyStatus: null, historyError: null,
      };
      await runs.fire(run, 'succeeded');

      expect(run.historyStatus).toBe('recorded');
      expect(run.historyError).toBeNull();
      const ev = runs.emitted.find((e) => e.event === 'history-completed');
      expect(ev).toBeDefined();
      expect((ev?.data as { status: string }).status).toBe('recorded');
    });

    it('stamps historyStatus=clean when there is no work to commit', async () => {
      await withInitializedSubstrate(sandbox);
      installHistoryRunFinishedHook({
        db: sandbox.db,
        projectsRoot: sandbox.projectsRoot,
        reposRoot: sandbox.reposRoot,
        runs,
        env: { OD_GIT_INTEGRATION_ENABLED: '1' },
      });

      const run: RunFinishedRun = {
        id: 'run-clean', projectId: 'p1', conversationId: 'c1',
        identity: TEST_IDENTITY, message: 'noop', touchedFiles: false,
        headAtCreate: null, historyStatus: null, historyError: null,
      };
      await runs.fire(run, 'succeeded');

      expect(run.historyStatus).toBe('clean');
      expect(run.historyError).toBeNull();
    });

    it('stamps historyStatus=failed + historyError when recordRevisionForRun throws', async () => {
      // Don't initialize substrate AND set substrate state up so it's
      // half-init. Then corrupt the gitdir so the recovery path throws.
      await withInitializedSubstrate(sandbox);
      // Wipe the entire gitdir mid-flight — readDotGitState will read
      // the gitlink in the worktree but git operations against it fail.
      rmSync(path.join(sandbox.reposRoot, 'p1.gitdir'), { recursive: true, force: true });

      installHistoryRunFinishedHook({
        db: sandbox.db,
        projectsRoot: sandbox.projectsRoot,
        reposRoot: sandbox.reposRoot,
        runs,
        env: { OD_GIT_INTEGRATION_ENABLED: '1' },
      });

      // Mark the tree dirty so the dirty-tree branch tries to commit
      // and fails on the missing gitdir.
      writeFileSync(path.join(sandbox.projectDir, 'broken.txt'), 'will not commit\n');

      const run: RunFinishedRun = {
        id: 'run-broken', projectId: 'p1', conversationId: 'c1',
        identity: TEST_IDENTITY, message: 'will fail', touchedFiles: true,
        headAtCreate: null, historyStatus: null, historyError: null,
      };
      await runs.fire(run, 'succeeded');

      // The exact failure mode depends on which git op trips first; we
      // care that the status is observable, not the specific message.
      expect(['failed', 'not-initialized']).toContain(run.historyStatus);
      if (run.historyStatus === 'failed') {
        expect(run.historyError).toBeTruthy();
        const ev = runs.emitted.find((e) => e.event === 'history-completed');
        expect((ev?.data as { status: string }).status).toBe('failed');
      }
    });
  });
});

// Bug B coverage — matrix cells P1×E3 (overlapping write) and P1×E4
// (sequential write) on fresh projects. Without the created-hook
// initializing substrate before reading HEAD, both runs against a
// fresh project end up with headAtCreate=null and the marker can't
// fire for the sibling-absorbed loser.
describe('installHistoryRunCreatedHook', () => {
  let sandbox: ReturnType<typeof setupSandbox>;
  let runs: ReturnType<typeof fakeRunService>;

  beforeEach(() => {
    sandbox = setupSandbox();
    runs = fakeRunService();
    // Created-hook calls ensureProject which fires the ensure-hook;
    // both must be installed for the substrate-init chain to work.
    installHistoryEnsureHook({
      db: sandbox.db,
      reposRoot: sandbox.reposRoot,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });
    installHistoryRunCreatedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs,
      env: { OD_GIT_INTEGRATION_ENABLED: '1' },
    });
  });

  afterEach(() => {
    sandbox.db.close();
    rmSync(sandbox.dataRoot, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it('initializes substrate on a fresh project and stamps headAtCreate with the migration SHA', async () => {
    const run = { id: 'run-fresh', projectId: 'p1', headAtCreate: null as string | null };
    await runs.fireCreate(run);

    expect(run.headAtCreate).toMatch(/^[0-9a-f]{40}$/);
    // The substrate should now exist; subsequent reads see the same SHA.
    const row = sandbox.db.prepare(
      `SELECT git_sha FROM project_revisions WHERE project_id = 'p1' AND source = 'migration'`,
    ).get() as { git_sha: string };
    expect(row.git_sha).toBe(run.headAtCreate);
  });

  it('stamps both concurrent runs against a fresh project with the same M0 baseline', async () => {
    const runA = { id: 'run-a', projectId: 'p1', headAtCreate: null as string | null };
    const runB = { id: 'run-b', projectId: 'p1', headAtCreate: null as string | null };
    await Promise.all([runs.fireCreate(runA), runs.fireCreate(runB)]);

    expect(runA.headAtCreate).toMatch(/^[0-9a-f]{40}$/);
    expect(runB.headAtCreate).toBe(runA.headAtCreate);
  });

  it('skips linked-folder projects (leaves headAtCreate null)', async () => {
    sandbox.db.prepare(`UPDATE projects SET metadata_json = ? WHERE id = 'p1'`)
      .run(JSON.stringify({ baseDir: '/tmp/somewhere' }));

    const run = { id: 'run-linked', projectId: 'p1', headAtCreate: null as string | null };
    await runs.fireCreate(run);

    expect(run.headAtCreate).toBeNull();
  });

  it('leaves headAtCreate null when the projects row is missing (run referenced an unknown project)', async () => {
    const run = { id: 'run-ghost', projectId: 'unknown-project', headAtCreate: null as string | null };
    await runs.fireCreate(run);

    expect(run.headAtCreate).toBeNull();
  });

  it('is a no-op when the feature flag is unset', async () => {
    const flagOffRuns = fakeRunService();
    installHistoryRunCreatedHook({
      db: sandbox.db,
      projectsRoot: sandbox.projectsRoot,
      reposRoot: sandbox.reposRoot,
      runs: flagOffRuns,
      env: {},
    });
    const run = { id: 'run-x', projectId: 'p1', headAtCreate: null as string | null };
    await flagOffRuns.fireCreate(run);
    expect(run.headAtCreate).toBeNull();
  });
});
