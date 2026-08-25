import type { Server } from 'node:http';
import { execFile } from 'node:child_process';
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  AppliedStrategyBindingV2,
  OdNextRuntimeCapabilitySnapshotV1,
  OpenDesignPlanContractV2,
  ProjectScenarioTaskProfile,
} from '@open-design/contracts';
import {
  normalizeAgentObservationV1,
  OD_NEXT_PROMPT_STAGE_CONTRACT_V2,
  parseOdNextPromptBundleV2,
} from '@open-design/contracts';

const uuidControl = vi.hoisted(() => ({ forced: [] as string[] }));
let pendingAutomaticFixtureIdentity: {
  initialRunId: string;
  taskExecutionId: string;
} | null = null;

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomUUID: () => uuidControl.forced.shift() ?? actual.randomUUID(),
  };
});

import { closeDatabase, openDatabase } from '../src/db.js';
import { createSnapshot, linkSnapshotToProject } from '../src/plugins/snapshots.js';
import { resolvePluginFolder, upsertInstalledPlugin } from '../src/plugins/registry.js';
import { createBundledStrategyBindingV2 } from '../src/plugins/strategy-package.js';
import { startServer, type StartServerOptions } from '../src/server.js';
import {
  createStrategyTaskExecution,
  getStrategyTaskExecution,
} from '../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture } from './strategies/strategy-task-test-fixtures.js';
import { prepareStrategyRequest } from '../src/strategies/od-next/coordinator.js';
import {
  clearOdNextRolloutStop,
  latchOdNextRolloutStop,
} from '../src/strategies/od-next/rollout.js';
import {
  hashOdNextRuntimeCapabilitySnapshotV1,
  resolveBundledOdNextRuntimeCapability,
} from '../src/runtimes/od-next-capability-gate.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

type RunStatus = {
  id: string;
  status: string;
  updatedAt: number;
  eventsLogPath: string;
  endedWithUnfinishedWork?: boolean;
  error?: string | null;
  errorCode?: string | null;
  strategyTask?: {
    taskExecutionId: string;
    inputStage: string;
    outcome: string;
    terminal: boolean;
  };
};

type Invocation = {
  argv: string[];
  stdin: string;
  cwd: string;
  startedAt: number;
  taskInputDir?: string | null;
  taskInputFiles?: Array<{ name: string; content: string }>;
};

const THREAD_ID = '019fffaa-0000-7000-8000-000000000010';
const execFileP = promisify(execFile);
const DAEMON_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(DAEMON_ROOT, '../..');
const CLI_SRC = path.resolve(DAEMON_ROOT, 'src/cli.ts');
const TSX_CLI = path.resolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');
const EXECUTION_PREFLIGHT = {
  productionRoutes: [{ id: 'html', available: true }],
  dependencies: [],
  inputs: [{ id: 'request', available: true }],
  renderers: [],
  exporters: [],
  templates: [],
  outputKinds: [{ id: 'prototype', supported: true }],
};
const DIRECT_ELIGIBLE = {
  editableBaselineExists: true,
  localAndUnambiguous: true,
  canonicalDeliverableStable: true,
  deliverableSetStable: true,
  dependenciesBounded: true,
};
const INTAKE_PASSED = {
  inputRefs: [{ id: 'request', accessible: true }],
  selectedAgentAvailable: true,
  nativeContinuation: 'verified' as const,
  taskProfileAvailable: true,
  dependencies: [],
};

function complexCapabilitySnapshot(): OdNextRuntimeCapabilitySnapshotV1 {
  const withoutHash: Omit<OdNextRuntimeCapabilitySnapshotV1, 'snapshotHash'> = {
    schema: 'open-design.od-next-runtime-capability-snapshot/v1',
    runtimePath: 'codex',
    agentId: 'codex',
    agentCliVersion: 'synthetic-cli-simulating-fixture/1',
    runtimeAdapterVersion: 'synthetic-adapter/1',
    fixtureVersion: 'synthetic-gate/v1',
    fixtureHash: `sha256:${'d'.repeat(64)}`,
    nativeSessionContinuation: {
      support: 'verified', evidenceLevel: 'L0', source: 'sanitized_fixture_replay',
    },
    nativeSubagents: {
      support: 'verified', evidenceLevel: 'L2', source: 'sanitized_fixture_replay',
    },
    capturedAt: 100,
  };
  return {
    ...withoutHash,
    snapshotHash: hashOdNextRuntimeCapabilitySnapshotV1(withoutHash),
  };
}

