import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  type AppliedPluginSnapshot,
  type OpenDesignPlanContractV2,
  type StrategyExecutionModeV2,
  type StrategyTaskTypeV2,
} from '@open-design/contracts';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../../../src/db.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import {
  finalizeStrategyPlanningTurn,
  prepareStrategyRequest,
} from '../../../src/strategies/od-next/coordinator.js';
import { OdNextMachineProtocolStream } from '../../../src/strategies/od-next/protocol.js';
import {
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  strategyPlanContractHash,
} from '../../../src/strategies/task-store.js';
import {
  strategyTaskCreateIdentityFixture,
  strategyTaskTurnText,
} from '../strategy-task-test-fixtures.js';

const AGENT_ID = 'codex';

type ActiveProfile = Exclude<StrategyTaskTypeV2, 'generic' | 'marketing'>;

interface ProfileFixture {
  taskType: ActiveProfile;
  route: string;
  goal: string;
  canonical: { id: string; kind: string; format: string };
  required: Array<{ id: string; kind: string }>;
}

const PROFILES: ProfileFixture[] = [
  {
    taskType: 'prototype',
    route: 'prototype-html',
    goal: 'Build a multi-role prototype.',
    canonical: { id: 'prototype', kind: 'prototype', format: 'html' },
    required: [{ id: 'prototype', kind: 'prototype' }],
  },
  {
    taskType: 'ppt',
    route: 'deck-html',
    goal: 'Build an editable presentation.',
    canonical: { id: 'presentation', kind: 'presentation', format: 'html' },
    required: [{ id: 'presentation', kind: 'presentation' }],
  },
  {
    taskType: 'hyperframes',
    route: 'hyperframes-html',
    goal: 'Build editable HyperFrames source and a rendered film.',
    canonical: { id: 'hyperframes-source', kind: 'html', format: 'hyperframes-html' },
    required: [
      { id: 'hyperframes-source', kind: 'html' },
      { id: 'rendered-film', kind: 'video' },
    ],
  },
];

const CASES = PROFILES.flatMap((profile) => (
  (['simple', 'complex'] as const).map((executionMode) => ({ profile, executionMode }))
));

const intakePassed = {
  inputRefs: [{ id: 'request', accessible: true }],
  selectedAgentAvailable: true,
  nativeContinuation: 'verified' as const,
  taskProfileAvailable: true,
  dependencies: [],
};

function strategyBinding(taskType: ActiveProfile) {
  const profilePath = `./assets/task-profiles/${taskType}.md`;
  const assetDigests = [
    { path: './SKILL.md', sha256: 'a'.repeat(64) },
    { path: profilePath, sha256: 'b'.repeat(64) },
  ];
  return {
    schema: 'open-design.applied-strategy/v2' as const,
    id: 'od-next-strategy' as const,
    version: '2.0.0',
    packageHash: strategyPackageHashFromDigests(assetDigests),
    assetDigests,
    selectedTaskProfile: {
      taskType,
      version: '2.0.0',
      path: profilePath,
      sha256: 'b'.repeat(64),
    },
    taskProfileVersions: ['2.0.0'],
    promptRecipe: 'od-next-plan-build-v2' as const,
  };
}

