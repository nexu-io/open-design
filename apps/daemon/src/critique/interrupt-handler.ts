import type { Request, Response } from 'express';
import type Database from 'better-sqlite3';
import {
  getCritiqueRun,
  markRunInterruptedRecovery,
} from './persistence.js';
import type { RunRegistry } from './run-registry.js';

/** HTTP status codes used by the interrupt endpoint. */
const HTTP_BAD_REQUEST = 400;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_ACCEPTED = 202;

/**
 * POST /api/projects/:projectId/critique/:runId/interrupt
 *
 * Validates the run exists and belongs to the URL project, then signals the
 * registered AbortController so the orchestrator can flush best-so-far state
 * and emit critique.interrupted.
 *
 * Idempotency: if the row is already 'interrupted', the endpoint returns 202
 * with prevStatus='interrupted' rather than 409, so a client that lost the
 * first response and retries does not see the run flip from 202 to a hard
 * conflict. Other terminal statuses (shipped, failed, timed_out, degraded,
 * below_threshold, legacy) still return 409 because the run reached its real
 * terminal state on its own and an interrupt is no longer meaningful.
 *
 * @see specs/current/critique-theater.md § interrupt endpoint (Task 6.1)
 */
export function handleCritiqueInterrupt(
  db: Database.Database,
  registry: RunRegistry,
): (req: Request, res: Response) => void {
  return function critiqueInterruptHandler(req: Request, res: Response): void {
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

    // Cross-project leak guard: a request to interrupt project p1's runId
    // must NOT find a row that actually belongs to project p2. Returning 404
    // (not 403) avoids leaking the existence of other projects' runs.
    if (row === null || row.projectId !== projectId) {
      res
        .status(HTTP_NOT_FOUND)
        .json({ error: { code: 'NOT_FOUND', message: 'critique run not found' } });
      return;
    }

    // row.status is already CritiquePersistedStatus (the contracts type that
    // admits 'running' alongside terminal values), so we can compare without
    // the inline widen this handler used to carry.
    const liveStatus = row.status;

    if (liveStatus === 'interrupted') {
      // Idempotent retry path. The original interrupt already drove the run
      // into the terminal 'interrupted' state; a duplicate request from a
      // retrying client should observe the same accepted outcome rather than
      // a 409.
      res.status(HTTP_ACCEPTED).json({
        runId,
        accepted: true,
        prevStatus: 'interrupted',
      });
      return;
    }

    if (liveStatus !== 'running') {
      res
        .status(HTTP_CONFLICT)
        .json({
          error: {
            code: 'CONFLICT',
            message: `run is already in terminal status: ${row.status}`,
            currentStatus: row.status,
          },
        });
      return;
    }

    // Project-keyed registry call: a request to interrupt project p1's runId
    // cannot match a registry handle from project p2 even if a runId
    // collision somehow occurred.
    const aborted = registry.interrupt(projectId, runId, 'user_requested');

    if (!aborted) {
      // The DB row says 'running' but the in-process registry has no live
      // AbortController for it. This happens after a daemon restart, in
      // the window before reconcileStaleRuns considers the row old enough
      // to flip to 'interrupted' on its own. Without this branch the
      // endpoint would lie: 202 accepted, but no child is signaled, no
      // critique.interrupted event is emitted, and the row stays
      // 'running' until reconcileStaleRuns finally catches it.
      //
      // Recovery path: mark the row 'interrupted' directly with
      // recoveryReason='no_live_handle' (mirroring how reconcileStaleRuns
      // writes 'daemon_restart'), so the row's terminal state matches
      // what the user asked for and the response carries the recovered
      // flag for clients that want to distinguish the two paths.
      const recovered = markRunInterruptedRecovery(db, runId, 'no_live_handle');
      res.status(HTTP_ACCEPTED).json({
        runId,
        accepted: true,
        prevStatus: 'running',
        recovered: true,
        ...(recovered ? {} : { recoveryFailed: true }),
      });
      return;
    }

    res.status(HTTP_ACCEPTED).json({
      runId,
      accepted: true,
      prevStatus: 'running',
    });
  };
}
