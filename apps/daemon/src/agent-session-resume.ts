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
