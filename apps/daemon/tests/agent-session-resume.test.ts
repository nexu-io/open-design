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
  upsertMessage,
} from '../src/db.js';
import {
  computeIncludeStable,
  hashStableInstructions,
  isAgentResumeFailure,
  isAmrResumeFailure,
  isClaudeResumeFailure,
  isCodexResumeFailure,
  isOpencodeResumeFailure,
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

  // A completed turn stamps its assistant message run_status='succeeded' at
  // finish (server.ts). The resume cursor only counts succeeded assistant turns,
  // so completed turns default to 'succeeded'; pass runStatus=null for an
  // in-flight placeholder (the current run's own not-yet-finished message).
  function seedMessage(
    db: ReturnType<typeof seed>,
    id: string,
    role: 'user' | 'assistant',
    runStatus: string | null = role === 'assistant' ? 'succeeded' : null,
  ) {
    upsertMessage(db, 'conv-1', { id, role, content: `${role} ${id}`, runStatus });
  }

  // A session row whose identity (model/cwd/last assistant id) matches what the
  // next resolve will present, so the guard allows the resume.
  function storeInSyncSession(
    db: ReturnType<typeof seed>,
    over: { stablePromptHash?: string | null; model?: string | null; cwd?: string | null } = {},
  ) {
    upsertAgentSession(db, {
      conversationId: 'conv-1',
      agentId: 'claude',
      sessionId: 'sess-A',
      lastMessageId: 'asst-1',
      model: over.model ?? null,
      cwd: over.cwd ?? null,
      stablePromptHash: over.stablePromptHash ?? null,
    });
  }

  it('creates a new session (minted uuid, not resuming) when none stored', () => {
    const db = seed();
    const ctx = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(ctx.isResuming).toBe(false);
    expect(ctx.resumeSessionId).toBeNull();
    expect(ctx.newSessionId).toMatch(UUID_RE);
    expect(ctx.invalidationReason).toBeNull();
  });

  it('resumes the stored session when the identity still matches', () => {
    const db = seed();
    seedMessage(db, 'asst-1', 'assistant');
    storeInSyncSession(db);
    const ctx = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(ctx.isResuming).toBe(true);
    expect(ctx.resumeSessionId).toBe('sess-A');
    expect(ctx.invalidationReason).toBeNull();
  });

  it('still resumes when only the current run placeholder is newer (normal follow-up)', () => {
    const db = seed();
    seedMessage(db, 'asst-1', 'assistant');
    storeInSyncSession(db);
    // The next turn's user message + assistant placeholder are already inserted.
    seedMessage(db, 'user-2', 'user');
    seedMessage(db, 'asst-2', 'assistant', null); // in-flight placeholder
    const ctx = resolveAgentResumeContext(db, {
      conversationId: 'conv-1',
      agentId: 'claude',
      currentAssistantMessageId: 'asst-2',
    });
    expect(ctx.isResuming).toBe(true);
    expect(ctx.resumeSessionId).toBe('sess-A');
  });

  it('returns the stored stable hash when resuming', () => {
    const db = seed();
    seedMessage(db, 'asst-1', 'assistant');
    storeInSyncSession(db, { stablePromptHash: 'h-1' });
    const resumed = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(resumed.isResuming).toBe(true);
    expect(resumed.storedStablePromptHash).toBe('h-1');
  });

  it('reseeds (model_changed) when the model differs from the stored session', () => {
    const db = seed();
    seedMessage(db, 'asst-1', 'assistant');
    storeInSyncSession(db, { model: 'gpt-5.1' });
    const ctx = resolveAgentResumeContext(db, {
      conversationId: 'conv-1', agentId: 'claude', currentModel: 'gpt-5-codex',
    });
    expect(ctx.isResuming).toBe(false);
    expect(ctx.resumeSessionId).toBeNull();
    expect(ctx.invalidationReason).toBe('model_changed');
  });

  it('reseeds (cwd_changed) when the cwd differs from the stored session', () => {
    const db = seed();
    seedMessage(db, 'asst-1', 'assistant');
    storeInSyncSession(db, { cwd: '/work/a' });
    const ctx = resolveAgentResumeContext(db, {
      conversationId: 'conv-1', agentId: 'claude', currentCwd: '/work/b',
    });
    expect(ctx.isResuming).toBe(false);
    expect(ctx.invalidationReason).toBe('cwd_changed');
  });

  it('reseeds (conversation_advanced) when another agent completed a turn in between', () => {
    const db = seed();
    seedMessage(db, 'asst-1', 'assistant');
    storeInSyncSession(db);
    // A different agent ran: a newer completed assistant turn now exists.
    seedMessage(db, 'user-2', 'user');
    seedMessage(db, 'asst-other', 'assistant');
    // This agent comes back; its placeholder is asst-3.
    seedMessage(db, 'user-3', 'user');
    seedMessage(db, 'asst-3', 'assistant', null); // in-flight placeholder
    const ctx = resolveAgentResumeContext(db, {
      conversationId: 'conv-1', agentId: 'claude', currentAssistantMessageId: 'asst-3',
    });
    expect(ctx.isResuming).toBe(false);
    expect(ctx.resumeSessionId).toBeNull();
    expect(ctx.invalidationReason).toBe('conversation_advanced');
  });

  it('still resumes when the stored cursor is the session own failed turn (resume-on-failure)', () => {
    const db = seed();
    // Turn 1 committed work then FAILED transiently; the resume-on-failure path
    // persisted the session pointing at that failed assistant turn.
    seedMessage(db, 'asst-1', 'assistant', 'failed');
    upsertAgentSession(db, {
      conversationId: 'conv-1',
      agentId: 'claude',
      sessionId: 'sess-A',
      lastMessageId: 'asst-1',
      model: null,
      cwd: null,
      stablePromptHash: null,
    });
    // Turn 2 must continue the same session — the failed turn it owns is a valid
    // resume cursor, not conversation advancement.
    const ctx = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(ctx.isResuming).toBe(true);
    expect(ctx.resumeSessionId).toBe('sess-A');
    expect(ctx.invalidationReason).toBeNull();
  });

  it('reseeds (conversation_advanced) when a later succeeded turn follows the stored failed turn', () => {
    const db = seed();
    // Stored session owns a failed turn (asst-1)...
    seedMessage(db, 'asst-1', 'assistant', 'failed');
    upsertAgentSession(db, {
      conversationId: 'conv-1',
      agentId: 'claude',
      sessionId: 'sess-A',
      lastMessageId: 'asst-1',
      model: null,
      cwd: null,
      stablePromptHash: null,
    });
    // ...but a different agent then COMPLETED a turn (asst-2 succeeded). That is
    // genuine advancement the session never saw — must reseed, not resume.
    seedMessage(db, 'asst-2', 'assistant'); // succeeded
    const ctx = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(ctx.isResuming).toBe(false);
    expect(ctx.invalidationReason).toBe('conversation_advanced');
  });

  it('reseeds (missing_cursor) for a legacy row written without an identity', () => {
    const db = seed();
    seedMessage(db, 'asst-1', 'assistant');
    // Old-style upsert: no model/cwd/lastMessageId.
    upsertAgentSession(db, { conversationId: 'conv-1', agentId: 'claude', sessionId: 'sess-A' });
    const ctx = resolveAgentResumeContext(db, { conversationId: 'conv-1', agentId: 'claude' });
    expect(ctx.isResuming).toBe(false);
    expect(ctx.invalidationReason).toBe('missing_cursor');
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
    expect(getAgentSessionRecord(db, 'conv-1', 'pi')).toMatchObject({
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

  // Regression for the resume identity guard: pi-rpc persists via this capture
  // path, so it must store model/cwd/lastMessageId too — otherwise the next pi
  // turn sees a null cursor (`missing_cursor`) and reseeds forever, silently
  // disabling pi's existing follow-up-session path (reported by @nettee).
  it('persists the resume identity so a successful pi turn still resumes next turn', () => {
    const db = seed();
    upsertMessage(db, 'conv-1', { id: 'asst-1', role: 'assistant', content: 'pi reply', runStatus: 'succeeded' });

    const result = persistCapturedAgentSession(db, {
      conversationId: 'conv-1',
      agentId: 'pi',
      sessionId: '/tmp/current.jsonl',
      stablePromptHash: 'hash-1',
      model: null,
      cwd: '/work/proj',
      lastMessageId: 'asst-1',
    });
    expect(result).toBe('stored');

    const ctx = resolveAgentResumeContext(db, {
      conversationId: 'conv-1',
      agentId: 'pi',
      currentModel: null,
      currentCwd: '/work/proj',
    });
    expect(ctx.isResuming).toBe(true);
    expect(ctx.resumeSessionId).toBe('/tmp/current.jsonl');
    expect(ctx.invalidationReason).toBeNull();
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
    // The structured result event arrives on stdout (the stream-json channel).
    expect(isClaudeResumeFailure('', rewordedResult)).toBe(true);
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
    expect(isClaudeResumeFailure('', inTurnApiError)).toBe(false);

    const success = JSON.stringify({
      type: 'result',
      subtype: 'success',
      duration_ms: 4200,
      duration_api_ms: 4000,
      is_error: false,
      num_turns: 2,
      session_id: 'live-session',
    });
    expect(isClaudeResumeFailure('', success)).toBe(false);
  });
});

describe('isCodexResumeFailure', () => {
  it('matches the codex "no rollout found" resume error', () => {
    expect(
      isCodexResumeFailure(
        'Error: thread/resume: thread/resume failed: no rollout found for thread id 019eef4f-7409-7c82-bebe-30504eed3959',
      ),
    ).toBe(true);
  });

  it('matches the generic thread/resume-failed signature', () => {
    expect(isCodexResumeFailure('thread/resume failed: something else')).toBe(true);
  });

  it('ignores unrelated codex errors and empty input', () => {
    expect(isCodexResumeFailure('stream disconnected before first event')).toBe(false);
    expect(isCodexResumeFailure('rate limit exceeded')).toBe(false);
    expect(isCodexResumeFailure('')).toBe(false);
  });
});

describe('isOpencodeResumeFailure', () => {
  it('matches the OpenCode "Session not found" resume error', () => {
    expect(isOpencodeResumeFailure('Error: Session not found')).toBe(true);
    expect(
      isOpencodeResumeFailure('{"name":"NotFoundError","data":{"message":"Session not found: ses_x"}}'),
    ).toBe(true);
  });

  it('ignores unrelated OpenCode errors and empty input', () => {
    expect(isOpencodeResumeFailure('OpenCode auth failed: login required')).toBe(false);
    expect(isOpencodeResumeFailure('rate limit exceeded')).toBe(false);
    expect(isOpencodeResumeFailure('')).toBe(false);
  });
});

describe('isAmrResumeFailure', () => {
  it('matches vela\'s structured resume_failed ACP error on stdout', () => {
    expect(
      isAmrResumeFailure('{"jsonrpc":"2.0","id":4,"error":{"code":-32600,"message":"the resumed session could not be loaded","data":{"kind":"resume_failed","phase":"session_load","retryable":true}}}'),
    ).toBe(true);
  });

  it('does not match a bare mention of resume_failed in assistant prose', () => {
    expect(isAmrResumeFailure('The build step logged resume_failed as a warning.')).toBe(false);
    expect(isAmrResumeFailure('')).toBe(false);
  });
});

describe('isAgentResumeFailure dispatch', () => {
  it('routes amr to the resume_failed structured detector on stdout', () => {
    // AMR's signal arrives on stdout (the ACP JSON-RPC channel), not stderr.
    expect(
      isAgentResumeFailure('amr', '', '{"error":{"data":{"kind":"resume_failed"}}}'),
    ).toBe(true);
    expect(
      isAgentResumeFailure('amr', '{"error":{"data":{"kind":"resume_failed"}}}', ''),
    ).toBe(false);
  });

  it('routes codex to the rollout-not-found detector', () => {
    expect(
      isAgentResumeFailure('codex', 'no rollout found for thread id abc'),
    ).toBe(true);
    // A Claude-style signature must NOT count as a codex resume failure.
    expect(
      isAgentResumeFailure('codex', 'No conversation found with session ID: abc'),
    ).toBe(false);
  });

  it('routes opencode to the session-not-found detector (on stderr only)', () => {
    // The CLI prints the miss to stderr (2nd positional is stdout).
    expect(isAgentResumeFailure('opencode', 'Error: Session not found', '')).toBe(true);
    // codex prose is not an OpenCode resume failure.
    expect(
      isAgentResumeFailure('opencode', 'no rollout found for thread id abc'),
    ).toBe(false);
  });

  it('does NOT treat a generic phrase in successful assistant stdout as a resume miss (#4629 nettee)', () => {
    // A turn that SUCCEEDS but whose model output literally says "session not
    // found" must not be failed + have its session cleared — the phrase is only
    // a resume miss when it comes from the CLI's stderr failure channel.
    expect(
      isAgentResumeFailure('opencode', '', 'Sure — your previous session was not found in the list, here it is...'),
    ).toBe(false);
    expect(
      isAgentResumeFailure('codex', '', 'The logs mention "no rollout found for thread id" as an example.'),
    ).toBe(false);
  });

  it('routes claude (and unknown resume-capable agents) to the Claude detector', () => {
    expect(
      isAgentResumeFailure('claude', 'No conversation found with session ID: abc'),
    ).toBe(true);
    // codex prose is not a Claude resume failure.
    expect(
      isAgentResumeFailure('claude', 'no rollout found for thread id abc'),
    ).toBe(false);
  });

  it('never reports a failure for empty output', () => {
    expect(isAgentResumeFailure('codex', '')).toBe(false);
    expect(isAgentResumeFailure('claude', '')).toBe(false);
  });
});
