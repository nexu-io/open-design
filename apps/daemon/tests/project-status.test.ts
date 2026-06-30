import assert from 'node:assert/strict';
import type Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  getConversation,
  listConversations,
  listLatestConversationRunStatuses,
  listLatestProjectRunStatuses,
  listProjectsAwaitingInput,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { composeProjectDisplayStatus } from '../src/server.js';

const tempDirs: string[] = [];

afterEach(() => {
  closeDatabase();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createDb(): Database.Database {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-project-status-'));
  tempDirs.push(dir);
  return openDatabase(dir, { dataDir: path.join(dir, '.od') });
}

function seedProject(db: Database.Database, projectId: string, runStatus = 'succeeded') {
  insertProject(db, {
    id: projectId,
    name: projectId,
    createdAt: 1,
    updatedAt: 1,
  });
  insertConversation(db, {
    id: `${projectId}-conversation`,
    projectId,
    title: null,
    createdAt: 1,
    updatedAt: 1,
  });
  upsertMessage(db, `${projectId}-conversation`, {
    id: `${projectId}-run`,
    role: 'assistant',
    content: 'done',
    runId: `${projectId}-run-id`,
    runStatus,
    endedAt: 50,
  });
  return `${projectId}-conversation`;
}

function addMessage(
  db: Database.Database,
  conversationId: string,
  id: string,
  role: 'user' | 'assistant',
  content: string,
) {
  upsertMessage(db, conversationId, { id, role, content });
}

test('unanswered structured question marks project as awaiting input', () => {
  const db = createDb();
  const conversationId = seedProject(db, 'project-a');

  addMessage(db, conversationId, 'assistant-question', 'assistant', 'Need one choice\n<question-form id="q1">');

  assert.deepEqual([...listProjectsAwaitingInput(db)], ['project-a']);
});

test('ask-question alias of question-form also marks project as awaiting input', () => {
  const db = createDb();
  const conversationId = seedProject(db, 'project-a-alias');

  // <ask-question> is an accepted alias for <question-form>; an alias-form
  // turn must mark the project awaiting input just like the canonical tag.
  addMessage(db, conversationId, 'assistant-question', 'assistant', 'Need one choice\n<ask-question id="q1">');

  assert.deepEqual([...listProjectsAwaitingInput(db)], ['project-a-alias']);
});

test('user reply after structured question clears awaiting input', () => {
  const db = createDb();
  const conversationId = seedProject(db, 'project-b');

  addMessage(db, conversationId, 'assistant-question', 'assistant', '<question-form id="q1">');
  addMessage(db, conversationId, 'user-answer', 'user', 'Here is my answer');

  assert.equal(listProjectsAwaitingInput(db).has('project-b'), false);
});

test('latest structured question form wins across assistant turns', () => {
  const db = createDb();
  const conversationId = seedProject(db, 'project-c');

  addMessage(db, conversationId, 'assistant-question-1', 'assistant', '<question-form id="q1">');
  addMessage(db, conversationId, 'user-answer', 'user', 'answered');
  addMessage(db, conversationId, 'assistant-question-2', 'assistant', '<question-form id="q2">');

  assert.equal(listProjectsAwaitingInput(db).has('project-c'), true);
});

test('plain text question does not mark awaiting input', () => {
  const db = createDb();
  const conversationId = seedProject(db, 'project-d');

  addMessage(db, conversationId, 'assistant-question', 'assistant', 'Can you clarify the color palette?');

  assert.equal(listProjectsAwaitingInput(db).has('project-d'), false);
});

test('conversation latest run follows assistant message position', () => {
  const db = createDb();
  const conversationId = seedProject(db, 'project-latest', 'succeeded');

  upsertMessage(db, conversationId, {
    id: 'project-latest-running',
    role: 'assistant',
    content: 'working',
    runId: 'project-latest-running-id',
    runStatus: 'running',
    startedAt: 20,
  });

  assert.equal(listConversations(db, 'project-latest')[0]?.latestRun?.status, 'running');
  assert.equal(getConversation(db, conversationId)?.latestRun?.status, 'running');
});

test('conversation latest run status breaks timestamp ties by message position', () => {
  const db = createDb();
  insertProject(db, {
    id: 'project-conversation-status-tie',
    name: 'project-conversation-status-tie',
    createdAt: 1,
    updatedAt: 1,
  });
  insertConversation(db, {
    id: 'conversation-status-tie',
    projectId: 'project-conversation-status-tie',
    title: null,
    createdAt: 1,
    updatedAt: 1,
  });
  upsertMessage(db, 'conversation-status-tie', {
    id: 'conversation-status-tie-failed',
    role: 'assistant',
    content: 'failed',
    runId: 'conversation-status-tie-failed-run',
    runStatus: 'failed',
    endedAt: 50,
  });
  upsertMessage(db, 'conversation-status-tie', {
    id: 'conversation-status-tie-succeeded',
    role: 'assistant',
    content: 'succeeded',
    runId: 'conversation-status-tie-succeeded-run',
    runStatus: 'succeeded',
    endedAt: 50,
  });

  const runStatuses = listLatestConversationRunStatuses(db);

  assert.equal(runStatuses.get('conversation-status-tie')?.value, 'succeeded');
  assert.equal(runStatuses.get('conversation-status-tie')?.runId, 'conversation-status-tie-succeeded-run');
});

test('conversation summaries expose cumulative completed run duration', () => {
  const db = createDb();
  insertProject(db, {
    id: 'project-duration',
    name: 'project-duration',
    createdAt: 1,
    updatedAt: 1,
  });
  insertConversation(db, {
    id: 'project-duration-conversation',
    projectId: 'project-duration',
    title: 'Duration test',
    createdAt: 1,
    updatedAt: 4,
  });
  upsertMessage(db, 'project-duration-conversation', {
    id: 'project-duration-first',
    role: 'assistant',
    content: 'first done',
    runId: 'project-duration-first-run',
    runStatus: 'succeeded',
    startedAt: 10_000,
    endedAt: 40_000,
  });
  upsertMessage(db, 'project-duration-conversation', {
    id: 'project-duration-running',
    role: 'assistant',
    content: 'still running',
    runId: 'project-duration-running-run',
    runStatus: 'running',
    startedAt: 45_000,
  });
  upsertMessage(db, 'project-duration-conversation', {
    id: 'project-duration-second',
    role: 'assistant',
    content: 'second done',
    runId: 'project-duration-second-run',
    runStatus: 'failed',
    startedAt: 50_000,
    endedAt: 125_000,
  });

  const listed = listConversations(db, 'project-duration')[0] as { totalDurationMs?: number };
  const fetched = getConversation(db, 'project-duration-conversation') as { totalDurationMs?: number } | null;

  assert.equal(listed.totalDurationMs, 105_000);
  assert.equal(fetched?.totalDurationMs, 105_000);
});

test('conversation summaries include usage-only terminal run durations', () => {
  const db = createDb();
  insertProject(db, {
    id: 'project-usage-duration',
    name: 'project-usage-duration',
    createdAt: 1,
    updatedAt: 1,
  });
  insertConversation(db, {
    id: 'project-usage-duration-conversation',
    projectId: 'project-usage-duration',
    title: 'Usage duration test',
    createdAt: 1,
    updatedAt: 4,
  });
  upsertMessage(db, 'project-usage-duration-conversation', {
    id: 'project-usage-duration-imported',
    role: 'assistant',
    content: 'imported done',
    runId: 'project-usage-duration-imported-run',
    runStatus: 'succeeded',
    events: [{ kind: 'usage', durationMs: 22_000 }],
  });
  upsertMessage(db, 'project-usage-duration-conversation', {
    id: 'project-usage-duration-timestamped',
    role: 'assistant',
    content: 'timestamped done',
    runId: 'project-usage-duration-timestamped-run',
    runStatus: 'succeeded',
    startedAt: 30_000,
    endedAt: 60_000,
  });

  const listed = listConversations(db, 'project-usage-duration')[0] as { totalDurationMs?: number };
  const fetched = getConversation(db, 'project-usage-duration-conversation') as { totalDurationMs?: number } | null;

  assert.equal(listed.totalDurationMs, 52_000);
  assert.equal(fetched?.totalDurationMs, 52_000);
});

test('conversation listing batches latest run summaries for large projects', () => {
  const db = createDb();
  insertProject(db, {
    id: 'project-large',
    name: 'project-large',
    createdAt: 1,
    updatedAt: 1,
  });
  for (let i = 0; i < 125; i += 1) {
    const conversationId = `project-large-conversation-${i}`;
    insertConversation(db, {
      id: conversationId,
      projectId: 'project-large',
      title: `Conversation ${i}`,
      createdAt: i,
      updatedAt: i,
    });
    upsertMessage(db, conversationId, {
      id: `${conversationId}-older`,
      role: 'assistant',
      content: 'done',
      runId: `${conversationId}-older-run`,
      runStatus: 'succeeded',
      startedAt: 10,
      endedAt: 20,
    });
    upsertMessage(db, conversationId, {
      id: `${conversationId}-latest`,
      role: 'assistant',
      content: 'failed',
      runId: `${conversationId}-latest-run`,
      runStatus: 'failed',
      startedAt: 100,
      endedAt: 175,
    });
  }

  const preparedSql: string[] = [];
  const instrumentedDb = new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === 'prepare') {
        return (sql: string) => {
          preparedSql.push(sql);
          return target.prepare(sql);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as Database.Database;

  const conversations = listConversations(instrumentedDb, 'project-large');

  assert.equal(conversations.length, 125);
  assert.equal(preparedSql.length, 1);
  assert.equal(conversations[0]?.latestRun?.status, 'failed');
  assert.equal(conversations[0]?.latestRun?.durationMs, 75);
  assert.equal(conversations[0]?.messageCount, 2);
});

test('only succeeded statuses are overridden by awaiting input', () => {
  const db = createDb();
  const failedConversationId = seedProject(db, 'project-failed', 'failed');
  const canceledConversationId = seedProject(db, 'project-canceled', 'canceled');
  const runningConversationId = seedProject(db, 'project-running', 'running');

  addMessage(db, failedConversationId, 'failed-question', 'assistant', '<question-form id="failed">');
  addMessage(db, canceledConversationId, 'canceled-question', 'assistant', '<question-form id="canceled">');
  addMessage(db, runningConversationId, 'running-question', 'assistant', '<question-form id="running">');

  const awaiting = listProjectsAwaitingInput(db);
  const runStatuses = listLatestProjectRunStatuses(db);

  assert.equal(awaiting.has('project-failed'), true);
  assert.equal(awaiting.has('project-canceled'), true);
  assert.equal(awaiting.has('project-running'), true);
  assert.equal(runStatuses.get('project-failed')?.value, 'failed');
  assert.equal(runStatuses.get('project-canceled')?.value, 'canceled');
  assert.equal(runStatuses.get('project-running')?.value, 'running');
});

test('queued active run surfaces as running in project projection', () => {
  const status = composeProjectDisplayStatus(
    {
      value: 'queued',
      updatedAt: 42,
      runId: 'active-run',
    },
    new Set(),
    'project-queued-active',
  );

  assert.deepEqual(status, {
    value: 'running',
    updatedAt: 42,
    runId: 'active-run',
  });
});

test('queued db-latest run status surfaces as running in project projection', () => {
  const db = createDb();
  seedProject(db, 'project-queued-db', 'queued');

  const runStatuses = listLatestProjectRunStatuses(db);
  const status = composeProjectDisplayStatus(
    runStatuses.get('project-queued-db') ?? { value: 'not_started' },
    new Set(),
    'project-queued-db',
  );

  assert.equal(runStatuses.get('project-queued-db')?.value, 'queued');
  assert.deepEqual(status, {
    value: 'running',
    updatedAt: 50,
    runId: 'project-queued-db-run-id',
  });
});
