import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import {
  OD_NEXT_DESIGN_NOTES_FILE,
  OD_NEXT_NO_DECLARATIONS_V2,
  deriveOdNextPromptBundleV2,
  parseOdNextPromptBundleV2,
  parseOdNextRequestTurnV1,
  renderChatTurnHostProtocolInstructions,
  serializeOdNextPromptBundleV2,
  type AppliedPluginSnapshot,
} from '@open-design/contracts';
import type Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { closeDatabase, openDatabase } from '../../../src/db.js';
import { createSnapshot } from '../../../src/plugins/snapshots.js';
import type { RunArtifactDiff } from '../../../src/run-artifact-fs.js';
import { createRunSideEffectLedger, foldEventIntoRunSideEffectLedger } from '../../../src/runtimes/run-lifecycle-analytics.js';
import {
  composeOdNextColdBuildRoundBundle,
  prepareAutomaticBuildRound,
  projectStrategyTask,
} from '../../../src/strategies/od-next/build-round.js';
import {
  decideStrategyRunSettlement,
  settleStrategyTask,
  type StrategyRunSettlementFacts,
} from '../../../src/strategies/od-next/coordinator.js';
import {
  strategyRunWriteEvidence,
  type StrategyRunWriteEvidence,
} from '../../../src/strategies/od-next/write-evidence.js';
import {
  createStrategyTaskExecution,
  getStrategyTaskExecution,
  getStrategyTaskExecutionByRunId,
} from '../../../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture } from '../strategy-task-test-fixtures.js';

const AGENT_ID = 'codex';

function evidence(overrides: Partial<StrategyRunWriteEvidence> = {}): StrategyRunWriteEvidence {
  return {
    deliverableWritten: false,
    noteOnly: false,
    unknown: false,
    filesWritten: 0,
    sources: ['filesystem'],
    ...overrides,
  };
}

function facts(overrides: Partial<StrategyRunSettlementFacts> = {}): StrategyRunSettlementFacts {
  return {
    visibleText: 'Here is the plan: three sections, warm palette.',
    declarations: { ...OD_NEXT_NO_DECLARATIONS_V2 },
    writeEvidence: evidence(),
    truncated: false,
    todoUnfinished: false,
    ...overrides,
  };
}

const FORM = '<question-form id="scope">{"questions":[{"id":"surface","label":"Surface?"}]}</question-form>';
const PLANNING = { autoRoundCount: 0, inputStage: 'request' as const };
const AFTER_BUILD = { autoRoundCount: 1, inputStage: 'production' as const };

function diff(overrides: Partial<RunArtifactDiff> = {}): RunArtifactDiff {
  return {
    created: 0, modified: 0, touched: 0, designSystemCreated: false, previewModuleCount: 0,
    touchedPaths: [], contentCreated: 0, contentModified: 0, contentTouched: 0, contentTouchedPaths: [],
    renderDependencyTouched: 0, renderDependencyTouchedPaths: [], supportingMediaTouched: 0, filesWritten: 0,
    ...overrides,
  };
}

function ledgerWith(paths: string[]) {
  const ledger = createRunSideEffectLedger();
  for (const [index, filePath] of paths.entries()) {
    foldEventIntoRunSideEffectLedger(ledger, { event: 'agent', data: { type: 'tool_use', id: `tool-${index}`, name: 'Write', input: { file_path: filePath } } });
    foldEventIntoRunSideEffectLedger(ledger, { event: 'agent', data: { type: 'tool_result', toolUseId: `tool-${index}`, content: 'ok' } });
  }
  return ledger;
}