describe('OD Next automatic production through the real server', () => {
  let started: StartedServer | null = null;
  let binDir: string | null = null;
  let sequence = 0;

  afterEach(async () => {
    delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
    delete process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY;
    delete process.env.OD_NEXT_STRATEGY_MAX_RUN_DURATION_MS;
    uuidControl.forced.length = 0;
    pendingAutomaticFixtureIdentity = null;
    await stopServer(started);
    started = null;
    closeDatabase();
    if (binDir) await rm(binDir, { recursive: true, force: true });
    binDir = null;
  });

  it('keeps off/observe public POST behavior ordinary and idempotent with zero strategy tasks', async () => {
    const fixture = await createPublicRolloutFixture('inert');
    started = fixture.started;
    binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
    const ordinaryFullTranscript = [
      '## user',
      'ORDINARY_PRIOR_MARKER',
      '',
      '## assistant',
      'prior answer',
      '',
      '## user',
      'Run the ordinary public fixture.',
    ].join('\n');
    const body = {
      ...publicRunRequest(fixture, ordinaryFullTranscript, 'inert-request'),
      currentPrompt: 'Run the ordinary public fixture.',
      research: { enabled: true },
    };
    const created = await postRun(started!.url, body);
    expect(created.strategyTask).toBeUndefined();
    expect(created.pluginId).toBe('example-web-prototype');
    await waitForRunTerminal(started!.url, created.runId as string);

    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'observe';
    const replayed = await postRun(started!.url, body);
    expect(replayed).toMatchObject({ runId: created.runId, reused: true });
    expect(replayed.strategyTask).toBeUndefined();
    expect((database().prepare('SELECT COUNT(*) AS count FROM strategy_task_executions').get() as { count: number }).count)
      .toBe(0);
    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.stdin).not.toContain('OD Next Strategy V2');
    expect(invocations[0]?.stdin).not.toContain('open-design.strategy-state/v2');
    const researchStart = invocations[0]!.stdin.indexOf('## Research command contract');
    const researchEnd = invocations[0]!.stdin.indexOf('# User request', researchStart);
    expect(researchStart).toBeGreaterThanOrEqual(0);
    expect(researchEnd).toBeGreaterThan(researchStart);
    const researchContract = invocations[0]!.stdin.slice(researchStart, researchEnd);
    expect(researchContract).toContain('ORDINARY_PRIOR_MARKER');
    expect(researchContract).toContain('Run the ordinary public fixture.');
  });

  it('keeps the automatic route when a named Skill cannot be resolved', async () => {
    const fixture = await createPublicRolloutFixture('prestart-skill-fallback', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';

    const created = await postRun(started.url, {
      ...publicRunRequest(
        fixture,
        'Complete this request through the automatic route.',
        'prestart-skill-fallback-request',
      ),
      skillIds: ['missing-automatic-skill'],
    });

    // A Skill that no longer resolves is dropped, exactly as the ordinary
    // route drops it — it is not evidence the user claimed the route.
    expect(created.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    expect(await readDurableRunState(created.runId as string)).toMatchObject({
      strategyRolloutDecision: { effectiveMode: 'active' },
    });
    const task = getStrategyTaskExecution(database(), created.taskExecutionId as string);
    expect(task?.promptBundle.text).not.toContain('user_selected_skills');
    expect(task?.promptBundle.text).not.toContain('missing-automatic-skill');

    const canceled = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(created.runId as string)}/cancel`,
      { method: 'POST' },
    );
    expect(canceled.status).toBe(200);
  });

  it('rolls back automatic task preparation and reclaims once through the ordinary default', async () => {
    const fixture = await createPublicRolloutFixture('preclaim-task-fallback', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const strategySnapshotCountAtStart = (database().prepare(`
      SELECT COUNT(*) AS count FROM applied_plugin_snapshots
       WHERE plugin_id = 'od-next-strategy'
    `).get() as { count: number }).count;
    const strategyTaskCountAtStart = (database().prepare(
      'SELECT COUNT(*) AS count FROM strategy_task_executions',
    ).get() as { count: number }).count;
    database().exec(`
      CREATE TRIGGER reject_automatic_strategy_task
      BEFORE INSERT ON strategy_task_executions
      BEGIN
        SELECT RAISE(ABORT, 'fixture automatic task preparation rejected');
      END
    `);

    try {
      const created = await postRun(
        started.url,
        publicRunRequest(
          fixture,
          'Run once after the automatic pre-claim rollback.',
          'preclaim-task-fallback-request',
        ),
      );

      expect(created.strategyTask).toBeUndefined();
      expect(created.taskExecutionId).toBeUndefined();
      expect(created.pluginId).toBe('example-web-prototype');
      await waitForRunTerminal(started.url, created.runId as string);
      // A delta, not an absolute: this suite shares one data root across its
      // tests, and what this case proves is that the rolled-back preparation
      // left nothing behind — not that the whole file ran no strategy task.
      expect((database().prepare(
        'SELECT COUNT(*) AS count FROM strategy_task_executions',
      ).get() as { count: number }).count).toBe(strategyTaskCountAtStart);
      expect((database().prepare(`
        SELECT COUNT(*) AS count FROM applied_plugin_snapshots
         WHERE plugin_id = 'od-next-strategy'
      `).get() as { count: number }).count).toBe(strategySnapshotCountAtStart);
      const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
      expect(invocations).toHaveLength(1);
      expect(invocations[0]?.stdin).toContain('Run once after the automatic pre-claim rollback.');
      expect(invocations[0]?.stdin).not.toContain('OD Next Strategy V2');
    } finally {
      database().exec('DROP TRIGGER IF EXISTS reject_automatic_strategy_task');
    }
  });

  it('routes the four approved automatic profiles while ordinary Image remains media-only', async () => {
    const fixture = await createPublicRolloutFixture('approved-profiles', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';

    const approved = [
      {
        ...(await createProjectForScenario(started.url, 'approved-prototype', {
          kind: 'prototype',
        }, undefined, 'prototype')),
        taskProfile: 'prototype',
        pluginId: 'example-web-prototype',
      },
      {
        ...(await createProjectForScenario(
          started.url,
          'approved-ppt',
          { kind: 'deck' },
          undefined,
          'ppt',
        )),
        taskProfile: 'ppt',
        pluginId: 'example-simple-deck',
      },
      {
        ...(await createProjectForScenario(started.url, 'approved-marketing', {
          kind: 'prototype',
          intent: 'marketing',
        }, undefined, 'marketing')),
        taskProfile: 'marketing',
        pluginId: 'example-web-prototype',
      },
      {
        ...(await createProjectForScenario(started.url, 'approved-hyperframes', {
          kind: 'video',
          intent: 'hyperframes',
          videoModel: 'hyperframes-html',
        }, undefined, 'hyperframes')),
        taskProfile: 'hyperframes',
        pluginId: 'example-hyperframes',
      },
    ];
    for (const candidate of approved) {
      expect(candidate.metadata?.strategyBinding).toMatchObject({
        schemaVersion: 1,
        provenance: 'automatic_default',
        taskProfile: candidate.taskProfile,
      });
      expect(candidate.metadata?.scenarioBinding).toBeUndefined();
      expect(candidate.appliedPluginSnapshotId).toBeUndefined();
    }

    const forgedPatch = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(approved[0]!.projectId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          metadata: {
            kind: 'prototype',
            strategyBinding: {
              schemaVersion: 1,
              provenance: 'automatic_default',
              taskProfile: 'marketing',
              boundAt: Date.now(),
            },
          },
        }),
      },
    );
    expect(forgedPatch.status).toBe(400);
    const preservedPatch = await fetch(
      `${started.url}/api/projects/${encodeURIComponent(approved[0]!.projectId)}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metadata: { kind: 'prototype', entryFile: 'index.html' } }),
      },
    );
    expect(preservedPatch.status).toBe(200);
    await expect(preservedPatch.json()).resolves.toMatchObject({
      project: {
        metadata: {
          strategyBinding: {
            provenance: 'automatic_default',
            taskProfile: 'prototype',
          },
        },
      },
    });

    const forgedCreate = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `forged-strategy-binding-${Date.now()}`,
        name: 'Forged strategy binding',
        metadata: {
          kind: 'prototype',
          strategyBinding: {
            schemaVersion: 1,
            provenance: 'automatic_default',
            taskProfile: 'prototype',
            boundAt: Date.now(),
          },
        },
        conversationMode: 'design',
      }),
    });
    expect(forgedCreate.status).toBe(200);
    const forgedCreateBody = await forgedCreate.json() as {
      project?: {
        metadata?: {
          scenarioBinding?: { pluginId?: string };
          strategyBinding?: unknown;
        };
      };
    };
    expect(forgedCreateBody).toMatchObject({
      project: { metadata: { scenarioBinding: { pluginId: 'example-web-prototype' } } },
    });
    expect(forgedCreateBody.project?.metadata?.strategyBinding).toBeUndefined();

    for (const candidate of approved) {
      const run = await postRun(started.url, publicRunRequest(
        candidate,
        'Hold the public rollout run open until canceled.',
        `approved-${candidate.taskProfile}`,
      ));
      expect(run.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
      expect(await readDurableRunState(run.runId as string)).toMatchObject({
        strategyRolloutDecision: {
          schemaVersion: 1,
          decisionClass: 'active',
          taskType: candidate.taskProfile,
          primaryReasonCode: 'od_next_rollout_eligible',
        },
      });
      expect(getStrategyTaskExecution(database(), run.taskExecutionId as string)?.taskExecutionId)
        .toBe(run.taskExecutionId);
      await fetch(`${started.url}/api/runs/${encodeURIComponent(run.runId as string)}/cancel`, {
        method: 'POST',
      });
      await waitForRunTerminal(started.url, run.runId as string);
    }

    for (const candidate of approved) {
      const explicitRun = await postRun(started.url, {
        ...publicRunRequest(
          candidate,
          'Use the explicitly named scenario through ordinary routing.',
          `explicit-${candidate.taskProfile}`,
        ),
        pluginId: candidate.pluginId,
      });
      expect(explicitRun.strategyTask).toBeUndefined();
      expect(explicitRun.pluginId).toBe(candidate.pluginId);
      expect(await readDurableRunState(explicitRun.runId as string)).toMatchObject({
        strategyRolloutDecision: {
          schemaVersion: 1,
          decisionClass: 'explicit_user',
          primaryReasonCode: 'od_next_rollout_explicit_user_authority',
        },
      });
      await waitForRunTerminal(started.url, explicitRun.runId as string);
    }

    // A second-level Prototype scene (Wireframe / Mobile) refines WHAT to build,
    // never WHETHER the parent's automatic route applies. The daemon must accept
    // the Prototype claim for that metadata and run OD Next for it.
    for (const [label, metadata] of [
      ['wireframe', { kind: 'prototype', fidelity: 'wireframe' }],
      [
        'mobile',
        {
          kind: 'prototype',
          platform: 'auto',
          platformTargets: ['mobile-ios', 'mobile-android'],
        },
      ],
    ] as const) {
      // No claim made → the project still binds the ordinary scenario plugin.
      const ordinary = await createProjectForScenario(
        started.url,
        `ordinary-${label}`,
        metadata,
      );
      expect(ordinary.metadata?.strategyBinding).toBeUndefined();
      expect(ordinary.metadata?.scenarioBinding).toMatchObject({
        provenance: 'automatic_default',
        pluginId: 'example-web-prototype',
      });

      const refined = await createProjectForScenario(
        started.url,
        `refined-${label}`,
        metadata,
        undefined,
        'prototype',
      );
      expect(refined.metadata?.strategyBinding).toMatchObject({
        schemaVersion: 1,
        provenance: 'automatic_default',
        taskProfile: 'prototype',
      });
      expect(refined.metadata?.scenarioBinding).toBeUndefined();
      expect(refined.appliedPluginSnapshotId).toBeUndefined();

      const refinedRun = await postRun(started.url, publicRunRequest(
        refined,
        `Hold the ${label} rollout run open until canceled.`,
        `refined-${label}`,
      ));
      expect(refinedRun.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
      expect(await readDurableRunState(refinedRun.runId as string)).toMatchObject({
        strategyRolloutDecision: {
          schemaVersion: 1,
          decisionClass: 'active',
          taskType: 'prototype',
          primaryReasonCode: 'od_next_rollout_eligible',
        },
      });
      await fetch(`${started.url}/api/runs/${encodeURIComponent(refinedRun.runId as string)}/cancel`, {
        method: 'POST',
      });
      await waitForRunTerminal(started.url, refinedRun.runId as string);
    }

    // Fail-closed is unchanged for metadata that genuinely owns no OD Next
    // route: a claim the exact metadata cannot back is a 400, never a silent
    // downgrade.
    for (const [label, metadata] of [
      ['web-clone', { kind: 'prototype', intent: 'web-clone' }],
      ['live-artifact', { kind: 'prototype', intent: 'live-artifact' }],
      ['image', { kind: 'image' }],
    ] as const) {
      const rejected = await fetch(`${started.url}/api/projects`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `rejected-${label}-${Date.now()}`,
          name: `Rejected ${label}`,
          metadata,
          conversationMode: 'design',
          automaticStrategyTaskProfile: 'prototype',
        }),
      });
      expect(rejected.status).toBe(400);
    }

    const image = await createProjectForScenario(
      started.url,
      'ordinary-image-default',
      { kind: 'image' },
      {
        pluginInputs: {
          mediaKind: 'image',
          subject: 'a polished product concept',
          style: 'cinematic, high-quality, on-brand',
          aspect: '16:9',
        },
      },
    );
    expect(image.metadata?.scenarioBinding).toMatchObject({
      provenance: 'automatic_default',
      pluginId: 'od-media-generation',
    });
    expect(image.metadata?.scenarioBinding).not.toHaveProperty('taskProfile');
    const imageRun = await postRun(started.url, publicRunRequest(
      image,
      'Create an ordinary image.',
      'ordinary-image-default',
    ));
    expect(imageRun.strategyTask).toBeUndefined();
    expect(imageRun.pluginId).toBe('od-media-generation');
    expect(await readDurableRunState(imageRun.runId as string)).toMatchObject({
      strategyRolloutDecision: {
        schemaVersion: 1,
        decisionClass: 'not_applicable',
        taskType: null,
      },
    });
    const imageStatus = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(imageRun.runId as string)}`,
    );
    expect(imageStatus.status).toBe(200);
    expect(await imageStatus.json()).toMatchObject({
      strategyRolloutDecision: {
        schemaVersion: 1,
        decisionClass: 'not_applicable',
        taskType: null,
      },
    });
    await waitForRunTerminal(started.url, imageRun.runId as string);

    const explicitImage = await createProjectForScenario(
      started.url,
      'ordinary-image-explicit',
      { kind: 'image' },
      {
        pluginId: 'od-media-generation',
        pluginInputs: {
          mediaKind: 'image',
          subject: 'a polished product concept',
          style: 'cinematic, high-quality, on-brand',
          aspect: '16:9',
        },
      },
    );
    expect(explicitImage.metadata?.scenarioBinding).toMatchObject({
      provenance: 'explicit_user',
      pluginId: 'od-media-generation',
    });
    expect(explicitImage.metadata?.scenarioBinding).not.toHaveProperty('taskProfile');
    const explicitImageRun = await postRun(started.url, publicRunRequest(
      explicitImage,
      'Create an ordinary image.',
      'ordinary-image-explicit',
    ));
    expect(explicitImageRun.strategyTask).toBeUndefined();
    expect(explicitImageRun.pluginId).toBe('od-media-generation');
    expect(await readDurableRunState(explicitImageRun.runId as string)).toMatchObject({
      strategyRolloutDecision: {
        schemaVersion: 1,
        decisionClass: 'explicit_user',
        taskType: null,
      },
    });
    await waitForRunTerminal(started.url, explicitImageRun.runId as string);
  });

  it('keeps legacy automatic scenario bindings eligible for OD Next', async () => {
    const fixture = await createPublicRolloutFixture('legacy-scenario-compat', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const legacy = await createProjectForScenario(
      started.url,
      'legacy-scenario-project',
      { kind: 'prototype' },
    );
    expect(legacy.appliedPluginSnapshotId).toBeTruthy();
    expect(legacy.metadata?.strategyBinding).toBeUndefined();
    expect(legacy.metadata?.scenarioBinding).toMatchObject({
      provenance: 'automatic_default',
      pluginId: 'example-web-prototype',
      taskProfile: 'prototype',
      snapshotId: legacy.appliedPluginSnapshotId,
    });

    const created = await postRun(started.url, publicRunRequest(
      legacy,
      'Hold the legacy-compatible OD Next run open until canceled.',
      'legacy-scenario-request',
    ));
    expect(created.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    expect(await readDurableRunState(created.runId as string)).toMatchObject({
      strategyRolloutDecision: {
        decisionClass: 'active',
        taskType: 'prototype',
      },
    });
    await fetch(`${started.url}/api/runs/${encodeURIComponent(created.runId as string)}/cancel`, {
      method: 'POST',
    });
    await waitForRunTerminal(started.url, created.runId as string);
  });

  it('binds adapter-family capability facts for an unrecognized new CLI version', async () => {
    const agentCliVersion = 'codex-cli 99.0.0-forward-compatible';
    const fixture = await createPublicRolloutFixture(
      'synthetic-planning-facts',
      'design',
      undefined,
      agentCliVersion,
    );
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';

    const resolvedCapability = resolveBundledOdNextRuntimeCapability({
      agentId: 'codex',
      agentCliVersion,
    });
    expect(resolvedCapability).toMatchObject({
      reason: 'capability_resolved',
      snapshot: {
        agentCliVersion,
        recordedAgentCliVersion: 'codex-cli 0.147.0',
        nativeSessionContinuation: { support: 'verified' },
        nativeSubagents: { support: 'verified' },
      },
    });

    const created = await postRun(
      started.url,
      publicRunRequest(
        fixture,
        'Hold the public rollout run open until canceled.',
        'forward-compatible-planning-facts-request',
      ),
    );
    expect(created.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    const task = getStrategyTaskExecution(database(), created.taskExecutionId as string);
    expect(task?.promptBundle.text).toContain(
      resolvedCapability.snapshot!.snapshotHash.slice('sha256:'.length),
    );

    const canceled = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(created.runId as string)}/cancel`,
      { method: 'POST' },
    );
    expect(canceled.status).toBe(200);
  });

  it('exposes the instance stop latch through the shared API and CLI CAS reset', async () => {
    const fixture = await createPublicRolloutFixture('rollout-control', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    latchOdNextRolloutStop(database(), {
      mode: 'off',
      reasonCode: 'route_mode_drift',
    });

    const beforeResult = await runOdCli([
      'strategy', 'rollout', 'status', '--daemon-url', started.url, '--json',
    ]);
    expect(beforeResult.stderr).toBe('');
    const before = JSON.parse(beforeResult.stdout) as {
      status: { scope: string; revision: number; latch: { mode: string; reasonCode: string } | null };
    };
    expect(before.status).toMatchObject({
      scope: 'daemon_instance',
      latch: { mode: 'off', reasonCode: 'route_mode_drift' },
    });

    const resetResult = await runOdCli([
      'strategy', 'rollout', 'reset', '--daemon-url', started.url, '--json',
    ]);
    expect(resetResult.stderr).toBe('');
    const reset = JSON.parse(resetResult.stdout) as {
      status: {
        revision: number;
        latch: null;
        lastEvent: { action: string; reasonCode: string } | null;
      };
    };
    expect(reset.status.revision).toBe(before.status.revision + 1);
    expect(reset.status.latch).toBeNull();
    expect(reset.status.lastEvent).toMatchObject({
      action: 'cleared',
      reasonCode: 'operator_reset',
    });

    const staleReset = await fetch(`${started.url}/api/strategies/od-next/rollout/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: before.status.revision }),
    });
    expect(staleReset.status).toBe(409);
    await expect(staleReset.json()).resolves.toMatchObject({
      error: { code: 'ROLLOUT_REVISION_CONFLICT' },
      status: { revision: reset.status.revision },
    });
  });

  it('keeps active retry/task recipe-only while rollback lazily resolves the ordinary default', async () => {
    const fixture = await createPublicRolloutFixture('rollback', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    const strategyTaskCountAtStart = (
      database().prepare('SELECT COUNT(*) AS count FROM strategy_task_executions').get() as {
        count: number;
      }
    ).count;
    expect(fixture.projectMetadata?.strategyBinding).toMatchObject({
      schemaVersion: 1,
      provenance: 'automatic_default',
      taskProfile: 'prototype',
    });
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const activeBody = publicRunRequest(
      fixture,
      'Hold the public rollout run open until canceled.',
      'active-request',
    );
    const active = await postRun(started!.url, activeBody);
    expect(active.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    const activeTask = getStrategyTaskExecution(database(), active.taskExecutionId as string);
    expect(activeTask?.frozenSkillPackage).toMatchObject({
        schema: 'open-design.od-next-frozen-skill-package/v1',
        selections: [],
      });
    expect(activeTask?.runs[0]?.finalText).toEqual(activeTask?.promptBundle);
    expect(activeTask?.promptBundle.utf8Bytes).toBe(
      Buffer.byteLength(activeTask?.promptBundle.text ?? '', 'utf8'),
    );
    expect((database().prepare(
      'SELECT applied_plugin_snapshot_id AS snapshotId FROM projects WHERE id = ?',
    ).get(fixture.projectId) as { snapshotId: string | null }).snapshotId)
      .toBeNull();

    latchOdNextRolloutStop(database(), {
      mode: 'observe',
      reasonCode: 'threshold_exceeded',
    });
    const replayed = await postRun(started!.url, activeBody);
    expect(replayed).toMatchObject({
      runId: active.runId,
      taskExecutionId: active.taskExecutionId,
      reused: true,
    });

    const ordinary = await postRun(
      started!.url,
      publicRunRequest(fixture, 'Run after rollback.', 'ordinary-after-rollback'),
    );
    expect(ordinary.strategyTask).toBeUndefined();
    expect(ordinary.pluginId).toBe('example-web-prototype');
    await waitForRunTerminal(started!.url, ordinary.runId as string);

    const canceledResponse = await fetch(
      `${started!.url}/api/runs/${encodeURIComponent(active.runId as string)}/cancel`,
      { method: 'POST' },
    );
    expect(canceledResponse.status).toBe(200);
    expect(await waitForRunTerminal(started!.url, active.runId as string)).toMatchObject({
      status: 'canceled',
      strategyTask: {
        taskExecutionId: active.taskExecutionId,
        outcome: 'canceled',
        terminal: true,
      },
    });
    const activeInvocation = (await readProjectInvocations(fixture.logPath, fixture.projectId))
      .find((invocation) => invocation.stdin.includes('Hold the public rollout run open'));
    expect(activeInvocation?.stdin).toBe(activeTask?.promptBundle.text);
    expect(activeInvocation?.stdin).not.toContain('## User-selected Skill');
    expect(activeInvocation?.stdin).not.toContain('example-web-prototype');
    expect(activeInvocation?.stdin).not.toContain('available_skills');
    expect((database().prepare('SELECT COUNT(*) AS count FROM strategy_task_executions').get() as { count: number }).count)
      .toBe(strategyTaskCountAtStart + 1);
  });

  it('carries explicit Web and CLI Skills into the same automatic run', async () => {
    const fixture = await createPublicRolloutFixture('web-cli-skill-parity', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const dataDir = process.env.OD_DATA_DIR!;
    for (const skillId of ['bundle-skill-a', 'bundle-skill-b']) {
      const skillDir = path.join(dataDir, 'skills', skillId);
      await mkdir(skillDir, { recursive: true });
      await writeFile(path.join(skillDir, 'SKILL.md'), [
        '---',
        `name: ${skillId}`,
        `description: ${skillId} parity fixture`,
        '---',
        `# ${skillId}`,
        `BODY_MARKER_${skillId.toUpperCase().replaceAll('-', '_')}`,
      ].join('\n'));
    }
    const prompt = 'Complete this request through automatic Skill routing.';
    const clientRequestId = 'web-cli-skill-parity-request';
    const strategyTaskCountAtStart = (database().prepare(
      'SELECT COUNT(*) AS count FROM strategy_task_executions',
    ).get() as { count: number }).count;
    const web = await postRun(started.url, {
      projectId: fixture.projectId,
      conversationId: fixture.conversationId,
      agentId: 'codex',
      message: prompt,
      clientRequestId,
      skillId: 'bundle-skill-a',
      skillIds: ['bundle-skill-a', 'bundle-skill-b'],
    });
    // The @-mention refines the task; it does not take it off the route.
    expect(web.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    await waitForInvocationCount(fixture.logPath, fixture.projectId, 1);

    const task = getStrategyTaskExecution(database(), web.taskExecutionId as string);
    const bundle = task?.promptBundle.text ?? '';
    // Both Skills reach the Agent through the Bundle slot the strategy's own
    // conflict order ranks above its orchestration and task-type Skills.
    expect(bundle).toContain('<user_selected_skills skill_names="bundle-skill-a,bundle-skill-b">');
    expect(bundle).toContain('BODY_MARKER_BUNDLE_SKILL_A');
    expect(bundle).toContain('BODY_MARKER_BUNDLE_SKILL_B');
    const invocation = (await readProjectInvocations(fixture.logPath, fixture.projectId))[0];
    expect(invocation?.stdin).toBe(bundle);

    const cliResult = await runOdCli([
      'run',
      'start',
      '--project', fixture.projectId,
      '--conversation', fixture.conversationId,
      '--message', prompt,
      '--skill', 'bundle-skill-a,bundle-skill-b,bundle-skill-a',
      '--client-request-id', clientRequestId,
      '--agent', 'codex',
      '--daemon-url', started.url,
      '--json',
    ]);
    expect(cliResult.stderr).toBe('');
    const cli = JSON.parse(cliResult.stdout) as {
      runId: string;
      taskExecutionId?: string;
    };
    await waitForInvocationCount(fixture.logPath, fixture.projectId, 1);

    expect(cli.runId).toBe(web.runId);
    expect(cli.taskExecutionId).toBe(web.taskExecutionId);
    expect((database().prepare(
      'SELECT COUNT(*) AS count FROM strategy_task_executions',
    ).get() as { count: number }).count).toBe(strategyTaskCountAtStart + 1);
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(1);

    const canceled = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(web.runId as string)}/cancel`,
      { method: 'POST' },
    );
    expect(canceled.status).toBe(200);
  });

  it('carries the Home-picked Skill persisted on the project into the Bundle', async () => {
    // The real Home flow: the @-mention is stored on the project row at create
    // time and the first run never names it again. That row is the third
    // branch of the old explicit-authority read, so it needs its own witness.
    const fixture = await createPublicRolloutFixture('project-skill-row', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const skillDir = path.join(process.env.OD_DATA_DIR!, 'skills', 'home-picked-skill');
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, 'SKILL.md'), [
      '---',
      'name: home-picked-skill',
      'description: home picked fixture',
      '---',
      '# home-picked-skill',
      'BODY_MARKER_HOME_PICKED',
    ].join('\n'));

    const projectId = `od-next-public-project-skill-row-${Date.now()}`;
    const createResponse = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: 'OD Next public project skill row',
        metadata: { kind: 'prototype' },
        automaticStrategyTaskProfile: 'prototype',
        skillId: 'home-picked-skill',
        conversationMode: 'design',
        skipDiscoveryBrief: true,
      }),
    });
    const createBody = await createResponse.json() as { conversationId: string };
    expect(createResponse.status, JSON.stringify(createBody)).toBe(200);

    const created = await postRun(started.url, publicRunRequest(
      { projectId, conversationId: createBody.conversationId },
      'Build it with the Skill I picked on Home.',
      'project-skill-row-request',
    ));
    expect(created.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });

    const bundle = getStrategyTaskExecution(
      database(),
      created.taskExecutionId as string,
    )?.promptBundle.text ?? '';
    expect(bundle).toContain('<user_selected_skills skill_names="home-picked-skill">');
    expect(bundle).toContain('BODY_MARKER_HOME_PICKED');

    const canceled = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(created.runId as string)}/cancel`,
      { method: 'POST' },
    );
    expect(canceled.status).toBe(200);
  });

  it('routes project context plugins through the ordinary default', async () => {
    const fixture = await createPublicRolloutFixture('context-plugin-authority', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const contextual = await createProjectForScenario(
      started.url,
      'context-plugin-project',
      {
        kind: 'prototype',
        contextPlugins: [{ id: 'example-web-prototype', title: 'Web Prototype' }],
      },
      undefined,
      'prototype',
    );

    const created = await postRun(started.url, publicRunRequest(
      contextual,
      'Use the project context through ordinary routing.',
      'context-plugin-request',
    ));

    expect(created.strategyTask).toBeUndefined();
    expect(created.taskExecutionId).toBeUndefined();
    expect(created.pluginId).toBe('example-web-prototype');
    expect(await readDurableRunState(created.runId as string)).toMatchObject({
      strategyRolloutDecision: {
        decisionClass: 'explicit_user',
        primaryReasonCode: 'od_next_rollout_explicit_user_authority',
      },
    });
    await waitForRunTerminal(started.url, created.runId as string);
  });

  it('binds an active headless request and its strategy Snapshot to the project conversation', async () => {
    const fixture = await createPublicRolloutFixture('headless-conversation', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';

    const request = publicRunRequest(
      fixture,
      'Hold the public rollout run open until canceled.',
      'headless-conversation-request',
    );
    delete (request as { conversationId?: string }).conversationId;
    const created = await postRun(started.url, request);
    expect(created.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });

    const task = getStrategyTaskExecution(database(), created.taskExecutionId as string);
    expect(task?.conversationId).toBe(fixture.conversationId);
    expect(database().prepare(
      'SELECT conversation_id AS conversationId FROM applied_plugin_snapshots WHERE id = ?',
    ).get(task?.snapshotId) as { conversationId: string | null }).toEqual({
      conversationId: fixture.conversationId,
    });

    await fetch(
      `${started.url}/api/runs/${encodeURIComponent(created.runId as string)}/cancel`,
      { method: 'POST' },
    );
  });

  it('rejects mapped-row deletion or legacy NULL final text without spawning an ordinary retry', async () => {
    const fixture = await createPublicRolloutFixture('persisted-task-tamper', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';

    const deletedBody = publicRunRequest(
      fixture,
      'Hold deleted-mapping task open.',
      'deleted-mapping-request',
    );
    const nullBody = publicRunRequest(
      fixture,
      'Hold NULL-identity task open.',
      'null-identity-request',
    );
    const deleted = await postRun(started.url, deletedBody);
    const nulled = await postRun(started.url, nullBody);
    await waitForInvocationCount(fixture.logPath, fixture.projectId, 2);
    await Promise.all([
      waitForRunTerminal(started.url, deleted.runId as string),
      waitForRunTerminal(started.url, nulled.runId as string),
    ]);
    const invocationCount = (await readProjectInvocations(fixture.logPath, fixture.projectId)).length;

    database().prepare(
      'DELETE FROM strategy_task_runs WHERE task_execution_id = ?',
    ).run(deleted.taskExecutionId);
    database().prepare(
      `UPDATE strategy_task_runs
          SET final_text = NULL, final_text_utf8_bytes = NULL, final_text_sha256 = NULL
        WHERE task_execution_id = ?`,
    ).run(nulled.taskExecutionId);

    for (const body of [deletedBody, nullBody]) {
      const response = await fetch(`${started.url}/api/runs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(response.status).toBe(409);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: 'OD_NEXT_TASK_STATE_INVALID' },
      });
    }
    expect((await readProjectInvocations(fixture.logPath, fixture.projectId)).length)
      .toBe(invocationCount);
  });

  it('rejects task-to-Run scope drift without spawning a retry', async () => {
    const fixture = await createPublicRolloutFixture('persisted-task-scope-drift', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const body = publicRunRequest(
      fixture,
      'Hold scope-drift task open.',
      'scope-drift-request',
    );
    const created = await postRun(started.url, body);
    await waitForInvocationCount(fixture.logPath, fixture.projectId, 1);
    database().prepare(
      `UPDATE strategy_task_executions
          SET selected_agent_id = 'opencode'
        WHERE task_execution_id = ?`,
    ).run(created.taskExecutionId);

    const response = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'OD_NEXT_TASK_STATE_INVALID' },
    });
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(1);
  });

  it('never overrides explicit plugin, snapshot, or existing project-pin authority', async () => {
    const fixture = await createPublicRolloutFixture(
      'authority',
      'design',
      'example-web-prototype',
    );
    started = fixture.started;
    binDir = fixture.binDir;
    clearOdNextRolloutStop(database());
    expect(fixture.projectMetadata?.scenarioBinding).toMatchObject({
      provenance: 'explicit_user',
      pluginId: 'example-web-prototype',
    });
    const strategyTaskCountAtStart = (
      database().prepare('SELECT COUNT(*) AS count FROM strategy_task_executions').get() as { count: number }
    ).count;
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';

    const pinned = await postRun(
      started.url,
      publicRunRequest(fixture, 'Use the pinned default.', 'pinned-authority'),
    );
    expect(pinned.strategyTask).toBeUndefined();
    expect(pinned.pluginId).toBe('example-web-prototype');

    const explicitDefault = await postRun(started.url, {
      ...publicRunRequest(fixture, 'Use the explicit default.', 'explicit-default'),
      pluginId: 'example-web-prototype',
    });
    expect(explicitDefault.strategyTask).toBeUndefined();
    expect(explicitDefault.pluginId).toBe('example-web-prototype');

    const invalidSnapshot = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...publicRunRequest(fixture, 'Use a missing snapshot.', 'missing-snapshot'),
        appliedPluginSnapshotId: 'missing-snapshot',
      }),
    });
    expect(invalidSnapshot.status).toBe(404);
    expect(await invalidSnapshot.json()).toMatchObject({
      error: { code: 'snapshot-not-found' },
    });

    const officialSource = path.resolve(
      import.meta.dirname,
      '../../../plugins/_official/scenarios/od-next-strategy',
    );
    const resolvedCollision = await resolvePluginFolder({
      folder: officialSource,
      folderId: 'od-next-strategy',
      sourceKind: 'bundled',
      source: officialSource,
      trust: 'bundled',
    });
    if (!resolvedCollision.ok) throw new Error(resolvedCollision.errors.join('; '));
    upsertInstalledPlugin(database(), {
      ...resolvedCollision.record,
      sourceKind: 'user',
      source: 'community-collision-fixture',
      trust: 'restricted',
    });
    const collidingId = await fetch(`${started.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...publicRunRequest(fixture, 'Use an explicit colliding id.', 'colliding-id'),
        pluginId: 'od-next-strategy',
      }),
    });
    expect(collidingId.status).toBe(409);
    expect(await collidingId.json()).toMatchObject({
      error: { code: 'capabilities-required' },
    });
    expect((database().prepare('SELECT COUNT(*) AS count FROM strategy_task_executions').get() as { count: number }).count)
      .toBe(strategyTaskCountAtStart);

    const restoredResult = await runOdCli([
      'project', 'restore-automatic-scenario', fixture.projectId,
      '--daemon-url', started.url,
      '--json',
    ]);
    expect(restoredResult.stderr).toBe('');
    const restored = JSON.parse(restoredResult.stdout) as {
      changed: boolean;
      scenarioBinding?: { provenance: string; pluginId: string; snapshotId: string };
      strategyBinding: {
        provenance: string;
        taskProfile: ProjectScenarioTaskProfile;
      };
    };
    expect(restored).toMatchObject({
      changed: true,
      strategyBinding: {
        provenance: 'automatic_default',
        taskProfile: 'prototype',
      },
    });
    expect(restored.scenarioBinding).toBeUndefined();
    expect((database().prepare(
      'SELECT applied_plugin_snapshot_id AS snapshotId FROM projects WHERE id = ?',
    ).get(fixture.projectId) as { snapshotId: string | null }).snapshotId).toBeNull();

    const retriedResult = await runOdCli([
      'project', 'restore-automatic-scenario', fixture.projectId,
      '--daemon-url', started.url,
      '--json',
    ]);
    expect(retriedResult.stderr).toBe('');
    expect(JSON.parse(retriedResult.stdout)).toMatchObject({
      changed: false,
      strategyBinding: {
        provenance: 'automatic_default',
        taskProfile: 'prototype',
      },
    });

    const automatic = await postRun(started.url, publicRunRequest(
      fixture,
      'Hold the public rollout run open until canceled.',
      'restored-automatic',
    ));
    expect(automatic.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    await fetch(`${started.url}/api/runs/${encodeURIComponent(automatic.runId as string)}/cancel`, {
      method: 'POST',
    });
    await waitForRunTerminal(started.url, automatic.runId as string);
  });

  it('runs parsed plan -> serialization repair -> production after each source end and remains exactly-once across restart', async () => {
    const fixture = await createFixture('repair');
    const sourcePdfAttachment = path.join(
      process.env.OD_DATA_DIR!,
      'projects',
      fixture.projectId,
      'brief.pdf',
    );
    const sourceTextAttachment = path.join(
      path.dirname(sourcePdfAttachment),
      'notes.txt',
    );
    await mkdir(path.dirname(sourcePdfAttachment), { recursive: true });
    await writeFile(sourcePdfAttachment, '%PDF-1.7\nimmutable brief');
    await writeFile(sourceTextAttachment, 'immutable notes');
    const body = {
      ...createRunRequest(fixture, 'Build the operator prototype.'),
      attachments: ['brief.pdf', 'notes.txt'],
    };

    queueFixtureIds(fixture);
    const created = await postRun(started!.url, body);
    expect(created).toMatchObject({
      runId: fixture.initialRunId,
      taskExecutionId: fixture.taskExecutionId,
      strategyTask: {
        taskExecutionId: fixture.taskExecutionId,
        inputStage: 'request',
        outcome: 'running',
        terminal: false,
      },
    });
    expect(uuidControl.forced).toEqual([]);
    const liveMutation = [
      'LIVE_CONTEXT_MUTATION_MUST_NOT_EXPORT',
      '/Users/alice/live-only.txt',
      'sk-test-1234567890123456789012',
    ].join(' ');
    await writeFile(sourcePdfAttachment, liveMutation);
    await writeFile(sourceTextAttachment, liveMutation);

    const initialTerminal = await waitForRunTerminal(started!.url, fixture.initialRunId);
    expect(initialTerminal.status, JSON.stringify(initialTerminal)).toBe('succeeded');
    const terminal = await waitForTask(fixture.taskExecutionId, 'completed');
    expect(terminal.runs.map((run) => run.inputStage)).toEqual([
      'request',
      'contract_repair',
      'production',
    ]);
    expect(terminal.runs.map((run) => run.sourceRunId ?? null)).toEqual([
      null,
      fixture.initialRunId,
      terminal.runs[1]?.runId,
    ]);
    expect(terminal.planContractRepairAttempts).toBe(1);
    expect(terminal.terminalRunId).toBe(terminal.runs[2]?.runId);

    const statuses = await Promise.all(
      terminal.runs.map((mapping) => getRun(started!.url, mapping.runId)),
    );
    expect(statuses.map((run) => run.status)).toEqual([
      'succeeded',
      'succeeded',
      'succeeded',
    ]);
    expect(statuses.at(-1)?.strategyTask).toMatchObject({
      taskExecutionId: fixture.taskExecutionId,
      inputStage: 'production',
      outcome: 'completed',
      terminal: true,
    });
    const resultPackageResponse = await fetch(
      `${started!.url}/api/runs/${fixture.initialRunId}/result-package`,
    );
    expect(resultPackageResponse.status).toBe(200);
    const resultPackage = await resultPackageResponse.json() as {
      run: { id: string };
      strategyTask?: RunStatus['strategyTask'];
    };
    expect(resultPackage.run.id).toBe(terminal.terminalRunId);
    expect(resultPackage.strategyTask).toMatchObject({
      taskExecutionId: fixture.taskExecutionId,
      inputStage: 'production',
      outcome: 'completed',
      terminal: true,
    });
    const watched = await runOdCli([
      'run',
      'watch',
      fixture.initialRunId,
      '--daemon-url',
      started!.url,
    ]);
    const watchedEnds = watched.stdout
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line) as { event: string; data: RunStatus })
      .filter((event) => event.event === 'end');
    expect(watched.stdout).toContain('Prepared a simple plan.');
    expect(watched.stdout).not.toContain('<open-design-plan-contract>');
    expect(watched.stdout).not.toContain('<open-design-runtime-state>');
    expect(watchedEnds.map((event) => event.data.strategyTask?.inputStage)).toEqual([
      'contract_repair',
      'production',
      'production',
    ]);
    expect(watchedEnds.at(-1)?.data.strategyTask).toMatchObject({
      outcome: 'completed',
      terminal: true,
    });

    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(3);
    expect(invocations.map((invocation) => invocation.stdin)).toEqual(
      terminal.runs.map((mapping) => mapping.finalText.text),
    );
    expect(invocations[0]?.argv).not.toContain('resume');
    expect(invocations[0]?.stdin).toMatch(/^<open_design_prompt_bundle/);
    expect(invocations[0]?.stdin).toContain('<open_design_core_system_prompt>');
    expect(invocations[0]?.stdin).toContain('<user_first_prompt>');
    expect(invocations[0]?.stdin).toContain('<task_metadata>');
    expect(invocations[0]?.stdin).toContain('<context>');
    // The rejected wrapper and the pre-PRD tag names must not come back.
    expect(invocations[0]?.stdin).not.toContain('<system_prompt>');
    expect(invocations[0]?.stdin).not.toContain('<task_config>');
    expect(invocations[0]?.stdin).not.toContain('<user_prompt>');
    // The Bundle is a tree: each spec slot is its own element, not a '---'
    // section inside one blob, and the user's words come last.
    for (const nested of [
      '<execution_boundary>',
      '<core_strategy>',
      '<output_contract>',
      '<echo_guard>',
      '<session_skills>',
      '<task_type_skill skill_name="prototype">',
      '<active_stages>',
      '<stage name="discovery">',
      '<atom name="discovery-question-form">',
      '<task_type>',
      '<attachments>',
      '<recipe_identity ',
      '<runtime_tool_environment>',
    ]) {
      expect(invocations[0]!.stdin).toContain(nested);
    }
    expect(invocations[0]!.stdin).not.toContain('\n\n---\n\n');
    expect(invocations[0]!.stdin).not.toContain('## Active stage:');
    expect(invocations[0]!.stdin.lastIndexOf('<user_first_prompt>'))
      .toBeGreaterThan(invocations[0]!.stdin.lastIndexOf('</context>'));
    // Drift 2, proved on the real payload: the head through active_stages is
    // the shared cache prefix, so no per-task or per-run value may appear in it.
    const firstStdin = invocations[0]!.stdin;
    const systemPromptSlice = firstStdin.slice(
      firstStdin.indexOf('  <open_design_core_system_prompt>'),
      firstStdin.indexOf('  </active_stages>'),
    );
    expect(systemPromptSlice.length).toBeGreaterThan(0);
    for (const perTaskValue of [
      'open-design.od-next-task-configuration/v1',
      'open-design.od-next-request-input-facts/v1',
      'task-input:attachments/attachment-001.pdf',
      'workspace:project',
      // The runtime tool contract embeds the daemon URL, which is per-run.
      'Daemon URL',
      'OD_TASK_INPUT_DIR',
    ]) {
      expect(systemPromptSlice).not.toContain(perTaskValue);
      expect(firstStdin).toContain(perTaskValue);
    }
    expect(invocations[0]?.stdin).toContain('open-design.od-next-task-configuration/v1');
    expect(invocations[0]?.stdin).toContain('open-design.od-next-request-input-facts/v1');
    expect(invocations[0]?.stdin).toContain('"taskType":"prototype"');
    expect(invocations[0]?.stdin).toContain('task-input:attachments/attachment-001.pdf');
    expect(invocations[0]?.stdin).toContain('task-input:attachments/attachment-002.txt');
    expect(invocations[0]?.stdin).toContain('OD_TASK_INPUT_DIR');
    expect(invocations[0]?.stdin).toContain('"reference":"workspace:project"');
    expect(invocations[0]?.stdin).not.toContain(process.env.OD_DATA_DIR ?? '__missing_data_root__');
    expect(invocations[0]?.stdin).not.toContain('# User request');
    expect(invocations[1]?.argv.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(invocations[2]?.argv.slice(0, 2)).toEqual(['exec', 'resume']);
    expect(invocations.slice(1).map((invocation) => invocation.argv.includes(THREAD_ID)))
      .toEqual([true, true]);
    expect(invocations[1]?.stdin).toContain('native continuation — contract_repair');
    expect(invocations[2]?.stdin).toContain('native continuation — production');
    expect(invocations[1]?.stdin).toMatch(/^<open_design_request_turn/);
    expect(invocations[2]?.stdin).toMatch(/^<open_design_request_turn/);
    expect(invocations[1]?.stdin).toContain('stage="contract_repair" task_run_index="1"');
    expect(invocations[2]?.stdin).toContain('stage="production" task_run_index="2"');
    expect(invocations[1]?.stdin).not.toContain('# User request');
    expect(invocations[2]?.stdin).not.toContain('# User request');
    expect(invocations[1]?.stdin).not.toContain('open-design.strategy-state/v2');
    expect(invocations[2]?.stdin).not.toContain('open-design.strategy-state/v2');
    expect(statuses[0]!.updatedAt).toBeLessThanOrEqual(invocations[1]!.startedAt);
    expect(statuses[1]!.updatedAt).toBeLessThanOrEqual(invocations[2]!.startedAt);
    for (const invocation of invocations) {
      expect(invocation.taskInputDir).toContain('od-next-run-inputs');
      expect(invocation.taskInputDir).not.toContain('od-next-task-inputs');
      expect(invocation.taskInputFiles).toEqual([
        { name: 'attachment-001.pdf', content: '%PDF-1.7\nimmutable brief' },
        { name: 'attachment-002.txt', content: 'immutable notes' },
      ]);
    }

    const durableInputSnapshots = await Promise.all(terminal.runs.map(async (mapping) => {
      const state = JSON.parse(await readFile(path.join(
        process.env.OD_DATA_DIR!,
        'runs',
        mapping.runId,
        'state.json',
      ), 'utf8')) as {
        odNextTaskInputSnapshot?: {
          taskExecutionId: string;
          snapshotDir: string;
          manifestSha256: string;
        };
      };
      return state.odNextTaskInputSnapshot;
    }));
    expect(durableInputSnapshots).toEqual([
      expect.objectContaining({ taskExecutionId: fixture.taskExecutionId }),
      expect.objectContaining({ taskExecutionId: fixture.taskExecutionId }),
      expect.objectContaining({ taskExecutionId: fixture.taskExecutionId }),
    ]);
    expect(new Set(durableInputSnapshots.map((snapshot) => snapshot?.manifestSha256)).size).toBe(1);
    expect(await readFile(path.join(
      durableInputSnapshots[0]!.snapshotDir,
      'attachments',
      'attachment-001.pdf',
    ), 'utf8')).toBe('%PDF-1.7\nimmutable brief');

    const durablePromptEvidence = await Promise.all(terminal.runs.map(async (mapping) => {
      const state = JSON.parse(await readFile(path.join(
        process.env.OD_DATA_DIR!,
        'runs',
        mapping.runId,
        'state.json',
      ), 'utf8')) as {
        promptTelemetry?: {
          promptFingerprint: string;
          rawBytes: number;
          odNextExactSend?: {
            schema: string;
            boundary: string;
            kind: string;
            promptSchema: string;
            stage: string;
            sha256: string;
            utf8Bytes: number;
          };
          sections: Array<{
            kind: string;
            redactedContent?: string;
          }>;
        };
      };
      return state.promptTelemetry;
    }));
    expect(durablePromptEvidence.map((telemetry) => telemetry?.odNextExactSend)).toEqual(
      terminal.runs.map((mapping) => ({
        boundary: 'hostComposed',
        kind: mapping.finalText.kind,
        promptSchema: mapping.finalText.schema,
        schema: 'open-design.od-next-exact-send-prompt/v1',
        stage: mapping.inputStage,
        sha256: mapping.finalText.sha256,
        utf8Bytes: mapping.finalText.utf8Bytes,
      })),
    );
    for (const [index, telemetry] of durablePromptEvidence.entries()) {
      expect(telemetry?.rawBytes).toBe(terminal.runs[index]!.finalText.utf8Bytes);
      expect(telemetry?.promptFingerprint).toMatch(/^sha256:/u);
      expect(telemetry?.sections.map((section) => section.kind)).toEqual([
        'odNextExactFinalText',
      ]);
      expect(telemetry?.sections[0]?.redactedContent).toBeTruthy();
      expect(Buffer.byteLength(
        telemetry?.sections[0]?.redactedContent ?? '',
        'utf8',
      )).toBeLessThanOrEqual(64 * 1024);
      expect(JSON.stringify(telemetry)).not.toContain(sourcePdfAttachment);
      expect(JSON.stringify(telemetry)).not.toContain(sourceTextAttachment);
      expect(JSON.stringify(telemetry)).not.toContain(process.env.OD_DATA_DIR!);
      expect(JSON.stringify(telemetry)).not.toContain('LIVE_CONTEXT_MUTATION_MUST_NOT_EXPORT');
      expect(JSON.stringify(telemetry)).not.toContain('/Users/alice/live-only.txt');
      expect(JSON.stringify(telemetry)).not.toContain('sk-test-');
    }

    for (const mapping of terminal.runs) {
      await getRun(started!.url, mapping.runId);
      await getRun(started!.url, mapping.runId);
    }
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(3);
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)?.runs).toHaveLength(3);

    await stopServer(started);
    started = await startDaemon();
    for (const mapping of terminal.runs) {
      expect((await getRun(started.url, mapping.runId)).status).toBe('succeeded');
    }
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(3);
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)).toMatchObject({
      outcome: 'completed',
      terminalRunId: terminal.runs[2]?.runId,
    });
  });

  it('keeps a completed task exactly-once across an exact retry and daemon restart', async () => {
    const fixture = await createFixture('repair');
    const body = createRunRequest(fixture, 'Update the existing operator header.');

    queueFixtureIds(fixture);
    const created = await postRun(started!.url, body);
    expect(created).toMatchObject({
      runId: fixture.initialRunId,
      taskExecutionId: fixture.taskExecutionId,
    });
    const terminal = await waitForTask(fixture.taskExecutionId, 'completed');
    expect(terminal.runs.map((run) => run.inputStage)).toEqual([
      'request',
      'contract_repair',
      'production',
    ]);
    expect(terminal.route).toBe('full_plan');
    expect(terminal.terminalRunId).toBe(terminal.runs[2]?.runId);
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(3);

    const retried = await postRun(started!.url, body);
    expect(retried).toMatchObject({
      runId: fixture.initialRunId,
      reused: true,
      taskExecutionId: fixture.taskExecutionId,
      strategyTask: {
        taskExecutionId: fixture.taskExecutionId,
        inputStage: 'production',
        outcome: 'completed',
        terminal: true,
      },
    });
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(3);
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)?.runs).toHaveLength(3);

    await stopServer(started);
    started = await startDaemon();
    expect((await getRun(started.url, fixture.initialRunId)).status).toBe('succeeded');
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(3);
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)).toMatchObject({
      outcome: 'completed',
      terminalRunId: terminal.runs[2]?.runId,
    });
  });

  it('uses the canonical Web current turn as the implicit research query', async () => {
    const fixture = await createFixture('repair');
    const repeatedQuery = 'REPEATED_CURRENT_QUERY_TOKEN';
    const priorTranscript = [
      '## user',
      repeatedQuery,
      '',
      '## assistant',
      'PRIOR_ASSISTANT_ONLY_MARKER',
    ].join('\n');
    const fullTranscript = `${priorTranscript}\n\n## user\n${repeatedQuery}`;
    const body = {
      ...createRunRequest(fixture, fullTranscript),
      currentPrompt: repeatedQuery,
      priorTranscript,
      research: { enabled: true },
    };

    queueFixtureIds(fixture);
    await postRun(started!.url, body);
    await waitForTask(fixture.taskExecutionId, 'completed');

    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(3);
    const bundle = parseOdNextPromptBundleV2(invocations[0]!.stdin);
    expect(bundle.userFirstPrompt).toBe(repeatedQuery);
    expect(bundle.context.priorTranscript).toContain(priorTranscript);
    // No separator arithmetic: the contract is addressable as its own node.
    const researchContract = bundle.context.researchCommandContract ?? '';
    expect(researchContract).toContain('## Research command contract');
    expect(researchContract).toContain(`Canonical query for this run:\n\n\`\`\`text\n${repeatedQuery}\n\`\`\``);
    expect(researchContract.match(new RegExp(repeatedQuery, 'g'))).toHaveLength(1);
    expect(researchContract).not.toContain('PRIOR_ASSISTANT_ONLY_MARKER');
    expect(researchContract).not.toContain('## assistant');
  });

  it('blocks the durable task when the selected agent exits before publishing a session', async () => {
    const fixture = await createFixture('repair');
    await writeFile(`${fixture.logPath}.fail-start`, '1');

    queueFixtureIds(fixture);
    const created = await postRun(
      started!.url,
      createRunRequest(fixture, 'Update the existing operator header.'),
    );
    const terminal = await waitForRunTerminal(started!.url, created.runId as string);

    expect(terminal).toMatchObject({
      status: 'failed',
      errorCode: 'AGENT_EXECUTION_FAILED',
      strategyTask: {
        taskExecutionId: fixture.taskExecutionId,
        outcome: 'blocked',
        terminal: true,
      },
    });
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)).toMatchObject({
      outcome: 'blocked',
      latestRunId: fixture.initialRunId,
    });
  });

  it('fails a mapped Run before live Skill staging when its frozen package row is missing', async () => {
    const fixture = await createFixture('repair');
    const body = createRunRequest(fixture, 'Do not fall back to a live Skill.');
    queueFixtureIds(fixture);
    await postRun(started!.url, body);
    await waitForTask(fixture.taskExecutionId, 'completed');
    const invocationCount = (await readProjectInvocations(fixture.logPath, fixture.projectId)).length;
    database().prepare(
      'DELETE FROM strategy_task_frozen_skill_packages WHERE task_execution_id = ?',
    ).run(fixture.taskExecutionId);
    const retry = await fetch(`${started!.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: 'OD_NEXT_SKILL_SNAPSHOT_INVALID' },
    });
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(invocationCount);
  });

  it('fails a mapped Run before live Skill staging when its frozen package is tampered', async () => {
    const fixture = await createFixture('repair');
    const body = createRunRequest(fixture, 'Do not use a tampered Skill package.');
    queueFixtureIds(fixture);
    await postRun(started!.url, body);
    await waitForTask(fixture.taskExecutionId, 'completed');
    const invocationCount = (await readProjectInvocations(fixture.logPath, fixture.projectId)).length;
    database().prepare(`
      UPDATE strategy_task_frozen_skill_packages
         SET payload_json = replace(payload_json, '"selections":[]', '"selections":[{}]')
       WHERE task_execution_id = ?
    `).run(fixture.taskExecutionId);

    const retry = await fetch(`${started!.url}/api/runs`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(retry.status).toBe(409);
    await expect(retry.json()).resolves.toMatchObject({
      error: { code: 'OD_NEXT_SKILL_SNAPSHOT_INVALID' },
    });
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(invocationCount);
  });

  it('does not report unfinished work when the task delivered under a stale plan', async () => {
    // QA on project 3ffc55f1: the turn wrote its deliverable and OD Next
    // settled the task `completed`, but the agent's last plan snapshot still
    // showed pending items. The Run was stamped endedWithUnfinishedWork, so the
    // chat offered to "continue remaining tasks" on finished work — and taking
    // that offer opened a second task that could only block on `no_artifact`.
    const fixture = await createFixture('repair');
    queueFixtureIds(fixture);
    await postRun(started!.url, createRunRequest(fixture, 'Build the coach prototype.'));
    const task = await waitForTask(fixture.taskExecutionId, 'completed');
    const terminal = await waitForRunTerminal(started!.url, task.latestRunId);

    expect(terminal).toMatchObject({
      status: 'succeeded',
      strategyTask: { outcome: 'completed', terminal: true },
    });
    // The stale snapshot really did reach the Run — otherwise this asserts nothing.
    const events = await readFile(terminal.eventsLogPath, 'utf8');
    expect(events).toContain('Deliver the runnable entry');
    expect(terminal.endedWithUnfinishedWork).toBe(false);

    // …and it must survive a reload. The delivered verdict lives only in the
    // task store — the messages table has no strategy column — so the
    // conversation read path has to project it, or reopening the project
    // brings the bogus "continue remaining tasks" offer straight back.
    const reloaded = await fetch(
      `${started!.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`,
    );
    expect(reloaded.status).toBe(200);
    const { messages } = await reloaded.json() as {
      messages: Array<{ role: string; runId?: string; strategyTaskDelivered?: boolean }>;
    };
    const deliveredTurn = messages.find((message) => message.runId === task.latestRunId);
    expect(deliveredTurn).toBeDefined();
    expect(deliveredTurn!.strategyTaskDelivered).toBe(true);
  });

  it('fails closed when daemon-owned execution preflight rejects', async () => {
    const fixture = await createFixture('repair');
    await stopServer(started);
    started = await startDaemon(async () => {
      throw new Error('fixture preflight unavailable');
    });

    queueFixtureIds(fixture);
    await postRun(started.url, createRunRequest(fixture, 'Build the operator prototype.'));
    const task = await waitForTask(fixture.taskExecutionId, 'blocked');
    const terminal = await waitForRunTerminal(started.url, task.latestRunId);

    expect(task.runs.map((run) => run.inputStage)).toEqual(['request']);
    expect(terminal).toMatchObject({
      status: 'failed',
      errorCode: 'OD_NEXT_EXECUTION_PREFLIGHT_FAILED',
      strategyTask: {
        taskExecutionId: fixture.taskExecutionId,
        outcome: 'blocked',
        terminal: true,
      },
    });
  });

  it('does not allocate a stale continuation when cancel wins during execution preflight', async () => {
    const fixture = await createFixture('repair');
    await stopServer(started);
    let enterResolver!: () => void;
    let releaseResolver!: () => void;
    const resolverEntered = new Promise<void>((resolve) => { enterResolver = resolve; });
    const resolverGate = new Promise<void>((resolve) => { releaseResolver = resolve; });
    started = await startDaemon(async () => {
      enterResolver();
      await resolverGate;
      return EXECUTION_PREFLIGHT;
    });

    queueFixtureIds(fixture);
    await postRun(started.url, createRunRequest(fixture, 'Build the operator prototype.'));
    await resolverEntered;
    const awaiting = getStrategyTaskExecution(database(), fixture.taskExecutionId);
    expect(awaiting?.runs.map((run) => run.inputStage)).toEqual(['request']);
    const activeRunId = awaiting?.activeRunId;
    expect(activeRunId).toBeTruthy();

    const cancelResponse = await fetch(
      `${started.url}/api/runs/${encodeURIComponent(activeRunId!)}/cancel`,
      { method: 'POST' },
    );
    expect(cancelResponse.status).toBe(200);
    releaseResolver();

    const task = await waitForTask(fixture.taskExecutionId, 'canceled');
    const terminal = await waitForRunTerminal(started.url, activeRunId!);
    expect(task.runs.map((run) => run.inputStage)).toEqual(['request']);
    expect(terminal).toMatchObject({
      status: 'canceled',
      strategyTask: { outcome: 'canceled', terminal: true },
    });
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(1);
  });

  it('runs a verified complex package chain and requires normalized Child evidence', async () => {
    const capabilityResult = resolveBundledOdNextRuntimeCapability({
      agentId: 'codex',
      agentCliVersion: 'codex-cli 0.147.0',
      capturedAt: 100,
    });
    expect(capabilityResult.reason).toBe('capability_resolved');
    if (!capabilityResult.snapshot) throw new Error('expected verified Codex capability');
    const capability = capabilityResult.snapshot;
    const fixture = await createFixture('complex', { capability });
    await stopServer(started);
    started = await startDaemon(
      () => EXECUTION_PREFLIGHT,
      ({ phase, taskExecutionId, runId }) => {
        if (phase === 'eligibility') return { capabilitySnapshot: capability };
        const rootId = `task-run:${runId}`;
        const fact = (
          id: string,
          kind: 'task_run' | 'child_agent',
          status: 'running' | 'completed',
          packageId?: string,
        ) => normalizeAgentObservationV1({
          identity: {
            observationId: id,
            taskExecutionId,
            runId,
            taskRunIndex: 1,
            ...(kind === 'child_agent' ? { parentObservationId: rootId } : {}),
          },
          kind,
          stage: 'production',
          status,
          ...(packageId ? { attributes: { buildPackageId: packageId } } : {}),
        });
        return {
          capabilitySnapshot: capability,
          taskRunObservationId: rootId,
          observations: [
            fact(rootId, 'task_run', 'running'),
            fact('child-shell', 'child_agent', 'running', 'shell'),
            fact('child-shell', 'child_agent', 'completed', 'shell'),
            fact('child-flow', 'child_agent', 'running', 'flow'),
            fact('child-flow', 'child_agent', 'completed', 'flow'),
            fact(rootId, 'task_run', 'completed'),
          ],
        };
      },
    );

    queueFixtureIds(fixture);
    await postRun(started.url, createRunRequest(fixture, 'Build the complex prototype.'));
    const terminal = await waitForTask(fixture.taskExecutionId, 'completed');
    expect(terminal).toMatchObject({
      executionMode: 'complex',
      terminalRunId: terminal.runs[1]?.runId,
    });
    expect(terminal.runs.map((run) => run.inputStage)).toEqual(['request', 'production']);
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(2);
  });

  it('binds native Claude Agents to complex Build Packages and completes from durable facts', async () => {
    const capabilityResult = resolveBundledOdNextRuntimeCapability({
      agentId: 'claude',
      agentCliVersion: '2.1.233 (Claude Code)',
    });
    expect(capabilityResult.reason).toBe('capability_resolved');
    if (!capabilityResult.snapshot) throw new Error('expected verified Claude capability');
    const fixture = await createFixture('complex', {
      selectedAgentId: 'claude',
      capability: capabilityResult.snapshot,
    });
    if (!started) throw new Error('expected running daemon fixture');

    queueFixtureIds(fixture);
    await postRun(started.url, createRunRequest(fixture, 'Build the complex prototype.'));
    const terminal = await waitForTask(fixture.taskExecutionId, 'completed');
    expect(terminal).toMatchObject({ executionMode: 'complex' });
    expect(terminal.runs.map((run) => run.inputStage)).toEqual(['request', 'production']);

    const invocations = await readClaudeInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(2);
    const production = invocations[1]!;
    const agentsFlag = production.argv.indexOf('--agents');
    expect(agentsFlag).toBeGreaterThan(-1);
    const nativeAgents = JSON.parse(production.argv[agentsFlag + 1]!) as Record<string, unknown>;
    const handles = Object.keys(nativeAgents);
    expect(handles).toHaveLength(2);
    expect(handles.every((handle) => /^od-build-\d+-[a-f0-9]{16}$/.test(handle))).toBe(true);
    expect(JSON.stringify(nativeAgents)).not.toContain('shell');
    expect(JSON.stringify(nativeAgents)).not.toContain('flow');
    const productionPrompt = (JSON.parse(production.stdin) as any).message.content[0].text;
    expect(productionPrompt).toContain('"buildPackageId":"shell"');
    expect(productionPrompt).toContain('"buildPackageId":"flow"');
    expect(production.argv).toContain('--forward-subagent-text');

    const productionRun = await getRun(started.url, terminal.runs[1]!.runId);
    const childFacts = await readClaudeChildRuntimeFacts(productionRun.eventsLogPath);
    expect(childFacts.filter((fact) => fact.state === 'completed').map((fact) => (
      fact.buildPackageId
    ))).toEqual(['shell', 'flow']);
    const childToolFacts = await readClaudeChildToolRuntimeFacts(productionRun.eventsLogPath);
    expect(childToolFacts.filter((fact) => fact.state === 'completed').map((fact) => (
      [fact.buildPackageId, fact.toolName]
    ))).toEqual([['shell', 'Bash'], ['flow', 'Bash']]);
    const persistedEvents = await readFile(productionRun.eventsLogPath, 'utf8');
    expect(persistedEvents).not.toContain('INTERNAL_CHILD_TEXT_SHOULD_NOT_PERSIST');
    expect(persistedEvents).not.toContain('INTERNAL_CHILD_TOOL_INPUT');
    expect(persistedEvents).not.toContain('INTERNAL_CHILD_TOOL_OUTPUT');
  });

  async function createFixture(
    mode: 'repair' | 'direct' | 'complex',
    {
      selectedAgentId = 'codex',
      capability,
    }: {
      selectedAgentId?: string;
      capability?: OdNextRuntimeCapabilitySnapshotV1;
    } = {},
  ) {
    const suffix = `${mode}-${Date.now()}-${++sequence}`;
    if (mode !== 'direct') {
      const publicFixture = await createPublicRolloutFixture(`chain-${suffix}`, 'design');
      started = publicFixture.started;
      binDir = publicFixture.binDir;
      clearOdNextRolloutStop(database());
      process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
      process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
      const template = await createStrategyTemplate();
      const initialRunId = `019fffab-0000-7000-8000-${sequence
        .toString(16)
        .padStart(12, '0')}`;
      const taskOwnerUuid = `019fffaa-0000-7000-8000-${sequence
        .toString(16)
        .padStart(12, '0')}`;
      const taskExecutionId = `odnext_${taskOwnerUuid.replaceAll('-', '')}`;
      const plan = planContract(template.snapshotId, template.strategy, mode, capability);
      const { bin, logPath } = selectedAgentId === 'claude'
        ? await writeStrategyClaude(binDir, plan)
        : await writeStrategyCodex(binDir, mode, plan);
      const configResponse = await fetch(`${started.url}/api/app-config`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          agentId: selectedAgentId,
          agentCliEnv: selectedAgentId === 'claude'
            ? { claude: { CLAUDE_BIN: bin } }
            : { codex: { CODEX_BIN: bin, CODEX_HOME: binDir } },
          telemetry: { metrics: false, content: false, artifactManifest: false },
          privacyDecisionAt: Date.now(),
        }),
      });
      expect(configResponse.status).toBe(200);
      expect((await fetch(`${started.url}/api/agents`)).status).toBe(200);
      return {
        projectId: publicFixture.projectId,
        conversationId: publicFixture.conversationId,
        snapshotId: template.snapshotId,
        useAutomaticSnapshot: true,
        initialRunId,
        taskOwnerUuid,
        taskExecutionId,
        logPath,
        agentId: selectedAgentId,
      };
    }
    binDir = await mkdtemp(path.join(os.tmpdir(), `od-next-server-${mode}-`));
    started = await startDaemon();
    const projectId = `od-next-server-${suffix}`;
    const projectResponse = await fetch(`${started.url}/api/projects`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: projectId,
        name: `OD Next ${mode} server test`,
        metadata: { kind: 'prototype' },
        conversationMode: mode === 'direct' ? 'chat' : 'design',
        skipDiscoveryBrief: true,
      }),
    });
    expect(projectResponse.status).toBe(200);
    const projectBody = await projectResponse.json() as {
      conversationId: string;
      appliedPluginSnapshotId?: string;
      project?: {
        metadata?: { scenarioBinding?: { snapshotId: string } };
      };
    };
    const project = { id: projectId, conversationId: projectBody.conversationId };
    if (mode !== 'direct') {
      expect(projectBody.project?.metadata?.scenarioBinding).toMatchObject({
        provenance: 'automatic_default',
        taskProfile: 'prototype',
      });
    }

    const snapshot = mode === 'direct'
      ? await createStrategySnapshot(project.id, project.conversationId)
      : await createStrategyTemplate();
    if (!snapshot?.strategy) throw new Error('OD Next strategy snapshot fixture is missing');
    const initialRunId = `019fffab-0000-7000-8000-${sequence
      .toString(16)
      .padStart(12, '0')}`;
    const taskOwnerUuid = mode === 'direct'
      ? null
      : `019fffaa-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
    const taskExecutionId = taskOwnerUuid
      ? `odnext_${taskOwnerUuid.replaceAll('-', '')}`
      : `task-${suffix}`;
    if (mode === 'direct') {
      createStrategyTaskExecution(database(), {
        taskExecutionId,
        projectId: project.id,
        conversationId: project.conversationId,
        snapshotId: snapshot.snapshotId,
        selectedAgentId,
        initialRunId,
        ...strategyTaskCreateIdentityFixture(),
      });
      prepareStrategyRequest(database(), {
        taskExecutionId,
        preference: 'auto',
        directEdit: DIRECT_ELIGIBLE,
        intake: INTAKE_PASSED,
        execution: EXECUTION_PREFLIGHT,
      });
    } else {
      process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
      process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    }

    const plan = planContract(snapshot.snapshotId, snapshot.strategy!, mode, capability);
    const { bin, logPath } = selectedAgentId === 'claude'
      ? await writeStrategyClaude(binDir, plan)
      : await writeStrategyCodex(binDir, mode, plan);
    const configResponse = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        agentId: selectedAgentId,
        agentCliEnv: selectedAgentId === 'claude'
          ? { claude: { CLAUDE_BIN: bin } }
          : { codex: { CODEX_BIN: bin, CODEX_HOME: binDir } },
        telemetry: { metrics: false, content: false, artifactManifest: false },
        privacyDecisionAt: Date.now(),
      }),
    });
    expect(configResponse.status).toBe(200);
    const agentsResponse = await fetch(`${started.url}/api/agents`);
    expect(agentsResponse.status).toBe(200);
    return {
      projectId: project.id,
      conversationId: project.conversationId,
      snapshotId: snapshot.snapshotId,
      useAutomaticSnapshot: mode !== 'direct',
      initialRunId,
      taskOwnerUuid,
      taskExecutionId,
      logPath,
      agentId: selectedAgentId,
    };
  }
});

