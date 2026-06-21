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

  // Captured from the installed Claude Code CLI (v2.1.178) on a bogus
  // `--resume <id>` with OD's exact stream-json flags. stderr carries the
  // human string; stdout carries the structured result event. Locks the
  // real-world shape as a regression guard (#4275).
  const REAL_CLAUDE_RESUME_FAILURE_STDERR =
    'No conversation found with session ID: 00000000-0000-0000-0000-000000000000';
  const REAL_CLAUDE_RESUME_FAILURE_STDOUT =
    '{"type":"result","subtype":"error_during_execution","duration_ms":0,'
    + '"duration_api_ms":0,"is_error":true,"num_turns":0,"stop_reason":null,'
    + '"session_id":"00000000-0000-0000-0000-000000000000","total_cost_usd":0,'
    + '"errors":["No conversation found with session ID: 00000000-0000-0000-0000-000000000000"]}';

  it('matches the real installed Claude CLI --resume failure output (#4275)', () => {
    expect(
      isClaudeResumeFailure(
        `${REAL_CLAUDE_RESUME_FAILURE_STDERR}\n${REAL_CLAUDE_RESUME_FAILURE_STDOUT}`,
      ),
    ).toBe(true);
  });

  // #4275: the human-readable prose drifts across Claude builds, so a reworded
  // failure ("...is unavailable" / "conversation ... not found") slips past all
  // three legacy patterns. The stream-json result event shape is version-stable
  // and must still flag the dead resume so the stored session id gets cleared.
  it('detects a resume failure from the stream-json result event when the prose is reworded', () => {
    const rewordedProse = 'Conversation 00000000-0000-0000-0000-000000000000 is unavailable';
    // Sanity: the reworded prose alone misses every legacy pattern.
    expect(isClaudeResumeFailure(rewordedProse)).toBe(false);

    const rewordedResult = JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      duration_ms: 0,
      duration_api_ms: 0,
      is_error: true,
      num_turns: 0,
      session_id: '00000000-0000-0000-0000-000000000000',
      errors: [rewordedProse],
    });
    expect(isClaudeResumeFailure(rewordedResult)).toBe(true);
  });

  // Guard against over-clearing: a transient in-turn failure (overload /
  // network) spends real API time and produces at least one turn, and a
  // successful run is not an error — neither must read as a dead resume, or a
  // blip would drop a still-valid session.
  it('does not treat an in-turn API failure or a successful run as a resume failure', () => {
    const inTurnApiError = JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      duration_ms: 5200,
      duration_api_ms: 5000,
      is_error: true,
      num_turns: 1,
      session_id: 'live-session',
      errors: ['Overloaded'],
    });
    expect(isClaudeResumeFailure(inTurnApiError)).toBe(false);

    const success = JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 4200,
      duration_api_ms: 4000,
      is_error: false,
      num_turns: 2,
      session_id: 'live-session',
    });
    expect(isClaudeResumeFailure(success)).toBe(false);
  });
});
