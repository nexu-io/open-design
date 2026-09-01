import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  normalizeAgentObservationV1,
  OpenDesignPlanContractV2Schema,
  type AppliedPluginSnapshot,
  type NormalizedAgentObservationV1,
  type OdNextRuntimeCapabilitySnapshotV1,
  type OpenDesignPlanContractV2,
} from '@open-design/contracts';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../../../src/db.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import { hashOdNextRuntimeCapabilitySnapshotV1 } from '../../../src/runtimes/od-next-capability-gate.js';
import { resolveBundledOdNextRuntimeCapability } from '../../../src/runtimes/od-next-capability-gate.js';
import { createClaudeChildEvidenceCollector } from '../../../src/runtimes/claude-child-evidence.js';
import {
  prepareAutomaticStrategyContinuation,
} from '../../../src/strategies/od-next/automatic-simple-production.js';
import {
  resolveAutomaticContinuationEvidence,
} from '../../../src/strategies/od-next/automatic-continuation-service.js';
import {
  evaluateOdNextComplexChildEvidence,
  evaluateOdNextComplexEligibility,
} from '../../../src/strategies/od-next/complex-production.js';
import { prepareStrategyRequest } from '../../../src/strategies/od-next/coordinator.js';
import { resolveDaemonOwnedOdNextComplexRuntimeEvidence } from '../../../src/strategies/od-next/complex-runtime-evidence.js';
import {
  createOdNextNativeBuildPackageBindings,
  nativeBuildPackageBindingMap,
} from '../../../src/strategies/od-next/native-build-package.js';
import { OdNextMachineProtocolStream } from '../../../src/strategies/od-next/protocol.js';
import {
  cancelStrategyTaskExecution,
  createStrategyTaskExecution,
  getStrategyTaskExecution,
} from '../../../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture } from '../strategy-task-test-fixtures.js';

const AGENT_ID = 'codex';
const TASK_ID = 'task-complex';
const REQUEST_RUN_ID = 'run-request';
const PRODUCTION_RUN_ID = 'run-production';
const ROOT_OBSERVATION_ID = 'task-run:run-production';

