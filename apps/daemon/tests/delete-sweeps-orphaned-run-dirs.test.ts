// Regression for #6117: deleting a project must also sweep the on-disk run
// directories that belong to it. The run service holds non-terminal runs in
// an in-memory map and drops them after a ~30 min TTL, but
// `<RUNTIME_DATA_DIR>/runs/<runId>/state.json` outlives that map. Before the
// fix, DELETE /api/projects/:id only canceled the live runs and removed the
// project row + project dir, leaking every prior run's directory for that
// project on disk forever.
//
// This exercises the real HTTP boundary against a real runs dir layout:
// before delete, two orphaned run dirs exist on disk (one for the project
// being deleted, one for a bystander). After delete only the bystander
// remains.

import express from 'express';
import type { Response } from 'express';
import type { AddressInfo } from 'node:net';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  closeDatabase,
  deleteProject as dbDeleteProject,
  getProject,
  insertProject,
  openDatabase,
  updateProject,
} from '../src/db.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import {
  registerProjectRoutes,
  type RegisterProjectRoutesDeps,
} from '../src/routes/project/index.js';

type Db = ReturnType<typeof openDatabase>;

function makeRunService() {
  return createChatRunService({
    createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

async function mountProjectApp(
  db: Db,
  runs: ReturnType<typeof createChatRunService>,
  tempDir: string,
) {
  const app = express();
  app.use(express.json());
  const noop = vi.fn();
  registerProjectRoutes(app, {
    db,
    design: { runs },
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
      createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
    },
    paths: {
      BRANDS_DIR: tempDir,
      DESIGN_SYSTEMS_DIR: tempDir,
      PROJECTS_DIR: tempDir,
      RUNTIME_DATA_DIR: tempDir,
      RUNTIME_DATA_DIR_CANONICAL: tempDir,
      SKILLS_DIR: tempDir,
      USER_DESIGN_SYSTEMS_DIR: tempDir,
    },
    projectStore: {
      insertProject,
      getProject,
      updateProject,
      dbDeleteProject,
      removeProjectDir: vi.fn(async () => {}),
      validateLinkedDirs: vi.fn(() => ({ dirs: [], error: null })),
    },
    projectFiles: {
      ensureProject: noop,
      listFiles: noop,
      listTabs: vi.fn(() => ({ tabs: [] })),
      setTabs: noop,
      readProjectFile: noop,
      writeProjectFile: noop,
      resolveProjectDir: (_projectsRoot: string, projectId: string) =>
        path.join(tempDir, projectId),
    },
    conversations: {
      insertConversation: noop,
      getConversation: noop,
      listConversations: vi.fn(() => []),
      updateConversation: noop,
      deleteConversation: noop,
      listMessages: vi.fn(() => []),
      upsertMessage: noop,
    },
    templates: {
      getTemplate: noop,
      listTemplates: vi.fn(() => []),
      deleteTemplate: noop,
      insertTemplate: noop,
      findTemplateByNameAndProject: noop,
      updateTemplate: noop,
    },
    status: {
      listLatestProjectRunStatuses: vi.fn(() => []),
      listProjectsAwaitingInput: vi.fn(() => new Set()),
      normalizeProjectDisplayStatus: noop,
      composeProjectDisplayStatus: noop,
      listProjects: vi.fn(() => []),
    },
    events: {
      subscribeFileEvents: noop,
      activeProjectEventSinks: new Map(),
    },
    ids: { randomId: () => 'rid-' + Math.random().toString(36).slice(2) },
    telemetry: {},
    appConfig: {
      readAppConfig: async () => ({}),
      writeAppConfig: noop,
    },
    agents: { getAgentDef: () => null },
    validation: {
      validateProjectDesignSystemId: noop,
      validateProjectSkillId: noop,
    },
  } as unknown as RegisterProjectRoutesDeps);

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return {
    base,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function writeRunState(runsDir: string, runId: string, projectId: string) {
  const runDir = path.join(runsDir, runId);
  mkdirSync(runDir, { recursive: true });
  writeFileSync(
    path.join(runDir, 'state.json'),
    JSON.stringify({ id: runId, projectId, status: 'succeeded' }),
  );
  return runDir;
}

describe('DELETE project sweeps orphaned run dirs (#6117)', () => {
  let tempDir: string;
  let db: Db;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-6117-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'Project 1', createdAt: now, updatedAt: now });
    insertProject(db, { id: 'p2', name: 'Project 2', createdAt: now, updatedAt: now });
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('removes on-disk run directories whose state.json belongs to the deleted project', async () => {
    const runsDir = path.join(tempDir, 'runs');
    mkdirSync(runsDir, { recursive: true });
    const doomedRunDir = writeRunState(runsDir, 'r-doomed', 'p1');
    const bystanderRunDir = writeRunState(runsDir, 'r-bystander', 'p2');

    const runs = makeRunService();
    const app = await mountProjectApp(db, runs, tempDir);
    try {
      const res = await fetch(`${app.base}/api/projects/p1`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }

    expect(getProject(db, 'p1')).toBeNull();
    // Orphaned dir for p1 has been swept.
    expect(existsSync(doomedRunDir)).toBe(false);
    // Bystander dir for p2 is untouched.
    expect(existsSync(bystanderRunDir)).toBe(true);
    expect(readdirSync(bystanderRunDir, { withFileTypes: true }).map((e) => e.name)).toEqual([
      'state.json',
    ]);
  });

  it('leaves run dirs with missing state.json in place', async () => {
    const runsDir = path.join(tempDir, 'runs');
    mkdirSync(runsDir, { recursive: true });
    const legacyRunDir = path.join(runsDir, 'r-legacy');
    mkdirSync(legacyRunDir, { recursive: true });
    writeFileSync(path.join(legacyRunDir, 'events.jsonl'), '{"x":1}\n');

    const runs = makeRunService();
    const app = await mountProjectApp(db, runs, tempDir);
    try {
      const res = await fetch(`${app.base}/api/projects/p1`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }

    // No state.json -> we cannot prove ownership, so the dir stays.
    expect(readdirSync(legacyRunDir, { withFileTypes: true }).map((e) => e.name)).toEqual([
      'events.jsonl',
    ]);
  });

  it('is a no-op when the runs dir does not exist yet', async () => {
    // Fresh install with no runs at all — the runs dir is absent. The delete
    // handler must not blow up just because removeProjectRunDirs has nothing
    // to walk.
    const runs = makeRunService();
    const app = await mountProjectApp(db, runs, tempDir);
    try {
      const res = await fetch(`${app.base}/api/projects/p1`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }
    expect(getProject(db, 'p1')).toBeNull();
  });

  it('does not let a delayed terminal telemetry callback recreate the swept run dir (#6117 race)', async () => {
    // Reproduces the race @mrcfps called out on PR #6202:
    //   1. A live run is created with a real on-disk state.json path.
    //   2. The handler cancels+tombstones it (purgeRunsForProject) and sweeps
    //      its run dir.
    //   3. After the sweep, a delayed terminal telemetry callback fires
    //      `markAnalyticsCompleted(run)` — which previously called persistState
    //      -> atomicWriteJson -> mkdir parent + write state.json, recreating
    //      exactly the orphaned dir this PR promises to eliminate.
    // After the fix, persistState is a no-op on tombstoned runs.
    const runsDir = path.join(tempDir, 'runs');
    mkdirSync(runsDir, { recursive: true });
    const runs = createChatRunService({
      createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
      runsLogDir: runsDir,
    });

    const run = runs.create({ projectId: 'p1', conversationId: null });
    // Simulate analytics recovery so markAnalyticsCompleted has work to do.
    runs.setAnalyticsRecovery?.(run, {
      context: { page_name: 'test' },
      properties: { a: 1 },
      insertId: 'test-insert',
    });
    const runDir = path.join(runsDir, run.id);
    // Service should have written state.json on create.
    expect(existsSync(path.join(runDir, 'state.json'))).toBe(true);

    const app = await mountProjectApp(db, runs, tempDir);
    try {
      const res = await fetch(`${app.base}/api/projects/p1`, { method: 'DELETE' });
      expect(res.status).toBe(200);
    } finally {
      await app.close();
    }

    // Sweep has happened: dir is gone.
    expect(existsSync(runDir)).toBe(false);

    // Now release the delayed telemetry callback. Before the tombstone fix
    // this would mkdir the runDir back and write a fresh state.json — the
    // exact regression #6117 describes.
    runs.markAnalyticsCompleted?.(run);
    runs.markLangfuseCompleted?.(run);
    runs.persistState?.(run);

    expect(existsSync(runDir)).toBe(false);
  });
});
