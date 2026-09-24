import type { Server } from 'node:http';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chmod, cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Agent, fetch as undiciFetch } from 'undici';
import * as contracts from '@open-design/contracts';
import type {
  AppliedStrategyBindingV2,
  OdNextRuntimeCapabilitySnapshotV1,
  OpenDesignPlanContractV2,
  ProjectScenarioTaskProfile,
} from '@open-design/contracts';

import {
  parseOdNextPromptBundleV2
} from '@open-design/contracts';

// Legacy-chain tests replay tasks carrying the previous frozen output contract.
// Only the prompt slot differs; parsers, persistence, claims and real server stay real.
const frozenProtocolFixture = vi.hoisted(() => ({ legacy: false }));

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
import { AGENT_DEFS } from '../src/runtimes/registry.js';
import { agentBinEnvKey } from '../src/runtimes/executables.js';
import {
  getInstalledPlugin,
  resolvePluginFolder,
  upsertInstalledPlugin,
} from '../src/plugins/registry.js';
import { startServer } from '../src/server.js';
import {
  getStrategyTaskExecution
} from '../src/strategies/task-store.js';
import {
  hashOdNextRuntimeCapabilitySnapshotV1,
  resolveBundledOdNextRuntimeCapability,
} from '../src/runtimes/od-next-capability-gate.js';

type StartedServer = {
  url: string;
  server: Server;
  shutdown?: () => Promise<void> | void;
};

// Each fixture owns its HTTP transport; daemon-internal fetch remains untouched.
const fixtureHttpClients = new Map<string, { owner: StartedServer; dispatcher: Agent }>();
const fixtureShutdowns = new WeakMap<StartedServer, Promise<void>>();
const fixtureAgentBinEnvKeys = [...new Set([
  ...AGENT_DEFS.map(def => agentBinEnvKey(def.id)).filter((key): key is string => key !== null),
  'VELA_OPENCODE_BIN',
])];
let fixtureDetectionIsolation: Promise<{ root: string; home: string; bin: string }> | null = null;
let previousDetectionEnv: Record<string, string | undefined> = {};

function fetch(input: Parameters<typeof undiciFetch>[0], init?: Parameters<typeof undiciFetch>[1]) {
  const origin = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).origin;
  const client = fixtureHttpClients.get(origin);
  if (!client) throw new Error(`No fixture HTTP client owns ${origin}`);
  return undiciFetch(input, { ...init, dispatcher: client.dispatcher });
}