async function createPublicRolloutFixture(
  label: string,
  conversationMode: 'design' | 'chat' | 'plan' = 'chat',
  pluginId?: string,
  agentCliVersion = 'codex-cli 0.147.0',
) {
  const suffix = `${label}-${Date.now()}`;
  const binDir = await mkdtemp(path.join(os.tmpdir(), `od-next-public-${label}-`));
  const { bin, logPath } = await writePublicRolloutCodex(
    binDir,
    label,
    agentCliVersion,
  );
  const started = await startDaemon();
  const projectId = `od-next-public-${suffix}`;
  const projectResponse = await fetch(`${started.url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `OD Next public ${label}`,
      metadata: { kind: 'prototype' },
      conversationMode,
      ...(pluginId ? { pluginId } : {}),
      ...(!pluginId && conversationMode === 'design'
        ? { automaticStrategyTaskProfile: 'prototype' }
        : {}),
      skipDiscoveryBrief: true,
    }),
  });
  expect(projectResponse.status).toBe(200);
  const { conversationId, appliedPluginSnapshotId, project } = await projectResponse.json() as {
    conversationId: string;
    appliedPluginSnapshotId?: string;
    project?: {
      metadata?: {
        scenarioBinding?: { pluginId: string; snapshotId: string };
        strategyBinding?: { taskProfile: ProjectScenarioTaskProfile };
      };
    };
  };
  const configResponse = await fetch(`${started.url}/api/app-config`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      agentId: 'codex',
      agentCliEnv: { codex: { CODEX_BIN: bin, CODEX_HOME: binDir } },
      telemetry: { metrics: false, content: false, artifactManifest: false },
      privacyDecisionAt: Date.now(),
    }),
  });
  expect(configResponse.status).toBe(200);
  const agentsResponse = await fetch(`${started.url}/api/agents`);
  expect(agentsResponse.status).toBe(200);
  return {
    started,
    binDir,
    projectId,
    conversationId,
    appliedPluginSnapshotId,
    projectMetadata: project?.metadata,
    logPath,
  };
}

async function createProjectForScenario(
  url: string,
  label: string,
  metadata: Record<string, unknown>,
  plugin?: {
    pluginId?: string;
    pluginInputs: Record<string, unknown>;
  },
  automaticStrategyTaskProfile?: ProjectScenarioTaskProfile,
) {
  const projectId = `od-next-public-${label}-${Date.now()}`;
  const response = await fetch(`${url}/api/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      id: projectId,
      name: `OD Next public ${label}`,
      metadata,
      ...plugin,
      ...(automaticStrategyTaskProfile ? { automaticStrategyTaskProfile } : {}),
      conversationMode: 'design',
      skipDiscoveryBrief: true,
    }),
  });
  const body = await response.json() as {
    conversationId: string;
    appliedPluginSnapshotId?: string;
    project?: {
      metadata?: {
        scenarioBinding?: {
          provenance: string;
          pluginId: string;
          snapshotId: string;
          taskProfile?: string;
        };
        strategyBinding?: {
          schemaVersion: number;
          provenance: string;
          taskProfile: ProjectScenarioTaskProfile;
          boundAt: number;
        };
      };
    };
  };
  expect(response.status, JSON.stringify(body)).toBe(200);
  return {
    projectId,
    conversationId: body.conversationId,
    appliedPluginSnapshotId: body.appliedPluginSnapshotId,
    metadata: body.project?.metadata,
  };
}

