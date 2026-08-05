import type { SkillPluginCandidate } from '@open-design/contracts';

export interface SkillCandidateMessageDb {
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    run(...parameters: unknown[]): unknown;
  };
}

export interface RunForSkillCandidateMessage {
  id: string;
  conversationId: string;
  assistantMessageId?: string | null;
  agentId?: string | null;
}

interface SkillCandidateAssistantMessage {
  id: string;
  role: 'assistant';
  content: string;
  agentId?: string | undefined;
  events: Array<{
    kind: 'plugin_candidate';
    candidateId: string;
    title: string;
    description: string;
    confidence: number;
    draftPath: string | null;
  }>;
  createdAt: number;
  endedAt: number;
}

export interface SkillCandidateMessageDependencies {
  upsertMessage: (
    db: SkillCandidateMessageDb,
    conversationId: string,
    message: SkillCandidateAssistantMessage,
  ) => void;
  createMessageId: () => string;
  now: () => number;
}

type PositionRow = { position?: unknown } | undefined;

export function upsertSkillPluginCandidateAssistantMessage(
  db: SkillCandidateMessageDb,
  run: RunForSkillCandidateMessage,
  candidate: SkillPluginCandidate,
  dependencies: SkillCandidateMessageDependencies,
): string | null {
  const currentMessagePosition = run.assistantMessageId
    ? (db.prepare(`SELECT position FROM messages WHERE id = ?`).get(run.assistantMessageId) as PositionRow)?.position ?? null
    : null;
  const existingMessagePosition = candidate.assistantMessageId
    ? (db.prepare(`SELECT position FROM messages WHERE id = ?`).get(candidate.assistantMessageId) as PositionRow)?.position ?? null
    : null;
  if (
    typeof currentMessagePosition === 'number' &&
    typeof existingMessagePosition === 'number' &&
    existingMessagePosition > currentMessagePosition
  ) {
    return null;
  }

  const canReuseExistingMessage = Boolean(
    candidate.assistantMessageId &&
    candidate.assistantMessageId !== run.assistantMessageId &&
    typeof existingMessagePosition === 'number',
  );
  const reusableMessageId = canReuseExistingMessage ? candidate.assistantMessageId : null;
  const messageId = reusableMessageId ?? dependencies.createMessageId();
  const shouldMoveReusedMessage =
    canReuseExistingMessage &&
    typeof currentMessagePosition === 'number' &&
    typeof existingMessagePosition === 'number' &&
    existingMessagePosition <= currentMessagePosition;

  if (
    candidate.assistantMessageId &&
    candidate.assistantMessageId !== messageId &&
    candidate.assistantMessageId !== run.assistantMessageId
  ) {
    db.prepare(`DELETE FROM messages WHERE id = ?`).run(candidate.assistantMessageId);
  }

  const now = dependencies.now();
  dependencies.upsertMessage(db, run.conversationId, {
    id: messageId,
    role: 'assistant',
    content: `Open Design found reusable skill material that can become a plugin: ${candidate.title}`,
    agentId: run.agentId ?? undefined,
    events: [{
      kind: 'plugin_candidate',
      candidateId: candidate.id,
      title: candidate.title,
      description: candidate.description,
      confidence: candidate.confidence,
      draftPath: candidate.draftPath ?? null,
    }],
    createdAt: now,
    endedAt: now,
  });

  if (shouldMoveReusedMessage) {
    const max = (db
      .prepare(`SELECT COALESCE(MAX(position), -1) AS m FROM messages WHERE conversation_id = ?`)
      .get(run.conversationId) as { m?: unknown } | undefined)?.m ?? -1;
    db.prepare(`UPDATE messages SET position = ? WHERE id = ?`).run(Number(max) + 1, messageId);
  }
  db.prepare(
    `UPDATE skill_plugin_candidates
        SET assistant_message_id = ?, updated_at = ?
      WHERE id = ?`,
  ).run(messageId, now, candidate.id);
  return messageId;
}
