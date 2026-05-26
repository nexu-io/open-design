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
