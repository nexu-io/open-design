import { randomUUID } from 'node:crypto';

import type Database from 'better-sqlite3';

import { getAgentSession } from './db.js';

type SqliteDb = Database.Database;

export interface AgentResumeContext {
  /** Stored CLI session id to resume, or null when starting fresh. */
  resumeSessionId: string | null;
  /** Freshly minted UUID to open a new session with when not resuming. */
  newSessionId: string;
  /** True when a prior session id exists for this (conversation, agent). */
  isResuming: boolean;
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
  const resumeSessionId = getAgentSession(db, input.conversationId, input.agentId);
  return {
    resumeSessionId,
    newSessionId: randomUUID(),
    isResuming: resumeSessionId != null,
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

/** True when CLI output indicates a resume target session is missing. */
export function isClaudeResumeFailure(text: string): boolean {
  if (!text) return false;
  return CLAUDE_RESUME_FAILURE_PATTERNS.some((re) => re.test(text));
}
