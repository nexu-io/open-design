import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  getAgentSessionRecord,
  insertConversation,
  insertProject,
  openDatabase,
  upsertAgentSession,
} from '../src/db.js';
import {
  computeIncludeStable,
  hashStableInstructions,
  isClaudeResumeFailure,
  persistCapturedAgentSession,
  resolveAgentResumeContext,
} from '../src/agent-session-resume.js';

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

  it('returns null storedStablePromptHash when none stored, and the value when present', () => {
    const db = seed();
    const fresh = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(fresh.storedStablePromptHash).toBeNull();

    upsertAgentSession(db, {
      conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A', stablePromptHash: 'h-1',
    });
    const resumed = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(resumed.isResuming).toBe(true);
    expect(resumed.resumeSessionId).toBe('sess-A');
    expect(resumed.storedStablePromptHash).toBe('h-1');
  });
});

describe('computeIncludeStable', () => {
  it('includes the stable block on a create turn (not resuming)', () => {
    expect(computeIncludeStable(false, null, 'h-1')).toBe(true);
  });
  it('skips the stable block on a resume turn with a matching hash', () => {
    expect(computeIncludeStable(true, 'h-1', 'h-1')).toBe(false);
  });
  it('includes the stable block on a resume turn whose hash changed', () => {
    expect(computeIncludeStable(true, 'h-old', 'h-new')).toBe(true);
  });
  it('includes the stable block on a resume turn with no stored hash (legacy session)', () => {
    expect(computeIncludeStable(true, null, 'h-1')).toBe(true);
  });
});

describe('persistCapturedAgentSession', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-captured-session-'));
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

  it('stores the captured session path for the conversation and agent', () => {
    const db = seed();
    const result = persistCapturedAgentSession(db, {
      conversationId: 'conv-1',
      agentId: 'pi',
      sessionId: '/tmp/current.jsonl',
      stablePromptHash: 'hash-1',
    });
    expect(result).toBe('stored');
    expect(getAgentSessionRecord(db, 'conv-1', 'pi')).toEqual({
      sessionId: '/tmp/current.jsonl',
      stablePromptHash: 'hash-1',
    });
  });

  it('clears stale session state when a successful run has no safe captured session', () => {
    const db = seed();
    upsertAgentSession(db, {
      conversationId: 'conv-1',
      agentId: 'pi',
      sessionId: '/tmp/stale.jsonl',
      stablePromptHash: 'old-hash',
    });

    const result = persistCapturedAgentSession(db, {
      conversationId: 'conv-1',
      agentId: 'pi',
      sessionId: null,
      stablePromptHash: 'new-hash',
    });

    expect(result).toBe('cleared');
    expect(getAgentSessionRecord(db, 'conv-1', 'pi')).toBeNull();
    expect(resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'pi' }).isResuming)
      .toBe(false);
  });
});

describe('hashStableInstructions', () => {
  it('is deterministic for the same input', () => {
    expect(hashStableInstructions('abc')).toBe(hashStableInstructions('abc'));
  });
  it('differs when the input differs', () => {
    expect(hashStableInstructions('abc')).not.toBe(hashStableInstructions('abd'));
  });
  it('returns a 64-char hex sha256 digest', () => {
    expect(hashStableInstructions('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('isClaudeResumeFailure', () => {
  it('matches the missing-session error shape', () => {
    expect(isClaudeResumeFailure('Error: No conversation found with session ID: abc')).toBe(true);
    expect(isClaudeResumeFailure('no session found for id abc')).toBe(true);
    expect(isClaudeResumeFailure('session abc-123 not found')).toBe(true);
  });

  it('does not match unrelated errors', () => {
    expect(isClaudeResumeFailure('rate limit exceeded')).toBe(false);
    expect(isClaudeResumeFailure('')).toBe(false);
  });
});
