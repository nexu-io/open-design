import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';

import { migrateProjectRevisions } from '../src/history/persistence.js';
import { initProjectHistory } from '../src/history/repo.js';
import { installHistoryRunFinishedHook } from '../src/history/run-hook.js';
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
function fakeRunService(): RunServiceForHook & {
  fire: (run: RunFinishedRun, status: 'succeeded' | 'failed' | 'canceled') => Promise<void>;
  fireCreate: (run: { id: string; projectId: string | null; headAtCreate: string | null }) => Promise<void>;
} {
  let hook: ((r: RunFinishedRun, s: 'succeeded' | 'failed' | 'canceled') => unknown) | null = null;
  let createHook: ((r: { id: string; projectId: string | null; headAtCreate: string | null }) => unknown) | null = null;
  return {
    setRunFinishedHook(h) { hook = h; },
    setRunCreatedHook(h) { createHook = h; },
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
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);
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
      { id: 'run-1', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Add hero section', touchedFiles: true, headAtCreate: null },
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
      { id: 'run-1', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Add hero section', touchedFiles: true, headAtCreate: null },
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
      { id: 'run-2', projectId: null, conversationId: null, identity: TEST_IDENTITY, message: 'doesnt matter', touchedFiles: true, headAtCreate: null },
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
      { id: 'run-3', projectId: 'p1', conversationId: 'c1', identity: null, message: 'no identity', touchedFiles: true, headAtCreate: null },
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
      { id: 'run-clean', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'no changes', touchedFiles: true, headAtCreate: null },
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
      { id: 'run-failed', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Try something', touchedFiles: true, headAtCreate: null },
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
      { id: 'run-multi', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: 'Refactor the hero\n\nMake it darker and more minimal\nMatch the brand palette', touchedFiles: true, headAtCreate: null },
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
      { id: 'run-noprompt', projectId: 'p1', conversationId: 'c1', identity: TEST_IDENTITY, message: null, touchedFiles: true, headAtCreate: null },
      'succeeded',
    );

    const row = sandbox.db.prepare(
      `SELECT message FROM project_revisions WHERE run_id = 'run-noprompt'`,
    ).get() as { message: string };
    expect(row.message).toBe('Agent run');
  });
});
