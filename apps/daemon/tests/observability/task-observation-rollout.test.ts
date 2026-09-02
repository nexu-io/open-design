import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';

import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import {
  OD_NEXT_REQUEST_TURN_SCHEMA_V1,
  type OpenDesignPlanContractV2,
} from '@open-design/contracts';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { closeDatabase, openDatabase, upsertMessage } from '../../src/db.js';
import { createSnapshot } from '../../src/plugins/snapshots.js';
import {
  createTaskObservationRolloutService,
  readTaskObservationRolloutConfig,
} from '../../src/observability/task-observation-rollout.js';
import {
  readRunTelemetrySinkConfig,
  readTaskTelemetrySinkConfig,
} from '../../src/langfuse-trace.js';
import { runTelemetryDeliveryIdempotencyKey } from '../../src/observability/delivery-state.js';
import { reconcileDurableRunTerminals } from '../../src/runtimes/run-terminal-reconciliation.js';
import {
  bindOdNextExactSendPromptEvidence,
  buildPromptStackTelemetry,
  buildSafeChildPromptTelemetry,
  type PromptStackTelemetry,
} from '../../src/prompt-telemetry.js';
import {
  compareAndTransitionStrategyTaskExecution,
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  migrateStrategyTaskStore,
} from '../../src/strategies/task-store.js';
import {
  strategyTaskCreateIdentityFixture,
  strategyTaskTurnText,
  TEST_PROMPT_BUNDLE,
} from '../strategies/strategy-task-test-fixtures.js';

const BASE_ENV = {
  OPEN_DESIGN_VELA_TELEMETRY: 'off',
  OD_TELEMETRY_ENV: 'synthetic-test',
  LANGFUSE_PUBLIC_KEY: 'pk_fixture',
  LANGFUSE_SECRET_KEY: 'sk_fixture',
  LANGFUSE_BASE_URL: 'https://langfuse.example.test',
};

