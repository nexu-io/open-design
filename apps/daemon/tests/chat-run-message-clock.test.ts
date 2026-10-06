import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { closeDatabase, getMessage, insertConversation, insertProject, openDatabase, upsertMessage } from '../src/db.js';
import { pinAssistantMessageOnRunCreate } from '../src/runtimes/chat-run-messages.js';

const CREATED = 1_788_000_000_000;
const RESTARTED = CREATED + 300_000;
let dataDir: string | undefined;

afterEach(() => {
  closeDatabase();
  if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  dataDir = undefined;
});

describe('OPEND-2946: message creation and rebound run start are distinct API fields', () => {
  it('retains message creation while projecting the new physical run start after rebinding', () => {
    dataDir = mkdtempSync(path.join(tmpdir(), 'od-message-clock-'));
    const db = openDatabase(dataDir, { dataDir });
    insertProject(db, { id: 'clock-project', name: 'Clock', createdAt: CREATED, updatedAt: CREATED });
    insertConversation(db, { id: 'clock-conversation', projectId: 'clock-project', title: 'Retry', createdAt: CREATED, updatedAt: CREATED });
    upsertMessage(db, 'clock-conversation', {
      id: 'clock-message', role: 'assistant', content: 'Previous attempt',
      runId: 'old-run', runStatus: 'failed',
      createdAt: CREATED, startedAt: CREATED, endedAt: CREATED + 10_000,
    });

    expect(pinAssistantMessageOnRunCreate(db, {
      id: 'new-run', assistantMessageId: 'clock-message', conversationId: 'clock-conversation',
      status: 'running', createdAt: RESTARTED,
    })).toEqual({ ok: true });

    const running = getMessage(db, 'clock-message', 'clock-conversation');
    expect(running).toMatchObject({
      id: 'clock-message', role: 'assistant', content: '', runId: 'new-run', runStatus: 'running',
      createdAt: CREATED, startedAt: RESTARTED,
    });
    expect(running?.endedAt).toBeUndefined();

    // The same persisted DTO is finalized and read again, as on history reload.
    upsertMessage(db, 'clock-conversation', { ...running!, runStatus: 'succeeded', endedAt: RESTARTED + 20_000 });
    const completed = getMessage(db, 'clock-message', 'clock-conversation');
    expect(completed).toMatchObject({ createdAt: CREATED, startedAt: RESTARTED, endedAt: RESTARTED + 20_000 });
    expect(completed!.endedAt! - completed!.startedAt!).toBe(20_000);
    expect(completed!.endedAt! - completed!.createdAt!).toBe(320_000);
  });
});
