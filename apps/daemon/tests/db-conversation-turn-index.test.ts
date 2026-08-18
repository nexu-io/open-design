import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  conversationTurnIndexForRun,
  insertConversation,
  insertProject,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

describe('conversationTurnIndexForRun', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-conversation-turn-index-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seed() {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'P', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'C1',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-2',
      projectId: 'proj-1',
      title: 'C2',
      createdAt: now,
      updatedAt: now,
    });
    return db;
  }

  function addRun(
    db: ReturnType<typeof seed>,
    conversationId: string,
    messageId: string,
    runId: string,
  ) {
    upsertMessage(db, conversationId, {
      id: messageId,
      role: 'assistant',
      content: '',
      runId,
      runStatus: 'queued',
    });
  }

  it('returns the 0-based run index within one conversation', () => {
    const db = seed();
    addRun(db, 'conv-1', 'assistant-1', 'run-1');
    addRun(db, 'conv-1', 'assistant-2', 'run-2');
    addRun(db, 'conv-1', 'assistant-3', 'run-3');

    expect(conversationTurnIndexForRun(db, 'conv-1', 'run-1')).toBe(0);
    expect(conversationTurnIndexForRun(db, 'conv-1', 'run-2')).toBe(1);
    expect(conversationTurnIndexForRun(db, 'conv-1', 'run-3')).toBe(2);
  });

  it('keeps independent counters per conversation and ignores non-run messages', () => {
    const db = seed();
    addRun(db, 'conv-1', 'assistant-1', 'run-1');
    upsertMessage(db, 'conv-1', {
      id: 'user-only',
      role: 'user',
      content: 'follow up',
    });
    addRun(db, 'conv-2', 'assistant-2', 'run-2');

    expect(conversationTurnIndexForRun(db, 'conv-1', 'run-1')).toBe(0);
    expect(conversationTurnIndexForRun(db, 'conv-2', 'run-2')).toBe(0);
  });

  it('returns null when the current run is not persisted in the conversation', () => {
    const db = seed();
    addRun(db, 'conv-1', 'assistant-1', 'run-1');

    expect(conversationTurnIndexForRun(db, 'conv-1', 'missing-run')).toBeNull();
  });
});
