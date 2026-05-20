// SQLite persistence layer for multi-CLI fan-out runs. The in-memory
// run service in `runs.ts` is the source of truth for live state
// (events, child process, SSE subscribers); this module mirrors the
// status snapshot to disk so the Compare tab still works after the
// daemon restarts and the in-memory Map has been cleared by the TTL.
//
// Contract: one row per sibling run, keyed by run id. The group is
// implicit — every row sharing a fanout_group_id is a sibling. No
// separate `fanout_groups` table because the only group-level fields
// we need (brief, createdAt, updatedAt, winnerRunId) are derivable
// from the rows themselves.
//
// Writes are best-effort and non-blocking semantically — a failed
// INSERT must never abort a run. The daemon's runs.ts wraps every
// call here in try/catch and just logs on failure.

import type Database from 'better-sqlite3';

type SqliteDb = Database.Database;

export interface PersistedFanoutRunRow {
  id: string;
  fanoutGroupId: string;
  projectId: string | null;
  conversationId: string | null;
  agentId: string | null;
  status: string;
  brief: string;
  winner: boolean;
  createdAt: number;
  updatedAt: number;
  error: string | null;
  outputText: string | null;
}

export interface FanoutPersistence {
  upsert(run: PersistedFanoutRunRow): void;
  updateStatus(
    id: string,
    status: string,
    updatedAt: number,
    error?: string | null,
    outputText?: string | null,
  ): void;
  setWinner(id: string, fanoutGroupId: string): void;
  /** Pulls up to `limit` groups, newest first. Used at boot and as the
   * fallback when the in-memory Map has been emptied by TTL. */
  listGroups(limit: number): {
    fanoutGroupId: string;
    brief: string;
    createdAt: number;
    updatedAt: number;
    winnerRunId: string | null;
    runs: PersistedFanoutRunRow[];
  }[];
}

export function createFanoutPersistence(db: SqliteDb): FanoutPersistence {
  const upsertStmt = db.prepare(`
    INSERT INTO fanout_runs (
      id, fanout_group_id, project_id, conversation_id, agent_id,
      status, brief, winner, created_at, updated_at, error, output_text
    ) VALUES (
      @id, @fanoutGroupId, @projectId, @conversationId, @agentId,
      @status, @brief, @winner, @createdAt, @updatedAt, @error, @outputText
    )
    ON CONFLICT(id) DO UPDATE SET
      status = excluded.status,
      winner = excluded.winner,
      updated_at = excluded.updated_at,
      error = excluded.error,
      output_text = COALESCE(excluded.output_text, fanout_runs.output_text)
  `);

  const updateStatusStmt = db.prepare(`
    UPDATE fanout_runs
    SET status = @status, updated_at = @updatedAt, error = @error, output_text = @outputText
    WHERE id = @id
  `);

  // Single-select winner: clear every other sibling in the same group,
  // then mark the chosen one. Wrapped in a transaction so a partial
  // failure can't leave two siblings flagged.
  const clearGroupWinnerStmt = db.prepare(`
    UPDATE fanout_runs SET winner = 0 WHERE fanout_group_id = @groupId
  `);
  const setWinnerStmt = db.prepare(`
    UPDATE fanout_runs SET winner = 1, updated_at = @updatedAt WHERE id = @id
  `);

  const listRunsStmt = db.prepare(`
    SELECT id, fanout_group_id, project_id, conversation_id, agent_id,
           status, brief, winner, created_at, updated_at, error, output_text
    FROM fanout_runs
    WHERE fanout_group_id IN (
      SELECT fanout_group_id FROM fanout_runs
      GROUP BY fanout_group_id
      ORDER BY MAX(updated_at) DESC
      LIMIT @limit
    )
    ORDER BY fanout_group_id, created_at ASC
  `);

  return {
    upsert(run) {
      try {
        upsertStmt.run({
          id: run.id,
          fanoutGroupId: run.fanoutGroupId,
          projectId: run.projectId,
          conversationId: run.conversationId,
          agentId: run.agentId,
          status: run.status,
          brief: run.brief,
          winner: run.winner ? 1 : 0,
          createdAt: run.createdAt,
          updatedAt: run.updatedAt,
          error: run.error,
          outputText: run.outputText,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[fanout-persistence] upsert failed', err);
      }
    },
    updateStatus(id, status, updatedAt, error = null, outputText = null) {
      try {
        updateStatusStmt.run({ id, status, updatedAt, error, outputText });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[fanout-persistence] updateStatus failed', err);
      }
    },
    setWinner(id, fanoutGroupId) {
      const tx = db.transaction(() => {
        clearGroupWinnerStmt.run({ groupId: fanoutGroupId });
        setWinnerStmt.run({ id, updatedAt: Date.now() });
      });
      try {
        tx();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[fanout-persistence] setWinner failed', err);
      }
    },
    listGroups(limit) {
      const rows = listRunsStmt.all({ limit }) as Array<{
        id: string;
        fanout_group_id: string;
        project_id: string | null;
        conversation_id: string | null;
        agent_id: string | null;
        status: string;
        brief: string | null;
        winner: number;
        created_at: number;
        updated_at: number;
        error: string | null;
        output_text: string | null;
      }>;
      const byGroup = new Map<string, PersistedFanoutRunRow[]>();
      for (const row of rows) {
        const arr = byGroup.get(row.fanout_group_id) ?? [];
        arr.push({
          id: row.id,
          fanoutGroupId: row.fanout_group_id,
          projectId: row.project_id,
          conversationId: row.conversation_id,
          agentId: row.agent_id,
          status: row.status,
          brief: row.brief ?? '',
          winner: row.winner === 1,
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          error: row.error,
          outputText: row.output_text,
        });
        byGroup.set(row.fanout_group_id, arr);
      }
      return Array.from(byGroup.entries())
        .map(([fanoutGroupId, siblings]) => {
          const sorted = [...siblings].sort((a, b) => a.createdAt - b.createdAt);
          const createdAt = sorted[0]?.createdAt ?? 0;
          const updatedAt = sorted.reduce((acc, r) => Math.max(acc, r.updatedAt), 0);
          const winner = sorted.find((r) => r.winner);
          return {
            fanoutGroupId,
            brief: sorted[0]?.brief ?? '',
            createdAt,
            updatedAt,
            winnerRunId: winner ? winner.id : null,
            runs: sorted,
          };
        })
        .sort((a, b) => b.updatedAt - a.updatedAt);
    },
  };
}
