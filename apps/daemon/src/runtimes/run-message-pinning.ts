export interface RunMessagePinningDb {
  prepare(sql: string): {
    get(...parameters: unknown[]): unknown;
    run(...parameters: unknown[]): unknown;
  };
}

export interface RunToPinAssistantMessage {
  id: string;
  conversationId?: string | null;
  assistantMessageId?: string | null;
  status: string;
  createdAt: number;
  agentId?: string | null;
}

export interface PinnedAssistantMessage {
  id: string;
  role: 'assistant';
  content: string;
  agentId?: string | undefined;
  events: [];
  runId: string;
  runStatus: string;
  startedAt: number;
}

export function pinAssistantMessageOnRunCreate(
  db: RunMessagePinningDb,
  run: RunToPinAssistantMessage,
  upsertMessage: (db: RunMessagePinningDb, conversationId: string, message: PinnedAssistantMessage) => void,
): void {
  if (!run.conversationId || !run.assistantMessageId) return;
  const existing = db
    .prepare(`SELECT id FROM messages WHERE id = ?`)
    .get(run.assistantMessageId);
  if (existing) {
    db.prepare(
      `UPDATE messages
          SET run_id = ?,
              run_status = CASE
                WHEN run_status IN ('succeeded', 'failed', 'canceled') THEN run_status
                ELSE ?
              END,
              started_at = COALESCE(started_at, ?)
        WHERE id = ?`,
    ).run(run.id, run.status, run.createdAt, run.assistantMessageId);
    return;
  }
  upsertMessage(db, run.conversationId, {
    id: run.assistantMessageId,
    role: 'assistant',
    content: '',
    agentId: run.agentId ?? undefined,
    events: [],
    runId: run.id,
    runStatus: run.status,
    startedAt: run.createdAt,
  });
}