function publicRunRequest(
  fixture: { projectId: string; conversationId: string },
  message: string,
  id: string,
) {
  return {
    projectId: fixture.projectId,
    conversationId: fixture.conversationId,
    agentId: 'codex',
    userMessageId: `user-${id}`,
    assistantMessageId: `assistant-${id}`,
    clientRequestId: id,
    message,
    currentPrompt: message,
  };
}

async function writePublicRolloutCodex(
  dir: string,
  label: string,
  agentCliVersion = 'codex-cli 0.147.0',
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, `codex-public-${label}`);
  const logPath = path.join(dir, `codex-public-${label}.jsonl`);
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const argv = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
if (argv.includes('--version')) { console.log(${JSON.stringify(agentCliVersion)}); process.exit(0); }
if (argv.includes('--help')) { console.log('Usage: codex exec'); process.exit(0); }
let stdin = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', () => {
  fs.appendFileSync(logPath, JSON.stringify({ argv, stdin, cwd: process.cwd(), startedAt: Date.now() }) + '\\n');
  console.log(JSON.stringify({ type: 'thread.started', thread_id: 'public-rollout-session' }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  if (stdin.includes('Hold the public rollout run open until canceled.')) {
    setInterval(() => {}, 1 << 30);
    return;
  }
  console.log(JSON.stringify({
    type: 'item.completed',
    item: { id: 'answer', type: 'agent_message', text: 'Ordinary public run completed.' },
  }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }));
  setTimeout(() => process.exit(0), 5);
});
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, logPath };
}

