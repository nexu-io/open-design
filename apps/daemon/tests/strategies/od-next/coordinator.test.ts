import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import { StrategyTaskProjectionV2Schema } from '@open-design/contracts';
import type { AppliedPluginSnapshot, OpenDesignPlanContractV2 } from '@open-design/contracts';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../../../src/db.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import {
  beginStrategyClarification,
  odNextTurnMayInferProductionCompletion,
  finalizeStrategyPlanningTurn as finalizeStrategyPlanningTurnRaw,
  prepareStrategyIntake,
  prepareStrategyRequest,
} from '../../../src/strategies/od-next/coordinator.js';
import { OdNextMachineProtocolStream } from '../../../src/strategies/od-next/protocol.js';
import {
  beginAutomaticSimpleProduction as beginAutomaticSimpleProductionRaw,
  blockAutomaticContinuation,
  completeAutomaticSimpleProduction,
  projectStrategyTask,
  prepareAutomaticStrategyContinuation,
  prepareAutomaticSimpleProductionRun,
} from '../../../src/strategies/od-next/automatic-simple-production.js';
import {
  createStrategyTaskExecution,
  getStrategyTaskExecution,
} from '../../../src/strategies/task-store.js';
import {
  strategyTaskCreateIdentityFixture,
  strategyTaskTurnText,
} from '../strategy-task-test-fixtures.js';

const AGENT_ID = 'codex';

type FinalizeInput = Parameters<typeof finalizeStrategyPlanningTurnRaw>[1];
type TestFinalizeInput = Omit<FinalizeInput, 'repairRun'> & {
  repairRun?: Omit<NonNullable<FinalizeInput['repairRun']>, 'finalText'> & {
    finalText?: string;
  };
};

function finalizeStrategyPlanningTurn(
  db: Database.Database,
  input: TestFinalizeInput,
) {
  const task = getStrategyTaskExecution(db, input.taskExecutionId);
  if (input.repairRun && !task) throw new Error('test task missing');
  const repairRun = input.repairRun
    ? {
        ...input.repairRun,
        finalText: input.repairRun.finalText ?? strategyTaskTurnText({
          taskExecutionId: input.taskExecutionId,
          inputStage: 'contract_repair',
          taskRunIndex: task!.runs.length,
        }),
      }
    : undefined;
  const { repairRun: _repairRun, ...restValue } = input;
  const rest: Omit<FinalizeInput, 'repairRun'> = restValue;
  return finalizeStrategyPlanningTurnRaw(db, {
    ...rest,
    ...(repairRun ? { repairRun } : {}),
  });
}

type BeginProductionInput = Parameters<typeof beginAutomaticSimpleProductionRaw>[1];
function beginAutomaticSimpleProduction(
  db: Database.Database,
  input: Omit<BeginProductionInput, 'finalText'> & { finalText?: string },
) {
  return beginAutomaticSimpleProductionRaw(db, {
    ...input,
    finalText: input.finalText ?? strategyTaskTurnText({
      taskExecutionId: input.task.taskExecutionId,
      inputStage: 'production',
      taskRunIndex: input.task.runs.length,
    }),
  });
}

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