type RunStatus = {
  id: string;
  status: string;
  updatedAt: number;
  eventsLogPath: string;
  endedWithUnfinishedWork?: boolean;
  cancelRequested?: boolean;
  error?: string | null;
  errorCode?: string | null;
  strategyTask?: {
    taskExecutionId: string;
    runMappings?: Array<{ runId: string; taskRunIndex: number }>;
    inputStage: string;
    outcome: string;
    terminal: boolean;
    activeRunId?: string;
    nextRunId?: string;
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
const CREATIVE_VOLTAGE_EXAMPLE_DIR = path.join(
  REPO_ROOT,
  'plugins',
  '_official',
  'examples',
  'fs-creative-voltage',
);
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
  let previousCodexTransport: string | undefined;

  beforeEach(() => {
    frozenProtocolFixture.legacy = false;
    const composeHead = contracts.composeOdNextStrategyBundleHeadV2;
    vi.spyOn(contracts, 'composeOdNextStrategyBundleHeadV2').mockImplementation(input => {
      const head = composeHead(input);
      if (frozenProtocolFixture.legacy) head.coreSystemPrompt.outputContract =
        'Historical V2 output: emit open-design-plan-contract and open-design-runtime-state blocks. Emit exactly one Runtime State block on every response.';
      return head;
    });
    previousDetectionEnv = Object.fromEntries(['PATH', 'OD_AGENT_HOME', ...fixtureAgentBinEnvKeys]
      .map(key => [key, process.env[key]]));
    previousCodexTransport = process.env.OD_CODEX_TRANSPORT;
    process.env.OD_CODEX_TRANSPORT = 'exec-json';
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (previousCodexTransport == null) delete process.env.OD_CODEX_TRANSPORT;
    else process.env.OD_CODEX_TRANSPORT = previousCodexTransport;
    delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
    delete process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY;
    uuidControl.forced.length = 0;
    pendingAutomaticFixtureIdentity = null;
    try {
      await stopServer(started);
      started = null;
      closeDatabase();
      if (binDir) await rm(binDir, { recursive: true, force: true });
      binDir = null;
    } finally {
      try {
        const isolation = await fixtureDetectionIsolation;
        if (isolation) await rm(isolation.root, { recursive: true, force: true });
      } finally {
        fixtureDetectionIsolation = null;
        for (const [key, value] of Object.entries(previousDetectionEnv)) {
          if (value === undefined) delete process.env[key];
          else process.env[key] = value;
        }
      }
    }
  });

  it('isolates host CLI probes while retaining real selected Codex detection and preflight', async () => {
    const hostRoot = await mkdtemp(path.join(os.tmpdir(), 'od-next-controlled-host-'));
    const hostBinDir = path.join(hostRoot, 'bin');
    const hostHome = path.join(hostRoot, 'home');
    const hostLog = path.join(hostRoot, 'host-probes.jsonl');
    const selectedLog = path.join(hostRoot, 'selected-probes.jsonl');
    const previous = { PATH: process.env.PATH, OD_AGENT_HOME: process.env.OD_AGENT_HOME,
      AIDER_BIN: process.env.AIDER_BIN };
    await mkdir(hostBinDir);
    await mkdir(hostHome);
    await writeFile(hostLog, '');
    await writeFile(selectedLog, '');
    await symlink(process.execPath, path.join(hostBinDir, 'node'));
    const sentinel = path.join(hostBinDir, 'aider');
    await writeFile(sentinel, `#!/usr/bin/env node
const fs = require('node:fs');
fs.appendFileSync(${JSON.stringify(hostLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
console.log('aider 0.86.0');
`, 'utf8');
    await chmod(sentinel, 0o755);
    // A controlled host candidate, not the developer's real CLI. Fixture
    // isolation must fence both PATH discovery and inherited explicit overrides.
    process.env.PATH = [hostBinDir, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter);
    process.env.OD_AGENT_HOME = hostHome;
    process.env.AIDER_BIN = sentinel;
    try {
      const fixture = await createFixture('repair', { probeLogPath: selectedLog });
      const selectedBin = path.join(path.dirname(fixture.logPath), 'codex-repair');
      // Empty fixture-only API-key entries ensure the actual login-status
      // probe is observed instead of relying on any inherited authenticated env.
      const config = await fetch(`${started!.url}/api/app-config`, {
        method: 'PUT', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId: 'codex', agentCliEnv: { codex: {
          CODEX_BIN: selectedBin, CODEX_HOME: path.dirname(selectedBin),
          CODEX_API_KEY: '', OPENAI_API_KEY: '',
        } } }),
      });
      expect(config.status).toBe(200);
      const detected = await fetch(`${started!.url}/api/agents`);
      expect(detected.status).toBe(200);
      const available = await detected.json() as { agents: Array<{ id: string; available: boolean }> };
      expect(available.agents.find(agent => agent.id === 'codex')?.available).toBe(true);
      const probes = (await readFile(selectedLog, 'utf8')).trim().split('\n')
        .filter(Boolean).map(line => JSON.parse(line) as string[]);
      expect(probes).toContainEqual(['--version']);
      // Codex declares listModels/authProbe but no helpArgs/capabilityFlags;
      // probeCapabilities therefore returns without invoking --help.
      expect(probes).toContainEqual(['debug', 'models']);
      expect(probes).toContainEqual(['login', 'status']);

      queueFixtureIds(fixture);
      await postRun(started!.url, createRunRequest(fixture, 'Build the operator prototype.'));
      const task = await waitForTask(fixture.taskExecutionId, 'completed');
      await waitForRunTerminal(started!.url, task.latestRunId);

      const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
      expect(invocations.some(call => call.stdin.includes('This is the production turn'))).toBe(true);

      // A real non-invocable selected executable must still become unavailable.
      // Exit 127 is the supported stale-wrapper signal, unlike generic exit 1.
      await writeFile(selectedBin, `#!/usr/bin/env node
require('node:fs').appendFileSync(${JSON.stringify(selectedLog)}, JSON.stringify(process.argv.slice(2)) + '\\n');
process.exit(127);
`, 'utf8');
      const probeCount = (await readFile(selectedLog, 'utf8')).trim().split('\n').length;
      const brokenResponse = await fetch(`${started!.url}/api/agents`);
      expect(brokenResponse.status).toBe(200);
      const broken = await brokenResponse.json() as { agents: Array<{ id: string; available: boolean }> };
      expect(broken.agents.find(agent => agent.id === 'codex')?.available).toBe(false);
      const afterFailure = (await readFile(selectedLog, 'utf8')).trim().split('\n')
        .filter(Boolean).map(line => JSON.parse(line) as string[]);
      expect(afterFailure.length).toBeGreaterThan(probeCount);
      expect(afterFailure.slice(probeCount)).toContainEqual(['--version']);
      // This is the expected red anchor on the unisolated fixture. All selected
      // runtime assertions above must pass before this boundary can be green.
      const hostProbes = (await readFile(hostLog, 'utf8')).trim().split('\n').filter(Boolean);
      expect(hostProbes).toEqual([]);
    } finally {
      await stopServer(started);
      started = null;
      // Keep the probe-only evidence in the Vitest log before removing owned
      // fixture files, including when a prerequisite assertion fails.
      const probeEvidence = await Promise.all([selectedLog, hostLog].map(async file => {
        try {
          return (await readFile(file, 'utf8')).trim().split('\n').filter(Boolean)
            .map(line => JSON.parse(line) as string[]);
        } catch { return null; }
      }));
      console.info('[2623-probe-evidence]', JSON.stringify({
        selected: probeEvidence[0], controlledHost: probeEvidence[1],
      }));
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      await rm(hostRoot, { recursive: true, force: true });
    }
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
    expect((database().prepare('SELECT COUNT(*) AS count FROM strategy_task_executions WHERE project_id = ?').get(fixture.projectId) as { count: number }).count)
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

  it('runs the selected official example on the ordinary route without pinning it to the project', async () => {
    const fixture = await createPublicRolloutFixture('selected-example-ordinary', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';

    const selected = await createProjectForScenario(
      started.url,
      'selected-example-deck',
      { kind: 'deck' },
      undefined,
      'ppt',
      {
        pluginId: 'example-fs-creative-voltage',
        source: CREATIVE_VOLTAGE_EXAMPLE_DIR,
      },
    );
    expect(selected.appliedPluginSnapshotId).toBeUndefined();
    expect(selected.metadata?.exampleBinding).toMatchObject({
      provenance: 'example_card',
      pluginId: 'example-fs-creative-voltage',
      pluginSource: CREATIVE_VOLTAGE_EXAMPLE_DIR,
    });

    const created = await postRun(started.url, publicRunRequest(
      selected,
      'Build the selected fundraising deck.',
      'selected-example-ordinary',
    ));
    expect(created.strategyTask).toBeUndefined();
    expect(created.pluginId).toBe('example-fs-creative-voltage');
    expect(created.appliedPluginSnapshotId).toEqual(expect.any(String));
    await waitForRunTerminal(started.url, created.runId as string);

    expect(database().prepare(`
      SELECT applied_plugin_snapshot_id AS snapshotId
        FROM projects
       WHERE id = ?
    `).get(selected.projectId)).toEqual({ snapshotId: null });
    expect(database().prepare(`
      SELECT applied_plugin_snapshot_id AS snapshotId
        FROM conversations
       WHERE id = ?
    `).get(selected.conversationId)).toEqual({ snapshotId: null });
    expect(database().prepare(`
      SELECT plugin_id AS pluginId, run_id AS runId
        FROM applied_plugin_snapshots
       WHERE id = ?
    `).get(created.appliedPluginSnapshotId)).toEqual({
      pluginId: 'example-fs-creative-voltage',
      runId: created.runId,
    });
    const userMessage = database().prepare(`
      SELECT applied_plugin_snapshot_json AS snapshotJson
        FROM messages
       WHERE id = ?
    `).get('user-selected-example-ordinary') as { snapshotJson: string };
    expect(JSON.parse(userMessage.snapshotJson)).toMatchObject({
      pluginId: 'example-fs-creative-voltage',
      pluginTitle: 'Write a Seed Pitch like a Top Pre-Seed Founder',
    });

    const invocations = await readProjectInvocations(fixture.logPath, selected.projectId);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.stdin).toContain('Creative Voltage');
    expect(invocations[0]?.stdin).not.toContain('克制的 COO');
  });

  it('lets a verified example replace an existing automatic-default pin for only the current run', async () => {
    const fixture = await createPublicRolloutFixture('selected-example-upgrade', 'design');
    started = fixture.started;
    binDir = fixture.binDir;

    const createAffectedProject = async (label: string) => {
      const project = await createProjectForScenario(
        started!.url,
        label,
        { kind: 'deck' },
        undefined,
        undefined,
        {
          pluginId: 'example-fs-creative-voltage',
          source: CREATIVE_VOLTAGE_EXAMPLE_DIR,
        },
      );
      expect(project.appliedPluginSnapshotId).toEqual(expect.any(String));
      expect(project.metadata?.scenarioBinding).toMatchObject({
        provenance: 'automatic_default',
        pluginId: 'example-simple-deck',
        snapshotId: project.appliedPluginSnapshotId,
      });
      expect(project.metadata?.exampleBinding).toMatchObject({
        provenance: 'example_card',
        pluginId: 'example-fs-creative-voltage',
        pluginSource: CREATIVE_VOLTAGE_EXAMPLE_DIR,
      });
      return project;
    };
    const expectRunScopedExample = (
      project: Awaited<ReturnType<typeof createAffectedProject>>,
      created: {
        pluginId?: string;
        appliedPluginSnapshotId?: string;
        runId?: string;
      },
    ) => {
      expect(created.pluginId).toBe('example-fs-creative-voltage');
      expect(created.appliedPluginSnapshotId).toEqual(expect.any(String));
      expect(created.appliedPluginSnapshotId).not.toBe(project.appliedPluginSnapshotId);
      expect(database().prepare(`
        SELECT applied_plugin_snapshot_id AS snapshotId
          FROM projects
         WHERE id = ?
      `).get(project.projectId)).toEqual({ snapshotId: project.appliedPluginSnapshotId });
      expect(database().prepare(`
        SELECT applied_plugin_snapshot_id AS snapshotId
          FROM conversations
         WHERE id = ?
      `).get(project.conversationId)).toEqual({ snapshotId: project.appliedPluginSnapshotId });
      expect(database().prepare(`
        SELECT plugin_id AS pluginId, run_id AS runId
          FROM applied_plugin_snapshots
         WHERE id = ?
      `).get(created.appliedPluginSnapshotId)).toEqual({
        pluginId: 'example-fs-creative-voltage',
        runId: created.runId,
      });
    };

    const rolloutOffProject = await createAffectedProject('selected-example-upgrade-off');
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
    const ordinary = await postRun(started.url, publicRunRequest(
      rolloutOffProject,
      'Use the selected example after upgrading the ordinary route.',
      'selected-example-upgrade-off',
    ));
    expect(ordinary.strategyTask).toBeUndefined();
    await waitForRunTerminal(started.url, ordinary.runId as string);
    expectRunScopedExample(rolloutOffProject, ordinary);

    const prestartFallbackProject = await createAffectedProject(
      'selected-example-upgrade-prestart',
    );
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    database().exec(`
      CREATE TRIGGER reject_selected_example_strategy_task
      BEFORE INSERT ON strategy_task_executions
      BEGIN
        SELECT RAISE(ABORT, 'fixture selected-example strategy preparation rejected');
      END
    `);
    try {
      const fallback = await postRun(started.url, publicRunRequest(
        prestartFallbackProject,
        'Use the selected example after automatic pre-start fallback.',
        'selected-example-upgrade-prestart',
      ));
      expect(fallback.strategyTask).toBeUndefined();
      expect(fallback.taskExecutionId).toBeUndefined();
      await waitForRunTerminal(started.url, fallback.runId as string);
      expectRunScopedExample(prestartFallbackProject, fallback);
    } finally {
      database().exec('DROP TRIGGER IF EXISTS reject_selected_example_strategy_task');
    }

    const invocations = await readProjectInvocations(fixture.logPath, rolloutOffProject.projectId);
    expect(invocations).toHaveLength(1);
    expect(invocations[0]?.stdin).toContain('Creative Voltage');
    expect(invocations[0]?.stdin).not.toContain('克制的 COO');
    const fallbackInvocations = await readProjectInvocations(
      fixture.logPath,
      prestartFallbackProject.projectId,
    );
    expect(fallbackInvocations).toHaveLength(1);
    expect(fallbackInvocations[0]?.stdin).toContain('Creative Voltage');
    expect(fallbackInvocations[0]?.stdin).not.toContain('克制的 COO');
  });

  it('does not reuse an automatic-default pin when the bound example identity is stale', async () => {
    const fixture = await createPublicRolloutFixture('stale-selected-example', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    const exampleDir = path.join(binDir, 'stale-selected-example');
    await cp(CREATIVE_VOLTAGE_EXAMPLE_DIR, exampleDir, { recursive: true });
    const staleExamplePluginId = 'example-stale-creative-voltage';
    const manifestPath = path.join(exampleDir, 'open-design.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    await writeFile(manifestPath, JSON.stringify({
      ...manifest,
      name: staleExamplePluginId,
    }), 'utf8');
    const installResponse = await fetch(`${started.url}/api/plugins/install`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
      body: JSON.stringify({ source: exampleDir }),
    });
    const installEvents = await installResponse.text();
    expect(installEvents).toContain('event: success');
    const installedExample = getInstalledPlugin(database(), staleExamplePluginId);
    expect(installedExample).not.toBeNull();

    const createAffectedProject = async (label: string) => {
      const project = await createProjectForScenario(
        started!.url,
        label,
        { kind: 'deck' },
        undefined,
        undefined,
        {
          pluginId: staleExamplePluginId,
          source: installedExample!.source,
        },
      );
      expect(project.appliedPluginSnapshotId).toEqual(expect.any(String));
      expect(project.metadata?.scenarioBinding).toMatchObject({
        provenance: 'automatic_default',
        pluginId: 'example-simple-deck',
        snapshotId: project.appliedPluginSnapshotId,
      });
      return project;
    };
    const rolloutOffProject = await createAffectedProject('stale-selected-example-off');
    const prestartFallbackProject = await createAffectedProject(
      'stale-selected-example-prestart',
    );

    // Both projects froze the original manifest identity. Mutating it now
    // reproduces an example that was removed or upgraded after selection.
    await writeFile(
      path.join(installedExample!.fsPath, 'SKILL.md'),
      '# Changed after the project selected this example\n',
      'utf8',
    );

    const expectDefaultWasNotReused = async (
      project: Awaited<ReturnType<typeof createAffectedProject>>,
      created: { pluginId?: string; runId?: string },
    ) => {
      expect(created.pluginId).toBeUndefined();
      await waitForRunTerminal(started!.url, created.runId as string);
      expect(database().prepare(`
        SELECT applied_plugin_snapshot_id AS snapshotId
          FROM projects
         WHERE id = ?
      `).get(project.projectId)).toEqual({ snapshotId: project.appliedPluginSnapshotId });
      const invocations = await readProjectInvocations(fixture.logPath, project.projectId);
      expect(invocations).toHaveLength(1);
      expect(invocations[0]?.stdin).not.toContain('Creative Voltage');
      expect(invocations[0]?.stdin).not.toContain('克制的 COO');
    };

    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
    const ordinary = await postRun(started.url, publicRunRequest(
      rolloutOffProject,
      'Do not substitute an unrelated default for the stale example.',
      'stale-selected-example-off',
    ));
    expect(ordinary.strategyTask).toBeUndefined();
    await expectDefaultWasNotReused(rolloutOffProject, ordinary);

    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    database().exec(`
      CREATE TRIGGER reject_stale_example_strategy_task
      BEFORE INSERT ON strategy_task_executions
      BEGIN
        SELECT RAISE(ABORT, 'fixture stale-example strategy preparation rejected');
      END
    `);
    try {
      const fallback = await postRun(started.url, publicRunRequest(
        prestartFallbackProject,
        'Do not substitute an unrelated default after pre-start fallback.',
        'stale-selected-example-prestart',
      ));
      expect(fallback.strategyTask).toBeUndefined();
      expect(fallback.taskExecutionId).toBeUndefined();
      await expectDefaultWasNotReused(prestartFallbackProject, fallback);
    } finally {
      database().exec('DROP TRIGGER IF EXISTS reject_stale_example_strategy_task');
    }
  });

  // ACCEPTANCE for the opt-out switch. Nothing configured takes the OD Next
  // route — that is the default this build ships. The SAME running daemon
  // takes the ordinary route on the next run once `odNextStrategyMode: 'off'`
  // is saved through the public app-config API. No restart, no environment
  // variable — that is what "configure it and it takes effect" has to mean for
  // a packaged install, where the saved mode is the only control a user has:
  // the packaged child environment allowlist carries no `OD_NEXT_*` key.
  it('marker protocol automatically resumes Codex once and preserves files despite a missing canonical entry', async () => {
    const fixture = await createPublicRolloutFixture('marker-production', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const created = await postRun(started.url, publicRunRequest(fixture, 'Create a landing page and a presentation.', 'marker-production'));
    const request = await waitForRunTerminal(started.url, created.runId as string);
    expect(request.status, JSON.stringify(request)).toBe('succeeded');
    const task = await waitForTask(created.strategyTask!.taskExecutionId, 'completed');
    expect(task.runs).toHaveLength(2);
    expect(task.planContract).toBeUndefined();
    const production = await waitForRunTerminal(started.url, task.latestRunId);
    expect(production.status).toBe('succeeded');
    expect(production.strategyTask).toMatchObject({ outcome: 'completed', terminal: true, deliverableValid: false });
    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(2);
    expect(invocations[1]!.argv).toContain('resume');
    expect(invocations[1]!.stdin).toContain('This is the production turn');
    expect(invocations[1]!.stdin).not.toContain('planContractHash=');
    expect(await readFile(path.join(invocations[1]!.cwd, 'landing.html'), 'utf8')).toContain('Landing');
    expect(await readFile(path.join(invocations[1]!.cwd, 'deck.html'), 'utf8')).toContain('Deck');
    const response = await fetch(`${started.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`);
    const history = await response.json() as { messages: Array<{ content: string; strategyTaskDelivered?: boolean }> };
    expect(JSON.stringify(history)).not.toContain('od-production-ready');
    expect(history.messages.some(message => message.strategyTaskDelivered)).toBe(false);
  });

  it.each(['missing-session', 'expired-session'] as const)('marker production cold-starts with its plan when %s', async mode => {
    const fixture = await createPublicRolloutFixture(`marker-${mode}`, 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const created = await postRun(started.url, publicRunRequest(fixture, 'Create a landing page and a presentation.', `cold-${mode}`));
    const request = await waitForRunTerminal(started.url, created.runId as string);
    expect(request.status).toBe('succeeded');
    const task = getStrategyTaskExecution(database(), created.strategyTask!.taskExecutionId)!;
    expect(task.runs).toHaveLength(2);
    const production = await waitForRunTerminal(started.url, task.latestRunId);
    expect(production.status, JSON.stringify(production)).toBe('succeeded');
    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(mode === 'expired-session' ? 3 : 2);
    const cold = invocations.at(-1)!;
    expect(cold.argv).not.toContain('resume');
    expect(cold.stdin).toContain('open_design_prompt_bundle');
    expect(cold.stdin).toContain('Create a landing page and a presentation.');
    expect(cold.stdin).toContain('Plan: create a landing page and a matching deck.');
    expect(cold.stdin).toContain('This is the production turn');
    expect(cold.stdin).not.toContain('Plan-to-production continuation:');
    const events = (await readFile(production.eventsLogPath, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    const transports = events.filter(event => event.data?.type === 'strategy_production_transport').map(event => event.data.transport);
    expect(transports).toEqual(mode === 'expired-session' ? ['resume', 'cold_start'] : ['cold_start']);
    expect(await readFile(path.join(cold.cwd, 'landing.html'), 'utf8')).toContain('Landing');
    const settled = getStrategyTaskExecution(database(), task.taskExecutionId)!;
    expect(settled.outcome).toBe('completed');
    expect(settled.runs[0]?.settlementReason).toBe('continued');
    expect(settled.runs).toHaveLength(2);
  });

  it('does not cold-replay production after a tool ran before resume failure', async () => {
    const fixture = await createPublicRolloutFixture('marker-expired-side-effect', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const created = await postRun(started.url, publicRunRequest(fixture, 'Create a landing page and a presentation.', 'unsafe-cold'));
    await waitForRunTerminal(started.url, created.runId as string);
    const task = getStrategyTaskExecution(database(), created.strategyTask!.taskExecutionId)!;
    const production = await waitForRunTerminal(started.url, task.latestRunId);
    expect(production.status).toBe('failed');
    expect(production.strategyTask).toMatchObject({ outcome: 'completed', settlementReason: 'ended', settlementFacts: { physicalStatus: 'failed' } });
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(2);
  });

  it('marker protocol delivers an independent image while preserving an existing prototype page', async () => {
    const fixture = await createPublicRolloutFixture('marker-image', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const projectRoot = path.join(process.env.OD_DATA_DIR!, 'projects', fixture.projectId);
    await mkdir(projectRoot, { recursive: true });
    const existingPage = '<!doctype html><html><body>Existing page</body></html>';
    await writeFile(path.join(projectRoot, 'index.html'), existingPage);
    const created = await postRun(started.url, publicRunRequest(fixture, '帮我生成一个狗狗大作战的图片，只出图片。', 'marker-image'));
    await waitForRunTerminal(started.url, created.runId as string);
    const task = await waitForTask(created.strategyTask!.taskExecutionId, 'completed');
    expect(task.runs).toHaveLength(2);
    const production = await waitForRunTerminal(started.url, task.latestRunId);
    expect(production.status).toBe('succeeded');
    expect(production.strategyTask).toMatchObject({ outcome: 'completed', deliverableValid: true });
    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(2);
    expect(invocations[0]!.stdin).not.toContain('allowedProductionRoutes');
    expect(invocations[0]!.stdin).not.toContain('supportedOutputKinds');
    expect(invocations[1]!.stdin).toContain('Drop any unrequested wrapper');
    expect(invocations[1]!.argv).toContain('resume');
    expect(await readFile(path.join(projectRoot, 'index.html'), 'utf8')).toBe(existingPage);
    expect((await readFile(path.join(projectRoot, 'dog.png'))).length).toBeGreaterThan(0);
    const response = await fetch(`${started.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`);
    const history = await response.json() as { messages: Array<{ strategyTaskDelivered?: boolean }> };
    expect(history.messages.some(message => message.strategyTaskDelivered)).toBe(true);
  });

  it('marker protocol accepts repeated form answers as new tasks without the one-question gate', async () => {
    const fixture = await createPublicRolloutFixture('marker-question', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const first = await postRun(started.url, publicRunRequest(fixture, 'Make a design.', 'marker-question-first'));
    await waitForRunTerminal(started.url, first.runId as string);
    const settled = await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
    const second = await postRun(started.url, {
      ...publicRunRequest(fixture, 'Here is the requested context.', 'marker-question-second'),
      taskExecutionId: settled.taskExecutionId,
    });
    expect(second.runId).toBeTruthy();
    expect(second.strategyTask!.taskExecutionId).not.toBe(settled.taskExecutionId);
    expect((await waitForRunTerminal(started.url, second.runId as string)).status).toBe('succeeded');
    const next = await waitForTask(second.strategyTask!.taskExecutionId, 'completed');
    expect(next.runs).toHaveLength(1);
  });

  it('carries a form answer through a new plan into automatic production', async () => {
    const fixture = await createPublicRolloutFixture('marker-question-plan', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const first = await postRun(started.url, publicRunRequest(fixture, 'Make a landing page for our product.', 'answer-first'));
    await waitForRunTerminal(started.url, first.runId as string);
    const asked = await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
    expect(asked.runs).toHaveLength(1);
    expect(asked.runs[0]!.settlementReason).toBe('question');
    const answer = await postRun(started.url, {
      ...publicRunRequest(fixture, 'Audience: developers.', 'answer-second'),
      taskExecutionId: asked.taskExecutionId,
    });
    expect(answer.strategyTask!.taskExecutionId).not.toBe(asked.taskExecutionId);
    const task = await waitForTask(answer.strategyTask!.taskExecutionId, 'completed');
    expect(task.continuedFromTaskExecutionId).toBe(asked.taskExecutionId);
    expect(task.runs).toHaveLength(2);
    expect(task.runs[0]!.settlementReason).toBe('continued');
    expect(task.runs[1]!.inputStage).toBe('production');
    expect((await waitForRunTerminal(started.url, task.latestRunId)).status).toBe('succeeded');
    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(3);
    expect(invocations[1]!.stdin).toContain('Audience: developers.');
    expect(invocations[2]!.stdin).toContain('This is the production turn');
    expect(await readFile(path.join(invocations[2]!.cwd, 'index.html'), 'utf8')).toContain('Developer landing');
  }, 45_000);

  it('continues once when a tool call separates the plan from its production marker', async () => {
    const fixture = await createPublicRolloutFixture('marker-tool-split', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const created = await postRun(started.url, publicRunRequest(fixture, 'Create a landing page and a presentation.', 'tool-split'));
    const request = await waitForRunTerminal(started.url, created.runId as string);
    expect(request.status, JSON.stringify(request)).toBe('succeeded');
    const task = await waitForTask(created.strategyTask!.taskExecutionId, 'completed');
    expect(task.runs).toHaveLength(2);
    expect(task.runs[0]!.settlementReason).toBe('continued');
    expect((await waitForRunTerminal(started.url, task.latestRunId)).status).toBe('succeeded');
    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(2);
    expect(await readFile(path.join(invocations[1]!.cwd, 'landing.html'), 'utf8')).toContain('Landing');
    const response = await fetch(`${started.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`);
    const history = await response.json() as { messages: Array<{ content?: string }> };
    expect(JSON.stringify(history)).not.toContain('od-production-ready');
    expect(history.messages.some(message => message.content?.includes('Plan: create a landing page and a matching deck.'))).toBe(true);
  });

  it('points the planning end at its production run so od run watch follows the task', async () => {
    const fixture = await createPublicRolloutFixture('marker-production', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const created = await postRun(started.url, publicRunRequest(fixture, 'Create a landing page and a presentation.', 'watch-follow'));
    const task = await waitForTask(created.strategyTask!.taskExecutionId, 'completed');
    const planningRunId = created.runId as string;
    const productionRunId = task.latestRunId;
    expect(productionRunId).not.toBe(planningRunId);
    await waitForRunTerminal(started.url, productionRunId);
    const { stdout } = await runOdCli(['run', 'watch', planningRunId, '--daemon-url', started.url]);
    const frames = stdout.trim().split('\n').map(line => JSON.parse(line) as {
      event: string;
      data: { strategyTask?: NonNullable<RunStatus['strategyTask']> };
    });
    const ends = frames.filter(frame => frame.event === 'end');
    expect(ends).toHaveLength(2);
    expect(ends[0]!.data.strategyTask).toMatchObject({ terminal: false, nextRunId: productionRunId });
    expect(ends[0]!.data.strategyTask?.runMappings).toContainEqual({ runId: productionRunId, taskRunIndex: 1 });
    expect(ends[1]!.data.strategyTask).toMatchObject({ terminal: true, outcome: 'completed' });
    expect(stdout).not.toContain('od-production-ready');
  }, 45_000);

  it.each(['active', 'off'] as const)(
    'starts a new turn instead of failing every message when the previous task is unreadable (rollout %s)', async mode => {
      const fixture = await createPublicRolloutFixture('marker-unreadable', 'design');
      started = fixture.started; binDir = fixture.binDir;
      process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
      const first = await postRun(started.url, publicRunRequest(fixture, 'Create a landing page.', `unreadable-first-${mode}`));
      const old = await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
      await waitForRunTerminal(started.url, old.latestRunId);
      writeStalePromptBundle(old.taskExecutionId, old.initialRunId);
      expect(() => getStrategyTaskExecution(database(), old.taskExecutionId)).toThrow();
      if (mode === 'off') process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
      const warn = vi.spyOn(console, 'warn');
      const next = await postRun(started.url, publicRunRequest(fixture, 'Now make a pricing page.', `unreadable-next-${mode}`));
      expect((await waitForRunTerminal(started.url, next.runId as string)).status).toBe('succeeded');
      expect(warn).toHaveBeenCalledWith('[od-next-task] previous task unreadable; follow-up starts a new task',
        expect.objectContaining({ runId: expect.any(String) }));
      if (mode === 'off') {
        expect(next.strategyTask).toBeUndefined();
        return;
      }
      const task = await waitForTask(next.strategyTask!.taskExecutionId, 'completed');
      expect(task.taskExecutionId).not.toBe(old.taskExecutionId);
      expect(task.continuedFromTaskExecutionId).toBeUndefined();
    }, 45_000);

  it('accepts a message sent while the stopped Run is still draining', async () => {
    const fixture = await createPublicRolloutFixture('marker-handoff', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const first = await postRun(started.url, publicRunRequest(fixture,
      'Hold the run open and drain slowly after a stop.', 'draining-first'));
    const firstRunId = first.runId as string;
    await vi.waitFor(async () => expect((await getRun(started!.url, firstRunId)).status).toBe('running'));
    const stopping = fetch(`${started.url}/api/runs/${encodeURIComponent(firstRunId)}/cancel`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
    });
    await vi.waitFor(async () => expect(await getRun(started!.url, firstRunId))
      .toMatchObject({ status: 'running', cancelRequested: true }));
    const next = await postRun(started.url, publicRunRequest(fixture, 'Continue and create the dog battle page.', 'draining-next'));
    expect(next.strategyTask!.taskExecutionId).not.toBe(first.strategyTask!.taskExecutionId);
    expect((await stopping).status).toBe(200);
    expect((await waitForRunTerminal(started.url, firstRunId)).status).toBe('canceled');
    expect((await waitForRunTerminal(started.url, next.runId as string)).status).toBe('succeeded');
    const task = await waitForTask(next.strategyTask!.taskExecutionId, 'completed');
    expect(task.continuedFromTaskExecutionId).toBe(first.strategyTask!.taskExecutionId);
  }, 45_000);

  it('resumes current marker conversations with only the current request and host directives', async () => {
    const fixture = await createPublicRolloutFixture('marker-question', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const first = await postRun(started.url, publicRunRequest(fixture, 'Original request sentinel.', 'resume-first'));
    await waitForRunTerminal(started.url, first.runId as string);
    await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
    const second = await postRun(started.url, publicRunRequest(fixture, 'Current request sentinel.', 'resume-second'));
    expect((await waitForRunTerminal(started.url, second.runId as string)).status).toBe('succeeded');
    const calls = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.argv).toContain('resume');
    expect(calls[1]!.stdin).toContain('Current request sentinel.');
    expect(calls[1]!.stdin).toContain('<od-production-ready key=');
    expect(calls[1]!.stdin).not.toContain('Original request sentinel.');
    expect(calls[1]!.stdin).not.toContain('<open_design_core_system_prompt>');
    expect(calls[1]!.stdin).not.toContain('<session_skills>');
    expect(calls[1]!.stdin).not.toContain('## Runtime tool environment');
    expect(calls[1]!.stdin).not.toContain('capabilitySnapshotHash');
    expect(calls[1]!.stdin).not.toContain('open_design_request_turn');
    expect(calls[1]!.stdin.length).toBeLessThan(calls[0]!.stdin.length);
    const firstKey = /<od-production-ready key="([a-f0-9]+)"/.exec(calls[0]!.stdin)?.[1];
    expect(calls[1]!.stdin).not.toContain(firstKey!);
  }, 45_000);

  it('automatically produces again after a resumed request with its new marker key', async () => {
    const fixture = await createPublicRolloutFixture('marker-production', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const first = await postRun(started.url, publicRunRequest(fixture, 'Make a landing page.', 'repeat-first'));
    await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
    const second = await postRun(started.url, publicRunRequest(fixture, 'Design another site from scratch.', 'repeat-second'));
    const task = await waitForTask(second.strategyTask!.taskExecutionId, 'completed');
    expect(task.runs).toHaveLength(2);
    expect(task.runs[0]!.settlementReason).toBe('continued');
    expect(task.runs[1]!.inputStage).toBe('production');
    expect(task.runs[0]!.resumeFinalText).toBeDefined();
    const calls = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(calls).toHaveLength(4);
    expect(calls[2]!.argv).toContain('resume');
    expect(calls[2]!.stdin).not.toContain('<session_skills>');
    expect(calls[3]!.argv).toContain('resume');
    expect(calls[3]!.stdin).toContain('This is the production turn');
  }, 45_000);

  it('re-sends changed stable instructions while retaining a current native session', async () => {
    const fixture = await createPublicRolloutFixture('marker-question', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const first = await postRun(started.url, publicRunRequest(fixture, 'Initial task.', 'change-first'));
    await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
    const second = await postRun(started.url, {
      ...publicRunRequest(fixture, 'Updated task.', 'change-second'),
      systemPrompt: 'New stable rule: use yellow.',
    });
    await waitForTask(second.strategyTask!.taskExecutionId, 'completed');
    const calls = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(calls[1]!.argv).toContain('resume');
    expect(calls[1]!.stdin).toContain('New stable rule: use yellow.');
    expect(calls[1]!.stdin).toContain('<open_design_core_system_prompt>');
  }, 45_000);

  it('restores the full frozen request when native request resume has expired', async () => {
    const fixture = await createPublicRolloutFixture('marker-request-expired', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const first = await postRun(started.url, publicRunRequest(fixture, 'Original context to recover.', 'expired-first'));
    await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
    const second = await postRun(started.url, publicRunRequest(fixture, 'Current followup.', 'expired-second'));
    const task = await waitForTask(second.strategyTask!.taskExecutionId, 'completed');
    expect(task.runs).toHaveLength(1);
    const calls = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(calls).toHaveLength(3);
    expect(calls[1]!.argv).toContain('resume');
    expect(calls[1]!.stdin).not.toContain('<session_skills>');
    expect(calls[2]!.argv).not.toContain('resume');
    expect(calls[2]!.stdin).toContain('Original context to recover.');
    expect(calls[2]!.stdin).toContain('Current followup.');
    expect(calls[2]!.stdin).toContain('<session_skills>');
  }, 45_000);

  it.each(['plan_ready', 'clarification_required', 'blocked'] as const)(
    'hands off historical %s through the current strategy and preserves exact retries after restart', async outcome => {
      const fixture = await createPublicRolloutFixture('marker-handoff', 'design');
      started = fixture.started; binDir = fixture.binDir;
      process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
      frozenProtocolFixture.legacy = true;
      const first = await postRun(started.url, publicRunRequest(fixture,
        'Create a dog battle page for children. Keep the blue background.', `history-${outcome}`));
      await waitForRunTerminal(started.url, first.runId as string);
      const old = await waitForTask(first.strategyTask!.taskExecutionId, 'completed');
      // Persist the pre-upgrade state, including an invalid model contract. No retired engine is loaded.
      database().prepare(`UPDATE strategy_task_executions SET outcome=?, route='full_plan',
        execution_mode=?, plan_contract_json=?, plan_contract_hash=? WHERE task_execution_id=?`)
        .run(outcome, outcome === 'clarification_required' ? null : 'simple', '{invalid legacy plan', 'old-hash', old.taskExecutionId);
      const historical = database().prepare('SELECT * FROM strategy_task_executions WHERE task_execution_id=?').get(old.taskExecutionId);
      frozenProtocolFixture.legacy = false;
      await stopServer(started); started = await startDaemon();
      const request = {
        ...publicRunRequest(fixture, 'Continue production using that plan. Audience: children aged 6–8.', `continue-${outcome}`),
        ...(outcome === 'plan_ready' ? {} : { taskExecutionId: old.taskExecutionId }),
      };
      let continued: Awaited<ReturnType<typeof postRun>>;
      if (outcome === 'clarification_required') {
        const response = await fetch(`${started.url}/api/chat`, { method: 'POST',
          headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
        expect(response.status).toBe(200);
        const events = await response.text();
        expect(events).not.toContain('od_next_clarification_repeated');
        continued = await postRun(started.url, request);
      } else continued = await postRun(started.url, request);
      expect(continued.strategyTask!.taskExecutionId).not.toBe(old.taskExecutionId);
      expect((await waitForRunTerminal(started.url, continued.runId as string)).status).toBe('succeeded');
      const next = await waitForTask(continued.strategyTask!.taskExecutionId, 'completed');
      expect(next.continuedFromTaskExecutionId).toBe(old.taskExecutionId);
      expect(next.runs).toHaveLength(1);
      expect(next.planContract).toBeUndefined();
      expect(parseOdNextPromptBundleV2(next.promptBundle.text).coreSystemPrompt.outputContract).toContain('od-production-ready');
      const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
      expect(invocations).toHaveLength(2);
      expect(invocations[1]!.argv).not.toContain('resume');
      expect(invocations[1]!.stdin).toContain('Keep the blue background.');
      expect(invocations[1]!.stdin).toContain('Plan: one blue dog battle page.');
      expect(invocations[1]!.stdin).toContain('Audience: children aged 6–8.');
      expect(invocations[1]!.stdin).not.toContain('Historical V2 output:');
      expect(invocations[1]!.stdin).not.toContain('{invalid legacy plan');
      expect(await readFile(path.join(invocations[1]!.cwd, 'index.html'), 'utf8')).toContain('Dog battle');
      expect(database().prepare('SELECT * FROM strategy_task_executions WHERE task_execution_id=?').get(old.taskExecutionId)).toEqual(historical);
      await stopServer(started); started = await startDaemon();
      const retry = await postRun(started.url, request);
      expect(retry.runId).toBe(continued.runId);
      expect((await readProjectInvocations(fixture.logPath, fixture.projectId))).toHaveLength(2);
    }, 45_000);

  it('rejects a handoff during an active run and continues under the current strategy after daemon restart', async () => {
    const fixture = await createPublicRolloutFixture('marker-handoff', 'design');
    started = fixture.started; binDir = fixture.binDir;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    frozenProtocolFixture.legacy = true;
    const first = await postRun(started.url, publicRunRequest(fixture,
      'Hold the public rollout run open until canceled.', 'upgrade-running'));
    await vi.waitFor(async () => expect((await getRun(started!.url, first.runId as string)).status).toBe('running'));
    const request = { ...publicRunRequest(fixture, 'Continue and create the dog battle page.', 'upgrade-continued'),
      taskExecutionId: first.strategyTask!.taskExecutionId };
    const busy = await fetch(`${started.url}/api/runs`, { method: 'POST',
      headers: { 'content-type': 'application/json' }, body: JSON.stringify(request) });
    expect(busy.status).toBe(409);
    expect(await busy.json()).toMatchObject({ error: { code: 'RUN_IN_PROGRESS' } });
    await stopServer(started); frozenProtocolFixture.legacy = false; started = await startDaemon();
    const next = await postRun(started.url, request);
    expect(next.strategyTask!.taskExecutionId).not.toBe(first.strategyTask!.taskExecutionId);
    expect((await waitForRunTerminal(started.url, next.runId as string)).status).toBe('succeeded');
    const task = await waitForTask(next.strategyTask!.taskExecutionId, 'completed');
    expect(task.runs).toHaveLength(1);
    expect(task.continuedFromTaskExecutionId).toBe(first.strategyTask!.taskExecutionId);
  }, 45_000);

  it('runs OD Next by default and leaves it on the next run once the installation opts out', async () => {
    const fixture = await createPublicRolloutFixture('app-config-opt-out', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';

    const beforeOptOut = await postRun(started.url, publicRunRequest(
      fixture,
      'Run before this installation opted out.',
      'app-config-opt-out-before',
    ));
    expect(beforeOptOut.strategyTask).toMatchObject({ inputStage: 'request', terminal: false });
    expect(await readDurableRunState(beforeOptOut.runId as string)).toMatchObject({
      strategyRolloutDecision: { decisionClass: 'active', taskType: 'prototype' },
    });
    await fetch(
      `${started.url}/api/runs/${encodeURIComponent(beforeOptOut.runId as string)}/cancel`,
      { method: 'POST' },
    );
    await waitForRunTerminal(started.url, beforeOptOut.runId as string);

    const optOut = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ odNextStrategyMode: 'off' }),
    });
    expect(optOut.status).toBe(200);
    expect((await optOut.json() as { config?: { odNextStrategyMode?: string } }).config?.odNextStrategyMode)
      .toBe('off');

    // A typo is refused rather than absorbed. Dropping it would leave the key
    // unconfigured, and unconfigured is `active` — so an absorbed typo would
    // revoke this opt-out while the caller saw success. That is the one
    // failure mode a control switch must not have.
    const typo = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ odNextStrategyMode: 'of' }),
    });
    expect(typo.status).toBe(400);
    expect((await typo.json() as { error?: { code?: string } }).error?.code)
      .toBe('INVALID_APP_CONFIG_VALUE');
    const stillOff = await fetch(`${started.url}/api/app-config`);
    expect((await stillOff.json() as { config?: { odNextStrategyMode?: string } })
      .config?.odNextStrategyMode).toBe('off');

    // Count first, compare after: the canceled run above may or may not have
    // reached a spawn, so what this asserts is the invocations the ordinary
    // run added — not the whole log.
    const invocationsBefore = (await readProjectInvocations(fixture.logPath, fixture.projectId)).length;
    const afterOptOut = await postRun(started.url, publicRunRequest(
      fixture,
      'Run after this installation opted out.',
      'app-config-opt-out-after',
    ));
    expect(afterOptOut.strategyTask).toBeUndefined();
    expect(afterOptOut.pluginId).toBe('example-web-prototype');
    await waitForRunTerminal(started.url, afterOptOut.runId as string);
    const ordinaryInvocations = (await readProjectInvocations(fixture.logPath, fixture.projectId))
      .slice(invocationsBefore);
    expect(ordinaryInvocations).toHaveLength(1);
    expect(ordinaryInvocations[0]?.stdin).not.toContain('OD Next Strategy V2');
    expect(ordinaryInvocations[0]?.stdin).not.toContain('open-design.strategy-state/v2');

    // The operator-facing surface names the authority that decided, so the
    // person who just configured the mode can confirm theirs is the one in
    // effect rather than inferring it from the resulting mode — which matters
    // more now that `default` and a saved `off` resolve to opposite routes.
    const status = await fetch(`${started.url}/api/strategies/od-next/rollout`);
    expect(status.status).toBe(200);
    expect((await status.json() as { status: unknown }).status).toMatchObject({
      requestedMode: 'off',
      requestedModeSource: 'app_config',
      effectiveMode: 'off',
    });
    // Two full runs against a real server, plus config writes and a status
    // read — the heaviest case in this file, and the only one that drives more
    // than a single run. The suite default of 20s leaves it no headroom on a
    // slow runner.
  }, 60_000);

  it('keeps the automatic route when a named Skill cannot be resolved', async () => {
    const fixture = await createPublicRolloutFixture('prestart-skill-fallback', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
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

  it('reports the deciding authority through the shared API and CLI, and offers no reset', async () => {
    // This used to cover the instance stop latch and its compare-and-swap
    // reset. Both are gone: nothing but the saved mode turns OD Next off, so
    // there is no latch to inspect and no operator recovery to protect. What is
    // still worth an endpoint is the authority — `default` and a saved `off`
    // produce opposite routes, and the mode alone does not say which happened.
    const fixture = await createPublicRolloutFixture('rollout-control', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
    delete process.env.OD_NEXT_STRATEGY_ROLLOUT;
    // Cases in this file share one data dir, and an earlier one leaves a saved
    // `off` behind. Clearing the key is the deliberate way back to the default,
    // and asserting it here is also what proves `null` still means that.
    const cleared = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ odNextStrategyMode: null }),
    });
    expect(cleared.status).toBe(200);

    const defaultResult = await runOdCli([
      'strategy', 'rollout', 'status', '--daemon-url', started.url, '--json',
    ]);
    expect(defaultResult.stderr).toBe('');
    expect((JSON.parse(defaultResult.stdout) as { status: unknown }).status).toEqual({
      strategyId: 'od-next-strategy',
      scope: 'daemon_instance',
      requestedMode: 'active',
      requestedModeSource: 'default',
      effectiveMode: 'active',
    });

    const optOut = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ odNextStrategyMode: 'off' }),
    });
    expect(optOut.status).toBe(200);

    const savedResult = await runOdCli([
      'strategy', 'rollout', 'status', '--daemon-url', started.url, '--json',
    ]);
    expect(savedResult.stderr).toBe('');
    expect((JSON.parse(savedResult.stdout) as { status: unknown }).status).toMatchObject({
      requestedMode: 'off',
      requestedModeSource: 'app_config',
      effectiveMode: 'off',
    });

    // The reset endpoint and its CLI subcommand are both gone, and gone the
    // same way — a daemon that still answered it would be a daemon that still
    // had something to reset.
    const reset = await fetch(`${started.url}/api/strategies/od-next/rollout/reset`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ expectedRevision: 0 }),
    });
    expect(reset.status).toBe(404);
    // `runOdCli` rejects on a non-zero exit, and an unknown subcommand is
    // exactly that: usage, exit 2. Catching keeps the assertion on what the CLI
    // told the operator rather than on the rejection itself.
    const resetCli = await runOdCli([
      'strategy', 'rollout', 'reset', '--daemon-url', started.url, '--json',
    ]).then(
      (ok) => ({ code: 0, stdout: ok.stdout, stderr: ok.stderr }),
      (error: { code?: number; stdout?: string; stderr?: string }) => ({
        code: error.code ?? -1,
        stdout: error.stdout ?? '',
        stderr: error.stderr ?? '',
      }),
    );
    expect(resetCli.code).toBe(2);
    // Named, not silently absent from a usage dump. `reset` shipped in 0.21.0
    // and 0.21.1, so an operator who scripted it gets told what happened and
    // what replaced it — and gets a non-zero exit, because the recovery it
    // asked for neither happened nor can.
    expect(resetCli.stderr).toContain('od strategy rollout reset was removed');
    expect(resetCli.stderr).toContain('od config set odNextStrategyMode off');
  });

  it('keeps active retry/task recipe-only while rollback lazily resolves the ordinary default', async () => {
    const fixture = await createPublicRolloutFixture('rollback', 'design');
    started = fixture.started;
    binDir = fixture.binDir;
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
    const promptBundleText = activeTask?.promptBundle.text ?? '';
    const doneKey = /<od-production-ready key="([a-f0-9]{16})" \/>/.exec(promptBundleText)?.[1];
    expect(doneKey).toMatch(/^[a-f0-9]{16}$/);
    expect(promptBundleText).toContain('production automatically');
    expect(promptBundleText).not.toContain('<od-done key=');
    expect(promptBundleText).not.toContain('<od-focus key=');
    expect(promptBundleText.slice(
      promptBundleText.indexOf('<open_design_core_system_prompt>'),
      promptBundleText.indexOf('</open_design_core_system_prompt>'),
    )).not.toContain(doneKey);
    expect(activeTask?.promptBundle.utf8Bytes).toBe(
      Buffer.byteLength(activeTask?.promptBundle.text ?? '', 'utf8'),
    );
    expect((database().prepare(
      'SELECT applied_plugin_snapshot_id AS snapshotId FROM projects WHERE id = ?',
    ).get(fixture.projectId) as { snapshotId: string | null }).snapshotId)
      .toBeNull();

    // The rest of this case needs later runs on the ordinary route. Saying so
    // through the mode is now the only way to say it: a run can no longer put
    // this daemon on the legacy path for the runs that follow it.
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'off';
    const replayed = await postRun(started!.url, activeBody);
    expect(replayed).toMatchObject({
      runId: active.runId,
      taskExecutionId: active.taskExecutionId,
      reused: true,
    });

    await waitForInvocationCount(fixture.logPath, fixture.projectId, 1);
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
    const ordinary = await postRun(
      started!.url,
      publicRunRequest(fixture, 'Run after rollback.', 'ordinary-after-rollback'),
    );
    expect(ordinary.strategyTask).toBeUndefined();
    expect(ordinary.pluginId).toBe('example-web-prototype');
    await waitForRunTerminal(started!.url, ordinary.runId as string);

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
    await waitForRunTerminal(started.url, deleted.runId as string);
    const nulled = await postRun(started.url, nullBody);
    await waitForInvocationCount(fixture.logPath, fixture.projectId, 2);
    await Promise.all([
      waitForRunTerminal(started.url, deleted.runId as string),
      waitForRunTerminal(started.url, nulled.runId as string),
    ]);
    const invocationCount = (await readProjectInvocations(fixture.logPath, fixture.projectId)).length;

    // Deliberately corrupt this task's mapping after removing its new evidence
    // children. The test still exercises the real missing-mapping rejection.
    database().transaction(() => {
      database().prepare('DELETE FROM strategy_task_run_write_evidence WHERE task_execution_id = ?').run(deleted.taskExecutionId);
      database().prepare('DELETE FROM strategy_task_runs WHERE task_execution_id = ?').run(deleted.taskExecutionId);
    }).immediate();
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

  // OPEND-2365 (P1). Only the HTTP-created Run passes through the analytics
  // lifecycle installed on POST /api/runs; the repair and production Runs the
  // daemon allocates for the SAME logical task are started straight off
  // `internalRunCreation.start(...)` and never enter it. Every OD Next rate
  // computed per physical Run — volume, success, failure, cancellation,
  // duration — is therefore measured on the request stage alone.
  it('installs the run analytics lifecycle on every physical Run of an automatic chain', async () => {
    const fixture = await createFixture('repair');
    const analyticsHeaders = {
      'x-od-analytics-device-id': 'device-opend-2365',
      'x-od-analytics-session-id': 'session-opend-2365',
      'x-od-analytics-client-type': 'desktop',
    };

    queueFixtureIds(fixture);
    const created = await postRun(
      started!.url,
      createRunRequest(fixture, 'Build the operator prototype.'),
      analyticsHeaders,
    );
    expect(created.runId).toBe(fixture.initialRunId);

    await waitForRunTerminal(started!.url, fixture.initialRunId);
    const terminal = await waitForTask(fixture.taskExecutionId, 'completed');
    expect(terminal.runs.map((run) => run.inputStage)).toEqual([
      'request',
      'production',
    ]);

    const recoveries = await waitForRunAnalyticsRecoveries(
      terminal.runs.map((mapping) => mapping.runId),
    );
    // Reported at all.
    expect(
      terminal.runs
        .map((mapping, index) => (recoveries[index] ? null : mapping.inputStage))
        .filter(Boolean),
    ).toEqual([]);
    // One stable identity per physical Run — a shared insert id would collapse
    // three Runs into one row on ingest.
    const insertIds = recoveries.map((recovery) => recovery?.insertId);
    expect(new Set(insertIds).size).toBe(2);
    // The continuation inherits the requesting client's identity rather than
    // inventing one, so the chain stays attributable to the same person.
    for (const recovery of recoveries) {
      expect(recovery?.context?.deviceId).toBe('device-opend-2365');
    }
    // The terminal listener ran for each Run, which is what emits run_finished.
    for (const recovery of recoveries) {
      expect(typeof recovery?.completedAt).toBe('number');
    }
    // The lineage is what stitches the physical Runs back into one turn: one
    // shared task id, one shared first Run, and a Run index that advances.
    const lineage = recoveries.map((recovery) => recovery?.properties ?? {});
    expect(new Set(lineage.map((props) => props.task_execution_id)).size).toBe(1);
    expect(new Set(lineage.map((props) => props.initial_run_id))).toEqual(
      new Set([fixture.initialRunId]),
    );
    expect(lineage.map((props) => props.task_run_index)).toEqual([0, 1]);
    // The rollout decision is daemon-owned truth; every Run of an admitted
    // task reports the harness it actually ran under.
    expect(lineage.map((props) => props.harness)).toEqual([
      'od_next',
      'od_next',
    ]);
    // The lifecycle re-reads host facts (app config, agent detection) before
    // it captures, so three physical Runs settle well past the shared default.
  }, 90_000);

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
      'production',
    ]);
    expect(terminal.route).toBe('full_plan');
    expect(terminal.terminalRunId).toBe(terminal.runs[1]?.runId);
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(2);

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
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(2);
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)?.runs).toHaveLength(2);

    await stopServer(started);
    started = await startDaemon();
    expect((await getRun(started.url, fixture.initialRunId)).status).toBe('succeeded');
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(2);
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)).toMatchObject({
      outcome: 'completed',
      terminalRunId: terminal.runs[1]?.runId,
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
    expect(invocations).toHaveLength(2);
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

  it('keeps a successful no-artifact production reply completed without claiming delivery', async () => {
    const fixture = await createFixture('repair');
    await writeFile(`${fixture.logPath}.blocked-production`, '1');
    queueFixtureIds(fixture);
    await postRun(started!.url, createRunRequest(fixture, 'Build the lesson deck.'), {
      'x-od-analytics-device-id': 'device-no-artifact-production',
      'x-od-analytics-session-id': 'session-no-artifact-production',
      'x-od-analytics-client-type': 'desktop',
    });
    const task = await waitForTask(fixture.taskExecutionId, 'completed');
    expect(task.runs.map((run) => run.inputStage)).toEqual(['request', 'production']);
    const terminal = await waitForRunTerminal(started!.url, task.latestRunId);
    // A clean production exit completes the turn without claiming delivery.
    // Missing artifacts must not restore contract blocking or a repair turn.
    expect(terminal).toMatchObject({
      status: 'succeeded',
      exitCode: 0,
      strategyTask: {
        outcome: 'completed', terminal: true, inputStage: 'production',
        deliverableValid: false, settlementReason: 'ended', settlementFacts: { todoUnfinished: true, deliverableValid: false },
      },
    });
    expect(terminal.endedWithUnfinishedWork).toBe(true);
    expect(terminal.errorCode ?? null).toBeNull();
    expect(terminal.error ?? null).toBeNull();
    const records = (await readFile(terminal.eventsLogPath, 'utf8')).trim().split('\n')
      .map((line) => JSON.parse(line));
    expect(records.filter((event) => event.event === 'error')).toHaveLength(0);
    expect(records.filter((event) => event.event === 'end')).toHaveLength(1);
    const end = records.find((event) => event.event === 'end')?.data;
    expect(end).toMatchObject({
      status: 'succeeded',
      code: 0,
      artifactCount: 0,
      strategyTask: {
        outcome: 'completed', inputStage: 'production',
        deliverableValid: false, settlementReason: 'ended', settlementFacts: { todoUnfinished: true, deliverableValid: false },
      },
    });
    expect(end.strategyTask.blockedContext ?? null).toBeNull();
    expect(records.find((event) => event.data?.type === 'runtime_close')?.data)
      .toMatchObject({ rpc_close_reason: 'exit_0', status: 'succeeded', exit_code: 0 });
    const response = await fetch(
      `${started!.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`,
    );
    const { messages } = await response.json() as {
      messages: Array<{ runId?: string; runStatus?: string }>;
    };
    expect(messages.find((message) => message.runId === task.latestRunId)?.runStatus).toBe('succeeded');
    const [recovery] = await waitForRunAnalyticsRecoveries([task.latestRunId]);
    expect(recovery?.properties).toMatchObject({
      result: 'success',
      od_next_settlement_reason: 'ended', od_next_settlement_facts: { todoUnfinished: true, deliverableValid: false },
      rpc_close_reason: 'exit_0',
    });
    expect(recovery?.properties?.error_code).toBeUndefined();
    expect(recovery?.properties?.od_next_blocked_reason_code).toBeUndefined();
    for (const mapping of task.runs.slice(0, -1)) {
      expect((await getRun(started!.url, mapping.runId)).status).toBe('succeeded');
    }
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(2);
  }, 90_000);

  it("ends a refused planning turn as the agent's reply instead of a failed Run", async () => {
    const fixture = await createFixture('repair');
    await writeFile(`${fixture.logPath}.refused-request`, '1');
    queueFixtureIds(fixture);
    await postRun(started!.url, createRunRequest(fixture, 'hello'), {
      'x-od-analytics-device-id': 'device-refused-request',
      'x-od-analytics-session-id': 'session-refused-request',
      'x-od-analytics-client-type': 'desktop',
    });
    const task = await waitForTask(fixture.taskExecutionId, 'completed');
    expect(task.runs.map((run) => run.inputStage)).toEqual(['request']);
    const terminal = await waitForRunTerminal(started!.url, task.latestRunId);
    // The task records the refusal; the physical Run keeps its own clean exit.
    expect(terminal).toMatchObject({
      status: 'succeeded',
      exitCode: 0,
      strategyTask: { outcome: 'completed', terminal: true, inputStage: 'request' },
    });
    expect(terminal.endedWithUnfinishedWork).toBe(false);
    expect(terminal.errorCode ?? null).toBeNull();
    expect(terminal.error ?? null).toBeNull();
    const records = (await readFile(terminal.eventsLogPath, 'utf8')).trim().split('\n')
      .map((line) => JSON.parse(line));
    expect(records.filter((event) => event.event === 'error')).toHaveLength(0);
    expect(records.filter((event) => event.event === 'end')).toHaveLength(1);
    expect(records.find((event) => event.event === 'end')?.data).toMatchObject({
      status: 'succeeded', code: 0, strategyTask: { outcome: 'completed', inputStage: 'request' },
    });
    expect(records.find((event) => event.data?.type === 'runtime_close')?.data)
      .toMatchObject({ rpc_close_reason: 'exit_0', status: 'succeeded', exit_code: 0 });
    const response = await fetch(
      `${started!.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`,
    );
    const { messages } = await response.json() as {
      messages: Array<{ runId?: string; runStatus?: string; content?: string }>;
    };
    expect(messages.find((message) => message.runId === task.latestRunId)).toMatchObject({
      runStatus: 'succeeded',
      content: expect.stringContaining('Tell me what you would like to design'),
    });
    const [recovery] = await waitForRunAnalyticsRecoveries([task.latestRunId]);
    expect(recovery?.properties).toMatchObject({
      result: 'success',
      rpc_close_reason: 'exit_0',
    });
    expect(recovery?.properties?.error_code).toBeUndefined();
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(1);
  }, 90_000);

  it('preserves physical Run failure without a duplicate task block when the selected agent exits before publishing a session', async () => {
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
        outcome: 'completed',
        terminal: true,
      },
    });
    expect(getStrategyTaskExecution(database(), fixture.taskExecutionId)).toMatchObject({
      outcome: 'completed',
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

  it.each([
    { declaredEntry: true, childFile: 'plant-taxonomy-guide.html' },
    { declaredEntry: false, childFile: 'plant-taxonomy-guide.html' },
    { declaredEntry: false, childFile: 'index.html' },
  ])('completes a linked $childFile write without Runtime State (declared entry: $declaredEntry, OPEND-2887)', async ({ declaredEntry, childFile }) => {
    const fixture = await createFixture('repair');
    const entryFile = 'plant-science-landing.html';
    const upload = await fetch(`${started!.url}/api/projects/${fixture.projectId}/files`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: entryFile, content: `<!doctype html><a href="${childFile}">分类导览</a>` }),
    });
    expect(upload.ok).toBe(true);
    if (declaredEntry) {
      const update = await fetch(`${started!.url}/api/projects/${fixture.projectId}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ metadata: { kind: 'prototype', entryFile } }),
      });
      expect(update.ok).toBe(true);
    }
    await writeFile(`${fixture.logPath}.linked-page`, childFile);
    queueFixtureIds(fixture);
    const created = await postRun(started!.url, createRunRequest(fixture, 'Build the taxonomy page linked from the existing landing page.'));
    const terminal = await waitForRunTerminal(started!.url, created.runId as string);
    expect(terminal).toMatchObject({
      status: 'succeeded', deliverableValid: true, deliverableEntryFile: entryFile,
      strategyTask: { outcome: 'completed', terminal: true },
    });
    const task = getStrategyTaskExecution(database(), terminal.strategyTask!.taskExecutionId)!;
    expect(task.runs).toHaveLength(1);
    const invocations = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(invocations).toHaveLength(1);
    expect(parseOdNextPromptBundleV2(invocations[0]!.stdin).coreSystemPrompt.outputContract)
      .toContain('od-production-ready');
    const reloaded = await fetch(`${started!.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`);
    const { messages } = await reloaded.json() as { messages: Array<{ runId?: string; strategyTaskDelivered?: boolean }> };
    expect(messages.find((message) => message.runId === task.latestRunId)?.strategyTaskDelivered).toBe(true);
    const cli = await runOdCli(['run', 'info', task.latestRunId!, '--daemon-url', started!.url, '--json']);
    expect(JSON.parse(cli.stdout)).toMatchObject({ strategyTask: { outcome: 'completed' } });
    if (!declaredEntry) {
      const project = await fetch(`${started!.url}/api/projects/${fixture.projectId}`);
      expect(await project.json()).toMatchObject({ project: { metadata: { entryFile } } });
      await writeFile(`${fixture.logPath}.linked-page-edit`, '1');
    }
    const followup = await postRun(started!.url, {
      ...createRunRequest(fixture, declaredEntry ? 'Confirm the delivered page.' : 'Update the taxonomy page.'),
      userMessageId: `followup-user-${fixture.projectId}`,
      assistantMessageId: `followup-assistant-${fixture.projectId}`,
      clientRequestId: `followup-request-${fixture.projectId}`,
    });
    const followupTerminal = await waitForRunTerminal(started!.url, followup.runId as string);
    expect(followupTerminal).toMatchObject(declaredEntry ? {
      deliverableValid: false, deliverableValidation: 'no_artifact',
      strategyTask: { outcome: 'completed', terminal: true },
    } : {
      deliverableValid: true, deliverableEntryFile: entryFile,
      strategyTask: { outcome: 'completed', terminal: true },
    });
    expect(followupTerminal.strategyTask!.taskExecutionId).not.toBe(task.taskExecutionId);
    const resumed = await readProjectInvocations(fixture.logPath, fixture.projectId);
    expect(resumed).toHaveLength(2);
    expect(resumed[1]!.argv).toContain('resume');
  });

  it('preserves unfinished todos alongside file evidence without an extra automatic turn', async () => {
    // A valid file proves an output exists, not that the remaining work is done.
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
    expect(terminal.endedWithUnfinishedWork).toBe(true);
    expect(task.runs.map((run) => run.inputStage)).toEqual(['request', 'production']);
    expect(await readProjectInvocations(fixture.logPath, fixture.projectId)).toHaveLength(2);

    // Reload retains both facts: a file was delivered and todos remain unfinished.
    const reloaded = await fetch(
      `${started!.url}/api/projects/${fixture.projectId}/conversations/${fixture.conversationId}/messages`,
    );
    expect(reloaded.status).toBe(200);
    const { messages } = await reloaded.json() as {
      messages: Array<{ role: string; runId?: string; strategyTaskDelivered?: boolean; events?: unknown }>;
    };
    const deliveredTurn = messages.find((message) => message.runId === task.latestRunId);
    expect(deliveredTurn).toBeDefined();
    expect(deliveredTurn!.strategyTaskDelivered).toBe(true);
    expect(contracts.eventsEndedWithUnfinishedWork(deliveredTurn!.events)).toBe(true);
  });

  async function createFixture(_mode: 'repair', { probeLogPath }: { probeLogPath?: string } = {}) {
    const suffix = `marker-${Date.now()}-${++sequence}`;
    const publicFixture = await createPublicRolloutFixture(`chain-${suffix}`, 'design');
    started = publicFixture.started; binDir = publicFixture.binDir;
    process.env.OD_NEXT_STRATEGY_ROLLOUT = 'active';
    process.env.OD_NEXT_STRATEGY_LOCAL_SYNTHETIC_CANARY = '1';
    const initialRunId = `019fffab-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
    const taskOwnerUuid = `019fffaa-0000-7000-8000-${sequence.toString(16).padStart(12, '0')}`;
    const taskExecutionId = `odnext_${taskOwnerUuid.replaceAll('-', '')}`;
    const { bin, logPath } = await writeStrategyCodex(binDir, probeLogPath);
    const configResponse = await fetch(`${started.url}/api/app-config`, {
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId: 'codex', agentCliEnv: { codex: { CODEX_BIN: bin, CODEX_HOME: binDir } },
        telemetry: { metrics: false, content: false, artifactManifest: false }, privacyDecisionAt: Date.now() }),
    });
    expect(configResponse.status).toBe(200);
    expect((await fetch(`${started.url}/api/agents`)).status).toBe(200);
    return { projectId: publicFixture.projectId, conversationId: publicFixture.conversationId,
      snapshotId: 'automatic-fixture-snapshot', useAutomaticSnapshot: true, initialRunId, taskOwnerUuid,
      taskExecutionId, logPath, agentId: 'codex' };
  }

});

