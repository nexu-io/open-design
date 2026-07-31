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

    const run = runs.create({ projectId: 'p1' });
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

  it('does not sweep a run dir for a run still live in the in-memory map (#6202 @mrcfps follow-up)', async () => {
    // Reproduces the second race @mrcfps flagged on PR #6202 (non-blocking
    // follow-up): purgeRunsForProject snapshots the in-memory runs once, then
    // awaits per-run cancellations. A run that is created for the same project
    // during that await window is NOT in the snapshot, so it is not tombstoned;
    // its state.json still references the soon-to-be-deleted project. If the
    // on-disk sweep (removeProjectRunDirs) only filters by `state.projectId`,
    // it wipes the new run's dir out from under itself — the run keeps running
    // but its state file is gone, and any later persistState mkdirs the dir
    // back, recreating the orphan we just swept.
    //
    // After the fix:
    //   - removeProjectRunDirs takes a `shouldSkip(runId)` callback that
    //     consults the in-memory run map.
    //   - The DELETE handler passes `(runId) => design.runs.isLiveRun(runId)`.
    //   - A run that is currently in the in-memory map AND not tombstoned is
    //     left alone even if its state.json projectId matches the sweep target.
    //
    // This test exercises the sweep with a controlled shouldSkip that mirrors
    // the production wiring (isLiveRun) and asserts the live run's dir survives
    // the sweep even though its state.json projectId matches the sweep target.
    const runsDir = path.join(tempDir, 'runs');
    mkdirSync(runsDir, { recursive: true });
    const runs = createChatRunService({
      createSseResponse: () => ({ send: vi.fn(() => true), end: vi.fn(), cleanup: vi.fn() }),
      createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
      shutdownGraceMs: 10,
      ttlMs: 60_000,
      runsLogDir: runsDir,
    });

    // Seed one orphaned run dir that DOES belong to p1 and is NOT in the
    // in-memory map (simulates a TTL-expired prior run). The sweep should
    // catch this one.
    const orphanRunId = 'orphan-' + Math.random().toString(36).slice(2);
    const orphanDir = path.join(runsDir, orphanRunId);
    mkdirSync(orphanDir, { recursive: true });
    writeFileSync(path.join(orphanDir, 'state.json'), JSON.stringify({ projectId: 'p1' }));

    // And create a live run for p1 that IS in the in-memory map. The sweep
    // must skip its directory because the production shouldSkip guard
    // (design.runs.isLiveRun) returns true for it.
    const liveRun = runs.create({ projectId: 'p1' });
    const liveRunDir = path.join(runsDir, liveRun.id);
    expect(existsSync(path.join(liveRunDir, 'state.json'))).toBe(true);

    // Mount and DELETE the project. The DELETE handler will:
    //   1. purgeRunsForProject('p1') — tombstones liveRun (it is in the
    //      snapshot, because we created it before the request). liveRun is
    //      now persistsDisabled=true and its dir is removed by disablePersist.
    //   2. removeProjectRunDirs with shouldSkip = (id) => isLiveRun(id).
    //      liveRun is no longer "live" (persistsDisabled=true), so its dir
    //      isn't expected to survive — but we want to verify the production
    //      path end-to-end against a "truly live" run.
    //
    // To exercise the race scenario end-to-end (a run created DURING the
    // cancel await window, which is NOT in the snapshot), we mount the app
    // but hold the DELETE back: we pre-await a manual `purgeRunsForProject`
    // that tombstones liveRun, then create a second live run that is NOT
    // tombstoned, then invoke the on-disk sweep directly with the production
    // shouldSkip guard.
    //
    // Step 1: tombstone the first liveRun via purgeRunsForProject.
    const firstPurge = await runs.purgeRunsForProject('p1');
    expect(firstPurge.tombstoned).toEqual(expect.arrayContaining([liveRun.id]));
    expect(existsSync(liveRunDir)).toBe(false);
    expect(runs.isLiveRun(liveRun.id)).toBe(false);

    // Step 2: create a new run for p1 — this one is "mid-flight" relative to
    // the original DELETE, i.e. not in any snapshot yet. Its state.json
    // projectId matches p1.
    const lateRun = runs.create({ projectId: 'p1' });
    const lateRunDir = path.join(runsDir, lateRun.id);
    expect(existsSync(path.join(lateRunDir, 'state.json'))).toBe(true);
    expect(runs.isLiveRun(lateRun.id)).toBe(true);

    // Also re-seed an orphan dir with state.json projectId=p1 (the sweep's
    // primary target).
    const orphan2Dir = path.join(runsDir, 'orphan2-' + Math.random().toString(36).slice(2));
    mkdirSync(orphan2Dir, { recursive: true });
    writeFileSync(path.join(orphan2Dir, 'state.json'), JSON.stringify({ projectId: 'p1' }));

    // Step 3: invoke the on-disk sweep with the production shouldSkip guard,
    // exactly as the DELETE handler does.
    const { removeProjectRunDirs } = await import('../src/projects.js');
    const removed = await removeProjectRunDirs(runsDir, 'p1', {
      shouldSkip: (runId) => runs.isLiveRun(runId),
    });
    // The orphan dirs (no in-memory run) are swept.
    expect(removed).toBe(2);
    expect(existsSync(orphanDir)).toBe(false);
    expect(existsSync(orphan2Dir)).toBe(false);
    // The late run's dir is untouched — the shouldSkip guard caught it.
    expect(existsSync(lateRunDir)).toBe(true);
    expect(existsSync(path.join(lateRunDir, 'state.json'))).toBe(true);

    // The new helper is exposed for callers that want to query the live-run
    // state directly (e.g. future sweep callers).
    expect(runs.isLiveRun(lateRun.id)).toBe(true);
    expect(runs.isLiveRun('orphanRunId-not-in-map')).toBe(false);
    expect(runs.isLiveRun('')).toBe(false);

    // And purgeRunsForProject now returns a structured result so callers can
    // destructure safely instead of treating the return as a bare array.
    const result = await runs.purgeRunsForProject('p1');
    expect(result).toEqual({ tombstoned: expect.arrayContaining([lateRun.id]), protectedRunIds: [] });
    expect(existsSync(lateRunDir)).toBe(false);
    expect(runs.isLiveRun(lateRun.id)).toBe(false);

    // Empty/invalid project id is a no-op and returns the empty structured
    // shape (not a bare array, so callers can destructure safely).
    await expect(runs.purgeRunsForProject('')).resolves.toEqual({ tombstoned: [], protectedRunIds: [] });
    await expect(runs.purgeRunsForProject(undefined as unknown as string)).resolves.toEqual({ tombstoned: [], protectedRunIds: [] });
  });
});
