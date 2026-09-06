import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AppliedStrategyBindingV2Schema, type OpenDesignPlanContractV2 } from '@open-design/contracts';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';

import { closeDatabase, openDatabase } from '../../../src/db.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import { applySkillDiscoveryLoad, ensureSkillDiscoveryForRun, resolveSkillDiscovery } from '../../../src/skill-discovery/state.js';
import { createStrategyTaskExecution, getStrategyTaskExecution } from '../../../src/strategies/task-store.js';
import { finalizeStrategyPlanningTurn, prepareStrategyIntake } from '../../../src/strategies/od-next/coordinator.js';
import { beginAutomaticSimpleProduction, projectStrategyTask } from '../../../src/strategies/od-next/automatic-simple-production.js';
import { OdNextMachineProtocolStream } from '../../../src/strategies/od-next/protocol.js';
import { validateOdNextDirectEditDecision, validateOdNextSkillDecision } from '../../../src/strategies/od-next/skill-decision.js';
import { strategyTaskCreateIdentityFixture, strategyTaskTurnText } from '../strategy-task-test-fixtures.js';

const revision = `sha256:${'a'.repeat(64)}`;
const types = ['prototype', 'ppt', 'marketing', 'hyperframes'] as const;
const profiles = types.map((taskType) => ({ taskType, version: '2.0.0',
  path: `./assets/task-profiles/${taskType}.md`, sha256: 'b'.repeat(64) }));
const assets = profiles.map(({ path: assetPath, sha256 }) => ({ path: assetPath, sha256 }))
  .sort((a, b) => a.path.localeCompare(b.path));
const binding = AppliedStrategyBindingV2Schema.parse({
  schema: 'open-design.applied-strategy/v2', id: 'od-next-strategy', version: '2.0.0',
  packageHash: strategyPackageHashFromDigests(assets), assetDigests: assets,
  selectionMode: 'agent-discovery', selectedTaskProfile: null,
  availableTaskProfiles: profiles, genericProfileVersion: '2.0.0',
  discoveryCatalogRevision: revision, taskProfileVersions: ['2.0.0'],
  promptRecipe: 'od-next-plan-build-v2',
});
const execution = { productionRoutes: [{ id: 'file', available: true }], dependencies: [],
  inputs: [{ id: 'request', available: true }], renderers: [], exporters: [], templates: [],
  outputKinds: [{ id: 'document', supported: true }] };