function strategyBinding() {
  const assetDigests = [
    { path: './SKILL.md', sha256: 'a'.repeat(64) },
    { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
  ];
  return {
    schema: 'open-design.applied-strategy/v2' as const,
    id: 'od-next-strategy' as const,
    version: '2.0.0',
    packageHash: strategyPackageHashFromDigests(assetDigests),
    assetDigests,
    selectedTaskProfile: {
      taskType: 'prototype' as const,
      version: '2.0.0',
      path: './assets/task-profiles/prototype.md',
      sha256: 'b'.repeat(64),
    },
    taskProfileVersions: ['2.0.0'],
    promptRecipe: 'od-next-plan-build-v2' as const,
  };
}

function planContractFixture(snapshotId: string): OpenDesignPlanContractV2 {
  const strategy = strategyBinding();
  return {
    schema: 'open-design.plan-contract/v2',
    strategy: {
      id: strategy.id,
      version: strategy.version,
      packageHash: strategy.packageHash,
      snapshotId,
    },
    taskProfile: {
      schemaVersion: '2',
      taskType: 'prototype',
      taskProfileVersion: strategy.selectedTaskProfile.version,
      goal: 'Build a synthetic prototype',
      contextAndAudience: 'Synthetic test',
      inputsAndReferences: [],
      constraints: [],
      canonicalDeliverable: { id: 'prototype', kind: 'prototype', format: 'html' },
      requiredDeliverables: [{ id: 'prototype', kind: 'prototype' }],
      designSpec: {
        source: 'resolved-baseline',
        version: '1',
        decisions: { palette: 'neutral' },
      },
      buildRequirements: [{ id: 'build-1', text: 'Build the synthetic prototype.' }],
      assumptions: [],
      risks: [],
      taskSpecific: {},
    },
    fullPlan: {
      executionMode: 'simple',
      steps: [{ id: 'step-1', objective: 'Build', outputs: ['prototype'] }],
      readinessArtifacts: [],
      buildPackages: [],
    },
    runManifest: {
      selectedAgentId: 'codex',
      capabilitySnapshotHash: 'c'.repeat(64),
      inputRefs: [],
      productionRoutes: ['html'],
      preflight: { intake: 'passed', execution: 'passed' },
    },
    decisionSummary: {
      goal: 'Build a synthetic prototype',
      deliverables: ['prototype'],
      keyConstraints: [],
      assumptions: [],
      risks: [],
      openDecisions: [],
    },
  };
}

function seedCompletedTask(db: Database.Database): void {
  db.prepare(
    `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
  ).run('project-1', 'Synthetic project', 1, 1);
  db.prepare(
    `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run('conversation-1', 'project-1', 'Synthetic conversation', 1, 1);
  const snapshot = createSnapshot(db, {
    projectId: 'project-1',
    conversationId: 'conversation-1',
    runId: null,
    pluginId: 'od-next-strategy',
    pluginVersion: '2.0.0',
    manifestSourceDigest: 'manifest-digest',
    strategy: strategyBinding(),
    taskKind: 'new-generation',
    inputs: {},
    resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'],
    capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [],
    connectorsRequired: [],
    connectorsResolved: [],
    mcpServers: [],
  });
  createStrategyTaskExecution(db, {
    taskExecutionId: 'task-1',
    projectId: 'project-1',
    conversationId: 'conversation-1',
    snapshotId: snapshot.snapshotId,
    selectedAgentId: 'codex',
    initialRunId: 'run-1',
    ...strategyTaskCreateIdentityFixture(),
    createdAt: 1_000,
  });
  db.prepare(
    `UPDATE strategy_task_executions
        SET revision = 1, route = 'direct_edit', outcome = 'completed',
            execution_mode = 'simple', updated_at = 2_000
      WHERE task_execution_id = 'task-1'`,
  ).run();
}

function syntheticRun() {
  const promptBundleIdentity = {
    kind: 'bundle' as const,
    schema: 'open-design.od-next-prompt-bundle/v2' as const,
    text: TEST_PROMPT_BUNDLE,
    utf8Bytes: Buffer.byteLength(TEST_PROMPT_BUNDLE, 'utf8'),
    sha256: createHash('sha256').update(TEST_PROMPT_BUNDLE, 'utf8').digest('hex'),
  };
  return {
    id: 'run-1',
    status: 'succeeded',
    createdAt: 1_000,
    updatedAt: 2_000,
    model: 'fixture-model',
    promptTelemetry: bindOdNextExactSendPromptEvidence({
      telemetry: buildPromptStackTelemetry({
        composedPrompt: TEST_PROMPT_BUNDLE,
        sections: [{ kind: 'odNextExactFinalText', content: TEST_PROMPT_BUNDLE }],
      }),
      finalText: TEST_PROMPT_BUNDLE,
      persisted: promptBundleIdentity,
      stage: 'request',
    }),
    events: [
      {
        event: 'agent',
        timestamp: 1_200,
        data: {
          type: 'usage',
          usage: { input_tokens: 21, output_tokens: 8 },
          model: 'fixture-model',
        },
      },
    ],
  };
}

function acceptedResponse(): Response {
  return new Response(JSON.stringify({ successes: [{ id: 'ok' }], errors: [] }), {
    status: 207,
    headers: { 'Content-Type': 'application/json' },
  });
}

interface DeliveryFixtureRow {
  mode: string;
  status: string;
  aggregateDigest: string | null;
  observationCount: number;
  coverageJson: string | null;
  idempotencyKey: string | null;
  attemptCount: number;
  crashWindow: number;
  dropReason: string | null;
  finalizedAt: number | null;
}

type SyntheticRunLike = Omit<
  ReturnType<typeof syntheticRun>,
  'events' | 'promptTelemetry'
> & {
  agentId?: string;
  assistantMessageId?: string;
  error?: string;
  errorCode?: string;
  preflightAgentCliVersion?: string;
  promptTelemetry?: PromptStackTelemetry;
  events: Array<{ event: string; timestamp: number; data: unknown }>;
};

describe('task observation rollout', () => {
  let tempDir: string;
  let db: Database.Database;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-task-observability-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    migrateStrategyTaskStore(db);
    seedCompletedTask(db);
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function service(input: {
    mode: 'off' | 'observe' | 'send';
    prefs?: { metrics: boolean; content: boolean; artifactManifest: boolean };
    appVersionInfo?: { version: string; channel: string; packaged: boolean };
    readTelemetryError?: Error;
    env?: Record<string, string>;
    fetchImpl?: typeof fetch;
    dataDir?: string;
    getRun?: (runId: string) => SyntheticRunLike | null;
    checkpointMappedRun?: (runId: string, reason: string, finalizedAt: number) => void;
  }) {
    return createTaskObservationRolloutService({
      db,
      ...(input.dataDir ? { dataDir: input.dataDir } : {}),
      getRun: input.getRun ?? ((runId) => runId === 'run-1' ? syntheticRun() : null),
      readTelemetry: async () => {
        if (input.readTelemetryError) throw input.readTelemetryError;
        return {
          prefs: input.prefs ?? { metrics: true, content: true, artifactManifest: false },
          installationId: 'installation-fixture',
          ...(input.appVersionInfo ? { appVersionInfo: input.appVersionInfo } : {}),
        };
      },
      env: {
        ...BASE_ENV,
        OD_NEXT_TASK_OBSERVABILITY_MODE: input.mode,
        ...(input.env ?? {}),
      },
      ...(input.fetchImpl ? { fetchImpl: input.fetchImpl } : {}),
      ...(input.checkpointMappedRun
        ? { checkpointMappedRun: input.checkpointMappedRun }
        : {}),
    });
  }

  function deliveryRow(): DeliveryFixtureRow {
    return db.prepare(`
      SELECT mode,
             status,
             aggregate_digest AS aggregateDigest,
             observation_count AS observationCount,
             coverage_json AS coverageJson,
             idempotency_key AS idempotencyKey,
             attempt_count AS attemptCount,
             crash_window AS crashWindow,
             drop_reason AS dropReason,
             finalized_at AS finalizedAt
        FROM strategy_task_observation_delivery
       WHERE task_execution_id = 'task-1'
    `).get() as DeliveryFixtureRow;
  }

  function seedSecondMappedRun(): void {
    const finalText = strategyTaskTurnText({
      taskExecutionId: 'task-1',
      inputStage: 'clarification',
      taskRunIndex: 1,
    });
    db.prepare(`
      INSERT INTO strategy_task_runs (
        task_execution_id, run_id, input_stage, task_run_index, source_run_id,
        final_text_kind, final_text_schema, final_text, final_text_utf8_bytes,
        final_text_sha256, created_at
      ) VALUES ('task-1', 'run-2', 'clarification', 1, 'run-1', ?, ?, ?, ?, ?, 1001)
    `).run(
      'turn',
      OD_NEXT_REQUEST_TURN_SCHEMA_V1,
      finalText,
      Buffer.byteLength(finalText, 'utf8'),
      createHash('sha256').update(finalText, 'utf8').digest('hex'),
    );
    db.prepare(`
      UPDATE strategy_task_executions
         SET revision = revision + 1, route = 'full_plan', input_stage = 'clarification',
             outcome = 'running', execution_mode = NULL, clarification_count = 1,
             latest_run_id = 'run-2', updated_at = 2001
       WHERE task_execution_id = 'task-1'
    `).run();
  }

  it('keeps the mapped run version when restart finalization replaces single-run telemetry', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const startedVersion = {
      version: '0.21.1',
      channel: 'stable',
      packaged: true,
    };
    const restartedVersion = {
      version: '0.22.0',
      channel: 'stable',
      packaged: true,
    };
    const durableRun = {
      ...syntheticRun(),
      appVersionInfo: { ...startedVersion, platform: 'darwin', arch: 'arm64' },
    };

    await expect(service({
      mode: 'send',
      appVersionInfo: restartedVersion,
      fetchImpl,
      getRun: (runId) => runId === 'run-1' ? durableRun : null,
    }).finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });

    const batch = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)).batch as Array<{
      type: string;
      body: Record<string, unknown>;
    }>;
    const trace = batch.find((event) => event.type === 'trace-create');
    expect(trace?.body).toMatchObject({
      release: startedVersion.version,
      version: startedVersion.version,
      metadata: {
        appVersion: startedVersion.version,
        appChannel: startedVersion.channel,
        packaged: startedVersion.packaged,
      },
    });
  });

  it('defaults unset/auto to send, fails invalid explicit mode closed, and reuses shared context', () => {
    expect(readTaskObservationRolloutConfig({
      OD_TELEMETRY_ENV: 'production',
    })).toEqual({
      requestedMode: 'auto',
      mode: 'send',
      context: { environment: 'production', tag: 'od-next-task-v1' },
    });
    expect(readTaskObservationRolloutConfig({
      OD_NEXT_TASK_OBSERVABILITY_MODE: 'active',
      OD_TELEMETRY_ENV: 'prod secret',
    })).toEqual({ requestedMode: 'invalid', mode: 'off', context: null });
    expect(readTaskObservationRolloutConfig({
      OD_NEXT_TASK_OBSERVABILITY_MODE: 'send',
      OD_TELEMETRY_ENV: 'staging-cn',
    })).toEqual({
      requestedMode: 'send',
      mode: 'send',
      context: { environment: 'staging-cn', tag: 'od-next-task-v1' },
    });
    expect(readTaskObservationRolloutConfig({
      OD_NEXT_TASK_OBSERVABILITY_MODE: 'send',
      OD_TELEMETRY_ENV: 'production',
      OD_NEXT_TASK_OBSERVABILITY_ENVIRONMENT: 'canary-cn',
      OD_NEXT_TASK_OBSERVABILITY_TAG: 'repair.01',
    })).toEqual({
      requestedMode: 'send',
      mode: 'send',
      context: { environment: 'canary-cn', tag: 'repair.01' },
    });
    expect(readTaskObservationRolloutConfig({
      OD_NEXT_TASK_OBSERVABILITY_MODE: 'send',
      OD_TELEMETRY_ENV: 'production',
      OD_NEXT_TASK_OBSERVABILITY_TAG: 'unsafe tag value',
    })).toEqual({ requestedMode: 'send', mode: 'send', context: null });

    expect(service({
      mode: 'send',
      env: { OD_NEXT_TASK_OBSERVABILITY_MODE: 'active' },
    }).diagnostic()).toMatchObject({
      requestedMode: 'invalid',
      mode: 'off',
      schemaReady: true,
      readyToSend: false,
      blockedReason: 'invalid_mode',
    });
    expect(service({
      mode: 'send',
      env: {
        OD_NEXT_TASK_OBSERVABILITY_MODE: '',
        LANGFUSE_PUBLIC_KEY: '',
        LANGFUSE_SECRET_KEY: '',
        LANGFUSE_BASE_URL: '',
        OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
      },
    }).diagnostic()).toMatchObject({
      requestedMode: 'auto',
      mode: 'send',
      effectiveMode: 'off',
      readyToSend: false,
      blockedReason: 'missing_sink',
    });
  });

  it.each([
    { label: 'off', mode: 'off' as const, expectedStatus: 'compatibility' },
    { label: 'observe', mode: 'observe' as const, expectedStatus: 'observed' },
    { label: 'no-sink', mode: 'send' as const, expectedStatus: 'compatibility' },
  ])('gates provisional $label eligibility until a durable single-Run decision', async ({
    mode,
    expectedStatus,
  }) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const rollout = service({
      mode,
      fetchImpl,
      ...(mode === 'send'
        ? {
            env: {
              LANGFUSE_PUBLIC_KEY: '',
              LANGFUSE_SECRET_KEY: '',
              LANGFUSE_BASE_URL: '',
              OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
            },
          }
        : {}),
    });

    expect(rollout.modeForRun('run-1')).toBe('send');
    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      dropReason: 'eligibility_pending',
    });
    const handle = rollout.beginFinalizeForRun('run-1');
    expect(handle.suppressSingleRun).toBe(true);
    await handle.completion;
    expect(deliveryRow()).toMatchObject({ status: expectedStatus });
    expect(rollout.representationForRun('run-1')).toBe('single_run');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the first compatibility decision sticky across later mode changes', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    expect(await service({ mode: 'off', fetchImpl }).finalizeForRun('run-1')).toMatchObject({
      mode: 'off',
      action: 'compatibility',
    });

    const observe = service({ mode: 'observe', fetchImpl });
    await expect(observe.finalizeForRun('run-1')).resolves.toMatchObject({
      mode: 'off',
      action: 'compatibility',
      taskExecutionId: 'task-1',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    const stored = deliveryRow();
    expect(stored).toMatchObject({
      mode: 'send',
      status: 'compatibility',
      observationCount: 0,
      attemptCount: 0,
      crashWindow: 0,
    });
    expect(stored.aggregateDigest).toBeNull();
    expect(stored.coverageJson).toBeNull();
    const persisted = JSON.stringify(stored);
    expect(persisted).not.toContain('pk_fixture');
    expect(persisted).not.toContain('sk_fixture');
    expect(persisted).not.toContain('fixture-model');
  });

  it('keeps an observed row terminal when rollout later advances to send', async () => {
    await service({ mode: 'observe' }).finalizeForRun('run-1');
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const send = service({ mode: 'send', fetchImpl });
    expect(send.config.mode).toBe('send');
    expect(send.modeForRun('run-1')).toBe('observe');
    const handle = send.beginFinalizeForRun('run-1');

    expect(handle).toMatchObject({
      durableTaskTruth: true,
      suppressSingleRun: false,
    });
    await expect(handle.completion).resolves.toMatchObject({
      action: 'observed',
    });

    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deliveryRow()).toMatchObject({
      mode: 'observe',
      status: 'observed',
      attemptCount: 0,
      crashWindow: 0,
    });
  });

  it('records the aggregate when an observed Task becomes terminal after its first Run', async () => {
    db.prepare(`
      UPDATE strategy_task_executions
         SET outcome = 'running', updated_at = 1500
       WHERE task_execution_id = 'task-1'
    `).run();
    const rollout = service({ mode: 'observe' });

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'observed',
    });
    expect(deliveryRow()).toMatchObject({ status: 'observed', aggregateDigest: null });

    db.prepare(`
      UPDATE strategy_task_executions
         SET outcome = 'completed', updated_at = 2000
       WHERE task_execution_id = 'task-1'
    `).run();
    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'observed',
    });
    expect(deliveryRow().aggregateDigest).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('sends one task root with environment tags and never resends a finalized task', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const rollout = service({ mode: 'send', fetchImpl });

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'sent',
      delivery: { status: 'accepted', attemptCount: 1, crashWindow: false },
    });
    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'already_finalized',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const request = fetchImpl.mock.calls[0]![1]!;
    const batch = JSON.parse(String(request.body)).batch as Array<{
      type: string;
      body: Record<string, unknown>;
    }>;
    expect(batch.filter((event) => event.type === 'trace-create')).toHaveLength(1);
    expect(batch[0]!.body).toMatchObject({
      id: 'strategy-task:task-1',
      environment: 'synthetic-test',
      tags: [
        'od-next-strategy-v2',
        'route:direct_edit',
        'execution-mode:simple',
        'environment:synthetic-test',
        'rollout:od-next-task-v1',
      ],
    });
    expect(batch.filter((event) => event.type === 'span-create')).toHaveLength(1);
  });

  it('rebuilds safe Run quality from durable facts before exporting the Task payload', async () => {
    vi.stubEnv(
      'OPEN_DESIGN_TELEMETRY_RELAY_URL',
      'https://telemetry.open-design.ai/api/langfuse',
    );
    upsertMessage(db, 'conversation-1', {
      id: 'user-quality',
      role: 'user',
      content: 'request',
      attachments: [{ path: '/Users/alice/private.png', size: 42 }],
      createdAt: 1_050,
    });
    upsertMessage(db, 'conversation-1', {
      id: 'assistant-quality',
      role: 'assistant',
      content: [
        'done token=sk-test-1234567890123456789012',
        '<artifact>private artifact body</artifact>',
        'x'.repeat(70 * 1024),
      ].join(' '),
      runId: 'run-1',
      producedFiles: [{ path: '/Users/alice/result.html', size: 84, kind: 'html' }],
      createdAt: 1_900,
    });
    const run: SyntheticRunLike = {
      ...syntheticRun(),
      status: 'failed',
      assistantMessageId: 'assistant-quality',
      agentId: 'codex',
      error: 'failed token=sk-test-1234567890123456789012 /Users/alice/private',
      errorCode: 'AGENT_EXIT',
      events: [
        {
          event: 'agent',
          timestamp: 1_200,
          data: {
            type: 'tool_use',
            id: 'tool-quality',
            name: 'Bash',
            input: {
              command: 'cat /Users/alice/private token=sk-test-1234567890123456789012',
            },
          },
        },
        {
          event: 'agent',
          timestamp: 1_300,
          data: {
            type: 'tool_result',
            toolUseId: 'tool-quality',
            content: 'result /home/alice/private token=sk-test-1234567890123456789012',
            isError: false,
          },
        },
        ...syntheticRun().events,
      ],
    };
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());

    await expect(service({
      mode: 'send',
      dataDir: tempDir,
      prefs: { metrics: true, content: true, artifactManifest: true },
      fetchImpl,
      getRun: (runId) => runId === 'run-1' ? run : null,
    }).finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });

    const batch = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)).batch as Array<{
      type: string;
      body: Record<string, unknown>;
    }>;
    const runSpan = batch.find((event) => event.body.name === 'strategy-stage:request')!;
    const toolSpan = batch.find((event) => (
      (event.body.metadata as Record<string, unknown> | undefined)?.toolName === 'Bash'
    ))!;
    expect(runSpan.body.output).toContain('[REDACTED:artifact_content]');
    expect(Buffer.byteLength(String(runSpan.body.output), 'utf8')).toBeLessThanOrEqual(64 * 1024);
    expect(runSpan.body.statusMessage).toContain('[REDACTED');
    expect(runSpan.body.metadata).toMatchObject({
      errorCode: 'AGENT_EXIT',
      manifestCompleteness: 'complete',
      attachmentManifest: [{ object_class: 'attachment', size_bytes: 42 }],
      artifactManifest: [{ object_class: 'artifact', size_bytes: 84, type: 'html' }],
    });
    expect(toolSpan.body.input).toContain('[REDACTED');
    expect(toolSpan.body.output).toContain('[REDACTED');
    const serialized = JSON.stringify(batch);
    expect(serialized).not.toContain('sk-test-');
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('/home/alice');
    expect(serialized).not.toContain('private artifact body');
  });

  it('exports the mapped raw hostComposed identity and bounded exact-text payload', async () => {
    const mapping = getStrategyTaskExecution(db, 'task-1')!.runs[0]!;
    const promptTelemetry = bindOdNextExactSendPromptEvidence({
      telemetry: buildPromptStackTelemetry({
        composedPrompt: mapping.finalText.text,
        sections: [{ kind: 'odNextExactFinalText', content: mapping.finalText.text }],
      }),
      finalText: mapping.finalText.text,
      persisted: mapping.finalText,
      stage: mapping.inputStage,
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());

    await expect(service({
      mode: 'send',
      fetchImpl,
      getRun: (runId) => runId === 'run-1'
        ? { ...syntheticRun(), promptTelemetry }
        : null,
    }).finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });

    const batch = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)).batch as Array<{
      type: string;
      body: { name?: string; input?: Record<string, unknown> };
    }>;
    const runSpan = batch.find((event) => event.body.name === 'strategy-stage:request');
    expect(runSpan?.body.input).toMatchObject({
      type: 'open-design.od-next-host-composed-prompt',
      schema: 'open-design.od-next-exact-send-prompt/v1',
      boundary: 'hostComposed',
      kind: 'bundle',
      promptSchema: 'open-design.od-next-prompt-bundle/v2',
      stage: 'request',
      sha256: mapping.finalText.sha256,
      utf8Bytes: mapping.finalText.utf8Bytes,
      promptStack: {
        type: 'open-design.prompt-stack',
        sections: [{ kind: 'odNextExactFinalText' }],
      },
    });
  });

  it.each([
    ['raw identity', (telemetry: PromptStackTelemetry) => {
      telemetry.odNextExactSend!.sha256 = 'f'.repeat(64);
    }],
    ['safe payload', (telemetry: PromptStackTelemetry) => {
      telemetry.sections[0]!.redactedContent = 'tampered persisted safe body';
    }],
    ['mandatory exact-send', (telemetry: PromptStackTelemetry) => {
      delete telemetry.odNextExactSend;
    }],
  ])('fails closed before network when persisted %s evidence is tampered', async (_label, tamper) => {
    const mapping = getStrategyTaskExecution(db, 'task-1')!.runs[0]!;
    const promptTelemetry = bindOdNextExactSendPromptEvidence({
      telemetry: buildPromptStackTelemetry({
        composedPrompt: mapping.finalText.text,
        sections: [{ kind: 'odNextExactFinalText', content: mapping.finalText.text }],
      }),
      finalText: mapping.finalText.text,
      persisted: mapping.finalText,
      stage: mapping.inputStage,
    });
    tamper(promptTelemetry);
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());

    await expect(service({
      mode: 'send',
      fetchImpl,
      getRun: (runId) => runId === 'run-1'
        ? { ...syntheticRun(), promptTelemetry }
        : null,
    }).finalizeForRun('run-1')).resolves.toMatchObject({ action: 'compatibility' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('exports a mapped pre-compose failure as Prompt unavailable', async () => {
    const { promptTelemetry: _promptTelemetry, ...preComposeFailure } = syntheticRun();
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());

    await expect(service({
      mode: 'send',
      fetchImpl,
      getRun: (runId) => runId === 'run-1'
        ? { ...preComposeFailure, status: 'failed' }
        : null,
    }).finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });

    expect(fetchImpl).toHaveBeenCalledOnce();
    const body = String(fetchImpl.mock.calls[0]![1]!.body);
    expect(body).toContain('"availability":"unavailable"');
    expect(body).not.toContain('open-design.od-next-host-composed-prompt');
    expect(body).not.toContain('open-design.prompt-stack');
  });

  it('exports redacted childInjected Prompt and exact runtime versions from persisted runtime facts', async () => {
    const prompt =
      'Inspect /Users/alice/private/design.ts with sk-test-1234567890123456789012.';
    const safePrompt = buildSafeChildPromptTelemetry([prompt]);
    const runWithChild = () => ({
      ...syntheticRun(),
      agentId: 'opencode',
      preflightAgentCliVersion: '1.18.18',
      events: [
        ...syntheticRun().events,
        {
          event: 'agent',
          timestamp: 1_900,
          data: {
            type: 'diagnostic',
            name: 'opencode_child_task_candidate',
            adapterVersion: 'od-opencode-child-evidence/v1',
            cliVersion: '1.18.18',
            rootSessionId: 'root-fixture',
            childSessionId: 'child-fixture',
            toolCallId: 'tool-fixture',
            state: 'completed',
            observedAtMs: 1_900,
            startedAtMs: 1_500,
            endedAtMs: 1_900,
            promptHash: 'a'.repeat(64),
            promptBytes: Buffer.byteLength(prompt, 'utf8'),
            promptSafePayload: safePrompt.safePayload,
          },
        },
      ],
    });
    const requests: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      requests.push(String(init?.body));
      return acceptedResponse();
    });

    await expect(service({
      mode: 'send',
      fetchImpl,
      getRun: (runId) => runId === 'run-1' ? runWithChild() : null,
    }).finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });

    const serialized = requests.join('\n');
    expect(serialized).toContain('open-design.child-injected-prompt');
    expect(serialized).toContain('1.18.18');
    expect(serialized).toContain('od-opencode-json-events/v1');
    expect(serialized).toContain('Inspect');
    expect(serialized).toContain('[REDACTED:path]');
    expect(serialized).toContain('[REDACTED:sk_key]');
    expect(serialized).not.toContain('/Users/alice');
    expect(serialized).not.toContain('sk-test-');
  });

  it('exports parent and Claude Child tool behavior as safe nested Langfuse spans', async () => {
    const childPrompt = buildSafeChildPromptTelemetry(['Inspect the frozen package.']);
    const rawParentToolCallId = 'raw-parent-agent-call';
    const rawChildToolCallId = 'raw-child-bash-call';
    const childToolHash = createHash('sha256')
      .update(rawChildToolCallId, 'utf8')
      .digest('hex');
    const run = {
      ...syntheticRun(),
      agentId: 'claude',
      preflightAgentCliVersion: '2.1.233',
      events: [
        ...syntheticRun().events,
        {
          event: 'agent', timestamp: 1_300,
          data: {
            type: 'tool_use', id: rawParentToolCallId, name: 'Agent',
            input: { prompt: 'must not export from generic tool telemetry' },
          },
        },
        {
          event: 'agent', timestamp: 1_310,
          data: {
            type: 'diagnostic', name: 'claude_child_runtime_fact',
            adapterVersion: 'od-claude-child-evidence/v1',
            childId: rawParentToolCallId,
            state: 'started',
            source: 'claude_stream_json',
            sourceEventType: 'assistant.parent_tool_use_id',
            observedAtMs: 1_310,
            startedAtMs: 1_310,
            runtimeSessionId: 'claude-session',
            runtimeReportedVersion: '2.1.233',
            promptHash: childPrompt.hash,
            promptBytes: childPrompt.bytes,
            promptSafePayload: childPrompt.safePayload,
          },
        },
        {
          event: 'agent', timestamp: 1_400,
          data: {
            type: 'diagnostic', name: 'claude_child_tool_runtime_fact',
            adapterVersion: 'od-claude-child-evidence/v1',
            childId: rawParentToolCallId,
            toolCallHash: childToolHash,
            toolName: 'Bash',
            state: 'completed',
            source: 'claude_stream_json',
            sourceEventType: 'user.child_tool_result',
            observedAtMs: 1_400,
            startedAtMs: 1_350,
            endedAtMs: 1_400,
            runtimeSessionId: 'claude-session',
            runtimeReportedVersion: '2.1.233',
          },
        },
        {
          event: 'agent', timestamp: 1_450,
          data: {
            type: 'diagnostic', name: 'claude_child_runtime_fact',
            adapterVersion: 'od-claude-child-evidence/v1',
            childId: rawParentToolCallId,
            state: 'completed',
            source: 'claude_stream_json',
            sourceEventType: 'user.tool_result',
            observedAtMs: 1_450,
            startedAtMs: 1_310,
            endedAtMs: 1_450,
            runtimeSessionId: 'claude-session',
            runtimeReportedVersion: '2.1.233',
            promptHash: childPrompt.hash,
            promptBytes: childPrompt.bytes,
            promptSafePayload: childPrompt.safePayload,
            resolvedModel: 'claude-haiku-4-5',
            usage: { inputTokens: 7, outputTokens: 3 },
          },
        },
        {
          event: 'agent', timestamp: 1_460,
          data: {
            type: 'tool_result', toolUseId: rawParentToolCallId,
            content: 'must not export from generic tool telemetry', isError: false,
          },
        },
      ],
    };
    const requests: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_url, init) => {
      requests.push(String(init?.body));
      return acceptedResponse();
    });

    await expect(service({
      mode: 'send',
      fetchImpl,
      getRun: (runId) => runId === 'run-1' ? run : null,
    }).finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });

    const serialized = requests.join('\n');
    expect(serialized).toContain('claude-haiku-4-5');
    expect(serialized).toContain('2.1.233');
    expect(serialized).toContain('"toolName":"Agent"');
    expect(serialized).toContain('"toolName":"Bash"');
    expect(serialized).toContain(childToolHash);
    expect(serialized).not.toContain(rawChildToolCallId);
    expect(serialized).not.toContain('must not export from generic tool telemetry');
    const batch = JSON.parse(requests[0]!) as {
      batch: Array<{ body: Record<string, unknown> }>;
    };
    const byId = new Map(batch.batch.map((event) => [event.body.id, event.body]));
    const parentToolId = `agent-tool:run-1:${createHash('sha256')
      .update(rawParentToolCallId, 'utf8').digest('hex')}`;
    const childId = `claude-child:run-1:${rawParentToolCallId}`;
    const childToolId = `claude-child-tool:run-1:${rawParentToolCallId}:${childToolHash}`;
    expect(byId.get(childId)?.parentObservationId).toBe(parentToolId);
    expect(byId.get(childToolId)?.parentObservationId).toBe(childId);
  });

  it('exports one root with the durable request/clarification/repair/production run chain', async () => {
    db.prepare(`
      UPDATE strategy_task_executions
         SET revision = 0, route = NULL, input_stage = 'request', outcome = 'running',
             execution_mode = NULL, plan_contract_json = NULL, plan_contract_hash = NULL,
             clarification_count = 0, plan_contract_repair_attempts = 0,
             latest_run_id = 'run-1', updated_at = 1000
       WHERE task_execution_id = 'task-1'
    `).run();
    let task = getStrategyTaskExecution(db, 'task-1')!;
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: null,
      },
      nextRun: {
        runId: 'run-clarification',
        sourceRunId: 'run-1',
        finalText: strategyTaskTurnText({
          taskExecutionId: 'task-1', inputStage: 'clarification', taskRunIndex: 1,
        }),
      },
      updatedAt: 1_100,
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'clarification',
        outcome: 'running',
        executionMode: 'simple',
      },
      updatedAt: 1_150,
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: {
        runId: 'run-repair',
        sourceRunId: 'run-clarification',
        finalText: strategyTaskTurnText({
          taskExecutionId: 'task-1', inputStage: 'contract_repair', taskRunIndex: 2,
        }),
      },
      updatedAt: 1_200,
    });
    task = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'running',
        executionMode: 'simple',
      },
      nextRun: {
        runId: 'run-production',
        sourceRunId: 'run-repair',
        finalText: strategyTaskTurnText({
          taskExecutionId: 'task-1', inputStage: 'production', taskRunIndex: 3,
        }),
      },
      planContract: planContractFixture(task.snapshotId),
      updatedAt: 1_300,
    });
    compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: task.taskExecutionId,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan',
        inputStage: 'production',
        outcome: 'completed',
        executionMode: 'simple',
      },
      updatedAt: 2_000,
    });
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const rollout = service({
      mode: 'send',
      fetchImpl,
      getRun: (runId) => {
        const mapping = getStrategyTaskExecution(db, 'task-1')!.runs.find(
          (candidate) => candidate.runId === runId,
        )!;
        const promptTelemetry = bindOdNextExactSendPromptEvidence({
          telemetry: buildPromptStackTelemetry({
            composedPrompt: mapping.finalText.text,
            sections: [{ kind: 'odNextExactFinalText', content: mapping.finalText.text }],
          }),
          finalText: mapping.finalText.text,
          persisted: mapping.finalText,
          stage: mapping.inputStage,
        });
        return {
          ...syntheticRun(),
          promptTelemetry,
          id: runId,
          createdAt: 1_000 + ['run-1', 'run-clarification', 'run-repair', 'run-production']
            .indexOf(runId) * 100,
        };
      },
    });

    await expect(rollout.finalizeForRun('run-production')).resolves.toMatchObject({
      action: 'sent',
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const batch = JSON.parse(String(fetchImpl.mock.calls[0]![1]!.body)).batch as Array<{
      type: string;
      body: { name?: string };
    }>;
    expect(batch.filter((event) => event.type === 'trace-create')).toHaveLength(1);
    expect(batch.filter((event) => event.type === 'span-create').map((event) => event.body.name))
      .toEqual([
        'strategy-stage:request',
        'strategy-stage:clarification',
        'strategy-stage:contract_repair',
        'strategy-stage:production',
      ]);
    expect(JSON.parse(deliveryRow().coverageJson!)).toMatchObject({
      runs: { availability: 'complete', observed: 4, expected: 4, missingRunIds: [] },
      children: { availability: 'unavailable', knownObservationCount: 0 },
    });
  });

  it.each([
    { metrics: false, content: true, reason: 'metrics_consent_off' },
    { metrics: false, content: false, reason: 'metrics_consent_off' },
    { metrics: true, content: false, reason: 'content_consent_off' },
  ])('makes zero requests when consent is disabled: $reason', async (prefs) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const rollout = service({
      mode: 'send',
      fetchImpl,
      prefs: { ...prefs, artifactManifest: false },
    });
    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'not_expected',
      delivery: {
        status: 'not_expected',
        attemptCount: 0,
        dropReason: prefs.reason,
      },
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('caps each boot at first attempt plus one retry and replays a pending failure next boot', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }));
    const rollout = service({
      mode: 'send',
      fetchImpl,
      env: { LANGFUSE_RETRIES: '9' },
    });
    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'failed',
      delivery: {
        status: 'failed',
        attemptCount: 2,
        dropReason: 'langfuse_5xx',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const restartedFetch = vi.fn<typeof fetch>(async () => acceptedResponse());
    const restarted = service({ mode: 'send', fetchImpl: restartedFetch });
    await expect(restarted.reconcileCrashWindows()).resolves.toBe(1);
    expect(restartedFetch).toHaveBeenCalledOnce();
  });

  it('atomically claims one concurrent terminal report and sends exactly once', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const rollout = service({ mode: 'send', fetchImpl });

    const results = await Promise.all([
      rollout.finalizeForRun('run-1'),
      rollout.finalizeForRun('run-1'),
    ]);

    expect(results.map((result) => result.action)).toEqual(['sent', 'sent']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(deliveryRow()).toMatchObject({
      status: 'accepted',
      attemptCount: 1,
      crashWindow: 0,
    });
  });

  it('establishes durable task truth before an online network completion', async () => {
    let acceptRequest: ((response: Response) => void) | undefined;
    const fetchImpl = vi.fn<typeof fetch>(() => new Promise<Response>((resolve) => {
      acceptRequest = resolve;
    }));
    const rollout = service({ mode: 'send', fetchImpl });

    const handle = rollout.beginFinalizeForRun('run-1');
    expect(handle.durableTaskTruth).toBe(true);
    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      crashWindow: 0,
      attemptCount: 0,
    });

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledOnce());
    expect(deliveryRow()).toMatchObject({
      status: 'in_flight',
      crashWindow: 1,
      attemptCount: 1,
    });
    acceptRequest!(acceptedResponse());
    await expect(handle.completion).resolves.toMatchObject({ action: 'sent' });
    expect(deliveryRow()).toMatchObject({ status: 'accepted', crashWindow: 0 });
  });

  it('persists pending ownership before deferring a non-terminal task run', async () => {
    db.prepare(`
      UPDATE strategy_task_executions
         SET outcome = 'running', updated_at = 1500
       WHERE task_execution_id = 'task-1'
    `).run();
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const rollout = service({ mode: 'send', fetchImpl });

    const handle = rollout.beginFinalizeForRun('run-1');

    expect(handle).toMatchObject({ durableTaskTruth: true, suppressSingleRun: true });
    let completionSettled = false;
    void handle.completion.then(() => { completionSettled = true; });
    await Promise.resolve();
    expect(completionSettled).toBe(false);
    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      attemptCount: 0,
      crashWindow: 0,
      finalizedAt: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    db.prepare(`
      UPDATE strategy_task_executions
         SET outcome = 'completed', updated_at = 2000
       WHERE task_execution_id = 'task-1'
    `).run();
    const terminal = rollout.beginFinalizeForRun('run-1');
    await expect(terminal.completion).resolves.toMatchObject({ action: 'sent' });
    await expect(handle.completion).resolves.toMatchObject({ action: 'sent' });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('releases deterministic pre-network aggregate failures to sticky compatibility', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const rollout = service({
      mode: 'send',
      fetchImpl,
      getRun: () => {
        throw new Error('synthetic aggregate read failure');
      },
    });

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'compatibility',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(deliveryRow()).toMatchObject({
      status: 'compatibility',
      attemptCount: 0,
      crashWindow: 0,
      dropReason: 'payload_build_error',
    });

    const restartedFetch = vi.fn<typeof fetch>();
    await expect(service({ mode: 'send', fetchImpl: restartedFetch }).reconcileCrashWindows())
      .resolves.toBe(0);
    expect(restartedFetch).not.toHaveBeenCalled();
  });

  it('returns expected transport failures to pending and attempts each task once per boot', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('down', { status: 503 }));
    const rollout = service({ mode: 'send', fetchImpl });

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'failed',
      delivery: {
        status: 'failed',
        dropReason: 'langfuse_5xx',
      },
    });
    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      attemptCount: 2,
      crashWindow: 0,
      dropReason: 'langfuse_5xx',
      finalizedAt: null,
    });
    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'failed',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const restartedFetch = vi.fn<typeof fetch>(async () => acceptedResponse());
    const restarted = service({ mode: 'send', fetchImpl: restartedFetch });
    await expect(restarted.reconcileCrashWindows()).resolves.toBe(1);
    expect(restartedFetch).toHaveBeenCalledOnce();
    expect(deliveryRow()).toMatchObject({ status: 'accepted' });
  });

  it('persists compatibility before single-run delivery when no Task-capable sink exists', async () => {
    const rollout = service({
      mode: 'send',
      env: {
        LANGFUSE_PUBLIC_KEY: '',
        LANGFUSE_SECRET_KEY: '',
        LANGFUSE_BASE_URL: '',
        OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
      },
    });

    const handle = rollout.beginFinalizeForRun('run-1');
    expect(handle).toMatchObject({ durableTaskTruth: true, suppressSingleRun: true });
    await expect(handle.completion).resolves.toMatchObject({ action: 'compatibility' });
    expect(deliveryRow()).toMatchObject({
      status: 'compatibility',
      dropReason: 'missing_sink_config',
    });
  });

  it.each(['off', 'observe', 'send'] as const)(
    'persists a privacy tombstone before %s eligibility can release or send',
    async (mode) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const rollout = service({
        mode,
        fetchImpl,
        prefs: { metrics: true, content: false, artifactManifest: false },
        env: {
          LANGFUSE_PUBLIC_KEY: '',
          LANGFUSE_SECRET_KEY: '',
          LANGFUSE_BASE_URL: '',
          OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
        },
      });

      const handle = rollout.beginFinalizeForRun('run-1');
      expect(handle.suppressSingleRun).toBe(true);
      await expect(handle.completion).resolves.toMatchObject({ action: 'not_expected' });
      expect(deliveryRow()).toMatchObject({
        status: 'not_expected',
        dropReason: 'content_consent_off',
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('checkpoints a Run mapped after a running Task received a privacy tombstone', async () => {
    db.prepare(`
      UPDATE strategy_task_executions
         SET outcome = 'running', updated_at = 2000
       WHERE task_execution_id = 'task-1'
    `).run();
    const fetchImpl = vi.fn<typeof fetch>();
    const checkpointMappedRun = vi.fn();
    const rollout = service({
      mode: 'send',
      fetchImpl,
      prefs: { metrics: false, content: true, artifactManifest: false },
      getRun: (runId) => ({ ...syntheticRun(), id: runId }),
      checkpointMappedRun,
    });

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'not_expected',
    });
    seedSecondMappedRun();
    await expect(rollout.finalizeForRun('run-2')).resolves.toMatchObject({
      action: 'already_finalized',
    });

    expect(checkpointMappedRun).toHaveBeenCalledWith(
      'run-2',
      'metrics_consent_off',
      expect.any(Number),
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['accepted', 'failed', 'in_flight'] as const)(
    'rebuilds sticky compatibility from a durable ordinary %s delivery fact',
    async (status) => {
      const rollout = service({
        mode: 'send',
        getRun: () => ({
          ...syntheticRun(),
          telemetryDelivery: {
            version: 1,
            idempotencyKey: 'od-run-telemetry-v1-existing',
            status,
            attemptCount: 1,
            crashWindow: status === 'in_flight',
            startedAt: 1_500,
            ...(status === 'accepted' ? { finalizedAt: 1_900 } : {}),
          },
        }),
      });

      const handle = rollout.beginFinalizeForRun('run-1');
      expect(handle).toMatchObject({ durableTaskTruth: true, suppressSingleRun: true });
      await expect(handle.completion).resolves.toMatchObject({ action: 'compatibility' });
      expect(deliveryRow()).toMatchObject({
        status: 'compatibility',
        dropReason: 'single_run_delivery_observed',
      });
    },
  );

  it.each(['accepted', 'failed'] as const)(
    'checks current privacy before releasing an ordinary %s sibling to compatibility',
    async (status) => {
      const fetchImpl = vi.fn<typeof fetch>();
      const rollout = service({
        mode: 'send',
        fetchImpl,
        prefs: { metrics: true, content: false, artifactManifest: false },
        getRun: () => ({
          ...syntheticRun(),
          telemetryDelivery: {
            version: 1,
            idempotencyKey: 'od-run-telemetry-v1-existing',
            status,
            attemptCount: 1,
            crashWindow: false,
            startedAt: 1_500,
            ...(status === 'accepted' ? { finalizedAt: 1_900 } : {}),
          },
        }),
      });

      const handle = rollout.beginFinalizeForRun('run-1');
      expect(handle.suppressSingleRun).toBe(true);
      await expect(handle.completion).resolves.toMatchObject({ action: 'not_expected' });
      expect(deliveryRow()).toMatchObject({
        status: 'not_expected',
        dropReason: 'content_consent_off',
      });
      expect(fetchImpl).not.toHaveBeenCalled();
    },
  );

  it('scans every in-memory sibling before a new Task can claim ownership', async () => {
    seedSecondMappedRun();
    const rollout = service({
      mode: 'send',
      getRun: (runId) => runId === 'run-1'
        ? syntheticRun()
        : {
            ...syntheticRun(),
            id: 'run-2',
            telemetryDelivery: {
              version: 1,
              idempotencyKey: 'od-run-telemetry-v1-sibling',
              status: 'accepted',
              attemptCount: 1,
              crashWindow: false,
              startedAt: 1_500,
              finalizedAt: 1_900,
            },
          },
    });

    const handle = rollout.beginFinalizeForRun('run-1');
    expect(handle.suppressSingleRun).toBe(true);
    await expect(handle.completion).resolves.toMatchObject({ action: 'compatibility' });
    expect(deliveryRow()).toMatchObject({ status: 'compatibility' });
  });

  it('gives a sibling privacy tombstone priority over an ordinary sibling fact', async () => {
    seedSecondMappedRun();
    const ordinary = {
      version: 1 as const,
      idempotencyKey: 'od-run-telemetry-v1-ordinary',
      status: 'accepted' as const,
      attemptCount: 1,
      crashWindow: false,
      startedAt: 1_500,
      finalizedAt: 1_900,
    };
    const privateFact = {
      version: 1 as const,
      idempotencyKey: 'od-run-telemetry-v1-private-sibling',
      status: 'not_expected' as const,
      attemptCount: 0,
      crashWindow: false,
      startedAt: 1_500,
      dropReason: 'metrics_consent_off',
      finalizedAt: 1_900,
    };
    const rollout = service({
      mode: 'send',
      getRun: (runId) => ({
        ...syntheticRun(),
        id: runId,
        telemetryDelivery: runId === 'run-1' ? ordinary : privateFact,
      }),
    });

    const handle = rollout.beginFinalizeForRun('run-1');
    expect(handle.suppressSingleRun).toBe(true);
    await expect(handle.completion).resolves.toMatchObject({ action: 'not_expected' });
    expect(deliveryRow()).toMatchObject({
      status: 'not_expected',
      dropReason: 'metrics_consent_off',
    });
  });

  it('rebuilds a privacy tombstone instead of reclaiming a completed private Run', async () => {
    const rollout = service({
      mode: 'send',
      getRun: () => ({
        ...syntheticRun(),
        langfuseCompletedAt: 1_900,
        telemetryDelivery: {
          version: 1,
          idempotencyKey: 'od-run-telemetry-v1-private',
          status: 'not_expected',
          attemptCount: 0,
          crashWindow: false,
          startedAt: 1_500,
          dropReason: 'content_consent_off',
          finalizedAt: 1_900,
        },
      }),
    });

    const handle = rollout.beginFinalizeForRun('run-1');
    expect(handle).toMatchObject({ durableTaskTruth: true, suppressSingleRun: true });
    await expect(handle.completion).resolves.toMatchObject({ action: 'not_expected' });
    expect(deliveryRow()).toMatchObject({
      status: 'not_expected',
      dropReason: 'content_consent_off',
      attemptCount: 0,
    });
  });

  it('migrates v1 failed Task delivery to retryable pending without changing identity', () => {
    db.exec(`
      CREATE TABLE strategy_task_observation_delivery (
        task_execution_id TEXT PRIMARY KEY,
        mode TEXT NOT NULL CHECK (mode IN ('observe', 'send')),
        environment TEXT NOT NULL,
        tag TEXT NOT NULL,
        aggregate_digest TEXT,
        observation_count INTEGER NOT NULL DEFAULT 0,
        coverage_json TEXT,
        status TEXT NOT NULL CHECK (
          status IN ('observed', 'in_flight', 'accepted', 'not_expected', 'failed')
        ),
        idempotency_key TEXT,
        attempt_count INTEGER NOT NULL DEFAULT 0,
        crash_window INTEGER NOT NULL DEFAULT 0,
        started_at INTEGER NOT NULL,
        drop_reason TEXT,
        finalized_at INTEGER,
        updated_at INTEGER NOT NULL
      );
      INSERT INTO strategy_task_observation_delivery VALUES (
        'task-1', 'send', 'synthetic-test', 'od-next-task-v1',
        NULL, 0, NULL, 'failed', 'od-task-stable', 2, 0,
        1500, 'langfuse_5xx', 2000, 2000
      );
    `);

    service({ mode: 'send' });

    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      idempotencyKey: 'od-task-stable',
      attemptCount: 2,
      crashWindow: 0,
      dropReason: 'langfuse_5xx',
      finalizedAt: null,
    });
  });

  it('recovers only a persisted in-flight crash window with the same idempotency identity', async () => {
    const first = service({ mode: 'send' });
    const idempotencyKey = runTelemetryDeliveryIdempotencyKey('strategy-task:task-1');
    db.prepare(`
      INSERT INTO strategy_task_observation_delivery (
        task_execution_id, mode, environment, tag,
        aggregate_digest, observation_count, coverage_json,
        status, idempotency_key, attempt_count, crash_window,
        started_at, drop_reason, finalized_at, updated_at
      ) VALUES (
        'task-1', 'send', 'synthetic-test', 'task22-canary',
        NULL, 0, NULL, 'in_flight', ?, 0, 1, 3000, NULL, NULL, 3000
      )
    `).run(idempotencyKey);
    expect(first.diagnostic().readyToSend).toBe(true);

    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const restarted = service({
      mode: 'send',
      fetchImpl,
      env: {
        OD_TELEMETRY_ENV: 'changed-environment',
      },
    });
    await expect(restarted.reconcileCrashWindows()).resolves.toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(deliveryRow()).toMatchObject({
      status: 'accepted',
      idempotencyKey,
      crashWindow: 0,
    });
    const body = String(fetchImpl.mock.calls[0]![1]!.body);
    expect(body).toContain('synthetic-test');
    expect(body).toContain('task22-canary');
    expect(body).not.toContain('changed-environment');
  });

  it('re-evaluates a crash-left provisional eligibility row before any Task send', async () => {
    const first = service({ mode: 'send' });
    expect(first.modeForRun('run-1')).toBe('send');
    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      dropReason: 'eligibility_pending',
      attemptCount: 0,
    });

    const fetchImpl = vi.fn<typeof fetch>();
    const restarted = service({
      mode: 'send',
      fetchImpl,
      env: {
        LANGFUSE_PUBLIC_KEY: '',
        LANGFUSE_SECRET_KEY: '',
        LANGFUSE_BASE_URL: '',
        OPEN_DESIGN_TELEMETRY_RELAY_URL: '',
      },
    });
    await expect(restarted.reconcileCrashWindows()).resolves.toBe(1);
    expect(deliveryRow()).toMatchObject({
      status: 'compatibility',
      dropReason: 'missing_sink_config',
      attemptCount: 0,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('turns a crash-left provisional row into compatibility when ordinary delivery crossed', async () => {
    const first = service({ mode: 'send' });
    expect(first.modeForRun('run-1')).toBe('send');
    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      dropReason: 'eligibility_pending',
    });
    const runsLogDir = path.join(tempDir, 'runs-provisional-ordinary');
    const runDir = path.join(runsLogDir, 'run-1');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: null,
      agentId: 'codex',
      status: 'succeeded',
      createdAt: 1_000,
      updatedAt: 2_000,
      langfuseCompletedAt: 2_000,
      telemetryDelivery: {
        version: 1,
        idempotencyKey: 'od-run-telemetry-v1-provisional-ordinary',
        status: 'accepted',
        attemptCount: 1,
        crashWindow: false,
        startedAt: 1_900,
        finalizedAt: 2_000,
      },
    }));
    const taskFetch = vi.fn<typeof fetch>(async () => acceptedResponse());
    const restarted = service({ mode: 'send', fetchImpl: taskFetch });

    await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: vi.fn(),
      taskObservationModeForRun: (runId) => restarted.modeForRun(runId),
      taskObservationRepresentationForRun: (runId) => restarted.representationForRun(runId),
      seedTaskObservationRunFact: (runId, fact) =>
        restarted.seedRepresentationFromRunFact(runId, fact),
      beginTaskObservationForRun: (runId) => restarted.beginFinalizeForRun(runId),
      runsLogDir,
    });

    expect(deliveryRow()).toMatchObject({
      status: 'compatibility',
      dropReason: 'single_run_delivery_observed',
      attemptCount: 0,
    });
    expect(taskFetch).not.toHaveBeenCalled();
  });

  it('claims a task trace after startup terminalizes a mapped run with no prior task row', async () => {
    db.prepare(`
      UPDATE strategy_task_executions
         SET outcome = 'running', updated_at = 2000
       WHERE task_execution_id = 'task-1'
    `).run();
    const runsLogDir = path.join(tempDir, 'runs');
    const runDir = path.join(runsLogDir, 'run-1');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: null,
      agentId: 'codex',
      status: 'running',
      createdAt: 1_000,
      updatedAt: 2_000,
    }));
    const taskFetch = vi.fn<typeof fetch>(async () => acceptedResponse());
    const rollout = service({
      mode: 'send',
      fetchImpl: taskFetch,
      getRun: () => ({ ...syntheticRun(), status: 'failed' }),
    });
    const legacySingleRunReport = vi.fn();
    expect(db.prepare(
      `SELECT COUNT(*) AS count FROM strategy_task_observation_delivery`,
    ).get()).toEqual({ count: 0 });

    const durable = await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      taskObservationRepresentationForRun: (runId) => rollout.representationForRun(runId),
      seedTaskObservationRunFact: (runId, fact) =>
        rollout.seedRepresentationFromRunFact(runId, fact),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    });
    expect(durable).toMatchObject({
      interrupted: 1,
      strategyTasksReconciled: 1,
      langfuseReplayed: 1,
    });
    expect(legacySingleRunReport).not.toHaveBeenCalled();
    expect(taskFetch).toHaveBeenCalledTimes(1);
    expect(deliveryRow()).toMatchObject({ status: 'accepted', crashWindow: 0 });

    const second = await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      taskObservationRepresentationForRun: (runId) => rollout.representationForRun(runId),
      seedTaskObservationRunFact: (runId, fact) =>
        rollout.seedRepresentationFromRunFact(runId, fact),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    });
    expect(second.langfuseReplayed).toBe(0);
    await rollout.reconcileCrashWindows();
    expect(taskFetch).toHaveBeenCalledTimes(1);
    expect(legacySingleRunReport).not.toHaveBeenCalled();
  });

  it('upgrades ordinary-first startup compatibility when a later sibling has a privacy fact', async () => {
    seedSecondMappedRun();
    const taskFetch = vi.fn<typeof fetch>();
    const rollout = service({ mode: 'send', fetchImpl: taskFetch });
    await rollout.seedRepresentationFromRunFact('run-1', {
      langfuseCompletedAt: 1_900,
      telemetryDelivery: {
        version: 1,
        idempotencyKey: 'od-run-telemetry-v1-ordinary-first',
        status: 'accepted',
        attemptCount: 1,
        crashWindow: false,
        startedAt: 1_500,
        finalizedAt: 1_900,
      },
    });
    expect(deliveryRow()).toMatchObject({ status: 'compatibility' });

    const runsLogDir = path.join(tempDir, 'runs-privacy-later');
    const runDir = path.join(runsLogDir, 'run-2');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-2',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: null,
      agentId: 'codex',
      status: 'succeeded',
      createdAt: 1_000,
      updatedAt: 2_000,
      langfuseCompletedAt: 2_000,
      telemetryDelivery: {
        version: 1,
        idempotencyKey: 'od-run-telemetry-v1-privacy-later',
        status: 'not_expected',
        attemptCount: 0,
        crashWindow: false,
        startedAt: 1_900,
        dropReason: 'metrics_consent_off',
        finalizedAt: 2_000,
      },
    }));
    const legacySingleRunReport = vi.fn();

    await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      taskObservationRepresentationForRun: (runId) => rollout.representationForRun(runId),
      taskObservationNotExpectedReasonForRun: (runId) =>
        rollout.notExpectedReasonForRun(runId),
      seedTaskObservationRunFact: (runId, fact) =>
        rollout.seedRepresentationFromRunFact(runId, fact),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    });

    expect(deliveryRow()).toMatchObject({
      status: 'not_expected',
      dropReason: 'metrics_consent_off',
    });
    expect(rollout.representationForRun('run-1')).toBe('task_not_expected');
    expect(taskFetch).not.toHaveBeenCalled();
    expect(legacySingleRunReport).not.toHaveBeenCalled();
  });

  it('checks current privacy before startup rebuilds compatibility from an ordinary fact', async () => {
    const runsLogDir = path.join(tempDir, 'runs-ordinary-private');
    const runDir = path.join(runsLogDir, 'run-1');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: null,
      agentId: 'codex',
      status: 'succeeded',
      createdAt: 1_000,
      updatedAt: 2_000,
      langfuseCompletedAt: 2_000,
      telemetryDelivery: {
        version: 1,
        idempotencyKey: 'od-run-telemetry-v1-ordinary-private',
        status: 'accepted',
        attemptCount: 1,
        crashWindow: false,
        startedAt: 1_900,
        finalizedAt: 2_000,
      },
    }));
    const taskFetch = vi.fn<typeof fetch>();
    const rollout = service({
      mode: 'send',
      fetchImpl: taskFetch,
      prefs: { metrics: false, content: true, artifactManifest: false },
    });
    const legacySingleRunReport = vi.fn();

    await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      taskObservationRepresentationForRun: (runId) => rollout.representationForRun(runId),
      seedTaskObservationRunFact: (runId, fact) =>
        rollout.seedRepresentationFromRunFact(runId, fact),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    });

    expect(deliveryRow()).toMatchObject({
      status: 'not_expected',
      dropReason: 'metrics_consent_off',
    });
    expect(taskFetch).not.toHaveBeenCalled();
    expect(legacySingleRunReport).not.toHaveBeenCalled();
  });

  it('does not forge a privacy tombstone when startup cannot read telemetry preferences', async () => {
    const runsLogDir = path.join(tempDir, 'runs-config-read-failure');
    const runDir = path.join(runsLogDir, 'run-1');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: null,
      agentId: 'codex',
      status: 'succeeded',
      createdAt: 1_000,
      updatedAt: 2_000,
      langfuseCompletedAt: 1_900,
      telemetryDelivery: {
        version: 1,
        idempotencyKey: 'od-run-telemetry-v1-config-read-failure',
        status: 'accepted',
        attemptCount: 1,
        crashWindow: false,
        startedAt: 1_500,
        finalizedAt: 1_900,
      },
    }));
    const fetchImpl = vi.fn<typeof fetch>();
    const rollout = service({
      mode: 'send',
      fetchImpl,
      readTelemetryError: new Error('synthetic app-config read failure'),
    });
    const legacySingleRunReport = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      taskObservationRepresentationForRun: (runId) => rollout.representationForRun(runId),
      seedTaskObservationRunFact: (runId, fact) =>
        rollout.seedRepresentationFromRunFact(runId, fact),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    });

    expect(warn).toHaveBeenCalledWith(
      '[telemetry] task fact seeding failed during startup recovery',
    );
    expect(deliveryRow()).toMatchObject({
      status: 'pending',
      dropReason: 'eligibility_pending',
      finalizedAt: null,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(legacySingleRunReport).not.toHaveBeenCalled();
  });

  it('records startup-terminalized tasks in observe mode while preserving legacy delivery', async () => {
    db.prepare(`
      UPDATE strategy_task_executions
         SET outcome = 'running', updated_at = 2000
       WHERE task_execution_id = 'task-1'
    `).run();
    const runsLogDir = path.join(tempDir, 'runs-observe');
    const runDir = path.join(runsLogDir, 'run-1');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: null,
      agentId: 'codex',
      status: 'running',
      createdAt: 1_000,
      updatedAt: 2_000,
    }));
    const taskFetch = vi.fn<typeof fetch>();
    const rollout = service({
      mode: 'observe',
      fetchImpl: taskFetch,
      getRun: () => ({ ...syntheticRun(), status: 'failed' }),
    });
    const legacySingleRunReport = vi.fn(async () => ({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted' as const,
    }));

    await expect(reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      taskObservationRepresentationForRun: (runId) => rollout.representationForRun(runId),
      seedTaskObservationRunFact: (runId, fact) =>
        rollout.seedRepresentationFromRunFact(runId, fact),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    })).resolves.toMatchObject({
      interrupted: 1,
      strategyTasksReconciled: 1,
      langfuseReplayed: 1,
    });

    expect(legacySingleRunReport).toHaveBeenCalledOnce();
    expect(taskFetch).not.toHaveBeenCalled();
    expect(deliveryRow()).toMatchObject({
      mode: 'observe',
      status: 'observed',
      attemptCount: 0,
      crashWindow: 0,
    });
  });

  it('replays legacy once when an observed task restarts in send mode with single-run in flight', async () => {
    await service({ mode: 'observe' }).finalizeForRun('run-1');
    const runsLogDir = path.join(tempDir, 'runs-observed-upgrade');
    const runDir = path.join(runsLogDir, 'run-1');
    fs.mkdirSync(runDir, { recursive: true });
    fs.writeFileSync(path.join(runDir, 'state.json'), JSON.stringify({
      schemaVersion: 1,
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      assistantMessageId: null,
      agentId: 'codex',
      status: 'failed',
      createdAt: 1_000,
      updatedAt: 2_000,
      telemetryDelivery: {
        version: 1,
        idempotencyKey: 'od-run-telemetry-v1-observed-upgrade',
        status: 'in_flight',
        attemptCount: 1,
        crashWindow: true,
        startedAt: 1_900,
      },
    }));
    const taskFetch = vi.fn<typeof fetch>();
    const rollout = service({ mode: 'send', fetchImpl: taskFetch });
    const legacySingleRunReport = vi.fn(async () => ({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted' as const,
    }));

    await expect(reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    })).resolves.toMatchObject({ langfuseReplayed: 1 });

    expect(legacySingleRunReport).toHaveBeenCalledOnce();
    expect(taskFetch).not.toHaveBeenCalled();
    expect(deliveryRow()).toMatchObject({
      mode: 'observe',
      status: 'observed',
      attemptCount: 0,
      crashWindow: 0,
    });
    expect(JSON.parse(fs.readFileSync(path.join(runDir, 'state.json'), 'utf8')))
      .toMatchObject({
        telemetryDelivery: {
          status: 'accepted',
          crashWindow: false,
          finalizedAt: expect.any(Number),
        },
      });

    await expect(reconcileDurableRunTerminals({
      analytics: { capture: vi.fn() },
      appVersion: 'fixture',
      db,
      reportLangfuse: legacySingleRunReport,
      taskObservationModeForRun: (runId) => rollout.modeForRun(runId),
      beginTaskObservationForRun: (runId) => rollout.beginFinalizeForRun(runId),
      runsLogDir,
    })).resolves.toMatchObject({ langfuseReplayed: 0 });
    expect(legacySingleRunReport).toHaveBeenCalledOnce();
    expect(taskFetch).not.toHaveBeenCalled();
  });

  it.each([
    { exporterMode: 'dual', path: '/api/public/ingestion' },
    { exporterMode: 'otlp', path: '/api/public/otel/v1/traces' },
  ])('uses one network protocol in $exporterMode mode', async ({ exporterMode, path: expectedPath }) => {
    const fetchImpl = vi.fn<typeof fetch>(async () => acceptedResponse());
    const rollout = service({
      mode: 'send',
      fetchImpl,
      env: { LANGFUSE_EXPORTER_MODE: exporterMode },
    });

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(new URL(String(fetchImpl.mock.calls[0]![0])).pathname).toBe(expectedPath);
    const body = String(fetchImpl.mock.calls[0]![1]!.body);
    expect(body).toContain('synthetic-test');
    expect(body).toContain('od-next-task-v1');
    if (exporterMode === 'otlp') {
      expect(body).toContain('deployment.environment.name');
      expect(body).toContain('langfuse.trace.metadata.rollout_tag');
    }
  });

  it('uses relay for Task hierarchy even when Vela is configured for single-Run', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 202 }));
    const env = {
      ...BASE_ENV,
      OD_NEXT_TASK_OBSERVABILITY_MODE: 'send',
      OPEN_DESIGN_VELA_TELEMETRY: 'on',
      OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://relay.example.test/private?key=secret',
    };
    const configuredEnv = {
      VELA_CONTROL_KEY: 'control-secret',
      VELA_API_URL: 'https://vela.example.test',
    };
    expect(readTaskTelemetrySinkConfig(env)).toMatchObject({ kind: 'relay' });
    expect(readRunTelemetrySinkConfig(env, configuredEnv)).toMatchObject({
      kind: 'vela',
      apiUrl: 'https://vela.example.test',
    });
    const rollout = service({
      mode: 'send',
      fetchImpl,
      env,
    });
    expect(rollout.diagnostic()).toMatchObject({
      effectiveSink: { kind: 'relay', host: 'relay.example.test', protocol: 'https' },
      taskProtocol: 'legacy-v1',
      readyToSend: true,
    });
    const diagnostic = JSON.stringify(rollout.diagnostic());
    expect(diagnostic).not.toContain('control-secret');
    expect(diagnostic).not.toContain('password');
    expect(diagnostic).not.toContain('/private');

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://relay.example.test/private?key=secret',
    );
    expect((fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>).Authorization)
      .toBeUndefined();
  });

  it('never falls back through Vela when the selected Task relay rejects auth', async () => {
    let requestCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      requestCount += 1;
      const status = requestCount === 1 ? 401 : 503;
      return new Response('', { status });
    });
    const rollout = service({
      mode: 'send',
      fetchImpl,
      env: {
        OPEN_DESIGN_VELA_TELEMETRY: 'on',
        OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://relay.example.test/ingest',
        OPEN_DESIGN_TELEMETRY_RETRIES: '9',
      },
    });

    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'failed',
      delivery: {
        status: 'failed',
        attemptCount: 1,
        crashWindow: false,
        dropReason: 'langfuse_4xx',
      },
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe(
      'https://relay.example.test/ingest',
    );

    const restarted = service({
      mode: 'send',
      fetchImpl,
      env: {
        OPEN_DESIGN_VELA_TELEMETRY: 'on',
        OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://relay.example.test/ingest',
      },
    });
    await expect(restarted.reconcileCrashWindows()).resolves.toBe(1);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('uses the effective relay sink with the same durable task idempotency key', async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response('', { status: 202 }));
    const rollout = service({
      mode: 'send',
      fetchImpl,
      env: {
        OPEN_DESIGN_TELEMETRY_RELAY_URL: 'https://relay.example.test/ingest',
      },
    });

    expect(rollout.diagnostic()).toMatchObject({
      effectiveSink: { kind: 'relay', host: 'relay.example.test', protocol: 'https' },
      taskProtocol: 'legacy-v1',
      readyToSend: true,
    });
    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({ action: 'sent' });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(String(fetchImpl.mock.calls[0]![0])).toBe('https://relay.example.test/ingest');
    const headers = fetchImpl.mock.calls[0]![1]!.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe(
      runTelemetryDeliveryIdempotencyKey('strategy-task:task-1'),
    );
  });

  it('blocks send locally when environment/tag are missing without touching the sink', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const rollout = service({
      mode: 'send',
      fetchImpl,
      env: {
        OD_TELEMETRY_ENV: 'unsafe context value',
      },
    });
    expect(rollout.diagnostic()).toMatchObject({
      readyToSend: false,
      blockedReason: 'missing_environment_or_tag',
    });
    await expect(rollout.finalizeForRun('run-1')).resolves.toMatchObject({
      action: 'compatibility',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