describe('write evidence from the two host sources', () => {
  it('treats any non-Markdown write from either source as a deliverable', () => {
    expect(strategyRunWriteEvidence({ artifactOutcome: { diff: diff({ touchedPaths: ['/p/index.html'], filesWritten: 1 }) } }, { projectKind: 'prototype' }))
      .toMatchObject({ deliverableWritten: true, noteOnly: false, unknown: false, filesWritten: 1, sources: ['filesystem'] });
    expect(strategyRunWriteEvidence({ artifactOutcome: { diff: diff({ renderDependencyTouchedPaths: ['/p/theme.css'], filesWritten: 1 }) } }, { projectKind: 'prototype' }))
      .toMatchObject({ deliverableWritten: true });
    expect(strategyRunWriteEvidence({ sideEffectLedger: ledgerWith(['/p/data.json']) }, { projectKind: 'prototype' }))
      .toMatchObject({ deliverableWritten: true, filesWritten: 1, sources: ['tool_stream'] });
  });

  it('counts Markdown notes and unnamed other-type writes as notes, and nothing as text-only', () => {
    expect(strategyRunWriteEvidence({ sideEffectLedger: ledgerWith([`/p/${OD_NEXT_DESIGN_NOTES_FILE}`, '/p/brand-spec.md']) }, { projectKind: 'prototype' }))
      .toMatchObject({ deliverableWritten: false, noteOnly: true, unknown: false, filesWritten: 2 });
    // The diff only counts files outside its tracked extensions; without a
    // ledger they are taken for notes.
    expect(strategyRunWriteEvidence({ artifactOutcome: { diff: diff({ filesWritten: 1 }) } }, { projectKind: 'prototype' }))
      .toMatchObject({ deliverableWritten: false, noteOnly: true, unknown: false });
    expect(strategyRunWriteEvidence({ artifactOutcome: { diff: diff() }, sideEffectLedger: createRunSideEffectLedger() }, { projectKind: 'prototype' }))
      .toEqual({ deliverableWritten: false, noteOnly: false, unknown: false, filesWritten: 0, sources: ['filesystem'] });
  });

  it('marks the round unknown only when neither source could see anything', () => {
    expect(strategyRunWriteEvidence({}, { projectKind: 'prototype' }))
      .toEqual({ deliverableWritten: false, noteOnly: false, unknown: true, filesWritten: 0, sources: [] });
    expect(strategyRunWriteEvidence({ artifactOutcome: { diff: diff({ filesWrittenUnknown: true }) } }, { projectKind: 'prototype' }))
      .toMatchObject({ unknown: true });
    const toolsSeen = createRunSideEffectLedger();
    foldEventIntoRunSideEffectLedger(toolsSeen, { event: 'agent', data: { type: 'tool_use', id: 't', name: 'Read', input: { file_path: '/p/x' } } });
    expect(strategyRunWriteEvidence({ artifactOutcome: { diff: diff({ filesWrittenUnknown: true }) }, sideEffectLedger: toolsSeen }, { projectKind: 'prototype' }))
      .toMatchObject({ unknown: false, noteOnly: false, sources: ['tool_stream', 'filesystem'] });
  });

  it('counts DESIGN.md as a deliverable only on a brand project', () => {
    const brand = { artifactOutcome: { diff: diff({ designSystemCreated: true, filesWritten: 1 }) } };
    expect(strategyRunWriteEvidence(brand, { projectKind: 'brand' })).toMatchObject({ deliverableWritten: true });
    expect(strategyRunWriteEvidence(brand, { projectKind: 'prototype' })).toMatchObject({ deliverableWritten: false, noteOnly: true });
    expect(strategyRunWriteEvidence({ sideEffectLedger: ledgerWith(['/p/DESIGN.md']) }, { projectKind: 'brand' })).toMatchObject({ deliverableWritten: true });
    expect(strategyRunWriteEvidence({ sideEffectLedger: ledgerWith(['/p/DESIGN.md']) }, { projectKind: 'prototype' })).toMatchObject({ deliverableWritten: false, noteOnly: true });
  });

  it('subtracts files the user saved by hand while the round ran', () => {
    const run = {
      artifactOutcome: { diff: diff({ touchedPaths: ['/p/index.html'], filesWritten: 1 }) },
      sideEffectLedger: ledgerWith(['/p/index.html']),
      userWrittenPaths: new Set(['index.html']),
    };
    expect(strategyRunWriteEvidence(run, { projectKind: 'prototype' })).toMatchObject({ deliverableWritten: false, filesWritten: 1 });
    expect(strategyRunWriteEvidence({ ...run, userWrittenPaths: new Set(['other.html']) }, { projectKind: 'prototype' })).toMatchObject({ deliverableWritten: true });
  });
});