type CodexArchiveFrame = { pid: number; method: string; threadId?: string };

async function createPublicRolloutFixture(
  label: string,
  conversationMode: 'design' | 'chat' | 'plan' = 'chat',
  pluginId?: string,
  agentCliVersion = 'codex-cli 0.147.0',
  preflightResolver?: () => typeof EXECUTION_PREFLIGHT,
) {
  const suffix = `${label}-${Date.now()}`;
  const binDir = await mkdtemp(path.join(os.tmpdir(), `od-next-public-${label}-`));
  const { bin, logPath } = await writePublicRolloutCodex(
    binDir,
    label,
    agentCliVersion,
  );
  const started = await startDaemon(preflightResolver);
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
  exampleReference?: { pluginId: string; source: string },
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
      ...(exampleReference ? { exampleReference } : {}),
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
        exampleBinding?: {
          provenance: string;
          pluginId: string;
          pluginSource: string;
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
  if (['marker-expired-session', 'marker-expired-side-effect', 'marker-request-expired'].includes(${JSON.stringify(label)}) && argv.includes('resume')) {
    if (${JSON.stringify(label)} === 'marker-expired-side-effect') {
      console.log(JSON.stringify({ type: 'item.completed', item: {
        id: 'side-effect', type: 'command_execution', command: 'echo executed', aggregated_output: 'executed', exit_code: 0, status: 'completed',
      } }));
    }
    process.stderr.write('no rollout found for thread id invalid-session\\n');
    process.exit(1);
  }
  if (${JSON.stringify(label)} !== 'marker-missing-session') {
  console.log(JSON.stringify({ type: 'thread.started', thread_id: ${JSON.stringify(label.startsWith('marker-') ? THREAD_ID : 'public-rollout-session')} }));
  }
  console.log(JSON.stringify({ type: 'turn.started' }));
  if (stdin.includes('Hold the public rollout run open until canceled.') && !stdin.includes('Historical task context.')) {
    setInterval(() => {}, 1 << 30);
    return;
  }
  if (stdin.includes('Hold the run open and drain slowly after a stop.') && !stdin.includes('Historical task context.')) {
    // Stopping answers only after the process exits; keep that window open.
    process.on('SIGTERM', () => setTimeout(() => process.exit(0), 2500));
    setInterval(() => {}, 1 << 30);
    return;
  }
  if (${JSON.stringify(label)} === 'marker-tool-split' && !stdin.includes('This is the production turn')) {
    const key = /<od-production-ready key="([a-f0-9]+)"/.exec(stdin)?.[1];
    if (!key) throw new Error('Current host marker key was not injected');
    for (const item of [
      { id: 'plan', type: 'agent_message', text: 'Plan: create a landing page and a matching deck.' },
      { id: 'todo', type: 'command_execution', command: 'echo planned', aggregated_output: 'planned', exit_code: 0, status: 'completed' },
      { id: 'answer', type: 'agent_message', text: '<od-production-ready key="' + key + '" />' },
    ]) console.log(JSON.stringify({ type: 'item.completed', item }));
    console.log(JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }));
    setTimeout(() => process.exit(0), 5);
    return;
  }
  let text = 'Ordinary public run completed.';
  if (${JSON.stringify(label)} === 'marker-handoff') {
    if (stdin.includes('Historical task context.')) {
      fs.writeFileSync('index.html', '<!doctype html><html><body>Dog battle</body></html>');
      text = 'Delivered index.html.';
    } else text = 'Plan: one blue dog battle page.\\n<open-design-plan-contract>bad old contract</open-design-plan-contract>';
  } else if (${JSON.stringify(label)} === 'marker-image') {
    if (stdin.includes('This is the production turn')) {
      fs.writeFileSync('dog.png', Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a5X8AAAAASUVORK5CYII=', 'base64'));
      text = 'Delivered dog.png.';
    } else {
      const key = /<od-production-ready key="([a-f0-9]+)"/.exec(stdin)?.[1];
      if (!key) throw new Error('Current host marker key was not injected');
      text = 'Plan: deliver a standalone dog image only.\\n<od-production-ready key="' + key + '" />';
    }
  } else if (['marker-production', 'marker-missing-session', 'marker-expired-session', 'marker-expired-side-effect', 'marker-tool-split'].includes(${JSON.stringify(label)})) {
    if (stdin.includes('This is the production turn')) {
      fs.writeFileSync('landing.html', '<!doctype html><html><body>Landing</body></html>');
      fs.writeFileSync('deck.html', '<!doctype html><html><body>Deck</body></html>');
      text = 'Wrote landing.html and deck.html.\\n<open-design-runtime-state>\\n{broken}\\n</open-design-runtime-state>';
    } else {
      const key = /<od-production-ready key="([a-f0-9]+)"/.exec(stdin)?.[1];
      if (!key) throw new Error('Current host marker key was not injected');
      text = 'Plan: create a landing page and a matching deck.\\n<od-production-ready key="' + key + '" />';
    }
  } else if (['marker-question', 'marker-request-expired'].includes(${JSON.stringify(label)})) {
    text = '<question-form id="scope">{"questions":[{"id":"audience","label":"Who is this for?"}]}</question-form>';
  } else if (${JSON.stringify(label)} === 'marker-question-plan') {
    if (stdin.includes('This is the production turn')) {
      fs.writeFileSync('index.html', '<!doctype html><html><body>Developer landing</body></html>');
      text = 'Wrote index.html.';
    } else if (stdin.includes('Audience: developers.')) {
      const key = /<od-production-ready key="([a-f0-9]+)"/.exec(stdin)?.[1];
      if (!key) throw new Error('Current host marker key was not injected');
      text = 'Plan: a landing page for developers.\\n<od-production-ready key="' + key + '" />';
    } else {
      text = '<question-form id="scope">{"questions":[{"id":"audience","label":"Who is this for?"}]}</question-form>';
    }
  } else if (${JSON.stringify(label)} === 'marker-unreadable') {
    const key = /<od-production-ready key="([a-f0-9]+)"/.exec(stdin)?.[1];
    if (stdin.includes('This is the production turn')) {
      fs.writeFileSync('index.html', '<!doctype html><html><body>Page</body></html>');
      text = 'Wrote index.html.';
    } else if (key) {
      text = 'Plan: one page.\\n<od-production-ready key="' + key + '" />';
    }
  }
  console.log(JSON.stringify({
    type: 'item.completed', item: { id: 'answer', type: 'agent_message', text },
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

/** Rewrite a task's frozen bundle in the layout the v2 composer used before its reshape. */
function writeStalePromptBundle(taskExecutionId: string, initialRunId: string): void {
  const text = contracts.serializeCanonicalXml({
    kind: 'element',
    tag: 'open_design_prompt_bundle',
    attributes: [['schema', contracts.OD_NEXT_PROMPT_BUNDLE_SCHEMA_V2]],
    children: [{ kind: 'element', tag: 'system_prompt', children: [{ kind: 'text', tag: 'core_system_prompt', text: 'stale' }] }],
  });
  const utf8Bytes = Buffer.byteLength(text, 'utf8');
  const sha256 = createHash('sha256').update(text, 'utf8').digest('hex');
  database().prepare(`UPDATE strategy_task_executions SET prompt_bundle_text=?, prompt_bundle_utf8_bytes=?, prompt_bundle_sha256=?
    WHERE task_execution_id=?`).run(text, utf8Bytes, sha256, taskExecutionId);
  database().prepare(`UPDATE strategy_task_runs SET final_text=?, final_text_utf8_bytes=?, final_text_sha256=?
    WHERE run_id=?`).run(text, utf8Bytes, sha256, initialRunId);
}

async function readDurableRunState(runId: string): Promise<Record<string, unknown>> {
  const dataDir = process.env.OD_DATA_DIR;
  if (!dataDir) throw new Error('OD_DATA_DIR is required');
  return JSON.parse(await readFile(
    path.join(dataDir, 'runs', runId, 'state.json'),
    'utf8',
  )) as Record<string, unknown>;
}

/**
 * Reuse the ACP server fixtures' OD_AGENT_HOME + minimal PATH boundary.
 * Detection and the selected CLI still run normally; only unrelated host
 * executables are outside this test's discovery scope. Explicit *_BIN paths
 * can bypass PATH, so the fixture also removes inherited executable overrides.
 */
async function isolateAgentDetection(): Promise<void> {
  fixtureDetectionIsolation ??= (async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'od-next-agent-detection-'));
    try {
      const home = path.join(root, 'home');
      const bin = path.join(root, 'bin');
      await mkdir(home);
      await mkdir(bin);
      // Keep Node shebangs usable without exposing every CLI installed beside
      // the host Node binary. Selected agent bins stay explicit in app config.
      await symlink(process.execPath, path.join(bin, 'node'));
      return { root, home, bin };
    } catch (error) {
      await rm(root, { recursive: true, force: true });
      throw error;
    }
  })();
  const isolation = await fixtureDetectionIsolation;
  process.env.OD_AGENT_HOME = isolation.home;
  process.env.PATH = [isolation.bin, '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(path.delimiter);
  for (const key of fixtureAgentBinEnvKeys) delete process.env[key];
}

async function startDaemon(
  resolver: () => typeof EXECUTION_PREFLIGHT =
    () => EXECUTION_PREFLIGHT,
  complexResolver: unknown = null,
): Promise<StartedServer> {
  await isolateAgentDetection();
  const started = await startServer({
    port: 0,
    returnServer: true,
  }) as StartedServer;
  fixtureHttpClients.set(new URL(started.url).origin, { owner: started, dispatcher: new Agent() });
  return started;
}

function stopServer(server: StartedServer | null): Promise<void> {
  if (!server) return Promise.resolve();
  const existing = fixtureShutdowns.get(server);
  if (existing) return existing;
  const pending = stopOwnedServer(server);
  fixtureShutdowns.set(server, pending);
  return pending;
}

async function stopOwnedServer(server: StartedServer): Promise<void> {
  await Promise.resolve(server.shutdown?.());
  const origin = new URL(server.url).origin;
  const client = fixtureHttpClients.get(origin);
  if (client?.owner === server) {
    fixtureHttpClients.delete(origin);
    // Runs have settled first. Release only this fixture's keep-alive clients,
    // including a connection whose idle transition races server.close().
    await client.dispatcher.destroy();
  }
  if (server.server.listening) {
    await new Promise<void>((resolve) => server.server.close(() => resolve()));
  }
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

async function writeStrategyCodex(dir: string, probeLogPath?: string): Promise<{ bin: string; logPath: string }> {
  const bin = path.join(dir, 'codex-repair');
  const logPath = path.join(dir, 'codex-marker.jsonl');
  await writeFile(bin, `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const argv = process.argv.slice(2);
const logPath = ${JSON.stringify(logPath)};
${probeLogPath ? `if (argv.includes('--version') || argv.includes('--help') || argv[0] === 'debug' && argv[1] === 'models' || argv[0] === 'login' && argv[1] === 'status') fs.appendFileSync(${JSON.stringify(probeLogPath)}, JSON.stringify(argv) + '\\n');` : ''}
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
  if (fs.existsSync(logPath + '.linked-page')) {
    const childFile = fs.readFileSync(logPath + '.linked-page', 'utf8');
    const edited = fs.existsSync(logPath + '.linked-page-edit');
    if (edited || !fs.existsSync(path.join(process.cwd(), childFile))) {
      fs.writeFileSync(path.join(process.cwd(), childFile), '<!doctype html><title>Taxonomy</title><a href="plant-science-landing.html">Home</a>' + (edited ? '<p>Updated taxonomy</p>' : ''));
    }
    text = '已交付 ' + childFile + '。';
  } else if (stdin.includes('This is the production turn') && fs.existsSync(logPath + '.blocked-production')) {
    staleTodoList = true;
    text = 'Working on the lesson.';
  } else if (stdin.includes('This is the production turn')) {
    fs.writeFileSync(path.join(process.cwd(), 'index.html'), '<!doctype html><title>Production</title>');
    staleTodoList = true;
    text = 'Delivered index.html.';
  } else if (!argv.includes('resume') && fs.existsSync(logPath + '.refused-request')) {
    // A planning turn that declines the request: the agent answers in prose,
    // writes nothing, emits no machine block, and exits cleanly.
    text = 'Hello! Tell me what you would like to design and I will plan it.';
  } else {
    const markerKey = /<od-production-ready key="([a-f0-9]+)"/.exec(stdin)?.[1];
    if (!markerKey) throw new Error('Missing current marker key');
    text = 'Prepared a simple plan.\\n<od-production-ready key="' + markerKey + '" />';
  }
  console.log(JSON.stringify({ type: 'thread.started', thread_id: ${JSON.stringify(THREAD_ID)} }));
  console.log(JSON.stringify({ type: 'turn.started' }));
  if (stdin.includes('This is the production turn') && fs.existsSync(logPath + '.blocked-production')) {
    // Replay the host-observed failure boundary: completed tools and progress text,
    // no deliverable or Runtime State, then a clean process exit.
    for (let i = 0; i < 2; i++) console.log(JSON.stringify({ type: 'item.completed', item: {
      id: 'tool-' + i, type: 'mcp_tool_call', server: 'tasks', tool: 'TodoWrite',
      arguments: { todos: [{ content: 'Build the lesson', status: 'in_progress' }] },
      result: { content: [{ type: 'text', text: 'Updated task list' }] }, status: 'completed',
    } }));
  }
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

async function postRun(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
) {
  const response = await fetch(`${url}/api/runs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
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

/**
 * The persisted analytics recovery record for one physical Run.
 *
 * This is the daemon's own durable evidence that a Run entered the analytics
 * lifecycle: `run_created` was captured under this `insertId`, and the terminal
 * listener replays `run_finished` from it after a restart. A physical Run that
 * has no record never reported, and never will.
 */
async function readRunAnalyticsRecovery(runId: string): Promise<{
  insertId?: string;
  context?: { deviceId?: string };
  properties?: Record<string, unknown>;
  completedAt?: number;
} | null> {
  const statePath = path.join(process.env.OD_DATA_DIR!, 'runs', runId, 'state.json');
  try {
    const raw = await readFile(statePath, 'utf8');
    return (JSON.parse(raw) as { analyticsRecovery?: any }).analyticsRecovery ?? null;
  } catch {
    return null;
  }
}

/**
 * Poll until each Run's recovery record has settled.
 *
 * The lifecycle installs after the response is sent and re-reads host facts
 * (app config, agent detection) before it captures, so the record appears a
 * beat behind the Run itself and is stamped complete only once the terminal
 * listener has run.
 */
async function waitForRunAnalyticsRecoveries(
  runIds: string[],
  timeoutMs = 45_000,
): Promise<Array<Awaited<ReturnType<typeof readRunAnalyticsRecovery>>>> {
  const deadline = Date.now() + timeoutMs;
  let latest = await Promise.all(runIds.map(readRunAnalyticsRecovery));
  while (
    Date.now() < deadline
    && !latest.every((recovery) => recovery && typeof recovery.completedAt === 'number')
  ) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    latest = await Promise.all(runIds.map(readRunAnalyticsRecovery));
  }
  return latest;
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
