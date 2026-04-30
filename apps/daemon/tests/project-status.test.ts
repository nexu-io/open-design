// @ts-nocheck
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'vitest';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listLatestProjectRunStatuses,
  listProjectsAwaitingInput,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { composeProjectDisplayStatus } from '../src/server.js';

const tempDirs = [];

afterEach(() => {
  closeDatabase();
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function createDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-project-status-'));
  tempDirs.push(dir);
  return openDatabase(dir, { dataDir: path.join(dir, '.od') });
}

function seedProject(db, projectId, runStatus = 'succeeded') {
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

function addMessage(db, conversationId, id, role, content) {
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
