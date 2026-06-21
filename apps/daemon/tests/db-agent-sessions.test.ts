import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  clearAgentSession,
  closeDatabase,
  getAgentSession,
  getAgentSessionRecord,
  insertConversation,
  insertProject,
  openDatabase,
  updateAgentSessionStableHash,
  upsertAgentSession,
} from '../src/db.js';

describe('agent_sessions persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-agent-sessions-'));
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
      title: 'C',
      createdAt: now,
      updatedAt: now,
    });
    return db;
  }

  it('returns null when no session is stored', () => {
    const db = seed();
    expect(getAgentSession(db, 'conv-1', 'claude')).toBeNull();
  });

  it('upserts and reads back a session id, scoped per agent', () => {
    const db = seed();
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A' });
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'codex', sessionId: 'sess-B' });
    expect(getAgentSession(db, 'conv-1', 'claude')).toBe('sess-A');
    expect(getAgentSession(db, 'conv-1', 'codex')).toBe('sess-B');
  });

  it('upsert overwrites the prior id for the same (conversation, agent)', () => {
    const db = seed();
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A' });
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-C' });
    expect(getAgentSession(db, 'conv-1', 'claude')).toBe('sess-C');
  });

  it('clearAgentSession removes only the targeted row', () => {
    const db = seed();
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A' });
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'codex', sessionId: 'sess-B' });
    clearAgentSession(db, 'conv-1', 'claude');
    expect(getAgentSession(db, 'conv-1', 'claude')).toBeNull();
    expect(getAgentSession(db, 'conv-1', 'codex')).toBe('sess-B');
  });
});

describe('agent_sessions stable_prompt_hash', () => {
  let tempDir: string;
  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-agent-sessions-hash-'));
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

  it('round-trips the stable hash through upsert + getAgentSessionRecord', () => {
    const db = seed();
    upsertAgentSession(db, {
      conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A', stablePromptHash: 'hash-1',
    });
    expect(getAgentSessionRecord(db, 'conv-1', 'claude')).toEqual({
      sessionId: 'sess-A', stablePromptHash: 'hash-1',
    });
  });

  it('stores null stable hash when omitted', () => {
    const db = seed();
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A' });
    expect(getAgentSessionRecord(db, 'conv-1', 'claude')).toEqual({
      sessionId: 'sess-A', stablePromptHash: null,
    });
  });

  it('updateAgentSessionStableHash changes only the hash, keeps the session id', () => {
    const db = seed();
    upsertAgentSession(db, {
      conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A', stablePromptHash: 'hash-1',
    });
    updateAgentSessionStableHash(db, 'conv-1', 'claude', 'hash-2');
    expect(getAgentSessionRecord(db, 'conv-1', 'claude')).toEqual({
      sessionId: 'sess-A', stablePromptHash: 'hash-2',
    });
  });

  it('getAgentSessionRecord returns null when no row exists', () => {
    const db = seed();
    expect(getAgentSessionRecord(db, 'conv-1', 'claude')).toBeNull();
  });
});