async function runOdCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const env = { ...process.env };
  delete env.NODE_OPTIONS;
  return execFileP(process.execPath, [TSX_CLI, CLI_SRC, ...args], {
    cwd: DAEMON_ROOT,
    env,
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function database() {
  const dataDir = process.env.OD_DATA_DIR;
  if (!dataDir) throw new Error('OD_DATA_DIR is required');
  return openDatabase(process.cwd(), { dataDir });
}

async function readDurableRunState(runId: string): Promise<Record<string, unknown>> {
  const dataDir = process.env.OD_DATA_DIR;
  if (!dataDir) throw new Error('OD_DATA_DIR is required');
  return JSON.parse(await readFile(
    path.join(dataDir, 'runs', runId, 'state.json'),
    'utf8',
  )) as Record<string, unknown>;
}

async function startDaemon(
  resolver: NonNullable<StartServerOptions['odNextExecutionPreflightResolver']> =
    () => EXECUTION_PREFLIGHT,
  complexResolver: StartServerOptions['odNextComplexProductionResolver'] = null,
): Promise<StartedServer> {
  return await startServer({
    port: 0,
    returnServer: true,
    odNextExecutionPreflightResolver: resolver,
    odNextComplexProductionResolver: complexResolver,
  }) as StartedServer;
}

async function stopServer(server: StartedServer | null): Promise<void> {
  if (!server) return;
  await Promise.resolve(server.shutdown?.());
  if (server.server.listening) {
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  }
}

async function createStrategySnapshot(
  projectId: string,
  conversationId: string,
  linkToProject = true,
) {
  const source = path.resolve(
    import.meta.dirname,
    '../../../plugins/_official/scenarios/od-next-strategy',
  );
  const resolved = await resolvePluginFolder({
    folder: source,
    folderId: 'od-next-strategy',
    sourceKind: 'bundled',
    source,
    trust: 'bundled',
  });
  if (!resolved.ok) throw new Error(resolved.errors.join('; '));
  const plugin = resolved.record;
  upsertInstalledPlugin(database(), plugin);
  const strategy = createBundledStrategyBindingV2({ plugin, taskType: 'prototype' });
  const snapshot = createSnapshot(database(), {
    projectId,
    conversationId,
    runId: null,
    pluginId: 'od-next-strategy',
    pluginVersion: '2.0.0',
    manifestSourceDigest: 'od-next-server-test-manifest',
    strategy,
    taskKind: 'new-generation',
    inputs: {},
    resolvedContext: { items: [] },
    pipeline: {
      stages: OD_NEXT_PROMPT_STAGE_CONTRACT_V2.map((stage) => ({
        id: stage.id,
        atoms: [...stage.atoms],
      })),
    },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
  });
  if (linkToProject) linkSnapshotToProject(database(), snapshot.snapshotId, projectId);
  return snapshot;
}

async function createStrategyTemplate() {
  const source = path.resolve(
    import.meta.dirname,
    '../../../plugins/_official/scenarios/od-next-strategy',
  );
  const resolved = await resolvePluginFolder({
    folder: source,
    folderId: 'od-next-strategy',
    sourceKind: 'bundled',
    source,
    trust: 'bundled',
  });
  if (!resolved.ok) throw new Error(resolved.errors.join('; '));
  return {
    snapshotId: '00000000-0000-4000-8000-000000000000',
    strategy: createBundledStrategyBindingV2({ plugin: resolved.record, taskType: 'prototype' }),
  };
}

function planContract(
  snapshotId: string,
  strategy: AppliedStrategyBindingV2,
  mode: 'repair' | 'direct' | 'complex' = 'repair',
  capability = complexCapabilitySnapshot(),
): OpenDesignPlanContractV2 {
  return {
    schema: 'open-design.plan-contract/v2',
    strategy: {
      id: 'od-next-strategy',
      version: strategy.version,
      packageHash: strategy.packageHash,
      snapshotId,
    },
    taskProfile: {
      schemaVersion: '2',
      taskType: 'prototype',
      taskProfileVersion: strategy.selectedTaskProfile.version,
      goal: 'Build an operator prototype',
      contextAndAudience: 'Product operators',
      inputsAndReferences: ['request'],
      constraints: [],
      canonicalDeliverable: { id: 'prototype', kind: 'prototype', format: 'html' },
      requiredDeliverables: [{ id: 'prototype', kind: 'prototype' }],
      designSpec: {
        source: 'resolved-baseline',
        version: '1',
        decisions: { palette: 'neutral' },
      },
      buildRequirements: [{ id: 'build', text: 'Build the prototype.' }],
      assumptions: [],
      risks: [],
      taskSpecific: {},
    },
    fullPlan: {
      executionMode: mode === 'complex' ? 'complex' : 'simple',
      steps: mode === 'complex'
        ? [
            { id: 'shell', objective: 'Build shell', outputs: ['shell'] },
            { id: 'flow', objective: 'Build flow', outputs: ['flow'], dependsOn: ['shell'] },
          ]
        : [{ id: 'build', objective: 'Build', outputs: ['prototype'] }],
      readinessArtifacts: [],
      buildPackages: mode === 'complex'
        ? [
            {
              id: 'shell', objective: 'Build shell', inputs: ['design-spec'], outputs: ['shell'],
              sharedConstraints: ['Use the frozen design spec.'], dependsOn: [],
              allowedResources: ['project-source'],
            },
            {
              id: 'flow', objective: 'Build flow', inputs: ['shell'], outputs: ['flow'],
              sharedConstraints: ['Use the frozen design spec.'], dependsOn: ['shell'],
              allowedResources: ['project-source'],
            },
          ]
        : [],
    },
    runManifest: {
      selectedAgentId: mode === 'complex' ? capability.agentId : 'codex',
      capabilitySnapshotHash: mode === 'complex'
        ? capability.snapshotHash.slice('sha256:'.length)
        : 'c'.repeat(64),
      inputRefs: ['request'],
      productionRoutes: ['html'],
      preflight: { intake: 'passed', execution: 'passed' },
    },
    decisionSummary: {
      goal: 'Build an operator prototype',
      deliverables: ['prototype'],
      keyConstraints: [],
      assumptions: [],
      risks: [],
      openDecisions: [],
    },
  };
}

function runtimeState(input: {
  route?: 'direct_edit' | 'full_plan';
  inputStage?: 'request' | 'contract_repair' | 'production';
  outcome: 'plan_ready' | 'completed';
  executionMode?: 'simple' | 'complex';
}) {
  return {
    schema: 'open-design.strategy-state/v2',
    route: input.route ?? 'full_plan',
    inputStage: input.inputStage ?? 'request',
    outcome: input.outcome,
    executionMode: input.executionMode ?? 'simple',
    reasonCodes: [],
  };
}

function machineBlock(tag: string, value: unknown, fenced = false): string {
  const json = JSON.stringify(value);
  return `<${tag}>\n${fenced ? `\`\`\`json\n${json}\n\`\`\`` : json}\n</${tag}>`;
}

async function writeStrategyCodex(
  dir: string,
  mode: 'repair' | 'direct' | 'complex',
  plan: OpenDesignPlanContractV2,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, `codex-${mode}`);
  const logPath = path.join(dir, `codex-${mode}.jsonl`);
  const initialRepair = [
    'Prepared a simple plan.',
    machineBlock('open-design-plan-contract', plan, true),
    machineBlock('open-design-runtime-state', runtimeState({ outcome: 'plan_ready' })),
  ].join('\n');
  const repaired = [
    machineBlock('open-design-plan-contract', plan),
    machineBlock('open-design-runtime-state', runtimeState({
      inputStage: 'contract_repair',
      outcome: 'plan_ready',
    })),
  ].join('\n');
  const production = machineBlock('open-design-runtime-state', runtimeState({
    inputStage: 'production',
    outcome: 'completed',
  }));
  const direct = machineBlock('open-design-runtime-state', runtimeState({
    route: 'direct_edit',
    outcome: 'completed',
  }));
  const complexPlan = [
    'Prepared a complex plan.',
    machineBlock('open-design-plan-contract', plan),
    machineBlock('open-design-runtime-state', runtimeState({
      outcome: 'plan_ready', executionMode: 'complex',
    })),
  ].join('\n');
  const complexProduction = machineBlock('open-design-runtime-state', runtimeState({
    inputStage: 'production', outcome: 'completed', executionMode: 'complex',
  }));

  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
const mode = ${JSON.stringify(mode)};
if (argv.includes('--version')) { console.log('codex-cli 0.147.0'); process.exit(0); }
if (argv.includes('--help')) { console.log('Usage: codex exec [--sandbox MODE]'); process.exit(0); }
if (fs.existsSync(logPath + '.fail-start')) {
  process.stderr.write('fixture: process exited before session start\\n');
  process.exit(1);
}
let stdin = '';
let finished = false;
let staleTodoList = false;
function finish() {
  if (finished) return;
  finished = true;
  const startedAt = Date.now();
  const taskInputDir = process.env.OD_TASK_INPUT_DIR || null;
  const taskInputFiles = taskInputDir && fs.existsSync(path.join(taskInputDir, 'attachments'))
    ? fs.readdirSync(path.join(taskInputDir, 'attachments')).sort().map((name) => ({
        name,
        content: fs.readFileSync(path.join(taskInputDir, 'attachments', name), 'utf8'),
      }))
    : [];
  fs.appendFileSync(logPath, JSON.stringify({ argv, stdin, cwd: process.cwd(), startedAt, taskInputDir, taskInputFiles }) + '\\n');
  if (argv.includes('resume') && (argv.includes('-C') || argv.includes('--add-dir'))) {
    process.stderr.write("error: unexpected argument '-C' found\\n");
    process.exit(2);
  }
  let text;
  if (mode === 'direct') {
    fs.writeFileSync(path.join(process.cwd(), 'index.html'), '<!doctype html><title>Direct</title>');
    text = ${JSON.stringify(direct)};
  } else if (mode === 'complex' && stdin.includes('native continuation — production')) {
    fs.writeFileSync(path.join(process.cwd(), 'index.html'), '<!doctype html><title>Complex</title>');
    text = ${JSON.stringify(complexProduction)};
  } else if (mode === 'complex') {
    text = ${JSON.stringify(complexPlan)};
  } else if (stdin.includes('native continuation — contract_repair')) {
    text = ${JSON.stringify(repaired)};
  } else if (stdin.includes('native continuation — production')) {
    fs.writeFileSync(path.join(process.cwd(), 'index.html'), '<!doctype html><title>Production</title>');
    staleTodoList = true;
    text = ${JSON.stringify(production)};
  } else {
    text = ${JSON.stringify(initialRepair)};
  }
  const snapshotPath = logPath + '.snapshot';
  // The Bundle publishes the applied snapshot as a <recipe_identity> attribute
  // and inside <runtime_facts>; the older Markdown line and inline example value
  // are kept as fallbacks so this fixture can read either shape.
  const detectedSnapshot = /applied_snapshot=[^a-f0-9]*([a-f0-9-]{36})/.exec(stdin)?.[1]
    || /appliedSnapshot[^a-f0-9]*([a-f0-9-]{36})/.exec(stdin)?.[1]
    || /applied snapshot:[^a-f0-9]*([a-f0-9-]{36})/.exec(stdin)?.[1]
    || /"snapshotId"\\s*:\\s*"([a-f0-9-]{36})"/.exec(stdin)?.[1];
  if (detectedSnapshot) fs.writeFileSync(snapshotPath, detectedSnapshot);
  const appliedSnapshot = detectedSnapshot
    || (fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf8') : null);
  if (appliedSnapshot) {
    text = text.replaceAll(${JSON.stringify(plan.strategy.snapshotId)}, appliedSnapshot);
  }
  console.log(JSON.stringify({ type: 'thread.started', thread_id: ${JSON.stringify(THREAD_ID)} }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  if (staleTodoList) {
    // Observed on real turns: the deliverable is written, but the LAST plan
    // snapshot the agent emits still carries unchecked items.
    console.log(JSON.stringify({ type: 'item.completed', item: { id: 'todo-1', type: 'todo_list', items: [
      { text: 'Draft the layout', completed: true },
      { text: 'Deliver the runnable entry', completed: false },
    ] } }));
  }
  console.log(JSON.stringify({ type: 'item.completed', item: { id: 'answer', type: 'agent_message', text } }));
  console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5 } }));
  setTimeout(() => process.exit(0), 5);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; });
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, logPath };
}

async function writeStrategyClaude(
  dir: string,
  plan: OpenDesignPlanContractV2,
): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, 'claude-complex');
  const logPath = path.join(dir, 'claude-complex.jsonl');
  const complexPlan = [
    'Prepared a complex plan.',
    machineBlock('open-design-plan-contract', plan),
    machineBlock('open-design-runtime-state', runtimeState({
      outcome: 'plan_ready',
      executionMode: 'complex',
    })),
  ].join('\n');
  const complexProduction = machineBlock('open-design-runtime-state', runtimeState({
    inputStage: 'production',
    outcome: 'completed',
    executionMode: 'complex',
  }));
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
if (argv.includes('--version')) { fs.writeSync(1, '2.1.233 (Claude Code)\\n'); process.exit(0); }
if (argv.includes('--help')) {
  fs.writeSync(1, 'Usage: claude -p [--include-partial-messages] [--forward-subagent-text] [--agents JSON] [--resume ID]\\n');
  process.exit(0);
}
let stdin = '';
let finished = false;
function w(value) { fs.writeSync(1, JSON.stringify(value) + '\\n'); }
function finish() {
  if (finished || stdin.length === 0) return;
  finished = true;
  fs.appendFileSync(logPath, JSON.stringify({ argv, stdin, cwd: process.cwd(), startedAt: Date.now() }) + '\\n');
  const production = stdin.includes('native continuation — production');
  const snapshotPath = logPath + '.snapshot';
  // The Bundle publishes the applied snapshot as a <recipe_identity> attribute
  // and inside <runtime_facts>; the older Markdown line and inline example value
  // are kept as fallbacks so this fixture can read either shape.
  const detectedSnapshot = /applied_snapshot=[^a-f0-9]*([a-f0-9-]{36})/.exec(stdin)?.[1]
    || /appliedSnapshot[^a-f0-9]*([a-f0-9-]{36})/.exec(stdin)?.[1]
    || /applied snapshot:[^a-f0-9]*([a-f0-9-]{36})/.exec(stdin)?.[1]
    || /"snapshotId"\\s*:\\s*"([a-f0-9-]{36})"/.exec(stdin)?.[1];
  if (detectedSnapshot) fs.writeFileSync(snapshotPath, detectedSnapshot);
  const appliedSnapshot = detectedSnapshot
    || (fs.existsSync(snapshotPath) ? fs.readFileSync(snapshotPath, 'utf8') : null);
  let text = production ? ${JSON.stringify(complexProduction)} : ${JSON.stringify(complexPlan)};
  if (appliedSnapshot) text = text.replaceAll(${JSON.stringify(plan.strategy.snapshotId)}, appliedSnapshot);
  w({ type: 'system', subtype: 'init', model: 'claude-haiku-4-5', session_id: 'claude-complex-session', claude_code_version: '2.1.233' });
  if (production) {
    const agentsIndex = argv.indexOf('--agents');
    const agents = agentsIndex >= 0 ? JSON.parse(argv[agentsIndex + 1]) : {};
    const handles = Object.keys(agents);
    for (let index = 0; index < handles.length; index += 1) {
      const handle = handles[index];
      const toolId = 'native-agent-' + index;
      w({
        type: 'assistant', parent_tool_use_id: null,
        message: { id: 'delegate-' + index, stop_reason: 'tool_use', content: [{
          type: 'tool_use', id: toolId, name: 'Agent',
          input: { prompt: 'Execute the daemon-bound package only.', subagent_type: handle, model: 'haiku', isolation: 'worktree' },
        }] },
      });
      w({
        type: 'assistant', parent_tool_use_id: toolId,
        message: { id: 'child-work-' + index, stop_reason: 'tool_use', content: [
          { type: 'text', text: 'INTERNAL_CHILD_TEXT_SHOULD_NOT_PERSIST' },
          { type: 'tool_use', id: 'child-tool-' + index, name: 'Bash', input: { command: 'INTERNAL_CHILD_TOOL_INPUT' } },
        ] },
      });
      w({
        type: 'user', parent_tool_use_id: toolId,
        message: { content: [{ type: 'tool_result', tool_use_id: 'child-tool-' + index, content: 'INTERNAL_CHILD_TOOL_OUTPUT' }] },
      });
      w({
        type: 'user',
        message: { content: [{ type: 'tool_result', tool_use_id: toolId, content: 'completed' }] },
        tool_use_result: {
          status: 'completed', agentId: 'child-' + index, agentType: handle,
          resolvedModel: 'claude-haiku-4-5', totalDurationMs: 10 + index,
          totalTokens: 3, usage: { input_tokens: 2, output_tokens: 1 },
        },
      });
    }
    fs.writeFileSync(path.join(process.cwd(), 'index.html'), '<!doctype html><title>Claude Complex</title>');
  }
  w({ type: 'assistant', parent_tool_use_id: null, message: { id: 'final', content: [{ type: 'text', text }], stop_reason: 'end_turn' } });
  w({ type: 'result', subtype: 'success', is_error: false, session_id: 'claude-complex-session', stop_reason: 'end_turn', usage: { input_tokens: 10, output_tokens: 5 }, duration_ms: 30 });
  setTimeout(() => process.exit(0), 10);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk) => { stdin += chunk; setTimeout(finish, 0); });
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
`, 'utf8');
  await chmod(bin, 0o755);
  return { bin, logPath };
}

