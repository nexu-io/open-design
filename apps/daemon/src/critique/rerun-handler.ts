import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import { getCritiqueRun, type CritiqueRoundSummary, type CritiqueRunStatus } from './persistence.js';

/** HTTP status codes used by the rerun endpoint. */
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_OK = 200;

/**
 * Payload returned to clients that asked to rerun a finished critique. The
 * shape is intentionally a thin reference into the original run rather than a
 * full new run row: the daemon does not start the next critique by itself,
 * since the spawn path needs the agent / model / prompt context that lives in
 * the chat layer. The web reducer (Phase 7) and Theater UI (Phase 8) consume
 * this payload to drive a fresh chat send with `priorArtifactPath` attached
 * so the new run can ground its critique against the previous artifact.
 */
export interface CritiqueRerunContext {
  originalRunId: string;
  projectId: string;
  conversationId: string | null;
  /** Path of the original artifact, surfaced as prior-art reference. */
  priorArtifactPath: string | null;
  protocolVersion: number;
  /** Final status the original run terminated in (for UI labeling). */
  originalStatus: CritiqueRunStatus;
  /** Final composite score from the original run, if scored. */
  originalScore: number | null;
  /** Per-round summaries from the original, so UI can show "what we are improving on". */
  originalRounds: CritiqueRoundSummary[];
}

/**
 * POST /api/projects/:projectId/critique/:runId/rerun
 *
 * Resolves the original run and returns the reference payload the web layer
 * needs to spawn a fresh critique with the original artifact attached as
 * prior-art context. The endpoint itself is read-only: it does not mutate the
 * critique_runs table or start a child process. That keeps the request
 * idempotent and safe to retry, and it matches how Phase 6.1 (interrupt)
 * exposes a thin verb on top of state the orchestrator owns.
 *
 * Status semantics:
 *   200 — happy path; body is `CritiqueRerunContext`.
 *   400 — projectId/runId missing in the URL.
 *   404 — original run not found, or belongs to a different project.
 *   409 — original is still 'running'; rerun while in flight is meaningless.
 *
 * @see specs/current/critique-theater.md § rerun endpoint (Task 6.2)
 */
export function handleCritiqueRerun(
  db: Database.Database,
): (req: Request, res: Response) => void {
  return function critiqueRerunHandler(req: Request, res: Response): void {
    const projectId =
      typeof req.params['projectId'] === 'string'
        ? req.params['projectId'].trim()
        : '';
    const runId =
      typeof req.params['runId'] === 'string'
        ? req.params['runId'].trim()
        : '';

    if (!projectId || !runId) {
      res
        .status(HTTP_BAD_REQUEST)
        .json({ error: { code: 'BAD_REQUEST', message: 'projectId and runId are required' } });
      return;
    }

    const row = getCritiqueRun(db, runId);

    // Cross-project leak guard mirrors the interrupt endpoint: a request
    // against project p1 must not reveal that runId actually lives in p2.
    if (row === null || row.projectId !== projectId) {
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'critique run not found' } });
      return;
    }

    // CritiqueRunStatus deliberately omits 'running' from its public union
    // (only terminal states are exposed), but the DB CHECK constraint
    // accepts it for in-flight rows. Widen here to match the runtime
    // value before comparing, mirroring how the interrupt handler does it.
    const liveStatus = row.status as CritiqueRunStatus | 'running';
    if (liveStatus === 'running') {
      // Reruning an in-flight run is meaningless: the original has not
      // produced its final artifact yet, so the prior-art context the new
      // run would attach is not stable. Clients should interrupt first
      // (Task 6.1) and only ask for a rerun once the original is terminal.
      res
        .status(HTTP_CONFLICT)
        .json({
          error: {
            code: 'CONFLICT',
            message: 'cannot rerun a run that is still running; interrupt it first',
            currentStatus: row.status,
          },
        });
      return;
    }

    const payload: CritiqueRerunContext = {
      originalRunId: row.id,
      projectId: row.projectId,
      conversationId: row.conversationId,
      priorArtifactPath: row.artifactPath,
      protocolVersion: row.protocolVersion,
      originalStatus: row.status,
      originalScore: row.score,
      originalRounds: row.rounds,
    };

    res.status(HTTP_OK).json(payload);
  };
}
