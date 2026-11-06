/**
 * Tests for POST /api/projects/:projectId/critique/:runId/interrupt
 *
 * Each test mounts the handler on a fresh express mini-app with an in-memory
 * SQLite database and a real RunRegistry so the full handler logic is exercised
 * without starting the full daemon server.
 *
 * @see specs/current/critique-theater.md § interrupt endpoint (Task 6.1)
 */
import http from 'node:http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import {
  getCritiqueRun,
  insertCritiqueRun,
  migrateCritique,
  type CritiqueRunStatus,
} from '../src/critique/persistence.js';
import { createRunRegistry } from '../src/critique/run-registry.js';
import { handleCritiqueInterrupt } from '../src/critique/interrupt-handler.js';

// ---------------------------------------------------------------------------
// Test infrastructure
// ---------------------------------------------------------------------------

function freshDb(): Database.Database {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE conversations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'Project 1', 0, 0);
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p2', 'Project 2', 0, 0);
  `);
  migrateCritique(db);
  return db;
}

function startMiniServer(
  db: Database.Database,
  registry: ReturnType<typeof createRunRegistry>,
): Promise<{ baseUrl: string; server: http.Server }> {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/projects/:projectId/critique/:runId/interrupt',
    handleCritiqueInterrupt(db, registry),
  );
  return new Promise((resolve, reject) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr !== 'object') {
        reject(new Error('could not bind'));
        return;
      }
      resolve({ baseUrl: `http://127.0.0.1:${addr.port}`, server });
    });
    server.on('error', reject);
  });
}