describe('planning round settlement decision', () => {
  it('waits for the user when the reply rendered a question form, whatever else happened', () => {
    expect(decideStrategyRunSettlement(PLANNING, facts({ visibleText: `Two questions first.\n${FORM}`, writeEvidence: evidence({ deliverableWritten: true }) })))
      .toEqual({ action: 'settle', reason: 'question', deliverableWritten: false });
    // A quoted tag is not a form.
    expect(decideStrategyRunSettlement(PLANNING, facts({ visibleText: 'I could emit `<question-form>` but will not.' })))
      .toEqual({ action: 'build', reason: 'text_only' });
  });

  it('is done when a deliverable was written, even with todo items open or a no-write declaration', () => {
    expect(decideStrategyRunSettlement(PLANNING, facts({ writeEvidence: evidence({ deliverableWritten: true }), todoUnfinished: true })))
      .toEqual({ action: 'settle', reason: 'deliverable_changed', deliverableWritten: true });
    expect(decideStrategyRunSettlement(PLANNING, facts({ writeEvidence: evidence({ deliverableWritten: true }), declarations: { nonDesignRequest: false, noFileWrites: true } })))
      .toEqual({ action: 'settle', reason: 'deliverable_changed', deliverableWritten: true });
  });

  it('settles on the two declarations when nothing was delivered', () => {
    expect(decideStrategyRunSettlement(PLANNING, facts({ declarations: { nonDesignRequest: true, noFileWrites: true } })))
      .toEqual({ action: 'settle', reason: 'non_design', deliverableWritten: false });
    expect(decideStrategyRunSettlement(PLANNING, facts({ declarations: { nonDesignRequest: false, noFileWrites: true }, writeEvidence: evidence({ noteOnly: true, filesWritten: 1 }) })))
      .toEqual({ action: 'settle', reason: 'no_file_writes', deliverableWritten: false });
    // The non-design declaration alone is enough; the no-write one is not
    // required alongside it, and it outranks an unfinished todo list.
    expect(decideStrategyRunSettlement(PLANNING, facts({ declarations: { nonDesignRequest: true, noFileWrites: false }, todoUnfinished: true })))
      .toEqual({ action: 'settle', reason: 'non_design', deliverableWritten: false });
  });

  it('lets a question outrank the non-design declaration, and records the declaration even in the build round', () => {
    expect(decideStrategyRunSettlement(PLANNING, facts({ visibleText: `Which one?\n${FORM}`, declarations: { nonDesignRequest: true, noFileWrites: true } })))
      .toEqual({ action: 'settle', reason: 'question', deliverableWritten: false });
    expect(decideStrategyRunSettlement(AFTER_BUILD, facts({ declarations: { nonDesignRequest: true, noFileWrites: false } })))
      .toEqual({ action: 'settle', reason: 'non_design', deliverableWritten: false });
  });

  it('starts one build round otherwise and names why the planning round did not deliver', () => {
    expect(decideStrategyRunSettlement(PLANNING, facts({ writeEvidence: evidence({ noteOnly: true, filesWritten: 1 }) }))).toEqual({ action: 'build', reason: 'note_only' });
    expect(decideStrategyRunSettlement(PLANNING, facts())).toEqual({ action: 'build', reason: 'text_only' });
    expect(decideStrategyRunSettlement(PLANNING, facts({ todoUnfinished: true }))).toEqual({ action: 'build', reason: 'todo_unfinished' });
    expect(decideStrategyRunSettlement(PLANNING, facts({ truncated: true, todoUnfinished: true }))).toEqual({ action: 'build', reason: 'truncated' });
    expect(decideStrategyRunSettlement(PLANNING, facts({ writeEvidence: evidence({ unknown: true, sources: [] }) }))).toEqual({ action: 'build', reason: 'write_evidence_unknown' });
  });

  it('never starts a second automatic round', () => {
    expect(decideStrategyRunSettlement(AFTER_BUILD, facts({ todoUnfinished: true })))
      .toEqual({ action: 'settle', reason: 'todo_unfinished', deliverableWritten: false });
    expect(decideStrategyRunSettlement({ autoRoundCount: 1, inputStage: 'request' }, facts()))
      .toEqual({ action: 'settle', reason: 'text_only', deliverableWritten: false });
    expect(decideStrategyRunSettlement(AFTER_BUILD, facts({ writeEvidence: evidence({ deliverableWritten: true }) })))
      .toEqual({ action: 'settle', reason: 'deliverable_changed', deliverableWritten: true });
  });
});