function createStrategySnapshot(db: Database.Database): AppliedPluginSnapshot {
  return createSnapshot(db, {
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
}

function planContract(snapshot: AppliedPluginSnapshot): OpenDesignPlanContractV2 {
  const strategy = snapshot.strategy!;
  return {
    schema: 'open-design.plan-contract/v2',
    strategy: {
      id: 'od-next-strategy',
      version: strategy.version,
      packageHash: strategy.packageHash,
      snapshotId: snapshot.snapshotId,
    },
    taskProfile: {
      schemaVersion: '2',
      taskType: 'prototype',
      taskProfileVersion: strategy.selectedTaskProfile.version,
      goal: 'Build a prototype',
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
      executionMode: 'simple',
      steps: [{ id: 'build', objective: 'Build', outputs: ['prototype'] }],
      readinessArtifacts: [],
      buildPackages: [],
    },
    runManifest: {
      selectedAgentId: AGENT_ID,
      capabilitySnapshotHash: 'c'.repeat(64),
      inputRefs: ['request'],
      productionRoutes: ['html'],
      preflight: { intake: 'passed', execution: 'passed' },
    },
    decisionSummary: {
      goal: 'Build a prototype',
      deliverables: ['prototype'],
      keyConstraints: [],
      assumptions: [],
      risks: [],
      openDecisions: [],
    },
  };
}

function block(tag: string, value: unknown, fenced = false): string {
  const json = JSON.stringify(value);
  return `<${tag}>\n${fenced ? `\`\`\`json\n${json}\n\`\`\`` : json}\n</${tag}>`;
}

function protocol(text: string): OdNextMachineProtocolStream {
  const stream = new OdNextMachineProtocolStream();
  for (let index = 0; index < text.length; index += 7) {
    stream.push(text.slice(index, index + 7));
  }
  return stream;
}

function runtimeState(input: {
  route?: 'direct_edit' | 'full_plan';
  inputStage?: 'request' | 'clarification' | 'contract_repair' | 'production';
  outcome: 'clarification_required' | 'plan_ready' | 'completed' | 'blocked';
  executionMode?: 'simple' | null;
}) {
  return {
    schema: 'open-design.strategy-state/v2' as const,
    route: input.route ?? 'full_plan',
    inputStage: input.inputStage ?? 'request',
    outcome: input.outcome,
    executionMode: input.executionMode === undefined ? null : input.executionMode,
    reasonCodes: [],
  };
}

const intakePassed = {
  inputRefs: [{ id: 'request', accessible: true }],
  selectedAgentAvailable: true,
  nativeContinuation: 'verified' as const,
  taskProfileAvailable: true,
  dependencies: [],
};

const executionPassed = {
  productionRoutes: [{ id: 'html', available: true }],
  dependencies: [],
  inputs: [{ id: 'request', available: true }],
  renderers: [],
  exporters: [],
  templates: [],
  outputKinds: [{ id: 'prototype', supported: true }],
};

const directEligible = {
  editableBaselineExists: true,
  localAndUnambiguous: true,
  canonicalDeliverableStable: true,
  deliverableSetStable: true,
  dependenciesBounded: true,
};

describe('OD Next planning coordinator', () => {
  let tempDir: string;
  let db: Database.Database;
  let snapshot: AppliedPluginSnapshot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-next-coordinator-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('project-1', 'Project 1', 1, 1);
    db.prepare(
      `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
    ).run('conversation-1', 'project-1', 'Conversation 1', 1, 1);
    snapshot = createStrategySnapshot(db);
    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-request',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 100,
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('routes a new request once and completes an eligible Direct Edit in its request Run', () => {
    const prepared = prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'auto',
      directEdit: directEligible,
      intake: intakePassed,
      execution: executionPassed,
      updatedAt: 110,
    });
    expect(prepared.task).toMatchObject({
      route: 'direct_edit',
      executionMode: 'simple',
      inputStage: 'request',
      outcome: 'running',
    });
    expect(() => prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
    })).toThrowError(expect.objectContaining({
      reasonCodes: ['od_next_route_already_locked'],
    }));

    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        'Updated the existing header.',
        block('open-design-runtime-state', runtimeState({
          route: 'direct_edit',
          outcome: 'completed',
          executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      updatedAt: 120,
    });
    expect(final).toMatchObject({
      action: 'completed',
      visibleText: 'Updated the existing header.\n',
      reasonCodes: [],
      task: { outcome: 'completed' },
    });
  });

  it('persists the one clarification round and refuses a second question after restart', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const awaiting = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    expect(awaiting).toMatchObject({
      action: 'awaiting_clarification',
      task: { outcome: 'clarification_required', clarificationCount: 0 },
    });

    const continued = beginStrategyClarification(db, {
      taskExecutionId: 'task-1',
      sourceRunId: 'run-request',
      nextRunId: 'run-clarification',
      answer: 'Use the operator console.',
      updatedAt: 130,
    });
    expect(continued).toMatchObject({
      instruction: {
        stage: 'clarification',
        nativeSessionResume: true,
        answer: 'Use the operator console.',
      },
      task: { inputStage: 'clarification', clarificationCount: 1 },
    });

    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });
    const repeated = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-clarification',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        inputStage: 'clarification',
        outcome: 'blocked',
      }))}`),
      updatedAt: 140,
    });
    expect(repeated).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_clarification_repeated'],
      task: { outcome: 'blocked', clarificationCount: 1 },
    });
  });

  it('persists a valid Full Plan and returns only its decision summary as structured output', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        'Planning complete.',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(final).toMatchObject({
      action: 'plan_ready',
      visibleText: 'Planning complete.\n\n',
      decisionSummary: plan.decisionSummary,
      task: {
        outcome: 'plan_ready',
        executionMode: 'simple',
        planContract: plan,
      },
    });
  });

  // Observed on a real OD Next turn: the agent decided it had nothing to ask
  // and STILL wrote the literal marker as a declaration line —
  // `<question-form> 无需提出——…` — unclosed, prose instead of JSON. The
  // renderable count is 0 for such a turn, so the coordinator scored it as a
  // clean no-clarification turn and recorded nothing at all. The stray marker
  // is a contract violation the daemon must report, but it is NOT a gate: the
  // planning turn still has to reach production.
  it('reports a stray question-form marker without blocking the handoff', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        '策略判断信息充足，将直接进入生产。\n\n<question-form> 无需提出',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(final.action).toBe('plan_ready');
    expect(final.task).toMatchObject({ outcome: 'plan_ready', executionMode: 'simple' });
    expect(final.reasonCodes).toContain('od_next_question_form_unterminated');
  });

  it('reports a closed question-form block the parser cannot render', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        'Planning complete. <question-form>无需提出</question-form>',
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(final.action).toBe('plan_ready');
    expect(final.reasonCodes).toContain('od_next_question_form_unrenderable');
  });

  // A genuine, renderable form on a clarification turn must stay clean — the
  // new signal only fires on markers that can never render.
  it('raises no marker signal for a renderable clarification form', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const final = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>',
        block('open-design-runtime-state', runtimeState({ outcome: 'clarification_required' })),
      ].join('\n')),
      updatedAt: 120,
    });
    expect(final.action).toBe('awaiting_clarification');
    expect(final.reasonCodes).toEqual([]);
  });

  it('allows one serialization-only repair only with a durable semantic hash anchor', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const repair = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', plan, true),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      repairRun: { runId: 'run-repair', sourceRunId: 'run-request' },
      toolUseCount: 2,
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(repair).toMatchObject({
      action: 'contract_repair',
      instruction: {
        stage: 'contract_repair',
        nativeSessionResume: true,
      },
      task: {
        inputStage: 'contract_repair',
        outcome: 'running',
        executionMode: 'simple',
        planContractRepairAttempts: 1,
        planContract: plan,
      },
    });

    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });
    const repaired = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-repair',
      protocol: protocol([
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'contract_repair',
          outcome: 'plan_ready',
          executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 130,
    });
    expect(repaired).toMatchObject({
      action: 'plan_ready',
      task: { outcome: 'plan_ready', planContractRepairAttempts: 1 },
    });
  });

  it('blocks duplicate blocks, semantic drift, tools in repair, and unanchored malformed plans', () => {
    const cases = [
      {
        name: 'duplicate',
        text: (plan: OpenDesignPlanContractV2) => [
          block('open-design-plan-contract', plan),
          block('open-design-plan-contract', plan),
          block('open-design-runtime-state', runtimeState({ outcome: 'plan_ready', executionMode: 'simple' })),
        ].join('\n'),
        reason: 'od_next_protocol_plan_contract_duplicate',
      },
      {
        name: 'unanchored',
        text: () => [
          '<open-design-plan-contract>\n{not-json}\n</open-design-plan-contract>',
          block('open-design-runtime-state', runtimeState({ outcome: 'plan_ready', executionMode: 'simple' })),
        ].join('\n'),
        reason: 'od_next_protocol_plan_contract_invalid_json',
      },
    ];
    for (const [index, testCase] of cases.entries()) {
      const taskId = `task-${index + 2}`;
      const runId = `run-${index + 2}`;
      createStrategyTaskExecution(db, {
        taskExecutionId: taskId,
        projectId: 'project-1',
        conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId,
        selectedAgentId: AGENT_ID,
        initialRunId: runId,
        ...strategyTaskCreateIdentityFixture(),
        createdAt: 200 + index * 20,
      });
      prepareStrategyRequest(db, {
        taskExecutionId: taskId,
        preference: 'full_plan',
        directEdit: directEligible,
        intake: intakePassed,
        updatedAt: 201 + index * 20,
      });
      const result = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: taskId,
        runId,
        protocol: protocol(testCase.text(planContract(snapshot))),
        repairRun: { runId: `${runId}-repair`, sourceRunId: runId },
        updatedAt: 202 + index * 20,
      });
      expect(result.action, testCase.name).toBe('blocked');
      expect(result.reasonCodes, testCase.name).toContain(testCase.reason);
    }

    const original = planContract(snapshot);
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 300,
    });
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', original, true),
        block('open-design-runtime-state', runtimeState({ outcome: 'plan_ready', executionMode: 'simple' })),
      ].join('\n')),
      repairRun: { runId: 'run-repair', sourceRunId: 'run-request' },
      executionPreflight: executionPassed,
      updatedAt: 301,
    });
    const changed = structuredClone(original);
    changed.taskProfile.goal = 'Changed semantic goal';
    changed.decisionSummary.goal = 'Changed semantic goal';
    const drift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-repair',
      protocol: protocol([
        block('open-design-plan-contract', changed),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'contract_repair', outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 302,
    });
    expect(drift).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_contract_repair_semantic_drift'],
    });
  });

  it('blocks locked route drift and any tool use during contract repair', () => {
    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-route-drift',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-route-drift',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 400,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-route-drift',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 401,
    });
    const drift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-route-drift',
      runId: 'run-route-drift',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', outcome: 'completed', executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      updatedAt: 402,
    });
    expect(drift).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_protocol_route_mismatch'],
    });

    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-profile-drift',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-profile-drift',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 405,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-profile-drift',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 406,
    });
    const mismatchedProfile = planContract(snapshot);
    mismatchedProfile.taskProfile.taskType = 'ppt';
    const profileDrift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-profile-drift',
      runId: 'run-profile-drift',
      protocol: protocol([
        block('open-design-plan-contract', mismatchedProfile),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 407,
    });
    expect(profileDrift).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_plan_task_profile_mismatch'],
    });

    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-repair-tools',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-repair-tools-request',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 410,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-repair-tools',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 411,
    });
    const plan = planContract(snapshot);
    finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-repair-tools',
      runId: 'run-repair-tools-request',
      protocol: protocol([
        block('open-design-plan-contract', plan, true),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      repairRun: {
        runId: 'run-repair-tools',
        sourceRunId: 'run-repair-tools-request',
      },
      executionPreflight: executionPassed,
      updatedAt: 412,
    });
    const toolUse = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-repair-tools',
      runId: 'run-repair-tools',
      protocol: protocol([
        block('open-design-plan-contract', plan),
        block('open-design-runtime-state', runtimeState({
          inputStage: 'contract_repair', outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      toolUseCount: 1,
      executionPreflight: executionPassed,
      updatedAt: 413,
    });
    expect(toolUse).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_contract_repair_tool_use_forbidden'],
    });
  });

  it('maps strict and repair-anchor Plan identity drift to stable blocked reasons', () => {
    const cases: Array<{
      name: string;
      reason: string;
      mutate: (plan: OpenDesignPlanContractV2) => void;
    }> = [
      {
        name: 'snapshot',
        reason: 'od_next_plan_snapshot_mismatch',
        mutate: (plan) => { plan.strategy.snapshotId = 'snapshot-drift'; },
      },
      {
        name: 'version',
        reason: 'od_next_plan_strategy_version_mismatch',
        mutate: (plan) => { plan.strategy.version = '2.0.1'; },
      },
      {
        name: 'package-hash',
        reason: 'od_next_plan_strategy_package_hash_mismatch',
        mutate: (plan) => { plan.strategy.packageHash = 'd'.repeat(64); },
      },
      {
        name: 'selected-agent',
        reason: 'od_next_plan_selected_agent_mismatch',
        mutate: (plan) => { plan.runManifest.selectedAgentId = 'claude'; },
      },
    ];

    let sequence = 0;
    for (const testCase of cases) {
      for (const repairAnchor of [false, true]) {
        sequence += 1;
        const taskId = `task-identity-${sequence}`;
        const runId = `run-identity-${sequence}`;
        createStrategyTaskExecution(db, {
          taskExecutionId: taskId,
          projectId: 'project-1',
          conversationId: 'conversation-1',
          snapshotId: snapshot.snapshotId,
          selectedAgentId: AGENT_ID,
          initialRunId: runId,
          ...strategyTaskCreateIdentityFixture(),
          createdAt: 500 + sequence * 10,
        });
        prepareStrategyRequest(db, {
          taskExecutionId: taskId,
          preference: 'full_plan',
          directEdit: directEligible,
          intake: intakePassed,
          updatedAt: 501 + sequence * 10,
        });
        const drifted = planContract(snapshot);
        testCase.mutate(drifted);
        const result = finalizeStrategyPlanningTurn(db, {
          taskExecutionId: taskId,
          runId,
          protocol: protocol([
            block('open-design-plan-contract', drifted, repairAnchor),
            block('open-design-runtime-state', runtimeState({
              outcome: 'plan_ready', executionMode: 'simple',
            })),
          ].join('\n')),
          ...(repairAnchor
            ? { repairRun: { runId: `${runId}-repair`, sourceRunId: runId } }
            : {}),
          executionPreflight: executionPassed,
          updatedAt: 502 + sequence * 10,
        });
        expect(result.action, `${testCase.name}/${repairAnchor ? 'repair' : 'strict'}`).toBe(
          'blocked',
        );
        expect(
          result.reasonCodes,
          `${testCase.name}/${repairAnchor ? 'repair' : 'strict'}`,
        ).toContain(testCase.reason);
        expect(result.task.outcome).toBe('blocked');
      }
    }
  });

  it('atomically advances a hash-bound plan into one simple production Run', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1',
      preference: 'full_plan',
      directEdit: directEligible,
      intake: intakePassed,
      updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });

    const production = beginAutomaticSimpleProduction(db, {
      task: planned.task,
      sourceRunId: 'run-request',
      nextRunId: 'run-production',
      updatedAt: 130,
    });
    expect(production).toMatchObject({
      outcome: 'running',
      inputStage: 'production',
      executionMode: 'simple',
      latestRunId: 'run-production',
      activeRunId: 'run-production',
    });
    expect(production.runs.map(({ finalText: _finalText, ...run }) => run)).toEqual([
      { runId: 'run-request', inputStage: 'request', taskRunIndex: 0 },
      {
        runId: 'run-production',
        inputStage: 'production',
        taskRunIndex: 1,
        sourceRunId: 'run-request',
      },
    ]);
    expect(projectStrategyTask(production, 'run-request')).toMatchObject({
      taskExecutionId: 'task-1',
      activeRunId: 'run-production',
      nextRunId: 'run-production',
      terminal: false,
    });

    expect(() => beginAutomaticSimpleProduction(db, {
      task: planned.task,
      sourceRunId: 'run-request',
      nextRunId: 'run-production-duplicate',
    })).toThrow();
  });

  it('prepares the production prompt and task CAS through the internal Run claim callback', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    let capturedMeta: Record<string, unknown> | null = null;
    const result = prepareAutomaticSimpleProductionRun({
      db,
      task: planned.task,
      service: {
        prepare(input) {
          capturedMeta = input.meta;
          const run = { id: 'run-production', status: 'queued' };
          input.beforeClaimCommit?.(run);
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: (instruction, taskRunIndex) => ({ instruction, taskRunIndex }),
      updatedAt: 130,
    });
    expect(capturedMeta).toMatchObject({
      taskRunIndex: 1,
      instruction: expect.stringContaining(`planContractHash=${planned.task.planContractHash}`),
    });
    expect(result.task.latestRunId).toBe('run-production');
    expect(result.projection.nextRunId).toBe('run-production');
  });

  it('accepts the parsed server result and claims simple Production in one transaction', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const parsed = protocol([
      block('open-design-plan-contract', planContract(snapshot)),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    let capturedMeta: Record<string, unknown> | null = null;
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      executionPreflight: executionPassed,
      service: {
        prepare(input) {
          capturedMeta = input.meta;
          const run = { id: 'run-production-live', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: (stage, instruction, taskRunIndex) => ({
        stage, instruction, taskRunIndex,
      }),
      updatedAt: 120,
    });
    expect(capturedMeta).toMatchObject({
      stage: 'production',
      taskRunIndex: 1,
      instruction: expect.stringContaining('planContractHash='),
    });
    expect(transition).toMatchObject({
      start: true,
      stage: 'production',
      result: {
        action: 'plan_ready',
        task: {
          inputStage: 'production',
          outcome: 'running',
          latestRunId: 'run-production-live',
        },
      },
    });
  });

  it('blocks an unknown production route instead of trusting the Plan string', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const plan = planContract(snapshot);
    plan.runManifest.productionRoutes = ['unregistered-host-route'];
    const parsed = protocol([
      block('open-design-plan-contract', plan),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      executionPreflight: {
        ...executionPassed,
        productionRoutes: [{ id: 'unregistered-host-route', available: false }],
      },
      service: {
        prepare(input) {
          const run = { id: 'must-rollback', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 120,
    });
    expect(transition).toMatchObject({
      start: false,
      result: {
        action: 'blocked',
        reasonCodes: ['od_next_preflight_route_unavailable:unregistered-host-route'],
        task: { outcome: 'blocked', latestRunId: 'run-request' },
      },
    });
  });

  it('blocks plan continuation when daemon-owned execution facts are absent', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const parsed = protocol([
      block('open-design-plan-contract', planContract(snapshot)),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      service: {
        prepare(input) {
          const run = { id: 'must-not-start', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 120,
    });
    expect(transition).toMatchObject({
      start: false,
      result: {
        action: 'blocked',
        reasonCodes: ['od_next_preflight_execution_facts_missing'],
        task: { outcome: 'blocked', latestRunId: 'run-request' },
      },
    });
  });

  it('claims a serialization-only repair Run before simple Production', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const plan = planContract(snapshot);
    const parsed = protocol([
      block('open-design-plan-contract', plan, true),
      block('open-design-runtime-state', runtimeState({
        outcome: 'plan_ready', executionMode: 'simple',
      })),
    ].join('\n')).finish();
    const transition = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, 'task-1')!,
      parsed,
      executionPreflight: executionPassed,
      service: {
        prepare(input) {
          const run = { id: 'run-contract-repair-live', status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: (stage, instruction) => ({ stage, instruction }),
      updatedAt: 120,
    });
    expect(transition).toMatchObject({
      start: true,
      stage: 'contract_repair',
      result: {
        action: 'contract_repair',
        task: {
          inputStage: 'contract_repair',
          outcome: 'running',
          latestRunId: 'run-contract-repair-live',
          planContractRepairAttempts: 1,
        },
      },
    });
  });

  it('blocks Direct Edit completion without physical success and canonical delivery', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'auto', directEdit: directEligible,
      intake: intakePassed, execution: executionPassed, updatedAt: 110,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', outcome: 'completed', executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      updatedAt: 120,
    });
    expect(result).toMatchObject({
      action: 'blocked',
      reasonCodes: ['od_next_canonical_deliverable_invalid'],
      task: { outcome: 'blocked', terminalRunId: 'run-request' },
    });
  });

  it('requires both physical success and a canonical deliverable to complete production', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const completed = completeAutomaticSimpleProduction(db, {
      runId: 'run-production', physicalStatus: 'succeeded', deliverableValid: true,
      updatedAt: 140,
    });
    expect(completed).toMatchObject({
      outcome: 'completed', terminalRunId: 'run-production', activeRunId: null,
    });
  });

  it('attributes a production block that delivered no resolvable entry', () => {
    // Every other blocking path persists a `blockedContext`; this one did not,
    // so the most common production block reached the client with no reason
    // codes at all and could only be rendered as an anonymous failure.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const blocked = completeAutomaticSimpleProduction(db, {
      runId: 'run-production', physicalStatus: 'succeeded', deliverableValid: false,
      updatedAt: 140,
    });
    expect(blocked).toMatchObject({ outcome: 'blocked' });
    expect(blocked?.blockedContext?.reasonCodes)
      .toEqual(['od_next_canonical_deliverable_invalid']);
  });

  it('names a production block for the process failure, not the delivery', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const failed = completeAutomaticSimpleProduction(db, {
      runId: 'run-production', physicalStatus: 'failed', deliverableValid: false,
      updatedAt: 140,
    });
    expect(failed?.blockedContext?.reasonCodes).toEqual([
      'od_next_physical_run_not_succeeded',
      'od_next_canonical_deliverable_invalid',
    ]);
  });

  it('blocks a continuation when native-session continuity cannot be proved', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const waiting = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', runtimeState({
        outcome: 'clarification_required',
      }))}`),
      updatedAt: 120,
    });
    beginStrategyClarification(db, {
      taskExecutionId: 'task-1', sourceRunId: waiting.task.latestRunId,
      nextRunId: 'run-clarification', answer: 'Desktop', updatedAt: 130,
    });
    const blocked = blockAutomaticContinuation(db, {
      runId: 'run-clarification', updatedAt: 140,
    });
    expect(blocked).toMatchObject({ outcome: 'blocked', terminalRunId: 'run-clarification' });
    expect(blocked?.blockedContext).toEqual({
      reasonCodes: ['od_next_native_session_continuity_unproven'],
      visibleText: null,
    });
  });

  it('accepts a form-only first turn by inferring the clarification runtime state', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    // The observed field failure: the agent renders a direction statement plus
    // exactly one discovery form but omits every machine-protocol block. The
    // turn has exactly one valid protocol meaning, so it must be accepted.
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`我们先对齐几个关键问题。
${question}`),
      updatedAt: 120,
    });
    expect(result.action).toBe('awaiting_clarification');
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_inferred']);
    expect(result.task.outcome).toBe('clarification_required');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('clarification_required');
    expect(persisted?.blockedContext).toBeUndefined();
  });

  it('accepts a clarification turn whose state predicted a premature execution mode', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const question = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${question}\n${block('open-design-runtime-state', {
        schema: 'open-design.strategy-state/v2',
        route: 'full_plan',
        inputStage: 'request',
        outcome: 'clarification_required',
        executionMode: 'simple',
        reasonCodes: ['scope_required'],
      })}`),
      updatedAt: 120,
    });
    expect(result.action).toBe('awaiting_clarification');
    expect(result.task.outcome).toBe('clarification_required');
    expect(result.task.executionMode).toBeNull();
  });

  it('keeps ambiguous protocol-less turns fail-closed instead of inferring', () => {
    // Two forms: not inferable.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const form = (id: string) => `<question-form id="${id}">{"questions":[{"id":"q","label":"Q?"}]}</question-form>`;
    const two = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(`${form('a')}
${form('b')}`),
      updatedAt: 120,
    });
    expect(two.action).toBe('blocked');
    expect(two.reasonCodes).toEqual(['od_next_protocol_runtime_state_missing']);

    // A recovered plan block without runtime state: ambiguous intent, no inference.
    createStrategyTaskExecution(db, {
      taskExecutionId: 'task-plan-no-state',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: 'run-plan-no-state',
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 200,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-plan-no-state', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 201,
    });
    const withPlan = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-plan-no-state', runId: 'run-plan-no-state',
      protocol: protocol(`${form('c')}
${block('open-design-plan-contract', planContract(snapshot))}`),
      executionPreflight: executionPassed,
      updatedAt: 202,
    });
    expect(withPlan.action).toBe('blocked');
    expect(withPlan.reasonCodes).toContain('od_next_protocol_runtime_state_missing');
  });

  it('lets the main Agent choose Direct Edit on an unrouted first turn', () => {
    // Product spec 3.1: the main Agent decides Direct Edit vs Full Plan.
    // The daemon leaves the route unlocked through the request turn and
    // adopts the Agent's declaration, so a local edit finishes in ONE
    // Request Turn instead of being forced through planning + production.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const beforeTurn = getStrategyTaskExecution(db, 'task-1');
    expect(beforeTurn?.route).toBeNull();

    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', inputStage: 'request', outcome: 'completed',
        executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.action).toBe('completed');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.route).toBe('direct_edit');
    expect(persisted?.executionMode).toBe('simple');
    expect(persisted?.inputStage).toBe('request');
    // One Request Turn: Direct Edit never claims a production Run.
    expect(persisted?.runs).toHaveLength(1);
  });

  it('recovers a Direct Edit completion the agent delivered but never declared', () => {
    // The observed field failure: the agent writes the canonical deliverable
    // correctly, Open Design's own validator resolves it, and then the agent
    // answers in prose without emitting a single machine block. Refusing that
    // turn stranded a finished artifact behind a generic failure card, and no
    // repair could rescue it — `tryBeginSerializationRepair` needs a recovered
    // Plan Contract to anchor on, and this turn produces none.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol('已创建 index.html，点击按钮会显示 Hello。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_inferred']);
    expect(result.task.outcome).toBe('completed');
    expect(result.task.route).toBe('direct_edit');
    expect(result.task.executionMode).toBe('simple');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('completed');
    expect(persisted?.blockedContext).toBeUndefined();
  });

  it('recovers a production completion the agent delivered but never declared', () => {
    // Production is only entered from a locked Full Plan and its schema admits
    // no non-terminal outcome, so a production turn that ran the frozen plan,
    // delivered a canonical entry Open Design resolved itself, and then answered
    // in prose has exactly one thing it could have declared. Refusing it
    // discarded a finished deliverable already sitting in the project.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-production',
      protocol: protocol('三个页面已生成，入口是 index.html。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      executionPreflight: executionPassed,
      updatedAt: 140,
    });
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_inferred']);
    expect(result.task.outcome).toBe('completed');
    expect(result.task.inputStage).toBe('production');
    expect(getStrategyTaskExecution(db, 'task-1')?.blockedContext).toBeUndefined();
  });

  it('refuses to infer a production completion that delivered nothing', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const planned = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    beginAutomaticSimpleProduction(db, {
      task: planned.task, sourceRunId: 'run-request', nextRunId: 'run-production',
      updatedAt: 130,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-production',
      protocol: protocol('已完成。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      executionPreflight: executionPassed,
      updatedAt: 140,
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_missing']);
  });

  it('refuses to infer a Direct Edit completion without verified physical delivery', () => {
    // The inference may only ever accept evidence Open Design resolved itself.
    // An undeclared turn that delivered nothing must still block, so a silent
    // no-op can never be laundered into a completed task.
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol('我已经完成了。'),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: false },
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toEqual(['od_next_protocol_runtime_state_missing']);
    expect(getStrategyTaskExecution(db, 'task-1')?.outcome).toBe('blocked');
  });

  it('adopts a Full Plan declaration on an unrouted first turn', () => {
    prepareStrategyIntake(db, {
      taskExecutionId: 'task-1',
      intake: intakePassed,
      execution: executionPassed,
    });
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol([
        block('open-design-plan-contract', planContract(snapshot)),
        block('open-design-runtime-state', runtimeState({
          outcome: 'plan_ready', executionMode: 'simple',
        })),
      ].join('\n')),
      executionPreflight: executionPassed,
      updatedAt: 120,
    });
    expect(result.action).toBe('plan_ready');
    expect(getStrategyTaskExecution(db, 'task-1')?.route).toBe('full_plan');
  });

  it('still rejects a route change once the route is locked', () => {
    // The unlocked-first-turn allowance must not weaken the existing guard:
    // later turns may never re-route the task chain.
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const drift = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1',
      runId: 'run-request',
      protocol: protocol(block('open-design-runtime-state', runtimeState({
        route: 'direct_edit', inputStage: 'request', outcome: 'completed',
        executionMode: 'simple',
      }))),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      updatedAt: 120,
    });
    expect(drift.action).toBe('blocked');
    expect(drift.reasonCodes).toContain('od_next_protocol_route_mismatch');
  });

  it('persists blocked attribution so a blocked task can be diagnosed from the store', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    // Mirrors the observed field failure: a visible-only reply without any
    // machine-protocol block must block AND leave queryable attribution.
    const visible = '这轮回复没有携带机器协议块，只有普通文本。';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(visible),
      updatedAt: 120,
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes.length).toBeGreaterThan(0);
    const persisted = getStrategyTaskExecution(db, 'task-1');
    expect(persisted?.outcome).toBe('blocked');
    expect(persisted?.blockedContext).toEqual({
      reasonCodes: result.reasonCodes,
      visibleText: visible,
    });
  });

  it('projects blocked attribution to clients so the UI can terminate form interaction', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const visible = '这轮回复没有携带机器协议块，只有普通文本。';
    const result = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol(visible),
      updatedAt: 120,
    });
    expect(result.action).toBe('blocked');
    const persisted = getStrategyTaskExecution(db, 'task-1');
    const projection = projectStrategyTask(persisted!, 'run-request');
    expect(projection.terminal).toBe(true);
    expect(projection.outcome).toBe('blocked');
    // The run-status / SSE projection must carry the persisted gate verdict so
    // the web client can disable the clarification form and explain why.
    expect(projection.blockedContext).toEqual({
      reasonCodes: result.reasonCodes,
      visibleText: visible,
    });
    // And the wire contract must accept + preserve that attribution.
    expect(StrategyTaskProjectionV2Schema.parse(projection).blockedContext).toEqual(
      projection.blockedContext,
    );
  });

  it('projects no blocked attribution on a non-blocked task', () => {
    prepareStrategyRequest(db, {
      taskExecutionId: 'task-1', preference: 'full_plan', directEdit: directEligible,
      intake: intakePassed, updatedAt: 110,
    });
    const waiting = finalizeStrategyPlanningTurn(db, {
      taskExecutionId: 'task-1', runId: 'run-request',
      protocol: protocol([
        '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>',
        block('open-design-runtime-state', runtimeState({ outcome: 'clarification_required' })),
      ].join('\n')),
      updatedAt: 120,
    });
    expect(waiting.task.outcome).toBe('clarification_required');
    const projection = projectStrategyTask(waiting.task, 'run-request');
    expect(projection.terminal).toBe(false);
    expect(projection.blockedContext).toBeUndefined();
  });
});

describe('OD Next production completion inference', () => {
  it('never infers a complex completion from a turn that declared nothing', () => {
    // The inference rests on Open Design having resolved the evidence the agent
    // failed to declare, and for a simple plan that evidence IS the canonical
    // deliverable. A complex plan additionally owes verified native Child
    // lifecycle — the property that makes it complex — which no deliverable
    // check substitutes for. Accepting complex here certified Children nobody
    // observed: an AMR complex Run whose Vela build ships no child-lifecycle
    // producer reported `knownChildCount: 0` and still landed `completed`,
    // walking past `evaluateOdNextComplexChildEvidence` entirely.
    const parsed = protocol('Built all three pages and wired the navigation.').finish();

    expect(odNextTurnMayInferProductionCompletion(
      { route: 'full_plan', inputStage: 'production', executionMode: 'simple' },
      parsed,
    )).toBe(true);
    expect(odNextTurnMayInferProductionCompletion(
      { route: 'full_plan', inputStage: 'production', executionMode: 'complex' },
      parsed,
    )).toBe(false);
  });
});