describe('V2 Agent-owned Skill decision', () => {
  let db: Database.Database;
  let root: string;
  let snapshotId: string;
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-discovery-v2-'));
    db = openDatabase(root, { dataDir: root });
    db.prepare('INSERT INTO projects (id,name,created_at,updated_at) VALUES (?,?,?,?)')
      .run('project', 'Project', 1, 1);
    db.prepare('INSERT INTO conversations (id,project_id,title,created_at,updated_at) VALUES (?,?,?,?,?)')
      .run('conversation', 'project', 'Conversation', 1, 1);
    snapshotId = createSnapshot(db, { projectId: 'project', conversationId: 'conversation', runId: null,
      pluginId: 'od-next-strategy', pluginVersion: '2.0.0', manifestSourceDigest: 'fixture',
      strategy: binding, taskKind: 'new-generation', inputs: {}, resolvedContext: { items: [] },
      capabilitiesGranted: [], capabilitiesRequired: [], assetsStaged: [], connectorsRequired: [],
      connectorsResolved: [], mcpServers: [] }).snapshotId;
    createStrategyTaskExecution(db, { taskExecutionId: 'task', projectId: 'project',
      conversationId: 'conversation', snapshotId, selectedAgentId: 'codex', initialRunId: 'request',
      ...strategyTaskCreateIdentityFixture() });
    prepareStrategyIntake(db, { taskExecutionId: 'task', intake: {
      inputRefs: [{ id: 'request', accessible: true }], selectedAgentAvailable: true,
      nativeContinuation: 'verified', taskProfileAvailable: true, dependencies: [],
    } });
    ensureSkillDiscoveryForRun(db, { projectId: 'project', conversationId: 'conversation',
      runId: 'request', catalogRevision: revision });
  });
  afterEach(() => { closeDatabase(); fs.rmSync(root, { recursive: true, force: true }); });

  function resolveNone() {
    resolveSkillDiscovery(db, { conversationId: 'conversation', runId: 'request',
      resolution: 'none', reasonDigest: revision });
  }
  function plan(): OpenDesignPlanContractV2 {
    return { schema: 'open-design.plan-contract/v2', strategy: {
      id: 'od-next-strategy', version: binding.version, packageHash: binding.packageHash, snapshotId },
    taskProfile: { schemaVersion: '2', taskType: 'generic', taskProfileVersion: '2.0.0',
      goal: 'Write a document', contextAndAudience: 'User', inputsAndReferences: ['request'], constraints: [],
      canonicalDeliverable: { id: 'document', kind: 'document', format: 'markdown' },
      requiredDeliverables: [{ id: 'document', kind: 'document' }],
      designSpec: { source: 'resolved-baseline', version: '1', decisions: {} },
      buildRequirements: [], assumptions: [], risks: [], taskSpecific: {} },
    fullPlan: { executionMode: 'simple', steps: [{ id: 'write', objective: 'Write', outputs: ['document'] }],
      readinessArtifacts: [], buildPackages: [] },
    runManifest: { selectedAgentId: 'codex', capabilitySnapshotHash: 'c'.repeat(64), inputRefs: ['request'],
      productionRoutes: ['file'], preflight: { intake: 'passed', execution: 'passed' } },
    decisionSummary: { goal: 'Write', deliverables: ['document'], keyConstraints: [], assumptions: [], risks: [], openDecisions: [] },
    skillDecision: { catalogRevision: revision, primarySkillId: null, auxiliarySkillIds: [], skills: [] } };
  }
  function finish(outcome: 'answered' | 'plan_ready' | 'completed', contract?: OpenDesignPlanContractV2,
    runId = 'request', visible = '这是给用户的直接答复。', route = 'full_plan') {
    const stream = new OdNextMachineProtocolStream();
    stream.push(`${visible}\n${contract ? `<open-design-plan-contract>\n${JSON.stringify(contract)}\n</open-design-plan-contract>\n` : ''}
<open-design-runtime-state>\n${JSON.stringify({ schema: 'open-design.strategy-state/v2', route,
      inputStage: runId === 'request' ? 'request' : 'production', outcome,
      executionMode: outcome === 'answered' ? null : 'simple', reasonCodes: [] })}\n</open-design-runtime-state>\n`);
    return finalizeStrategyPlanningTurn(db, { taskExecutionId: 'task', runId, protocol: stream,
      executionPreflight: execution, completionEvidence: { physicalStatus: 'succeeded', deliverableValid: outcome === 'completed' } });
  }

  it('accepts an explicit visible answer with none, no Plan, and no canonical artifact', () => {
    resolveNone();
    const result = finish('answered');
    expect(result.action).toBe('answered');
    expect(projectStrategyTask(result.task)).toMatchObject({ terminal: true, outcome: 'answered' });
    expect(projectStrategyTask(result.task).nextRunId).toBeUndefined();
    expect(getStrategyTaskExecution(db, 'task')?.outcome).toBe('answered');
  });
  it('does not turn a plain process success or empty answer into completion', () => {
    resolveNone();
    expect(finish('answered', undefined, 'request', '').action).toBe('blocked');
  });
  it('rejects an answer while the Agent has not resolved primary selection', () => {
    expect(finish('answered').reasonCodes).toContain('od_next_answered_decision_invalid');
  });
  it('keeps an immutable generic Plan while production reads a newly relevant auxiliary', () => {
    resolveNone();
    const ready = finish('plan_ready', plan());
    expect(ready.action).toBe('plan_ready');
    const production = beginAutomaticSimpleProduction(db, { task: ready.task, sourceRunId: 'request', nextRunId: 'production',
      finalText: strategyTaskTurnText({ taskExecutionId: 'task', inputStage: 'production', taskRunIndex: 1 }) });
    ensureSkillDiscoveryForRun(db, { projectId: 'project', conversationId: 'conversation', runId: 'production', catalogRevision: revision });
    applySkillDiscoveryLoad(db, { conversationId: 'conversation', runId: 'production', conflictsWith: [],
      loaded: { id: 'document-guide', kind: 'functional', role: 'auxiliary', version: '1.0.0',
        candidateDigest: revision, contentDigest: revision, catalogRevision: revision, purposeDigest: revision } });
    expect(production.snapshotId).toBe(snapshotId);
    expect(production.planContract?.skillDecision?.auxiliarySkillIds).toEqual([]);
    expect(finish('completed', undefined, 'production').action).toBe('completed');
  });
  it('rejects missing Plan decision rather than silently adopting generic', () => {
    resolveNone();
    const contract = plan(); delete contract.skillDecision;
    expect(finish('plan_ready', contract).reasonCodes).toContain('od_next_skill_decision_missing');
  });
  it('requires a committed same-task primary body and exact selected version', () => {
    applySkillDiscoveryLoad(db, { conversationId: 'conversation', runId: 'request', conflictsWith: [],
      loaded: { id: 'prototype', kind: 'task-profile', role: 'primary', version: '2.0.0',
        candidateDigest: revision, contentDigest: `sha256:${'b'.repeat(64)}`, catalogRevision: revision, purposeDigest: revision } });
    const contract = plan();
    contract.taskProfile.taskType = 'prototype';
    contract.skillDecision = { catalogRevision: revision, primarySkillId: 'prototype', auxiliarySkillIds: [],
      skills: [{ id: 'prototype', role: 'primary', candidateDigest: revision, contentDigest: `sha256:${'b'.repeat(64)}` }] };
    expect(finish('plan_ready', contract).action).toBe('plan_ready');
  });
  it('rejects a fabricated read receipt even when the catalog and ID look valid', () => {
    resolveNone();
    const contract = plan();
    contract.skillDecision!.auxiliarySkillIds = ['template'];
    contract.skillDecision!.skills = [{ id: 'template', role: 'auxiliary', candidateDigest: revision, contentDigest: revision }];
    expect(finish('plan_ready', contract).reasonCodes).toContain('od_next_skill_decision_receipt_mismatch');
  });
  it('does not let direct-edit completion bypass the committed primary decision', () => {
    resolveNone();
    expect(finish('completed', undefined, 'request', 'Edited.', 'direct_edit').reasonCodes)
      .toContain('od_next_direct_edit_decision_invalid');
  });
  it('validates an explicit typed constraint with Discovery on for Plan and Direct Edit', () => {
    const rawTyped: Record<string, unknown> = { ...binding, selectedTaskProfile: profiles[0] };
    delete rawTyped.selectionMode; delete rawTyped.availableTaskProfiles; delete rawTyped.genericProfileVersion;
    const typed = AppliedStrategyBindingV2Schema.parse(rawTyped);
    applySkillDiscoveryLoad(db, { conversationId: 'conversation', runId: 'request', conflictsWith: [],
      loaded: { id: 'ppt', kind: 'task-profile', role: 'primary', version: '2.0.0',
        candidateDigest: revision, contentDigest: `sha256:${'b'.repeat(64)}`, catalogRevision: revision, purposeDigest: revision } });
    const contract = plan();
    contract.taskProfile.taskType = 'ppt';
    contract.skillDecision = { catalogRevision: revision, primarySkillId: 'ppt', auxiliarySkillIds: [],
      skills: [{ id: 'ppt', role: 'primary', candidateDigest: revision, contentDigest: `sha256:${'b'.repeat(64)}` }] };
    const task = getStrategyTaskExecution(db, 'task')!;
    expect(validateOdNextSkillDecision(db, task, typed, contract)).toContain('od_next_plan_task_profile_mismatch');
    expect(validateOdNextDirectEditDecision(db, task, typed)).toContain('od_next_plan_task_profile_mismatch');
    expect(validateOdNextDirectEditDecision(db, task, binding)).toEqual([]);
  });
});