describe('settling and building against the durable store', () => {
  let tempDir: string;
  let db: Database.Database;
  let snapshot: AppliedPluginSnapshot;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-strategy-settlement-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    db.prepare(`INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`).run('project-1', 'Project 1', 1, 1);
    db.prepare(`INSERT INTO conversations (id, project_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`).run('conversation-1', 'project-1', 'Conversation 1', 1, 1);
    const assetDigests = [
      { path: './SKILL.md', sha256: 'a'.repeat(64) },
      { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
    ];
    snapshot = createSnapshot(db, {
      projectId: 'project-1', conversationId: 'conversation-1', runId: null,
      pluginId: 'od-next-strategy', pluginVersion: '2.0.0', manifestSourceDigest: 'manifest-digest',
      strategy: {
        schema: 'open-design.applied-strategy/v2', id: 'od-next-strategy', version: '2.0.0',
        packageHash: strategyPackageHashFromDigests(assetDigests), assetDigests,
        selectedTaskProfile: { taskType: 'prototype', version: '2.0.0', path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
        taskProfileVersions: ['2.0.0'], promptRecipe: 'od-next-plan-build-v2',
      },
      taskKind: 'new-generation', inputs: {}, resolvedContext: { items: [] },
      capabilitiesGranted: ['prompt:inject'], capabilitiesRequired: ['prompt:inject'], assetsStaged: [],
      connectorsRequired: [], connectorsResolved: [], mcpServers: [],
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function createTask(runId = 'run-request', taskExecutionId = 'task-1') {
    return createStrategyTaskExecution(db, {
      taskExecutionId, projectId: 'project-1', conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: runId,
      ...strategyTaskCreateIdentityFixture(), createdAt: 100,
    });
  }

  function fakeService() {
    const prepared: Array<{ id: string; doneKey?: unknown }> = [];
    let sequence = 0;
    return {
      prepared,
      service: {
        prepare(input: { meta: { doneKey?: unknown }; beforeClaimCommit?: (run: { id: string }) => void }) {
          sequence += 1;
          const run = { id: `run-build-${sequence}`, doneKey: input.meta.doneKey };
          prepared.push(run);
          input.beforeClaimCommit?.(run);
          return { kind: 'ready' as const, run, creationKind: 'created' as const, resumed: false };
        },
        start(run: { id: string }) { return run; },
      },
    };
  }

  it('settles the latest running Run only, and projects the reason and the delivered fact', () => {
    const task = createTask();
    expect(() => settleStrategyTask(db, { taskExecutionId: task.taskExecutionId, runId: 'other-run', reason: 'text_only', deliverableWritten: false }))
      .toThrow(/latest physical Run/);
    const settled = settleStrategyTask(db, { taskExecutionId: task.taskExecutionId, runId: 'run-request', reason: 'question', deliverableWritten: false, updatedAt: 200 });
    expect(projectStrategyTask(settled, 'run-request')).toEqual({
      taskExecutionId: 'task-1',
      strategy: { id: 'od-next-strategy', version: '2.0.0', packageHash: snapshot.strategy!.packageHash, snapshotId: snapshot.snapshotId },
      inputStage: 'request', outcome: 'completed', route: 'full_plan', executionMode: 'simple',
      activeRunId: 'run-request', runMappings: [{ runId: 'run-request', taskRunIndex: 0 }],
      terminal: true, deliverableWritten: false, settlementReason: 'question', autoRoundCount: 0,
    });
    expect(() => settleStrategyTask(db, { taskExecutionId: task.taskExecutionId, runId: 'run-request', reason: 'text_only', deliverableWritten: false }))
      .toThrow(/running/);
  });

  it('claims the build round as a request turn when the session continues', () => {
    const task = createTask();
    const { service, prepared } = fakeService();
    const claimed = prepareAutomaticBuildRound({
      db, service: service as never, task, reason: 'note_only', resume: true,
      planningRoundVisibleText: 'The plan.', locale: 'zh-CN',
      createMeta: (instruction) => ({ message: instruction, currentPrompt: instruction }),
    });
    expect(claimed.transport).toBe('resume');
    expect(claimed.task).toMatchObject({ inputStage: 'production', outcome: 'running', autoRoundCount: 1, latestRunId: prepared[0]!.id });
    const mapping = claimed.task.runs[1]!;
    expect(mapping.finalText.kind).toBe('turn');
    const turn = parseOdNextRequestTurnV1(mapping.finalText.text);
    expect(turn).toMatchObject({ taskExecutionId: 'task-1', stage: 'production', taskRunIndex: 1 });
    expect(turn.payload).toContain('# OD Next build round');
    expect(turn.payload).not.toContain('This round runs in a new session');
    expect(turn.payload).toContain(`<od-done key="${String(prepared[0]!.doneKey)}"/>`);
    expect(turn.payload).toContain('the OpenDesign UI locale for this run is `zh-CN`');
    expect(projectStrategyTask(claimed.task, 'run-request')).toMatchObject({ nextRunId: prepared[0]!.id, terminal: false, autoRoundCount: 1 });
    expect(() => prepareAutomaticBuildRound({
      db, service: service as never, task: getStrategyTaskExecutionByRunId(db, prepared[0]!.id)!, reason: 'text_only', resume: true,
      planningRoundVisibleText: 'again', createMeta: (instruction) => ({ message: instruction }),
    })).toThrow(/at most one automatic build round/);
  });

  it('claims a cold-started build round as a Bundle carrying the conversation so far', () => {
    const frozenText = serializeOdNextPromptBundleV2({
      ...parseOdNextPromptBundleV2(strategyTaskCreateIdentityFixture().promptBundleText),
      taskMetadata: { taskType: 'prototype', taskConfiguration: 'Frozen test task configuration.', titleDirective: 'Emit a title.' },
      context: {
        ...parseOdNextPromptBundleV2(strategyTaskCreateIdentityFixture().promptBundleText).context,
        priorTranscript: '## user\nearlier request\n\n## assistant\nearlier answer',
        formOverride: 'The <user_first_prompt> contains submitted answers.',
        clientSystemPrompt: [
          renderChatTurnHostProtocolInstructions('0123456789abcdef', 'od_next_request', 'zh-CN').text,
          'Custom instructions: keep it terse.',
        ].join('\n\n---\n\n'),
      },
      userFirstPrompt: 'Build me a landing page.',
    });
    const task = createStrategyTaskExecution(db, {
      taskExecutionId: 'task-cold', projectId: 'project-1', conversationId: 'conversation-1',
      snapshotId: snapshot.snapshotId, selectedAgentId: AGENT_ID, initialRunId: 'run-cold-request',
      ...strategyTaskCreateIdentityFixture(), promptBundleText: frozenText, createdAt: 100,
    });
    const { service, prepared } = fakeService();
    const claimed = prepareAutomaticBuildRound({
      db, service: service as never, task, reason: 'note_only', resume: false,
      planningRoundVisibleText: 'Plan: hero, features, footer. Notes saved to design-notes.md.',
      createMeta: (instruction) => ({ message: instruction, currentPrompt: instruction }),
    });
    expect(claimed.transport).toBe('cold_start');
    const mapping = claimed.task.runs[1]!;
    expect(mapping.finalText.kind).toBe('bundle');
    const bundle = parseOdNextPromptBundleV2(mapping.finalText.text);
    const frozen = parseOdNextPromptBundleV2(frozenText);
    // Cache-stable head and task metadata untouched; one-shot request slots gone.
    expect(bundle.coreSystemPrompt).toEqual(frozen.coreSystemPrompt);
    expect(bundle.sessionSkills).toEqual(frozen.sessionSkills);
    expect(bundle.activeStages).toEqual(frozen.activeStages);
    expect(bundle.taskMetadata).toEqual({ taskType: 'prototype', taskConfiguration: 'Frozen test task configuration.' });
    expect(bundle.context.formOverride).toBeUndefined();
    expect(bundle.context.recipeIdentity).toEqual(frozen.context.recipeIdentity);
    // The transcript is the frozen one plus the two turns the daemon saw.
    expect(bundle.context.priorTranscript).toBe([
      '## user\nearlier request',
      '## assistant\nearlier answer',
      '## user\nBuild me a landing page.',
      '## assistant\nPlan: hero, features, footer. Notes saved to design-notes.md.',
    ].join('\n\n'));
    // The request-stage host protocols are dropped; the client's own text stays.
    expect(bundle.context.clientSystemPrompt).toBe('Custom instructions: keep it terse.');
    // The build instruction is the user turn and carries the new key and the cold-start pointer.
    expect(bundle.userFirstPrompt).toContain('# OD Next build round');
    expect(bundle.userFirstPrompt).toContain('This round runs in a new session');
    expect(bundle.userFirstPrompt).toContain(`\`${OD_NEXT_DESIGN_NOTES_FILE}\` at the project root`);
    expect(bundle.userFirstPrompt).toContain(`<od-done key="${String(prepared[0]!.doneKey)}"/>`);
    expect(bundle.userFirstPrompt).not.toContain('0123456789abcdef');
    expect(getStrategyTaskExecution(db, 'task-cold')?.promptBundle.text).toBe(frozenText);
  });

  it('keeps a client system prompt without the host protocol prefix as it was', () => {
    const base = parseOdNextPromptBundleV2(strategyTaskCreateIdentityFixture().promptBundleText);
    const frozenText = serializeOdNextPromptBundleV2({ ...base, context: { ...base.context, clientSystemPrompt: 'Only the client text.' } });
    const cold = parseOdNextPromptBundleV2(composeOdNextColdBuildRoundBundle({
      frozenBundleText: frozenText, userFirstPrompt: base.userFirstPrompt, planningRoundVisibleText: 'plan',
      agentId: AGENT_ID, hostProtocolKey: 'fedcba9876543210', clientSystemPrompt: 'Only the client text.',
    }));
    expect(cold.context.clientSystemPrompt).toBe('Only the client text.');
    expect(cold.context.priorTranscript).toBe('## user\n冻结的用户请求。\n\n## assistant\nplan');
    expect(deriveOdNextPromptBundleV2(frozenText, {})).toBe(frozenText);
  });

  it('refuses a cold start for a task frozen on the first Bundle version', () => {
    const task = createTask('run-v1', 'task-v1');
    db.prepare(`UPDATE strategy_task_executions SET prompt_bundle_schema = 'open-design.od-next-prompt-bundle/v1' WHERE task_execution_id = ?`).run('task-v1');
    const stale = { ...getStrategyTaskExecution(db, 'task-1') ?? task, taskExecutionId: 'task-v1', promptBundle: { ...task.promptBundle, schema: 'open-design.od-next-prompt-bundle/v1' as const } };
    const { service } = fakeService();
    expect(() => prepareAutomaticBuildRound({
      db, service: service as never, task: stale as never, reason: 'note_only', resume: false,
      planningRoundVisibleText: 'plan', createMeta: (instruction) => ({ message: instruction }),
    })).toThrow(/current Prompt Bundle version/);
  });
});