async function readClaudeChildRuntimeFacts(
  eventsLogPath: string,
): Promise<Array<Record<string, any>>> {
  const raw = await readFile(eventsLogPath, 'utf8');
  return raw.trim().split('\n').flatMap((line) => {
    try {
      const record = JSON.parse(line) as { event?: string; data?: Record<string, any> };
      return record.event === 'agent'
        && record.data?.name === 'claude_child_runtime_fact'
        ? [record.data]
        : [];
    } catch {
      return [];
    }
  });
}

async function readClaudeChildToolRuntimeFacts(
  eventsLogPath: string,
): Promise<Array<Record<string, any>>> {
  const raw = await readFile(eventsLogPath, 'utf8');
  return raw.trim().split('\n').flatMap((line) => {
    try {
      const record = JSON.parse(line) as { event?: string; data?: Record<string, any> };
      return record.event === 'agent'
        && record.data?.name === 'claude_child_tool_runtime_fact'
        ? [record.data]
        : [];
    } catch {
      return [];
    }
  });
}

function createRunRequest(
  fixture: {
    projectId: string;
    conversationId: string;
    snapshotId: string;
    agentId?: string;
    useAutomaticSnapshot?: boolean;
  },
  message: string,
) {
  return {
    projectId: fixture.projectId,
    conversationId: fixture.conversationId,
    agentId: fixture.agentId ?? 'codex',
    ...(fixture.useAutomaticSnapshot
      ? {}
      : {
          appliedPluginSnapshotId: fixture.snapshotId,
        }),
    userMessageId: `user-${fixture.projectId}`,
    assistantMessageId: `assistant-${fixture.projectId}`,
    clientRequestId: `request-${fixture.projectId}`,
    message,
    currentPrompt: message,
  };
}

