import { createHash, randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { getAgentSessionRecord } from './db.js';

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

// Signatures Claude Code prints to stderr when a `--resume <id>` target no
// longer exists on disk (session pruned, repo moved machines, ~/.claude
// cleared). VERIFY against the installed CLI during implementation and add
// the exact observed string to a mocks/ fixture — these patterns are the
// planning-time best guess, intentionally permissive.
const CLAUDE_RESUME_FAILURE_PATTERNS: RegExp[] = [
  /no conversation found with session id/i,
  /no session found/i,
  /session .* not found/i,
];

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
  return CLAUDE_RESUME_FAILURE_PATTERNS.some((re) => re.test(text));
}