const executionPassed = {
  productionRoutes: [{ id: 'html', available: true }],
  dependencies: [],
  inputs: [{ id: 'request', available: true }],
  renderers: [],
  exporters: [],
  templates: [],
  outputKinds: [{ id: 'prototype', supported: true }],
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

function capabilitySnapshot(
  overrides: Partial<Omit<OdNextRuntimeCapabilitySnapshotV1, 'snapshotHash'>> = {},
): OdNextRuntimeCapabilitySnapshotV1 {
  const withoutHash: Omit<OdNextRuntimeCapabilitySnapshotV1, 'snapshotHash'> = {
    schema: 'open-design.od-next-runtime-capability-snapshot/v1',
    runtimePath: 'codex',
    agentId: AGENT_ID,
    agentCliVersion: 'synthetic-cli-simulating-fixture/1',
    recordedAgentCliVersion: 'synthetic-cli-recorded-fixture/1',
    runtimeAdapterVersion: 'synthetic-adapter/1',
    fixtureVersion: 'synthetic-gate/v1',
    fixtureHash: `sha256:${'d'.repeat(64)}`,
    nativeSessionContinuation: {
      support: 'verified',
      evidenceLevel: 'L0',
      source: 'sanitized_fixture_replay',
    },
    nativeSubagents: {
      support: 'verified',
      evidenceLevel: 'L2',
      source: 'sanitized_fixture_replay',
    },
    capturedAt: 100,
    ...overrides,
  };
  return {
    ...withoutHash,
    snapshotHash: hashOdNextRuntimeCapabilitySnapshotV1(withoutHash),
  };
}

function planContract(
  snapshot: AppliedPluginSnapshot,
  capability = capabilitySnapshot(),
  dependent = true,
): OpenDesignPlanContractV2 {
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
      executionMode: 'complex',
      steps: [
        { id: 'shell', objective: 'Build shell', outputs: ['shell'] },
        {
          id: 'flow',
          objective: 'Build flow',
          outputs: ['flow'],
          ...(dependent ? { dependsOn: ['shell'] } : {}),
        },
      ],
      readinessArtifacts: [],
      buildPackages: [
        {
          id: 'shell',
          objective: 'Build shell',
          inputs: ['design-spec'],
          outputs: ['shell'],
          sharedConstraints: ['Use the frozen design spec.'],
          dependsOn: [],
          allowedResources: ['project-source'],
        },
        {
          id: 'flow',
          objective: 'Build flow',
          inputs: dependent ? ['shell'] : ['design-spec'],
          outputs: ['flow'],
          sharedConstraints: ['Use the frozen design spec.'],
          dependsOn: dependent ? ['shell'] : [],
          allowedResources: ['project-source'],
        },
      ],
    },
    runManifest: {
      selectedAgentId: AGENT_ID,
      capabilitySnapshotHash: capability.snapshotHash.slice('sha256:'.length),
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

function observation(input: {
  id: string;
  kind?: 'task_run' | 'child_agent';
  status: 'running' | 'completed' | 'failed' | 'canceled';
  parentId?: string;
  packageId?: string;
  runId?: string;
  taskRunIndex?: number;
}): NormalizedAgentObservationV1 {
  return normalizeAgentObservationV1({
    identity: {
      observationId: input.id,
      taskExecutionId: TASK_ID,
      runId: input.runId ?? PRODUCTION_RUN_ID,
      taskRunIndex: input.taskRunIndex ?? 1,
      ...(input.parentId ? { parentObservationId: input.parentId } : {}),
    },
    kind: input.kind ?? 'task_run',
    stage: 'production',
    status: input.status,
    ...(input.packageId ? { attributes: { buildPackageId: input.packageId } } : {}),
  });
}

function successfulEvidence(dependent = true): NormalizedAgentObservationV1[] {
  return dependent
    ? [
        observation({ id: ROOT_OBSERVATION_ID, status: 'running' }),
        observation({ id: 'child-shell', kind: 'child_agent', status: 'running', parentId: ROOT_OBSERVATION_ID, packageId: 'shell' }),
        observation({ id: 'child-shell', kind: 'child_agent', status: 'completed', parentId: ROOT_OBSERVATION_ID, packageId: 'shell' }),
        observation({ id: 'child-flow', kind: 'child_agent', status: 'running', parentId: ROOT_OBSERVATION_ID, packageId: 'flow' }),
        observation({ id: 'child-flow', kind: 'child_agent', status: 'completed', parentId: ROOT_OBSERVATION_ID, packageId: 'flow' }),
        observation({ id: ROOT_OBSERVATION_ID, status: 'completed' }),
      ]
    : [
        observation({ id: ROOT_OBSERVATION_ID, status: 'running' }),
        observation({ id: 'child-shell', kind: 'child_agent', status: 'running', parentId: ROOT_OBSERVATION_ID, packageId: 'shell' }),
        observation({ id: 'child-flow', kind: 'child_agent', status: 'running', parentId: ROOT_OBSERVATION_ID, packageId: 'flow' }),
        observation({ id: 'child-flow', kind: 'child_agent', status: 'completed', parentId: ROOT_OBSERVATION_ID, packageId: 'flow' }),
        observation({ id: 'child-shell', kind: 'child_agent', status: 'completed', parentId: ROOT_OBSERVATION_ID, packageId: 'shell' }),
        observation({ id: ROOT_OBSERVATION_ID, status: 'completed' }),
      ];
}

function block(tag: string, value: unknown): string {
  return `<${tag}>\n${JSON.stringify(value)}\n</${tag}>`;
}

function parsedPlanning(plan: OpenDesignPlanContractV2) {
  OpenDesignPlanContractV2Schema.parse(plan);
  const protocol = new OdNextMachineProtocolStream();
  protocol.push([
    block('open-design-plan-contract', plan),
    block('open-design-runtime-state', {
      schema: 'open-design.strategy-state/v2',
      route: 'full_plan',
      inputStage: 'request',
      outcome: 'plan_ready',
      executionMode: 'complex',
      reasonCodes: [],
    }),
  ].join('\n'));
  return protocol.finish();
}

function parsedCompletion() {
  const protocol = new OdNextMachineProtocolStream();
  protocol.push(block('open-design-runtime-state', {
    schema: 'open-design.strategy-state/v2',
    route: 'full_plan',
    inputStage: 'production',
    outcome: 'completed',
    executionMode: 'complex',
    reasonCodes: [],
  }));
  return protocol.finish();
}

describe('OD Next complex production enforcement', () => {
  let tempDir: string;
  let db: Database.Database;
  let snapshot: AppliedPluginSnapshot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-next-complex-'));
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
      taskExecutionId: TASK_ID,
      projectId: 'project-1',
      conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId,
      selectedAgentId: AGENT_ID,
      initialRunId: REQUEST_RUN_ID,
      ...strategyTaskCreateIdentityFixture(),
      createdAt: 100,
    });
    prepareStrategyRequest(db, {
      taskExecutionId: TASK_ID,
      preference: 'full_plan',
      directEdit: {
        editableBaselineExists: false,
        localAndUnambiguous: false,
        canonicalDeliverableStable: false,
        deliverableSetStable: false,
        dependenciesBounded: false,
      },
      intake: {
        inputRefs: [{ id: 'request', accessible: true }],
        selectedAgentAvailable: true,
        nativeContinuation: 'verified',
        taskProfileAvailable: true,
        dependencies: [],
      },
      updatedAt: 110,
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('reports a Run that observed no Child as missing evidence, not malformed evidence', () => {
    // The daemon-owned resolver always brackets the Child list with a
    // running/completed root pair, so a Run whose Children were never observed
    // still reaches the graph check with two perfectly valid observations. It
    // used to be reported as `..._invalid`, which sent whoever debugged it
    // hunting a corrupt payload — the codex collector had simply never run, so
    // there was nothing malformed to find and nothing observed either.
    const capability = capabilitySnapshot();
    const plan = planContract(snapshot, capability, true);
    expect(evaluateOdNextComplexChildEvidence({
      plan,
      taskExecutionId: TASK_ID,
      runId: PRODUCTION_RUN_ID,
      taskRunIndex: 1,
      observations: [
        observation({ id: ROOT_OBSERVATION_ID, status: 'running' }),
        observation({ id: ROOT_OBSERVATION_ID, status: 'completed' }),
      ],
      taskRunObservationId: ROOT_OBSERVATION_ID,
    })).toEqual({
      eligible: false,
      reasonCodes: ['od_next_complex_child_evidence_missing'],
    });
  });

  it('accepts structured serial and parallel package lifecycles without parsing prose', () => {
    const capability = capabilitySnapshot();
    for (const dependent of [true, false]) {
      const plan = planContract(snapshot, capability, dependent);
      expect(evaluateOdNextComplexChildEvidence({
        plan,
        taskExecutionId: TASK_ID,
        runId: PRODUCTION_RUN_ID,
        taskRunIndex: 1,
        observations: successfulEvidence(dependent),
        taskRunObservationId: ROOT_OBSERVATION_ID,
      })).toEqual({ eligible: true, reasonCodes: [] });
    }
  });

  it('finishes a complex task whose Children cannot name a Build Package', () => {
    // Ownership rides on Claude's `--agents` / `subagent_type` transport, so
    // `buildPackageId` is best-effort — most runtimes cannot produce it at all.
    // Demanding it from everyone refused every complex run on Codex, native
    // OpenCode and AMR at the completion turn, after a full production Run had
    // been spent, and the blocked verdict then latched OD Next off daemon-wide.
    const plan = planContract(snapshot, capabilitySnapshot());
    const unowned = successfulEvidence().map((item) => (
      item.kind === 'child_agent'
        ? observation({
            id: item.identity.observationId,
            kind: 'child_agent',
            status: item.status as 'running' | 'completed' | 'failed' | 'canceled',
            parentId: ROOT_OBSERVATION_ID,
          })
        : item
    ));
    expect(evaluateOdNextComplexChildEvidence({
      plan,
      taskExecutionId: TASK_ID,
      runId: PRODUCTION_RUN_ID,
      taskRunIndex: 1,
      observations: unowned,
      taskRunObservationId: ROOT_OBSERVATION_ID,
    })).toEqual({ eligible: true, reasonCodes: [] });

    // Dropping ownership must not turn the gate into a rubber stamp.
    const noTerminal = unowned.filter((item) => (
      !(item.kind === 'child_agent' && item.status === 'completed')
    ));
    expect(evaluateOdNextComplexChildEvidence({
      plan,
      taskExecutionId: TASK_ID,
      runId: PRODUCTION_RUN_ID,
      taskRunIndex: 1,
      observations: noTerminal,
      taskRunObservationId: ROOT_OBSERVATION_ID,
    }).reasonCodes).toContain('od_next_complex_child_terminal_missing');
  });

  it('still verifies ownership when the evidence carries it', () => {
    // The judgement follows the evidence, not an agent allowlist: a runtime
    // that starts stamping ownership is held to it the moment it does, with no
    // list to maintain.
    const plan = planContract(snapshot, capabilitySnapshot());
    const wrongPackage = successfulEvidence().map((item) => (
      item.kind === 'child_agent' && item.identity.observationId === 'child-flow'
        ? observation({
            id: 'child-flow',
            kind: 'child_agent',
            status: item.status as 'running' | 'completed' | 'failed' | 'canceled',
            parentId: ROOT_OBSERVATION_ID,
            packageId: 'not-a-declared-package',
          })
        : item
    ));
    expect(evaluateOdNextComplexChildEvidence({
      plan,
      taskExecutionId: TASK_ID,
      runId: PRODUCTION_RUN_ID,
      taskRunIndex: 1,
      observations: wrongPackage,
      taskRunObservationId: ROOT_OBSERVATION_ID,
    }).reasonCodes).toContain('od_next_complex_child_package_unknown');
  });

  it('ignores later runtime-version drift when resolving automatic complex eligibility', async () => {
    const frozenCapability = capabilitySnapshot({
      agentCliVersion: 'codex-cli 0.148.0-alpha.9',
      recordedAgentCliVersion: 'codex-cli 0.147.0',
    });
    const evidence = await resolveAutomaticContinuationEvidence({
      plan: planContract(snapshot, frozenCapability),
      phase: 'eligibility',
      task: getStrategyTaskExecution(db, TASK_ID)!,
      run: {
        id: REQUEST_RUN_ID,
        status: 'succeeded',
        createdAt: 100,
        events: [],
        preflightAgentCliVersion: 'codex-cli 9.9.9-later-probe',
      },
      localSyntheticCanary: false,
      runtimeCapabilitySnapshot: frozenCapability,
    });

    expect(evidence.complexRuntimeEvidence?.capabilitySnapshot).toEqual(
      frozenCapability,
    );
  });

  it('keeps complex continuation on the admission-frozen capability snapshot', () => {
    const capability = resolveBundledOdNextRuntimeCapability({
      agentId: 'claude',
      agentCliVersion: '2.1.233 (Claude Code)',
      capturedAt: 1,
    }).snapshot!;
    const plan = OpenDesignPlanContractV2Schema.parse({
      ...planContract(snapshot, capability),
      runManifest: {
        ...planContract(snapshot, capability).runManifest,
        selectedAgentId: 'claude',
      },
    });
    const bindings = createOdNextNativeBuildPackageBindings({
      taskExecutionId: TASK_ID,
      taskRunIndex: 1,
      planContractHash: 'f'.repeat(64),
      plan,
    });
    expect(bindings.map(({ buildPackageId }) => buildPackageId)).toEqual(['shell', 'flow']);
    expect(bindings.every(({ nativeAgentHandle }) => (
      /^od-build-[1-9][0-9]*-[a-f0-9]{16}$/.test(nativeAgentHandle)
    ))).toBe(true);
    const facts: Array<Record<string, unknown>> = [];
    let now = 100;
    const collector = createClaudeChildEvidenceCollector({
      now: () => ++now,
      nativeBuildPackageBindings: nativeBuildPackageBindingMap(bindings),
      onFact: (fact) => facts.push({
        type: 'diagnostic',
        name: 'claude_child_runtime_fact',
        ...fact,
      }),
    });
    collector.observe({
      type: 'system', subtype: 'init', session_id: 'session-complex', claude_code_version: '2.1.233',
    });
    for (const [index, binding] of bindings.entries()) {
      const childId = `child-${index + 1}`;
      collector.observe({
        type: 'assistant',
        parent_tool_use_id: null,
        message: {
          content: [{
            type: 'tool_use',
            id: childId,
            name: 'Agent',
            input: {
              subagent_type: binding.nativeAgentHandle,
              prompt: index === 0
                ? 'This prose mentions flow but the native handle owns shell.'
                : 'Execute the second package.',
            },
          }],
          stop_reason: 'tool_use',
        },
      });
      collector.observe({
        type: 'user',
        message: {
          content: [{ type: 'tool_result', tool_use_id: childId, content: 'ok' }],
        },
        tool_use_result: {
          status: 'completed',
          agentId: `native-${index + 1}`,
          agentType: binding.nativeAgentHandle,
          resolvedModel: 'claude-haiku-4-5',
          totalTokens: 3,
          usage: { input_tokens: 2, output_tokens: 1 },
        },
      });
    }
    const evidence = resolveDaemonOwnedOdNextComplexRuntimeEvidence({
      phase: 'completion',
      taskExecutionId: TASK_ID,
      runId: PRODUCTION_RUN_ID,
      taskRunIndex: 1,
      stage: 'production',
      agentId: 'claude',
      capabilitySnapshot: capability,
      plan,
      run: {
        status: 'succeeded',
        createdAt: 90,
        updatedAt: 200,
        events: facts.map((data) => ({ event: 'agent', data })),
      },
    });
    expect(evidence).toBeDefined();
    if (!evidence?.observations || !evidence.taskRunObservationId) {
      throw new Error('expected daemon-owned complex completion evidence');
    }
    expect(evidence.capabilitySnapshot).toEqual(capability);
    expect(evidence.capabilitySnapshot).toMatchObject({
      agentCliVersion: '2.1.233 (Claude Code)',
      recordedAgentCliVersion: '2.1.233 (Claude Code)',
      snapshotHash: capability.snapshotHash,
    });
    expect(evidence?.observations?.filter((item: any) => (
      item.kind === 'child_agent' && item.status === 'completed'
    )).map((item: any) => item.attributes.buildPackageId)).toEqual(['shell', 'flow']);
    expect(evaluateOdNextComplexChildEvidence({
      plan,
      taskExecutionId: TASK_ID,
      runId: PRODUCTION_RUN_ID,
      taskRunIndex: 1,
      observations: evidence.observations,
      taskRunObservationId: evidence.taskRunObservationId,
    })).toEqual({ eligible: true, reasonCodes: [] });
  });

  it('fails closed for unknown, unsupported, missing, mismatched, and drifted capability snapshots', () => {
    const verified = capabilitySnapshot();
    const plan = planContract(snapshot, verified);
    expect(evaluateOdNextComplexEligibility({
      plan,
      selectedAgentId: AGENT_ID,
    }).reasonCodes).toEqual(['od_next_complex_capability_snapshot_missing']);

    for (const support of ['unknown', 'unsupported'] as const) {
      const changed = capabilitySnapshot({
        nativeSubagents: {
          support,
          evidenceLevel: 'L0',
          source: support === 'unsupported' ? 'sanitized_fixture_replay' : 'unverified',
        },
      });
      const result = evaluateOdNextComplexEligibility({
        plan: planContract(snapshot, changed),
        selectedAgentId: AGENT_ID,
        capabilitySnapshot: changed,
      });
      expect(result.eligible).toBe(false);
      expect(result.reasonCodes).toContain(
        support === 'unsupported'
          ? 'od_next_complex_native_subagents_unsupported'
          : 'od_next_complex_native_subagents_unverified',
      );
    }

    const otherAgent = capabilitySnapshot({ agentId: 'claude' });
    expect(evaluateOdNextComplexEligibility({
      plan: planContract(snapshot, otherAgent),
      selectedAgentId: AGENT_ID,
      capabilitySnapshot: otherAgent,
    }).reasonCodes).toContain('od_next_complex_capability_agent_mismatch');

    const drifted = capabilitySnapshot({ runtimeAdapterVersion: 'synthetic-adapter/2' });
    expect(evaluateOdNextComplexEligibility({
      plan,
      selectedAgentId: AGENT_ID,
      capabilitySnapshot: drifted,
    }).reasonCodes).toContain('od_next_complex_capability_version_drift');
  });

  it('diagnoses missing terminal, parent/package mismatch, duplicate ownership, dependency violations, and Child failure', () => {
    const plan = planContract(snapshot);
    const cases: Array<[NormalizedAgentObservationV1[], string]> = [
      [successfulEvidence().filter((item) => !(
        item.identity.observationId === 'child-flow' && item.status === 'completed'
      )), 'od_next_complex_child_terminal_missing'],
      [successfulEvidence().map((item) => item.identity.observationId === 'child-flow'
        ? observation({
            id: 'child-flow',
            kind: 'child_agent',
            status: item.status as 'running' | 'completed',
            parentId: 'wrong-parent',
            packageId: 'flow',
          })
        : item), 'od_next_complex_child_parent_mismatch'],
      [successfulEvidence().map((item) => item.identity.observationId === 'child-flow'
        ? observation({
            id: 'child-flow',
            kind: 'child_agent',
            status: item.status as 'running' | 'completed',
            parentId: ROOT_OBSERVATION_ID,
            packageId: 'shell',
          })
        : item), 'od_next_complex_child_package_duplicate'],
      [[
        observation({ id: ROOT_OBSERVATION_ID, status: 'running' }),
        observation({ id: 'child-flow', kind: 'child_agent', status: 'running', parentId: ROOT_OBSERVATION_ID, packageId: 'flow' }),
        observation({ id: 'child-shell', kind: 'child_agent', status: 'running', parentId: ROOT_OBSERVATION_ID, packageId: 'shell' }),
        observation({ id: 'child-shell', kind: 'child_agent', status: 'completed', parentId: ROOT_OBSERVATION_ID, packageId: 'shell' }),
        observation({ id: 'child-flow', kind: 'child_agent', status: 'completed', parentId: ROOT_OBSERVATION_ID, packageId: 'flow' }),
        observation({ id: ROOT_OBSERVATION_ID, status: 'completed' }),
      ], 'od_next_complex_package_dependency_order_invalid'],
      [successfulEvidence().map((item) => (
        item.identity.observationId === 'child-flow' && item.status === 'completed'
          ? observation({ id: 'child-flow', kind: 'child_agent', status: 'failed', parentId: ROOT_OBSERVATION_ID, packageId: 'flow' })
          : item
      )), 'od_next_complex_child_failed'],
    ];
    for (const [observations, reason] of cases) {
      expect(evaluateOdNextComplexChildEvidence({
        plan,
        taskExecutionId: TASK_ID,
        runId: PRODUCTION_RUN_ID,
        taskRunIndex: 1,
        observations,
        taskRunObservationId: ROOT_OBSERVATION_ID,
      }).reasonCodes).toContain(reason);
    }
  });

  it('claims complex Production atomically and completes from persisted state after daemon restart', () => {
    const capability = capabilitySnapshot();
    const plan = planContract(snapshot, capability);
    const planning = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, TASK_ID)!,
      parsed: parsedPlanning(plan),
      executionPreflight: executionPassed,
      complexRuntimeEvidence: { capabilitySnapshot: capability },
      service: {
        prepare(input) {
          const run = { id: PRODUCTION_RUN_ID, status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: (stage, instruction, taskRunIndex) => ({ stage, instruction, taskRunIndex }),
      updatedAt: 120,
    });
    expect(planning).toMatchObject({
      start: true,
      stage: 'production',
      result: { task: { inputStage: 'production', executionMode: 'complex' } },
    });

    closeDatabase();
    db = openDatabase(tempDir, { dataDir: tempDir });
    const restored = getStrategyTaskExecution(db, TASK_ID)!;
    expect(restored.runs.map((item) => item.inputStage)).toEqual(['request', 'production']);
    const completed = prepareAutomaticStrategyContinuation({
      db,
      task: restored,
      parsed: parsedCompletion(),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      complexRuntimeEvidence: {
        capabilitySnapshot: capability,
        observations: successfulEvidence(),
        taskRunObservationId: ROOT_OBSERVATION_ID,
      },
      service: {
        prepare() { throw new Error('Completion must not allocate another Run.'); },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 130,
    });
    expect(completed).toMatchObject({
      start: false,
      result: {
        action: 'completed',
        task: { outcome: 'completed', terminalRunId: PRODUCTION_RUN_ID },
      },
    });
  });

  it('blocks failed Child evidence and keeps cancellation terminal without repair or another Run', () => {
    const capability = capabilitySnapshot();
    const plan = planContract(snapshot, capability);
    const planning = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, TASK_ID)!,
      parsed: parsedPlanning(plan),
      executionPreflight: executionPassed,
      complexRuntimeEvidence: { capabilitySnapshot: capability },
      service: {
        prepare(input) {
          const run = { id: PRODUCTION_RUN_ID, status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 120,
    });
    const canceled = cancelStrategyTaskExecution(db, {
      taskExecutionId: TASK_ID,
      expectedRevision: planning.result.task.revision,
      updatedAt: 125,
    });
    expect(canceled).toMatchObject({
      outcome: 'canceled',
      terminalRunId: PRODUCTION_RUN_ID,
      planContractRepairAttempts: 0,
    });
    expect(canceled.runs).toHaveLength(2);
  });

  it('blocks a successful parent Run when one required Child failed', () => {
    const capability = capabilitySnapshot();
    const plan = planContract(snapshot, capability);
    const planning = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, TASK_ID)!,
      parsed: parsedPlanning(plan),
      executionPreflight: executionPassed,
      complexRuntimeEvidence: { capabilitySnapshot: capability },
      service: {
        prepare(input) {
          const run = { id: PRODUCTION_RUN_ID, status: 'queued' };
          db.transaction(() => input.beforeClaimCommit?.(run)).immediate();
          return { kind: 'ready', run, creationKind: 'created', resumed: false };
        },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 120,
    });
    const failedEvidence = successfulEvidence().map((item) => (
      item.identity.observationId === 'child-flow' && item.status === 'completed'
        ? observation({
            id: 'child-flow',
            kind: 'child_agent',
            status: 'failed',
            parentId: ROOT_OBSERVATION_ID,
            packageId: 'flow',
          })
        : item
    ));
    const terminal = prepareAutomaticStrategyContinuation({
      db,
      task: planning.result.task,
      parsed: parsedCompletion(),
      completionEvidence: { physicalStatus: 'succeeded', deliverableValid: true },
      complexRuntimeEvidence: {
        capabilitySnapshot: capability,
        observations: failedEvidence,
        taskRunObservationId: ROOT_OBSERVATION_ID,
      },
      service: {
        prepare() { throw new Error('Blocked completion must not allocate another Run.'); },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 130,
    });
    expect(terminal).toMatchObject({
      start: false,
      result: {
        action: 'blocked',
        reasonCodes: expect.arrayContaining(['od_next_complex_child_failed']),
        task: {
          outcome: 'blocked',
          terminalRunId: PRODUCTION_RUN_ID,
          planContractRepairAttempts: 0,
        },
      },
    });
    expect(terminal.result.task.runs).toHaveLength(2);
  });

  it('blocks a complex Plan before Run allocation when the verified snapshot drifts', () => {
    const capability = capabilitySnapshot();
    const plan = planContract(snapshot, capability);
    const drifted = capabilitySnapshot({ runtimeAdapterVersion: 'synthetic-adapter/2' });
    let prepareCalls = 0;
    const result = prepareAutomaticStrategyContinuation({
      db,
      task: getStrategyTaskExecution(db, TASK_ID)!,
      parsed: parsedPlanning(plan),
      executionPreflight: executionPassed,
      complexRuntimeEvidence: { capabilitySnapshot: drifted },
      service: {
        prepare() {
          prepareCalls += 1;
          throw new Error('must not allocate');
        },
        start(run) { return run; },
      },
      createMeta: () => ({}),
      updatedAt: 120,
    });
    expect(prepareCalls).toBe(0);
    expect(result).toMatchObject({
      start: false,
      result: {
        action: 'blocked',
        reasonCodes: ['od_next_complex_capability_version_drift'],
        task: { outcome: 'blocked', latestRunId: REQUEST_RUN_ID },
      },
    });
  });
});
