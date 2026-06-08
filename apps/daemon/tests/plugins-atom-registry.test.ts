// Stage D of plugin-driven-flow-plan — atom worker registry tests.
//
// Covers:
//   - Registration / lookup / clearing surface.
//   - `runStageWithRegistry` aggregates signals across multiple atoms
//     using pessimistic merge (lowest number / false-wins boolean).
//   - Permissive defaults preserve happy-path convergence when no
//     atom registers a real worker.
//   - Worker errors are captured as notes instead of crashing the
//     stage so a bad atom never blocks the run.
//   - The built-in `critique-theater` worker reads
//     `run_devloop_iterations` and surfaces the lowest numeric score
//     it can find — and falls through silently when no score is
//     present yet (e.g. the first iteration before the agent has
//     written a critique).
//   - Built-in registration is idempotent and the test-only reset
//     hook restores the install flag for the next case.
//
// The registry is module-scoped so each `beforeEach` calls
// `clearAtomWorkers()` + `resetBuiltInAtomWorkersForTests()` to
// guarantee independence between cases.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import type { AppliedPluginSnapshot, PipelineStage } from '@open-design/contracts';
import { migratePlugins } from '../src/plugins/persistence.js';
import {
  PERMISSIVE_DEFAULT_SIGNALS,
  clearAtomWorkers,
  getAtomWorker,
  listRegisteredAtomIds,
  registerAtomWorker,
  runStageWithRegistry,
  type AtomWorkerContext,
} from '../src/plugins/atoms/registry.js';
import {
  registerBuiltInAtomWorkers,
  resetBuiltInAtomWorkersForTests,
} from '../src/plugins/atoms/built-ins.js';

let db: Database.Database;
let tmpDir: string;

