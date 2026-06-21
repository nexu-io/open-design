import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import {
  clearAgentSession,
  getAgentSessionRecord,
  upsertAgentSession,
} from './db.js';

type SqliteDb = Database.Database;

export interface AgentResumeContext {
  /** Stored CLI session id to resume, or null when starting fresh. */
  resumeSessionId: string | null;
  /** Freshly minted UUID to open a new session with when not resuming. */
  newSessionId: string;
  /** True when a prior session id exists for this (conversation, agent). */
  isResuming: boolean;
  /** Hash of the stable instruction block last sent on this session, or null. */
  storedStablePromptHash: string | null;
}

export type CapturedAgentSessionResult = 'stored' | 'cleared' | 'skipped';

/**
 * Decide whether a resume-capable adapter should continue its stored CLI
 * session or start a new one for this (conversation, agent). Pure read +
 * mint; the caller is responsible for persisting `newSessionId` when it
 * actually spawns a create turn.
 */
export function resolveAgentResumeContext(
  db: SqliteDb,
  input: { conversationId: string; agentId: string },
): AgentResumeContext {
  const record = getAgentSessionRecord(db, input.conversationId, input.agentId);
  const resumeSessionId = record?.sessionId ?? null;
  return {
    resumeSessionId,
    newSessionId: randomUUID(),
    isResuming: resumeSessionId != null,
    storedStablePromptHash: record?.stablePromptHash ?? null,
  };
}

/**
 * Persist a captured upstream session for a successful run.
 *
 * A missing captured session on a successful run means the adapter could not
 * safely identify the child session it just created (for example, ambiguous pi
 * `.jsonl` writes in a shared cwd). Clear the stored row so the next turn does
 * not resume stale history; it will start fresh and seed from the transcript.
 */
export function persistCapturedAgentSession(
  db: SqliteDb,
  input: {
    conversationId: string | null | undefined;
    agentId: string;
    sessionId: string | null;
    stablePromptHash?: string | null;
  },
): CapturedAgentSessionResult {
  if (!input.conversationId) return 'skipped';
  if (input.sessionId) {
    upsertAgentSession(db, {
      conversationId: input.conversationId,
      agentId: input.agentId,
      sessionId: input.sessionId,
      stablePromptHash: input.stablePromptHash ?? null,
    });
    return 'stored';
  }
  clearAgentSession(db, input.conversationId, input.agentId);
  return 'cleared';
}

// Signatures Claude Code prints to stderr when a `--resume <id>` target no
// longer exists on disk (session pruned, repo moved machines, ~/.claude
// cleared). Verified against the installed CLI (v2.1.178): the first pattern
// matches its "No conversation found with session ID: <id>" string. These stay
// as a fast path, but Claude's human-readable prose drifts across builds — when
// it does, none of these match and the stale session id is never cleared, so
// every turn retries the same dead `--resume` (#4275). The structured detector
// below is the version-stable primary; treat these patterns as a complement.
const CLAUDE_RESUME_FAILURE_PATTERNS: RegExp[] = [
  /no conversation found with session id/i,
  /no session found/i,
  /session .* not found/i,
];

/**
 * Version-stable structured signal that a `--resume <id>` turn failed because
 * the target session could not be loaded. Unlike the human-readable prose
 * (which #4275 shows can silently stop matching across Claude builds), the
 * stream-json `result` event shape is stable: a resume whose session can't be
 * loaded fails LOCALLY, before any API call, so the terminal result is
 * `is_error` with zero turns and zero API time. A genuine in-turn failure
 * (overload / network) spends real API time (`duration_api_ms > 0`) and/or
 * completes a turn, so it is deliberately left alone — a transient blip must
 * not drop a still-valid session.
 */
function hasClaudeResumeFailureResultEvent(text: string): boolean {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{') || !trimmed.includes('"result"')) continue;
    let event: {
      type?: unknown;
      is_error?: unknown;
      num_turns?: unknown;
      duration_api_ms?: unknown;
    };
    try {
      event = JSON.parse(trimmed);
    } catch {
      continue;
    }
    if (event.type !== 'result') continue;
    if (
      event.is_error === true
      && Number(event.num_turns) === 0
      && Number(event.duration_api_ms) === 0
    ) {
      return true;
    }
  }
  return false;
}

/** sha256 hex digest of the composed stable instruction block. */
export function hashStableInstructions(stable: string): string {
  return createHash('sha256').update(stable, 'utf8').digest('hex');
}

/**
 * Decide whether a resume-capable spawn must include the stable instruction
 * block (daemon prompt + tool contract + design system / skills / memory).
 * Always include it on a create turn (not resuming) or when the block's hash
 * differs from what was last sent on this session; skip it only on a resumed
 * turn whose stable block is byte-identical to last time (incl. legacy
 * sessions with no stored hash, which compare unequal and so re-send).
 */
export function computeIncludeStable(
  isResuming: boolean,
  storedStableHash: string | null,
  currentStableHash: string,
): boolean {
  return !isResuming || storedStableHash !== currentStableHash;
}

/** True when CLI output indicates a resume target session is missing. */
export function isClaudeResumeFailure(text: string): boolean {
  if (!text) return false;
  if (CLAUDE_RESUME_FAILURE_PATTERNS.some((re) => re.test(text))) return true;
  return hasClaudeResumeFailureResultEvent(text);
}