async function post(url: string, body?: unknown): Promise<{ status: number; json: unknown }> {
  const init: RequestInit =
    body !== undefined
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : { method: 'POST' };
  const res = await fetch(url, init);
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/projects/:projectId/critique/:runId/interrupt', () => {
  let db: Database.Database;
  let registry: ReturnType<typeof createRunRegistry>;
  let baseUrl: string;
  let server: http.Server;

  beforeEach(async () => {
    db = freshDb();
    registry = createRunRegistry();
    ({ baseUrl, server } = await startMiniServer(db, registry));
  });

  afterEach(() => {
    db.close();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ---- 202: happy path -------------------------------------------------------

  it('returns 202 and fires the AbortController for a registered running run', async () => {
    const abort = new AbortController();
    insertCritiqueRun(db, {
      id: 'crun_aaa',
      projectId: 'p1',
      status: 'running',
      protocolVersion: 1,
    });
    registry.register({ runId: 'crun_aaa', projectId: 'p1', abort, startedAt: Date.now() });

    const { status, json } = await post(`${baseUrl}/api/projects/p1/critique/crun_aaa/interrupt`);

    expect(status).toBe(202);
    expect(json).toMatchObject({ runId: 'crun_aaa', accepted: true, prevStatus: 'running' });
    expect(abort.signal.aborted).toBe(true);
  });

  it('aborts with reason "user_requested"', async () => {
    const abort = new AbortController();
    insertCritiqueRun(db, {
      id: 'crun_bbb',
      projectId: 'p1',
      status: 'running',
      protocolVersion: 1,
    });
    registry.register({ runId: 'crun_bbb', projectId: 'p1', abort, startedAt: Date.now() });

    await post(`${baseUrl}/api/projects/p1/critique/crun_bbb/interrupt`);

    expect(abort.signal.reason).toBe('user_requested');
  });

  // ---- 404: unknown run ------------------------------------------------------

  it('returns 404 when runId does not exist in the DB', async () => {
    const { status } = await post(`${baseUrl}/api/projects/p1/critique/ghost/interrupt`);
    expect(status).toBe(404);
  });

  it('returns 404 when runId exists but belongs to a different project', async () => {
    insertCritiqueRun(db, {
      id: 'crun_ccc',
      projectId: 'p2',
      status: 'running',
      protocolVersion: 1,
    });

    const { status } = await post(`${baseUrl}/api/projects/p1/critique/crun_ccc/interrupt`);
    expect(status).toBe(404);
  });

  // ---- 202 + recovered: stale running row, no live handle ------------------

  it('marks the row interrupted as a recovery path when no live handle is registered', async () => {
    // mrcfps round-2: after a daemon restart but before reconcileStaleRuns
    // sees the row old enough, the DB still says 'running' and the
    // in-process registry has no AbortController. Without recovery the
    // endpoint would return 202 accepted but no child is signaled and no
    // critique.interrupted event fires; the row would stay 'running' until
    // reconcileStaleRuns eventually catches it. Recovery path: mark the row
    // 'interrupted' directly with recoveryReason='no_live_handle'.
    insertCritiqueRun(db, {
      id: 'crun_no_handle',
      projectId: 'p1',
      status: 'running',
      protocolVersion: 1,
    });
    // No registry.register call. The row exists in DB but has no live
    // handle in the registry.

    const { status, json } = await post(
      `${baseUrl}/api/projects/p1/critique/crun_no_handle/interrupt`,
    );

    expect(status).toBe(202);
    expect(json).toMatchObject({
      runId: 'crun_no_handle',
      accepted: true,
      prevStatus: 'running',
      recovered: true,
    });
    expect((json as Record<string, unknown>)['recoveryFailed']).toBeUndefined();

    // Most important post-condition: the row is now terminal so it does
    // not sit in 'running' forever and a subsequent rerun is not blocked.
    const row = getCritiqueRun(db, 'crun_no_handle');
    expect(row?.status).toBe('interrupted');
  });

  it('does not abort a same-runId registry handle from a different project (cross-project leak guard)', async () => {
    // A request to interrupt project p1's runId must NOT find or abort a
    // registry handle from project p2 even if the runIds collide. The
    // registry is keyed by (projectId, runId), so this is enforced at the
    // registry layer in addition to the handler's DB-row projectId check.
    const sharedRunId = 'crun_shared_id';
    const p2Abort = new AbortController();
    insertCritiqueRun(db, {
      id: sharedRunId,
      projectId: 'p2',
      status: 'running',
      protocolVersion: 1,
    });
    registry.register({
      runId: sharedRunId,
      projectId: 'p2',
      abort: p2Abort,
      startedAt: Date.now(),
    });

    // Request to p1 for that same runId: must 404 and must NOT abort p2's signal.
    const { status } = await post(
      `${baseUrl}/api/projects/p1/critique/${sharedRunId}/interrupt`,
    );
    expect(status).toBe(404);
    expect(p2Abort.signal.aborted).toBe(false);
  });

  // ---- 409: terminal status --------------------------------------------------

  // Terminal statuses where the run reached its real outcome on its own and
  // an interrupt is no longer meaningful: must return 409. Note that
  // 'interrupted' is intentionally excluded here and handled by the
  // idempotency tests below.
  const TERMINAL_STATUSES: CritiqueRunStatus[] = [
    'shipped',
    'below_threshold',
    'timed_out',
    'degraded',
    'failed',
    'legacy',
  ];

  for (const terminalStatus of TERMINAL_STATUSES) {
    it(`returns 409 for run already in status "${terminalStatus}"`, async () => {
      insertCritiqueRun(db, {
        id: `crun_t_${terminalStatus}`,
        projectId: 'p1',
        status: terminalStatus,
        protocolVersion: 1,
      });

      const { status, json } = await post(
        `${baseUrl}/api/projects/p1/critique/crun_t_${terminalStatus}/interrupt`,
      );

      expect(status).toBe(409);
      const err = (json as Record<string, unknown>)['error'] as Record<string, unknown>;
      expect(err['currentStatus']).toBe(terminalStatus);
    });
  }

  // ---- 202: idempotent retry on already-interrupted run --------------------

  it('returns 202 (not 409) when the run is already in status "interrupted"', async () => {
    // Idempotency contract: a client that lost the first interrupt response
    // and retries should observe the same accepted outcome rather than a
    // 409 conflict. The interrupt has already done its job; the retry is a
    // no-op against a row whose terminal state was reached *because of*
    // interrupt itself.
    insertCritiqueRun(db, {
      id: 'crun_interrupted_retry',
      projectId: 'p1',
      status: 'interrupted',
      protocolVersion: 1,
    });

    const { status, json } = await post(
      `${baseUrl}/api/projects/p1/critique/crun_interrupted_retry/interrupt`,
    );

    expect(status).toBe(202);
    expect(json).toMatchObject({
      runId: 'crun_interrupted_retry',
      accepted: true,
      prevStatus: 'interrupted',
    });
  });

  it('idempotent retry does not re-fire a registry abort even if a stale handle is still registered', async () => {
    // Defense in depth: if the registry handle was somehow not cleaned up
    // after the first interrupt drove the row terminal, a retry must not
    // double-abort or otherwise invoke registry side effects.
    const abort = new AbortController();
    insertCritiqueRun(db, {
      id: 'crun_interrupted_stale',
      projectId: 'p1',
      status: 'interrupted',
      protocolVersion: 1,
    });
    registry.register({
      runId: 'crun_interrupted_stale',
      projectId: 'p1',
      abort,
      startedAt: Date.now(),
    });

    await post(
      `${baseUrl}/api/projects/p1/critique/crun_interrupted_stale/interrupt`,
    );

    expect(abort.signal.aborted).toBe(false);
  });

  // ---- 400: bad params -------------------------------------------------------

  it('returns 400 when projectId param is missing (route mismatch becomes 404 at express)', async () => {
    // The route /api/projects//critique/crun_x/interrupt won't match at all
    // so express 404s; we verify the handler itself returns 400 for empty strings
    // by calling an adjacent unmatched path; the real validation is covered by
    // the handler unit: empty projectId after trim() returns 400.
    // Test via a direct handler invocation to cover the guard.
    const mockReq = {
      params: { projectId: '', runId: 'crun_x' },
      body: {},
    } as unknown as import('express').Request;
    let capturedStatus = 0;
    let capturedBody: unknown = null;
    const mockRes = {
      status(s: number) { capturedStatus = s; return mockRes; },
      json(b: unknown) { capturedBody = b; return mockRes; },
    } as unknown as import('express').Response;

    handleCritiqueInterrupt(db, registry)(mockReq, mockRes);

    expect(capturedStatus).toBe(400);
    expect((capturedBody as Record<string, unknown>)['error']).toBeTruthy();
  });

  it('returns 400 when runId param is empty string', () => {
    const mockReq = {
      params: { projectId: 'p1', runId: '   ' },
      body: {},
    } as unknown as import('express').Request;
    let capturedStatus = 0;
    const mockRes = {
      status(s: number) { capturedStatus = s; return mockRes; },
      json() { return mockRes; },
    } as unknown as import('express').Response;

    handleCritiqueInterrupt(db, registry)(mockReq, mockRes);

    expect(capturedStatus).toBe(400);
  });

  // ---- no unhandled throws ---------------------------------------------------

  it('does not throw to the framework error handler on any valid input path', async () => {
    // Interrupt a non-existent run; handler should return 404 cleanly.
    const { status } = await post(`${baseUrl}/api/projects/p1/critique/no-such-run/interrupt`);
    expect(status).toBe(404);
  });
});
