import { once } from 'node:events';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import type { AppliedPluginSnapshot, ChatMessage, OpenDesignPlanContractV2 } from '@open-design/contracts';
import { strategyPackageHashFromDigests } from '@open-design/plugin-runtime';
import express, { type Response } from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  getConversation,
  getMessage,
  getProject,
  insertConversation,
  insertProject,
  listConversations,
  listMessages,
  openDatabase,
  updateConversation,
  updateProject,
  upsertMessage,
} from '../../src/db.js';
import { createSnapshot } from '../../src/plugins/snapshots.js';
import {
  registerProjectConversationRoutes,
  type RegisterProjectConversationRoutesDeps,
} from '../../src/routes/project/conversations.js';
import {
  cancelStrategyTaskExecution,
  compareAndTransitionStrategyTaskExecution,
  createStrategyTaskExecution,
  getStrategyTaskExecution,
} from '../../src/strategies/task-store.js';
import { strategyTaskCreateIdentityFixture, strategyTaskTurnText } from '../strategies/strategy-task-test-fixtures.js';

const PROJECT_ID = 'history-project';
const CONVERSATION_ID = 'history-conversation';
const RUN_ID = 'history-run';
const MESSAGE_ID = 'history-assistant';
const TASK_ID = 'history-task';
const REPLY = 'Controlled reply without a completed deliverable.';
const REASON = 'od_next_protocol_runtime_state_missing';

type Db = ReturnType<typeof openDatabase>;
type Outcome = 'blocked' | 'completed' | 'canceled' | 'running';

// The real task writer owns these fields; the fixture never injects proposed
// response fields or edits SQLite schema to make the read-side assertion pass.
function seedTaskAndMessage(
  db: Db,
  outcome: Outcome,
  ids = { taskId: TASK_ID, runId: RUN_ID, messageId: MESSAGE_ID },
  scope = { projectId: PROJECT_ID, conversationId: CONVERSATION_ID, visibleText: REPLY },
) {
  const assetDigests = [
    { path: './SKILL.md', sha256: 'a'.repeat(64) },
    { path: './assets/task-profiles/prototype.md', sha256: 'b'.repeat(64) },
  ];
  const snapshot = createSnapshot(db, {
    projectId: scope.projectId,
    conversationId: scope.conversationId,
    runId: null,
    pluginId: 'od-next-strategy',
    pluginVersion: '2.0.0',
    manifestSourceDigest: 'history-fixture-manifest',
    strategy: {
      schema: 'open-design.applied-strategy/v2',
      id: 'od-next-strategy',
      version: '2.0.0',
      packageHash: strategyPackageHashFromDigests(assetDigests),
      assetDigests,
      selectedTaskProfile: {
        taskType: 'prototype',
        version: '2.0.0',
        path: './assets/task-profiles/prototype.md',
        sha256: 'b'.repeat(64),
      },
      taskProfileVersions: ['2.0.0'],
      promptRecipe: 'od-next-plan-build-v2',
    },
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
  const task = createStrategyTaskExecution(db, {
    taskExecutionId: ids.taskId,
    projectId: scope.projectId,
    conversationId: scope.conversationId,
    snapshotId: snapshot.snapshotId,
    selectedAgentId: 'codex',
    initialRunId: ids.runId,
    ...strategyTaskCreateIdentityFixture(),
    createdAt: 100,
  });
  if (outcome === 'canceled') {
    cancelStrategyTaskExecution(db, {
      taskExecutionId: ids.taskId,
      expectedRevision: task.revision,
      updatedAt: 200,
    });
  } else if (outcome !== 'running') {
    compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: ids.taskId,
      expectedRevision: task.revision,
      to: {
        route: outcome === 'blocked' ? 'full_plan' : 'direct_edit',
        inputStage: 'request',
        executionMode: outcome === 'blocked' ? null : 'simple',
        outcome,
      },
      ...(outcome === 'blocked'
        ? { blockedContext: { reasonCodes: [REASON], visibleText: scope.visibleText } }
        : {}),
      updatedAt: 200,
    });
  }
  upsertMessage(db, scope.conversationId, {
    id: ids.messageId,
    role: 'assistant',
    content: scope.visibleText,
    runId: ids.runId,
    runStatus: outcome === 'canceled' ? 'canceled' : 'succeeded',
    startedAt: 100,
    endedAt: 200,
  });
  return { snapshot, task };
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
      contextAndAudience: 'Product team',
      inputsAndReferences: [],
      constraints: [],
      canonicalDeliverable: { id: 'prototype', kind: 'prototype', format: 'html' },
      requiredDeliverables: [{ id: 'prototype', kind: 'prototype' }],
      designSpec: {
        source: 'resolved-baseline',
        version: '1',
        decisions: { palette: 'neutral' },
      },
      buildRequirements: [{ id: 'build-1', text: 'Build the required prototype.' }],
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
      goal: 'Build a prototype',
      deliverables: ['prototype'],
      keyConstraints: [],
      assumptions: [],
      risks: [],
      openDecisions: [],
    },
  };
}

