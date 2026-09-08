import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  OD_NEXT_ADAPTIVE_PROMPT_RECIPE_ID,
  OD_NEXT_PROMPT_RECIPE_ID,
  parseOdNextPromptBundleV2,
  serializeOdNextPromptBundleV2,
  type StrategyPromptRecipe,
} from '@open-design/contracts';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../../../src/db.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import {
  beginAdaptiveStrategyClarification,
  finalizeAdaptiveStrategyTurn,
} from '../../../src/strategies/od-next/adaptive-execution.js';
import { OdNextMachineProtocolStream } from '../../../src/strategies/od-next/protocol.js';
import { createStrategyTaskExecution, getStrategyTaskExecution } from '../../../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture } from '../strategy-task-test-fixtures.js';

const QUESTION = '<question-form id="decision" title="Delivery decision">'
  + '{"questions":[{"id":"scope","type":"radio","label":"Scope",'
  + '"required":true,"options":[{"label":"Complete scope","value":"complete"}]}]}'
  + '</question-form>';
const artifactEvidence = {
  physicalStatus: 'succeeded' as const, deliverableValid: true, visibleConclusion: false,
};

function output(outcome: string, deliveryKind?: string, text = 'The requested work is complete.') {
  return text + '\n<open-design-runtime-state>\n' + JSON.stringify({
    schema: 'open-design.strategy-state/adaptive-v1', outcome,
    ...(deliveryKind ? { deliveryKind } : {}),
  }) + '\n</open-design-runtime-state>';
}

function parse(text: string) {
  const stream = new OdNextMachineProtocolStream({ executionPolicy: 'adaptive_v1' });
  stream.push(text);
  return stream.finish();
}

function createTask(db: Database.Database, recipe: StrategyPromptRecipe = OD_NEXT_ADAPTIVE_PROMPT_RECIPE_ID) {
  const assetDigests = [{ path: './SKILL.md', sha256: 'a'.repeat(64) }];
  const snapshot = createSnapshot(db, {
    projectId: 'project-1', conversationId: 'conversation-1', runId: null,
    pluginId: 'od-next-strategy', pluginVersion: '2.0.0', manifestSourceDigest: 'manifest-digest',
    strategy: {
      schema: 'open-design.applied-strategy/v2', id: 'od-next-strategy', version: '2.0.0',
      packageHash: strategyPackageHashFromDigests(assetDigests), assetDigests,
      selectedTaskProfile: {
        taskType: 'prototype', version: '2.0.0', path: './SKILL.md', sha256: 'a'.repeat(64),
      },
      taskProfileVersions: ['2.0.0'], promptRecipe: recipe,
    },
    taskKind: 'new-generation', inputs: {}, resolvedContext: { items: [] },
    capabilitiesGranted: ['prompt:inject'], capabilitiesRequired: ['prompt:inject'],
    assetsStaged: [], connectorsRequired: [], connectorsResolved: [], mcpServers: [],
  });
  const identity = strategyTaskCreateIdentityFixture();
  const bundle = parseOdNextPromptBundleV2(identity.promptBundleText);
  bundle.context.recipeIdentity.recipe = recipe;
  return createStrategyTaskExecution(db, {
    taskExecutionId: 'task-1', projectId: 'project-1', conversationId: 'conversation-1',
    snapshotId: snapshot.snapshotId, selectedAgentId: 'codex', initialRunId: 'request-1',
    ...identity, promptBundleText: serializeOdNextPromptBundleV2(bundle), createdAt: 100,
  });
}

