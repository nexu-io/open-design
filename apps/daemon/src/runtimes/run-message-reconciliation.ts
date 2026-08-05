export interface RunMessageReconciliationDb {
  prepare(sql: string): {
    run(...parameters: unknown[]): unknown;
  };
}

export interface RunMessageReconciliationWaiter {
  wait(run: { assistantMessageId?: string | null }): Promise<{ status: string }>;
}

export interface RunWithAssistantMessage {
  assistantMessageId?: string | null;
}

export function reconcileAssistantMessageOnRunEnd(
  db: RunMessageReconciliationDb,
  runs: RunMessageReconciliationWaiter,
  run: RunWithAssistantMessage,
  warn: (...args: unknown[]) => void = console.warn,
): void {
  if (!run.assistantMessageId) return;
  void runs
    .wait(run)
    .then((finalStatus) => {
      db.prepare(
        `UPDATE messages
            SET run_status = ?, ended_at = COALESCE(ended_at, ?)
          WHERE id = ? AND run_status IN ('queued', 'running')`,
      ).run(finalStatus.status, Date.now(), run.assistantMessageId);
    })
    .catch((err: unknown) => {
      warn('[runs] message reconciliation failed', err);
    });
}
