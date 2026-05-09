/**
 * Tests for POST /api/projects/:projectId/critique/:runId/rerun
 *
 * Each test mounts the rerun handler on a fresh express mini-app with an
 * in-memory SQLite database so the full handler logic is exercised without
 * starting the full daemon server.
 *
 * @see specs/current/critique-theater.md § rerun endpoint (Task 6.2)
 */
import http from 'node:http';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import {
  insertCritiqueRun,
  migrateCritique,
  type CritiqueRoundSummary,
} from '../src/critique/persistence.js';
import { handleCritiqueRerun } from '../src/critique/rerun-handler.js';

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
): Promise<{ baseUrl: string; server: http.Server }> {
  const app = express();
  app.use(express.json());
  app.post(
    '/api/projects/:projectId/critique/:runId/rerun',
    handleCritiqueRerun(db),
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

async function post(url: string): Promise<{ status: number; json: unknown }> {
  const res = await fetch(url, { method: 'POST' });
  const json: unknown = await res.json().catch(() => null);
  return { status: res.status, json };
}

const SAMPLE_ROUNDS: CritiqueRoundSummary[] = [
  { n: 1, composite: 7.2, mustFix: 3, decision: 'continue' },
  { n: 2, composite: 8.4, mustFix: 0, decision: 'ship' },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/projects/:projectId/critique/:runId/rerun', () => {
  let db: Database.Database;
  let baseUrl: string;
  let server: http.Server;

  beforeEach(async () => {
    db = freshDb();
    ({ baseUrl, server } = await startMiniServer(db));
  });

  afterEach(() => {
    db.close();
    return new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // ---- 200: happy path -----------------------------------------------------

  it('returns 200 with the rerun context for a shipped run', async () => {
    insertCritiqueRun(db, {
      id: 'crun_ok',
      projectId: 'p1',
      conversationId: null,
      artifactPath: 'design/landing.html',
      status: 'shipped',
      score: 8.4,
      rounds: SAMPLE_ROUNDS,
      protocolVersion: 1,
    });

    const { status, json } = await post(`${baseUrl}/api/projects/p1/critique/crun_ok/rerun`);

    expect(status).toBe(200);
    expect(json).toMatchObject({
      originalRunId: 'crun_ok',
      projectId: 'p1',
      conversationId: null,
      priorArtifactPath: 'design/landing.html',
      protocolVersion: 1,
      originalStatus: 'shipped',
      originalScore: 8.4,
      originalRounds: SAMPLE_ROUNDS,
    });
  });

  it('returns the rerun context for a below_threshold terminal run', async () => {
    insertCritiqueRun(db, {
      id: 'crun_low',
      projectId: 'p1',
      artifactPath: 'design/about.html',
      status: 'below_threshold',
      score: 6.1,
      rounds: SAMPLE_ROUNDS.slice(0, 1),
      protocolVersion: 1,
    });

    const { status, json } = await post(`${baseUrl}/api/projects/p1/critique/crun_low/rerun`);

    expect(status).toBe(200);
    expect(json).toMatchObject({
      originalRunId: 'crun_low',
      originalStatus: 'below_threshold',
      originalScore: 6.1,
      priorArtifactPath: 'design/about.html',
    });
  });

  it('does not mutate the original row', async () => {
    insertCritiqueRun(db, {
      id: 'crun_immut',
      projectId: 'p1',
      artifactPath: 'design/x.html',
      status: 'shipped',
      score: 9,
      rounds: SAMPLE_ROUNDS,
      protocolVersion: 1,
    });

    const before = db.prepare('SELECT * FROM critique_runs WHERE id = ?').get('crun_immut');
    await post(`${baseUrl}/api/projects/p1/critique/crun_immut/rerun`);
    const after = db.prepare('SELECT * FROM critique_runs WHERE id = ?').get('crun_immut');

    expect(after).toEqual(before);
  });

  // ---- 404: unknown run ----------------------------------------------------

  it('returns 404 when the run does not exist', async () => {
    const { status, json } = await post(`${baseUrl}/api/projects/p1/critique/ghost/rerun`);
    expect(status).toBe(404);
    expect(json).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns 404 when the run belongs to a different project (cross-project leak guard)', async () => {
    insertCritiqueRun(db, {
      id: 'crun_other',
      projectId: 'p2',
      status: 'shipped',
      score: 9,
      rounds: SAMPLE_ROUNDS,
      protocolVersion: 1,
    });

    const { status } = await post(`${baseUrl}/api/projects/p1/critique/crun_other/rerun`);
    expect(status).toBe(404);
  });

  // ---- 409: still running --------------------------------------------------

  it('returns 409 when the original run is still running', async () => {
    insertCritiqueRun(db, {
      id: 'crun_running',
      projectId: 'p1',
      status: 'running',
      protocolVersion: 1,
    });

    const { status, json } = await post(
      `${baseUrl}/api/projects/p1/critique/crun_running/rerun`,
    );

    expect(status).toBe(409);
    expect(json).toMatchObject({
      error: { code: 'CONFLICT', currentStatus: 'running' },
    });
  });

  // ---- 400: bad input ------------------------------------------------------

  it('returns 400 when runId is whitespace-only', async () => {
    const { status } = await post(`${baseUrl}/api/projects/p1/critique/%20/rerun`);
    expect(status).toBe(400);
  });

  // ---- terminal-state coverage --------------------------------------------

  it('allows rerun from interrupted, timed_out, degraded, failed and legacy states', async () => {
    const cases: Array<['interrupted' | 'timed_out' | 'degraded' | 'failed' | 'legacy']> = [
      ['interrupted'],
      ['timed_out'],
      ['degraded'],
      ['failed'],
      ['legacy'],
    ];
    for (const [state] of cases) {
      const id = `crun_${state}`;
      insertCritiqueRun(db, {
        id,
        projectId: 'p1',
        status: state,
        protocolVersion: 1,
      });
      const { status, json } = await post(`${baseUrl}/api/projects/p1/critique/${id}/rerun`);
      expect(status).toBe(200);
      expect((json as { originalStatus: string }).originalStatus).toBe(state);
    }
  });
});