describe('adaptive OD Next task finalization', () => {
  let tempDir: string;
  let db: Database.Database;
  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-next-adaptive-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    db.prepare('INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('project-1', 'Adaptive project', 1, 1);
    db.prepare('INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run('conversation-1', 'project-1', 'Adaptive conversation', 1, 1);
  });
  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('completes an artifact on the initial Run without a plan contract or production Run', () => {
    const task = createTask(db);
    const result = finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
      parsed: parse(output('completed', 'artifact')), completionEvidence: artifactEvidence,
    });
    expect(result.action).toBe('completed');
    expect(result.reasonCodes).toEqual([]);
    expect(result.task).toMatchObject({ inputStage: 'request', outcome: 'completed', latestRunId: 'request-1' });
    expect(result.task.runs).toHaveLength(1);
    expect(result.task.planContract).toBeUndefined();
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toEqual(result.task);
  });

  it.each(['answer', 'plan'])('requires a visible conclusion for a %s without an artifact', (deliveryKind) => {
    const task = createTask(db);
    const result = finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
      parsed: parse(output('completed', deliveryKind)),
      completionEvidence: { ...artifactEvidence, deliverableValid: false },
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toContain('od_next_adaptive_conclusion_missing');
  });

  it('accepts a visible plan-only conclusion without a generated artifact', () => {
    const task = createTask(db);
    const result = finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
      parsed: parse(output('completed', 'plan', 'First collect the requirements, then draft the layout.')),
      completionEvidence: { ...artifactEvidence, deliverableValid: false, visibleConclusion: true },
    });
    expect(result.action).toBe('completed');
    expect(result.task.runs).toHaveLength(1);
  });

  it('waits for a necessary decision even after producing a valid partial deliverable', () => {
    const task = createTask(db);
    const result = finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
      parsed: parse(output('clarification_required', undefined, QUESTION)),
      completionEvidence: { ...artifactEvidence, visibleConclusion: true },
    });
    expect(result.action).toBe('awaiting_clarification');
    expect(result.reasonCodes).toEqual([]);
    expect(result.task).toMatchObject({ outcome: 'clarification_required', terminalRunId: null });
    expect(result.task.runs).toHaveLength(1);
  });

  it.each([
    { text: '', physicalStatus: 'succeeded' as const, expected: 'od_next_protocol_runtime_state_missing' },
    { text: output('completed', 'artifact'), physicalStatus: 'succeeded' as const, expected: 'od_next_canonical_deliverable_invalid' },
    { text: output('completed', 'artifact'), physicalStatus: 'failed' as const, expected: 'od_next_physical_run_not_succeeded' },
  ])('does not infer completion from an exit or declaration alone: $expected', ({ text, physicalStatus, expected }) => {
    const task = createTask(db);
    const result = finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId, parsed: parse(text),
      completionEvidence: { physicalStatus, deliverableValid: false, visibleConclusion: false },
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toContain(expected);
    expect(result.task.runs).toHaveLength(1);
  });

  it('preserves repeated actionable questions and resumes only on the latest user answer', () => {
    let task = createTask(db);
    const originalBundle = task.promptBundle;
    for (let round = 1; round <= 2; round += 1) {
      // A valid form preserves a wait even when its redundant status is absent.
      const waiting = finalizeAdaptiveStrategyTurn(db, {
        taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
        parsed: parse(round === 1 ? QUESTION : output('clarification_required', undefined, QUESTION)),
        completionEvidence: { ...artifactEvidence, deliverableValid: false },
      });
      expect(waiting.action).toBe('awaiting_clarification');
      expect(waiting.reasonCodes).toEqual([]);
      expect(waiting.task.runs).toHaveLength(round);
      expect(() => beginAdaptiveStrategyClarification(db, {
        taskExecutionId: task.taskExecutionId, sourceRunId: 'stale-run',
        nextRunId: 'wrong-answer', answer: 'Complete scope',
      })).toThrow(/latest waiting/);
      task = beginAdaptiveStrategyClarification(db, {
        taskExecutionId: task.taskExecutionId, sourceRunId: task.latestRunId,
        nextRunId: `answer-${round}`, answer: `Keep the complete scope, decision ${round}.`,
      }).task;
      expect(task.clarificationCount).toBe(round);
      expect(task.runs.at(-1)?.finalText.text).toContain('# OD Next adaptive continuation');
      expect(task.runs.at(-1)?.finalText.text).toContain(`Keep the complete scope, decision ${round}.`);
    }
    const done = finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
      parsed: parse(output('completed', 'artifact')), completionEvidence: artifactEvidence,
    });
    expect(done.action).toBe('completed');
    expect(done.task.runs.map((run) => run.runId)).toEqual(['request-1', 'answer-1', 'answer-2']);
    expect(done.task.runs.map((run) => run.inputStage)).toEqual(['request', 'clarification', 'clarification']);
    expect(done.task.promptBundle).toEqual(originalBundle);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toEqual(done.task);
  });

  it('rejects legacy v2 output without opening a repair turn', () => {
    const task = createTask(db);
    const text = '<open-design-runtime-state>\n' + JSON.stringify({
      schema: 'open-design.strategy-state/v2', route: 'full_plan', inputStage: 'request',
      outcome: 'plan_ready', executionMode: 'simple', reasonCodes: [],
    }) + '\n</open-design-runtime-state>';
    const result = finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
      parsed: parse(text), completionEvidence: artifactEvidence,
    });
    expect(result.action).toBe('blocked');
    expect(result.reasonCodes).toContain('od_next_protocol_runtime_state_invalid_schema');
    expect(result.task.runs).toHaveLength(1);
  });

  it('refuses to finalize a frozen legacy task under adaptive semantics', () => {
    const task = createTask(db, OD_NEXT_PROMPT_RECIPE_ID);
    expect(() => finalizeAdaptiveStrategyTurn(db, {
      taskExecutionId: task.taskExecutionId, runId: task.latestRunId,
      parsed: parse(output('completed', 'artifact')), completionEvidence: artifactEvidence,
    })).toThrow(/frozen adaptive execution recipe/);
    expect(getStrategyTaskExecution(db, task.taskExecutionId)).toEqual(task);
  });
});