function queueFixtureIds(fixture: {
  taskOwnerUuid?: string | null;
  initialRunId: string;
  taskExecutionId: string;
}): void {
  if (fixture.taskOwnerUuid) {
    pendingAutomaticFixtureIdentity = fixture;
    return;
  }
  uuidControl.forced.push(fixture.initialRunId);
}

async function postRun(url: string, body: Record<string, unknown>) {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(response.headers.get('content-type')).toContain('application/json');
  const responseBody = await response.json() as Record<string, any>;
  expect(response.status, JSON.stringify(responseBody)).toBe(202);
  if (pendingAutomaticFixtureIdentity) {
    pendingAutomaticFixtureIdentity.initialRunId = responseBody.runId as string;
    pendingAutomaticFixtureIdentity.taskExecutionId = responseBody.taskExecutionId as string;
    pendingAutomaticFixtureIdentity = null;
  }
  return responseBody;
}

async function getRun(url: string, runId: string): Promise<RunStatus> {
  const response = await fetch(`${url}/api/runs/${encodeURIComponent(runId)}`);
  expect(response.status).toBe(200);
  return await response.json() as RunStatus;
}

async function waitForRunTerminal(url: string, runId: string): Promise<RunStatus> {
  const deadline = Date.now() + 10_000;
  let latest: RunStatus | null = null;
  while (Date.now() < deadline) {
    latest = await getRun(url, runId);
    if (['succeeded', 'failed', 'canceled'].includes(latest.status)) return latest;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`run ${runId} did not finish: ${JSON.stringify(latest)}`);
}

async function waitForTask(taskExecutionId: string, outcome: string) {
  const deadline = Date.now() + 10_000;
  let latest = null;
  while (Date.now() < deadline) {
    const task = getStrategyTaskExecution(database(), taskExecutionId);
    latest = task;
    if (task?.outcome === outcome) return task;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(
    `task ${taskExecutionId} did not reach ${outcome}: ${JSON.stringify(latest)}`,
  );
}

async function readProjectInvocations(logPath: string, projectId: string): Promise<Invocation[]> {
  let raw = '';
  try {
    raw = await readFile(logPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Invocation)
    .filter((invocation) =>
      invocation.argv[0] === 'exec'
      && invocation.cwd.includes(projectId),
    );
}

async function readClaudeInvocations(logPath: string, projectId: string): Promise<Invocation[]> {
  let raw = '';
  try {
    raw = await readFile(logPath, 'utf8');
  } catch {
    return [];
  }
  return raw
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as Invocation)
    .filter((invocation) => invocation.cwd.includes(projectId));
}

async function waitForInvocationCount(
  logPath: string,
  projectId: string,
  count: number,
): Promise<void> {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if ((await readProjectInvocations(logPath, projectId)).length >= count) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`project ${projectId} did not reach ${count} runtime invocations`);
}