// Mount only the production conversation registrar; no agent or full daemon
// starts. Each request sees actual SQLite rows and crosses JSON serialization.
async function readHistory(
  db: Db,
  dataDir: string,
  options: {
    beforeRead?: (origin: string) => Promise<void>;
    authorizeProjectRequest?: RegisterProjectConversationRoutesDeps['authorizeProjectRequest'];
  } = {},
): Promise<ChatMessage[]> {
  const app = express();
  app.use(express.json());
  registerProjectConversationRoutes(app, {
    db,
    http: {
      sendApiError: (res: Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { BRANDS_DIR: dataDir, PROJECTS_DIR: dataDir, RUNTIME_DATA_DIR: dataDir },
    projectStore: { getProject, updateProject },
    conversations: {
      insertConversation, getConversation, listConversations, updateConversation,
      getMessage, listMessages, upsertMessage,
    },
    ids: { randomId: () => 'unused-history-read-id' },
    appConfig: { readAppConfig: async () => ({}) },
    agents: { getAgentDef: () => null },
    design: { runs: {} },
    // Most fixtures are unbound local projects. Scope cases explicitly inject
    // a project-authority boundary; neither claims live Workspace coverage.
    authorizeProjectRequest: options.authorizeProjectRequest,
  } as unknown as RegisterProjectConversationRoutesDeps);
  const server = app.listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const { port } = server.address() as AddressInfo;
    await options.beforeRead?.(`http://127.0.0.1:${port}`);
    const response = await fetch(
      `http://127.0.0.1:${port}/api/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/messages`,
    );
    expect(response.status).toBe(200);
    const body = await response.json() as { messages: ChatMessage[] };
    return body.messages;
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
}

describe('persisted strategy verdict in conversation history', () => {
  let dataDir: string;
  let db: Db;

  beforeEach(() => {
    dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-history-verdict-'));
    db = openDatabase(dataDir, { dataDir });
    insertProject(db, { id: PROJECT_ID, name: 'History fixture', createdAt: 1, updatedAt: 1 });
    insertConversation(db, {
      id: CONVERSATION_ID, projectId: PROJECT_ID, title: 'History', createdAt: 1, updatedAt: 1,
    });
  });

  afterEach(() => {
    closeDatabase();
    fs.rmSync(dataDir, { recursive: true, force: true });
  });

  it('returns the durable blocked verdict before and after reopening the database without rewriting process success', async () => {
    seedTaskAndMessage(db, 'blocked');
    const persisted = db.prepare(`
      SELECT outcome, blocked_reason_codes_json AS reasons
      FROM strategy_task_executions WHERE task_execution_id = ?
    `).get(TASK_ID);
    expect(persisted).toEqual({ outcome: 'blocked', reasons: JSON.stringify([REASON]) });
    const warm = await readHistory(db, dataDir);

    closeDatabase();
    db = openDatabase(dataDir, { dataDir });
    expect(getStrategyTaskExecution(db, TASK_ID)).toMatchObject({
      outcome: 'blocked', blockedContext: { reasonCodes: [REASON], visibleText: REPLY },
    });
    const cold = await readHistory(db, dataDir);

    for (const messages of [warm, cold]) {
      expect(messages).toHaveLength(1);
      // Existing ChatMessage fields represent task truth independently from
      // physical Run success. This is not a request to invent an error string
      // or to change all blocked tasks into failed physical processes.
      expect.soft(messages[0]).toMatchObject({
        id: MESSAGE_ID,
        content: REPLY,
        runStatus: 'succeeded',
        strategyTaskExecutionId: TASK_ID,
        strategyTaskRunIndex: 0,
        strategyTaskBlocked: true,
        strategyTaskBlockedText: REPLY,
      });
      expect(messages[0]?.strategyTaskDelivered).not.toBe(true);
    }
    expect(getMessage(db, MESSAGE_ID)?.runStatus).toBe('succeeded');
  });

  it.each([
    { label: 'another conversation in the same project', foreignProjectId: PROJECT_ID },
    { label: 'a project the caller cannot read', foreignProjectId: 'foreign-history-project' },
  ])('does not disclose task metadata through a caller-written runId from $label', async ({ foreignProjectId }) => {
    const foreignConversationId = 'foreign-history-conversation';
    const foreignTaskId = 'foreign-history-task';
    const foreignRunId = 'foreign-history-run';
    const foreignText = 'Foreign task attribution must remain in its own conversation.';
    const importedMessageId = 'caller-written-assistant';
    const importedContent = 'Caller-owned imported placeholder.';
    seedTaskAndMessage(db, 'blocked');
    if (foreignProjectId !== PROJECT_ID) {
      insertProject(db, {
        id: foreignProjectId, name: 'Foreign history fixture', createdAt: 1, updatedAt: 1,
      });
    }
    insertConversation(db, {
      id: foreignConversationId, projectId: foreignProjectId,
      title: 'Foreign history', createdAt: 1, updatedAt: 1,
    });
    seedTaskAndMessage(db, 'blocked', {
      taskId: foreignTaskId, runId: foreignRunId, messageId: 'foreign-history-assistant',
    }, {
      projectId: foreignProjectId, conversationId: foreignConversationId, visibleText: foreignText,
    });
    expect(getStrategyTaskExecution(db, foreignTaskId)).toMatchObject({
      projectId: foreignProjectId, conversationId: foreignConversationId,
      outcome: 'blocked', blockedContext: { visibleText: foreignText },
    });
    const authorizeProjectRequest: NonNullable<
      RegisterProjectConversationRoutesDeps['authorizeProjectRequest']
    > = async (_req, res, projectId) => {
      if (projectId === PROJECT_ID) return true;
      res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Fixture project denied.' } });
      return false;
    };
    const warm = await readHistory(db, dataDir, {
      authorizeProjectRequest,
      beforeRead: async (origin) => {
        if (foreignProjectId !== PROJECT_ID) {
          const denied = await fetch(
            `${origin}/api/projects/${foreignProjectId}/conversations/${foreignConversationId}/messages`,
          );
          expect(denied.status).toBe(403);
          await denied.json();
        }
        // Exercise the actual new-message write path. There is no stored row
        // for the daemon-backed merge guard to preserve, so the supplied runId
        // is currently accepted. Do not seed the forged message directly in DB.
        expect(getMessage(db, importedMessageId)).toBeNull();
        const written = await fetch(
          `${origin}/api/projects/${PROJECT_ID}/conversations/${CONVERSATION_ID}/messages/${importedMessageId}`,
          {
            method: 'PUT',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              id: importedMessageId, role: 'assistant', content: importedContent,
              runId: foreignRunId, runStatus: 'succeeded',
            }),
          },
        );
        expect(written.status).toBe(200);
        expect(await written.json()).toMatchObject({ message: {
          id: importedMessageId, runId: foreignRunId, content: importedContent,
        } });
        expect(getMessage(db, importedMessageId, CONVERSATION_ID)).toMatchObject({
          runId: foreignRunId, content: importedContent,
        });
      },
    });
    closeDatabase();
    db = openDatabase(dataDir, { dataDir });
    const cold = await readHistory(db, dataDir, { authorizeProjectRequest });
    for (const messages of [warm, cold]) {
      expect(messages).toHaveLength(2);
      // Preserve the intended same-project, same-conversation restoration.
      expect(messages.find((message) => message.id === MESSAGE_ID)).toMatchObject({
        strategyTaskExecutionId: TASK_ID, strategyTaskRunIndex: 0,
        strategyTaskBlocked: true, strategyTaskBlockedText: REPLY, runStatus: 'succeeded',
      });
      const imported = messages.find((message) => message.id === importedMessageId);
      expect(imported).toMatchObject({
        content: importedContent, runId: foreignRunId, runStatus: 'succeeded',
      });
      expect.soft(imported?.strategyTaskExecutionId).toBeUndefined();
      expect.soft(imported?.strategyTaskRunIndex).toBeUndefined();
      expect.soft(imported?.strategyTaskBlocked).toBeUndefined();
      expect.soft(imported?.strategyTaskBlockedText).toBeUndefined();
      expect.soft(imported?.strategyTaskDelivered).toBeUndefined();
    }
  });

  it('returns the blocked task verdict for request and production runs without changing either process status', async () => {
    const { snapshot, task } = seedTaskAndMessage(db, 'running');
    const productionRunId = 'history-production-run';
    const production = compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: TASK_ID,
      expectedRevision: task.revision,
      to: {
        route: 'full_plan', inputStage: 'production', outcome: 'running', executionMode: 'simple',
      },
      nextRun: {
        runId: productionRunId,
        sourceRunId: RUN_ID,
        finalText: strategyTaskTurnText({
          taskExecutionId: TASK_ID, inputStage: 'production', taskRunIndex: 1,
        }),
      },
      planContract: planContract(snapshot),
      updatedAt: 300,
    });
    compareAndTransitionStrategyTaskExecution(db, {
      taskExecutionId: TASK_ID,
      expectedRevision: production.revision,
      to: {
        route: 'full_plan', inputStage: 'production', outcome: 'blocked', executionMode: 'simple',
      },
      blockedContext: { reasonCodes: [REASON], visibleText: REPLY },
      updatedAt: 400,
    });
    upsertMessage(db, CONVERSATION_ID, {
      id: 'history-production-assistant', role: 'assistant', content: REPLY,
      runId: productionRunId, runStatus: 'failed', startedAt: 300, endedAt: 400,
    });
    closeDatabase();
    db = openDatabase(dataDir, { dataDir });
    expect(getStrategyTaskExecution(db, TASK_ID)).toMatchObject({
      outcome: 'blocked', latestRunId: productionRunId,
      runs: [
        { runId: RUN_ID, taskRunIndex: 0 },
        { runId: productionRunId, taskRunIndex: 1, sourceRunId: RUN_ID },
      ],
    });
    const messages = await readHistory(db, dataDir);
    expect(messages).toHaveLength(2);
    for (const [id, runId, runIndex, runStatus] of [
      [MESSAGE_ID, RUN_ID, 0, 'succeeded'],
      ['history-production-assistant', productionRunId, 1, 'failed'],
    ] as const) {
      const message = messages.find((candidate) => candidate.id === id);
      // This existing flag is task-scoped. It must not rewrite a successful
      // predecessor as a failed process or erase the failed child's status.
      expect(message).toMatchObject({
        runId, runStatus, strategyTaskExecutionId: TASK_ID, strategyTaskRunIndex: runIndex,
        strategyTaskBlocked: true, strategyTaskBlockedText: REPLY,
      });
      expect(message?.strategyTaskDelivered).not.toBe(true);
      expect(getMessage(db, id)?.runStatus).toBe(runStatus);
    }
  });

  it.each([
    { label: 'legacy missing attribution', reasons: null, text: null, expectedText: null },
    { label: 'malformed reason JSON', reasons: '{broken', text: REPLY, expectedText: REPLY },
    { label: 'non-text attribution', reasons: '{broken', text: Buffer.from('invalid'), expectedText: null },
  ])('keeps history readable with $label', async ({ reasons, text, expectedText }) => {
    seedTaskAndMessage(db, 'blocked');
    // Corrupt only existing optional storage columns after using the real
    // writer. Display reads must not require a fully verifiable task record.
    db.prepare(`
      UPDATE strategy_task_executions
         SET blocked_reason_codes_json = ?, blocked_visible_text = ?
       WHERE task_execution_id = ?
    `).run(reasons, text, TASK_ID);
    closeDatabase();
    db = openDatabase(dataDir, { dataDir });

    const messages = await readHistory(db, dataDir);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      id: MESSAGE_ID,
      runStatus: 'succeeded',
      strategyTaskExecutionId: TASK_ID,
      strategyTaskBlocked: true,
      strategyTaskBlockedText: expectedText,
    });
    expect(messages[0]?.strategyTaskDelivered).not.toBe(true);
  });

  it('keeps separate tasks and physical runs in the same history tied to their own verdict', async () => {
    seedTaskAndMessage(db, 'blocked');
    seedTaskAndMessage(db, 'completed', {
      taskId: 'completed-task', runId: 'completed-run', messageId: 'completed-assistant',
    });
    upsertMessage(db, CONVERSATION_ID, {
      id: 'unmapped-assistant', role: 'assistant', content: 'Independent run.',
      runId: 'unmapped-run', runStatus: 'succeeded',
    });
    closeDatabase();
    db = openDatabase(dataDir, { dataDir });
    const messages = await readHistory(db, dataDir);
    expect(messages).toHaveLength(3);
    expect(messages.find((message) => message.id === MESSAGE_ID)).toMatchObject({
      strategyTaskExecutionId: TASK_ID, strategyTaskRunIndex: 0,
      strategyTaskBlocked: true, strategyTaskBlockedText: REPLY, runStatus: 'succeeded',
    });
    const completed = messages.find((message) => message.id === 'completed-assistant');
    expect(completed).toMatchObject({
      strategyTaskExecutionId: 'completed-task', strategyTaskRunIndex: 0,
      strategyTaskDelivered: true, runStatus: 'succeeded',
    });
    expect(completed?.strategyTaskBlocked).toBeUndefined();
    expect(completed?.strategyTaskBlockedText).toBeUndefined();
    const unmapped = messages.find((message) => message.id === 'unmapped-assistant');
    expect(unmapped).toMatchObject({ runId: 'unmapped-run', runStatus: 'succeeded' });
    expect(unmapped?.strategyTaskExecutionId).toBeUndefined();
    expect(unmapped?.strategyTaskBlocked).toBeUndefined();
  });

  it.each(['completed', 'canceled', 'running'] as const)(
    'does not turn a %s task or an unrelated legacy message into a blocked turn',
    async (outcome) => {
      seedTaskAndMessage(db, outcome);
      upsertMessage(db, CONVERSATION_ID, {
        id: 'legacy-assistant', role: 'assistant', content: 'Legacy reply.', runStatus: 'succeeded',
      });
      closeDatabase();
      db = openDatabase(dataDir, { dataDir });
      const messages = await readHistory(db, dataDir);
      const mapped = messages.find((message) => message.id === MESSAGE_ID);
      const legacy = messages.find((message) => message.id === 'legacy-assistant');
      expect(mapped?.strategyTaskExecutionId).toBe(TASK_ID);
      expect(mapped?.strategyTaskBlocked).not.toBe(true);
      expect(mapped?.strategyTaskDelivered === true).toBe(outcome === 'completed');
      expect(legacy).toMatchObject({ content: 'Legacy reply.', runStatus: 'succeeded' });
      expect(legacy?.strategyTaskExecutionId).toBeUndefined();
      expect(legacy?.strategyTaskBlocked).toBeUndefined();
    },
  );
});