beforeEach(async () => {
  tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-atom-reg-'));
  db = new Database(path.join(tmpDir, 'test.sqlite'));
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY, name TEXT);
    CREATE TABLE conversations (id TEXT PRIMARY KEY, project_id TEXT, title TEXT);
  `);
  migratePlugins(db);
  clearAtomWorkers();
  resetBuiltInAtomWorkersForTests();
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

function fakeSnapshot(): AppliedPluginSnapshot {
  return {
    snapshotId:          'snap-1',
    projectId:           'project-1',
    conversationId:      'conv-A',
    runId:               'run-1',
    pluginId:            'sample-plugin',
    pluginVersion:       '1.0.0',
    pluginTitle:         'Sample',
    pluginDescription:   '',
    manifestSourceDigest: 'digest-1',
    taskKind:            'new-generation',
    inputs:              {},
    resolvedContext:     { items: [] },
    capabilitiesGranted:  ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged:         [],
    connectorsRequired:   [],
    connectorsResolved:   [],
    mcpServers:           [],
    query:                '',
    createdAt:            Date.now(),
  } as unknown as AppliedPluginSnapshot;
}

function ctxFor(stage: PipelineStage, iteration = 0): AtomWorkerContext {
  return {
    db,
    runId:          'run-1',
    projectId:      'project-1',
    conversationId: 'conv-A',
    stage,
    iteration,
    snapshot:       fakeSnapshot(),
  };
}

describe('atom registry: registration + lookup', () => {
  it('returns undefined for unregistered ids and lists registered ones alphabetically', () => {
    expect(getAtomWorker('nope')).toBeUndefined();
    registerAtomWorker({ id: 'zebra', run: () => ({}) });
    registerAtomWorker({ id: 'alpha', run: () => ({}) });
    expect(listRegisteredAtomIds()).toEqual(['alpha', 'zebra']);
  });

  it('clears the registry on demand', () => {
    registerAtomWorker({ id: 'temp', run: () => ({}) });
    expect(listRegisteredAtomIds()).toContain('temp');
    clearAtomWorkers();
    expect(listRegisteredAtomIds()).toEqual([]);
  });
});

describe('runStageWithRegistry: signal aggregation', () => {
  it('falls through to permissive defaults when no atom has a registered worker', async () => {
    const stage: PipelineStage = { id: 's', atoms: ['unknown-1', 'unknown-2'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals).toEqual(PERMISSIVE_DEFAULT_SIGNALS);
    expect(out.observedAtoms).toEqual([]);
    expect(out.notes).toEqual([]);
    expect(out.critiqueSummary).toBeNull();
  });

  it('pessimistically merges numeric signals (lowest wins) across multiple atoms', async () => {
    registerAtomWorker({
      id:  'judge-low',
      run: () => ({ signals: { 'critique.score': 2 } }),
    });
    registerAtomWorker({
      id:  'judge-high',
      run: () => ({ signals: { 'critique.score': 5 } }),
    });
    const stage: PipelineStage = { id: 's', atoms: ['judge-low', 'judge-high'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals['critique.score']).toBe(2);
    expect(out.observedAtoms).toEqual(['judge-low', 'judge-high']);
  });

  it('pessimistically merges boolean signals (false wins) across atoms', async () => {
    registerAtomWorker({
      id:  'gate-pass',
      run: () => ({ signals: { 'preview.ok': true } }),
    });
    registerAtomWorker({
      id:  'gate-fail',
      run: () => ({ signals: { 'preview.ok': false } }),
    });
    const stage: PipelineStage = { id: 's', atoms: ['gate-pass', 'gate-fail'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals['preview.ok']).toBe(false);
  });

  it('captures worker errors as notes without crashing the stage', async () => {
    registerAtomWorker({
      id:  'boom',
      run: () => {
        throw new Error('boom');
      },
    });
    registerAtomWorker({
      id:  'ok',
      run: () => ({ signals: { 'critique.score': 4 }, note: 'looks fine' }),
    });
    const stage: PipelineStage = { id: 's', atoms: ['boom', 'ok'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals['critique.score']).toBe(4);
    expect(out.notes.some((n) => n.includes('worker error: boom'))).toBe(true);
    expect(out.notes.some((n) => n.includes('looks fine'))).toBe(true);
    expect(out.critiqueSummary).not.toBeNull();
  });

  it('awaits async workers and applies their signals to the merge', async () => {
    registerAtomWorker({
      id:  'slow-judge',
      run: async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return { signals: { 'critique.score': 1 } };
      },
    });
    const stage: PipelineStage = { id: 's', atoms: ['slow-judge'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals['critique.score']).toBe(1);
  });
});

describe('built-in critique-theater worker', () => {
  beforeEach(() => {
    registerBuiltInAtomWorkers();
  });

  it('returns permissive (no score) when no devloop row exists yet', async () => {
    const stage: PipelineStage = { id: 'critique', atoms: ['critique-theater'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals).toEqual(PERMISSIVE_DEFAULT_SIGNALS);
    expect(out.observedAtoms).toEqual(['critique-theater']);
    expect(out.critiqueSummary).toBeNull();
  });

  it('parses a numeric score=N from critique_summary and surfaces the latest iteration that has one', async () => {
    insertIteration('critique', 1, 'critique panel: score=2');
    insertIteration('critique', 2, 'no parseable score here');
    insertIteration('critique', 3, 'score=4');
    const stage: PipelineStage = { id: 'critique', atoms: ['critique-theater'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals['critique.score']).toBe(4);
    expect(out.critiqueSummary).toContain('latest critique score=4 from iteration 3');
  });

  it('falls back to the most recent parseable iteration when the newest row has no score', async () => {
    insertIteration('critique', 1, 'score=3');
    insertIteration('critique', 2, 'unrelated notes only');
    const stage: PipelineStage = { id: 'critique', atoms: ['critique-theater'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals['critique.score']).toBe(3);
  });

  it('only looks at iterations for the active stage, ignoring siblings', async () => {
    insertIteration('discovery', 1, 'score=1');
    insertIteration('critique', 1, 'score=4');
    const stage: PipelineStage = { id: 'critique', atoms: ['critique-theater'] };
    const out = await runStageWithRegistry(ctxFor(stage));
    expect(out.signals['critique.score']).toBe(4);
  });
});

describe('registerBuiltInAtomWorkers: idempotency', () => {
  it('registers every FIRST_PARTY_ATOM exactly once even on repeat calls', () => {
    registerBuiltInAtomWorkers();
    const first = listRegisteredAtomIds();
    registerBuiltInAtomWorkers();
    const second = listRegisteredAtomIds();
    expect(second).toEqual(first);
    expect(first).toContain('critique-theater');
    expect(first).toContain('file-write');
    expect(first).toContain('media-image');
  });
});

function insertIteration(stageId: string, iteration: number, summary: string): void {
  db.prepare(
    `INSERT INTO run_devloop_iterations
       (id, run_id, stage_id, iteration, artifact_diff_summary, critique_summary, tokens_used, ended_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(`iter-${stageId}-${iteration}`, 'run-1', stageId, iteration, null, summary, null, Date.now());
}