function createStrategySnapshot(
  db: Database.Database,
  taskType: ActiveProfile,
): AppliedPluginSnapshot {
  return createSnapshot(db, {
    projectId: 'project-1',
    conversationId: 'conversation-1',
    runId: null,
    pluginId: 'od-next-strategy',
    pluginVersion: '2.0.0',
    manifestSourceDigest: `manifest-${taskType}`,
    strategy: strategyBinding(taskType),
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

function planContract(
  snapshot: AppliedPluginSnapshot,
  profile: ProfileFixture,
  executionMode: StrategyExecutionModeV2,
): OpenDesignPlanContractV2 {
  const strategy = snapshot.strategy!;
  const outputIds = profile.required.map(({ id }) => id);
  const complex = executionMode === 'complex';
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
      taskType: profile.taskType,
      taskProfileVersion: strategy.selectedTaskProfile.version,
      goal: profile.goal,
      contextAndAudience: 'Profile-specific contract repair operators.',
      inputsAndReferences: ['request'],
      constraints: ['Preserve the frozen profile and deliverable set.'],
      canonicalDeliverable: profile.canonical,
      requiredDeliverables: profile.required,
      designSpec: {
        source: 'resolved-baseline',
        version: '1',
        decisions: { palette: 'neutral', profile: profile.taskType },
      },
      buildRequirements: [{ id: 'build', text: `Build the ${profile.taskType} outputs.` }],
      assumptions: [],
      risks: [],
      taskSpecific: { profile: profile.taskType },
    },
    fullPlan: {
      executionMode,
      steps: complex
        ? [
            { id: 'package-a', objective: 'Build package A', outputs: ['package-a-output'] },
            {
              id: 'package-b',
              objective: 'Build package B',
              outputs: ['package-b-output'],
              dependsOn: ['package-a'],
            },
            {
              id: 'integrate',
              objective: 'Integrate the canonical deliverables',
              outputs: outputIds,
              dependsOn: ['package-b'],
            },
          ]
        : [{ id: 'build', objective: 'Build all required outputs', outputs: outputIds }],
      readinessArtifacts: [],
      buildPackages: complex
        ? [
            {
              id: 'package-a',
              objective: 'Build package A',
              inputs: ['design-spec'],
              outputs: ['package-a-output'],
              sharedConstraints: ['Use the frozen Design Spec.'],
              dependsOn: [],
              allowedResources: ['project-source'],
            },
            {
              id: 'package-b',
              objective: 'Build package B',
              inputs: ['package-a-output'],
              outputs: ['package-b-output'],
              sharedConstraints: ['Use the frozen Design Spec.'],
              dependsOn: ['package-a'],
              allowedResources: ['project-source'],
            },
          ]
        : [],
    },
    runManifest: {
      selectedAgentId: AGENT_ID,
      capabilitySnapshotHash: 'c'.repeat(64),
      inputRefs: ['request'],
      productionRoutes: [profile.route],
      preflight: { intake: 'passed', execution: 'passed' },
    },
    decisionSummary: {
      goal: profile.goal,
      deliverables: outputIds,
      keyConstraints: ['Preserve the frozen profile and deliverable set.'],
      assumptions: [],
      risks: [],
      openDecisions: [],
    },
  };
}

function executionPassed(profile: ProfileFixture) {
  return {
    productionRoutes: [{ id: profile.route, available: true }],
    dependencies: [],
    inputs: [{ id: 'request', available: true }],
    renderers: [],
    exporters: [],
    templates: [],
    outputKinds: profile.required.map(({ kind }) => ({ id: kind, supported: true })),
  };
}

function block(tag: string, value: unknown, fenced = false): string {
  const json = JSON.stringify(value);
  return `<${tag}>\n${fenced ? `\`\`\`json\n${json}\n\`\`\`` : json}\n</${tag}>`;
}

function protocol(text: string): OdNextMachineProtocolStream {
  const stream = new OdNextMachineProtocolStream();
  for (let index = 0; index < text.length; index += 11) {
    stream.push(text.slice(index, index + 11));
  }
  return stream;
}

function runtimeState(
  inputStage: 'request' | 'contract_repair',
  executionMode: StrategyExecutionModeV2,
) {
  return {
    schema: 'open-design.strategy-state/v2' as const,
    route: 'full_plan' as const,
    inputStage,
    outcome: 'plan_ready' as const,
    executionMode,
    reasonCodes: [],
  };
}

describe.each(CASES)(
  'OD Next $profile.taskType $executionMode Contract Repair',
  ({ profile, executionMode }) => {
    let tempDir: string;
    let db: Database.Database;
    let snapshot: AppliedPluginSnapshot;
    const taskId = `task-${profile.taskType}-${executionMode}`;
    const requestRunId = `run-${profile.taskType}-${executionMode}-request`;
    const repairRunId = `run-${profile.taskType}-${executionMode}-repair`;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-next-repair-profile-'));
      db = openDatabase(tempDir, { dataDir: tempDir });
      db.prepare(
        `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
      ).run('project-1', 'Project 1', 1, 1);
      db.prepare(
        `INSERT INTO conversations (id, project_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run('conversation-1', 'project-1', 'Conversation 1', 1, 1);
      snapshot = createStrategySnapshot(db, profile.taskType);
      createStrategyTaskExecution(db, {
        taskExecutionId: taskId,
        projectId: 'project-1',
        conversationId: 'conversation-1',
        snapshotId: snapshot.snapshotId,
        selectedAgentId: AGENT_ID,
        initialRunId: requestRunId,
        ...strategyTaskCreateIdentityFixture(profile.taskType),
        createdAt: 100,
      });
      prepareStrategyRequest(db, {
        taskExecutionId: taskId,
        preference: 'full_plan',
        directEdit: {
          editableBaselineExists: false,
          localAndUnambiguous: false,
          canonicalDeliverableStable: true,
          deliverableSetStable: true,
          dependenciesBounded: true,
        },
        intake: intakePassed,
        updatedAt: 110,
      });
    });

    afterEach(() => {
      closeDatabase();
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('preserves the profile, deliverables, mode and packages across one durable repair', () => {
      const plan = planContract(snapshot, profile, executionMode);
      const expectedHash = strategyPlanContractHash(plan);
      const repair = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: taskId,
        runId: requestRunId,
        protocol: protocol([
          block('open-design-plan-contract', plan, true),
          block('open-design-runtime-state', runtimeState('request', executionMode)),
        ].join('\n')),
        repairRun: {
          runId: repairRunId,
          sourceRunId: requestRunId,
          finalText: strategyTaskTurnText({
            taskExecutionId: taskId,
            inputStage: 'contract_repair',
            taskRunIndex: 1,
          }),
        },
        executionPreflight: executionPassed(profile),
        updatedAt: 120,
      });

      expect(repair).toMatchObject({
        action: 'contract_repair',
        task: {
          inputStage: 'contract_repair',
          outcome: 'running',
          executionMode,
          planContractRepairAttempts: 1,
          planContractHash: expectedHash,
          planContract: plan,
        },
      });

      closeDatabase();
      db = openDatabase(tempDir, { dataDir: tempDir });
      expect(getStrategyTaskExecution(db, taskId)).toMatchObject({
        inputStage: 'contract_repair',
        executionMode,
        planContractRepairAttempts: 1,
        planContractHash: expectedHash,
        planContract: plan,
      });

      const repaired = finalizeStrategyPlanningTurn(db, {
        taskExecutionId: taskId,
        runId: repairRunId,
        protocol: protocol([
          block('open-design-plan-contract', plan),
          block('open-design-runtime-state', runtimeState('contract_repair', executionMode)),
        ].join('\n')),
        toolUseCount: 0,
        executionPreflight: executionPassed(profile),
        updatedAt: 130,
      });

      expect(repaired).toMatchObject({
        action: 'plan_ready',
        task: {
          outcome: 'plan_ready',
          executionMode,
          planContractRepairAttempts: 1,
          planContractHash: expectedHash,
          planContract: plan,
        },
      });
      expect(repaired.task.planContract?.taskProfile.taskType).toBe(profile.taskType);
      expect(repaired.task.planContract?.taskProfile.canonicalDeliverable).toEqual(
        profile.canonical,
      );
      expect(repaired.task.planContract?.taskProfile.requiredDeliverables).toEqual(
        profile.required,
      );
      expect(repaired.task.planContract?.fullPlan.buildPackages).toEqual(
        plan.fullPlan.buildPackages,
      );
    });
  },
);
