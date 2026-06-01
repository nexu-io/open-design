import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  openDatabase,
  upsertAgentSession,
} from '../src/db.js';
import { resolveAgentResumeContext } from '../src/agent-session-resume.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('resolveAgentResumeContext', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-resume-ctx-'));
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
      id: 'conv-1', projectId: 'proj-1', title: 'C', createdAt: now, updatedAt: now,
    });
    return db;
  }

  it('creates a new session (minted uuid, not resuming) when none stored', () => {
    const db = seed();
    const ctx = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(ctx.isResuming).toBe(false);
    expect(ctx.resumeSessionId).toBeNull();
    expect(ctx.newSessionId).toMatch(UUID_RE);
  });

  it('resumes the stored session when one exists', () => {
    const db = seed();
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A' });
    const ctx = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(ctx.isResuming).toBe(true);
    expect(ctx.resumeSessionId).toBe('sess-A');
  });
});
