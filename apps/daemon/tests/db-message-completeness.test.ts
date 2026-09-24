import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { closeDatabase, getMessage, insertConversation, insertProject, listMessages, listLatestProjectRunStatuses, openDatabase, upsertMessage } from '../src/db.js';
let directory: string;
afterEach(() => { closeDatabase(); if (directory) rmSync(directory, { recursive: true, force: true }); });

describe('durable host-owned message completeness', () => {
  it.each([true, false])('preserves verdict %s on reload and stale client saves, clears it for a new run', (unfinished) => {
    directory = mkdtempSync(join(tmpdir(), 'od-message-completeness-'));
    let db = openDatabase(directory, { dataDir: directory });
    insertProject(db, { id: 'p', name: 'p', createdAt: 1, updatedAt: 1 });
    insertConversation(db, { id: 'c', projectId: 'p', title: 'c', createdAt: 1, updatedAt: 1 });
    const message = { id: 'm', role: 'assistant', content: 'Done', runId: 'r', runStatus: 'succeeded',
      events: unfinished ? [] : [{ kind: 'tool_use', name: 'TodoWrite', id: 'todo', input: { todos: [{ content: 'old', status: 'pending' }] } }] };
    upsertMessage(db, 'c', { ...message, endedWithUnfinishedWork: unfinished });
    upsertMessage(db, 'c', { ...message, endedWithUnfinishedWork: !unfinished });
    closeDatabase();
    db = openDatabase(directory, { dataDir: directory });
    expect(getMessage(db, 'm')?.endedWithUnfinishedWork).toBe(unfinished);
    expect(listMessages(db, 'c')[0]?.endedWithUnfinishedWork).toBe(unfinished);
    expect(listLatestProjectRunStatuses(db).get('p')?.value).toBe(unfinished ? 'incomplete' : 'succeeded');
    // Forked transcript rows keep their verdict even though their run pointer is removed.
    upsertMessage(db, 'c', { ...getMessage(db, 'm'), id: 'forked', runId: undefined });
    expect(getMessage(db, 'forked')?.endedWithUnfinishedWork).toBe(unfinished);
    upsertMessage(db, 'c', { ...message, runId: 'new-run', runStatus: 'running' });
    expect(getMessage(db, 'm')?.endedWithUnfinishedWork).toBeUndefined();
  });
});
