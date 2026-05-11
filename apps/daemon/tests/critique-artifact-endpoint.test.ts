/**
 * Tests for GET /api/projects/:projectId/critique/:runId/artifact.
 *
 * Each test mounts the handler on a fresh Express mini-app with an
 * in-memory SQLite database and a real on-disk artifacts root, so the
 * full handler logic (cross-project leak guard, path-traversal guard,
 * missing-file 404, mime/Content-Type response) is exercised without
 * starting the full daemon server.
 *
 * @see specs/current/critique-theater.md § rerun endpoint (Task 6.2)
 */
import http from 'node:http';
import { mkdirSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import express from 'express';
import Database from 'better-sqlite3';
import {
  insertCritiqueRun,
  migrateCritique,
  updateCritiqueRun,
} from '../src/critique/persistence.js';
import { handleCritiqueArtifact } from '../src/critique/artifact-handler.js';

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
  artifactsRoot: string,
): Promise<{ baseUrl: string; server: http.Server }> {
  const app = express();
  app.get(
    '/api/projects/:projectId/critique/:runId/artifact',
    handleCritiqueArtifact(db, { artifactsRoot }),
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

interface FetchResult {
  status: number;
  headers: Headers;
  body: string;
}

async function get(url: string): Promise<FetchResult> {
  const res = await fetch(url);
  const body = await res.text();
  return { status: res.status, headers: res.headers, body };
}

/** Insert a row + place a real artifact file under the artifacts root,
 *  matching what the orchestrator would have written. */
function seedRowWithArtifact(
  db: Database.Database,
  artifactsRoot: string,
  args: {
    runId: string;
    projectId: string;
    body: string;
    extension: 'html' | 'css' | 'svg' | 'bin' | 'json' | 'txt' | 'md';
  },
): { absPath: string } {
  const dir = join(artifactsRoot, args.projectId, args.runId);
  mkdirSync(dir, { recursive: true });
  const absPath = join(dir, `artifact.${args.extension}`);
  writeFileSync(absPath, args.body, 'utf8');
  insertCritiqueRun(db, {
    id: args.runId,
    projectId: args.projectId,
    status: 'shipped',
    score: 9,
    rounds: [{ n: 1, composite: 9, mustFix: 0, decision: 'ship' }],
    artifactPath: absPath,
    protocolVersion: 1,
  });
  return { absPath };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('GET /api/projects/:projectId/critique/:runId/artifact', () => {
  let db: Database.Database;
  let artifactsRoot: string;
  let baseUrl: string;
  let server: http.Server;

  beforeEach(async () => {
    db = freshDb();
    artifactsRoot = mkdtempSync(join(tmpdir(), 'od-artifact-endpoint-'));
    ({ baseUrl, server } = await startMiniServer(db, artifactsRoot));
  });

  afterEach(async () => {
    db.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(artifactsRoot, { recursive: true, force: true });
  });

  // ---- 200: happy path -----------------------------------------------------

  it('streams the body with text/html and the right Content-Length', async () => {
    seedRowWithArtifact(db, artifactsRoot, {
      runId: 'crun_html',
      projectId: 'p1',
      body: '<html><body>final</body></html>',
      extension: 'html',
    });

    const { status, headers, body } = await get(
      `${baseUrl}/api/projects/p1/critique/crun_html/artifact`,
    );

    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe('text/html');
    expect(headers.get('content-length')).toBe('31');
    expect(headers.get('x-content-type-options')).toBe('nosniff');
    expect(headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(body).toBe('<html><body>final</body></html>');
  });

  it('streams an SVG with image/svg+xml and the same CSP that html gets', async () => {
    seedRowWithArtifact(db, artifactsRoot, {
      runId: 'crun_svg',
      projectId: 'p1',
      body: '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
      extension: 'svg',
    });

    const { status, headers } = await get(
      `${baseUrl}/api/projects/p1/critique/crun_svg/artifact`,
    );

    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe('image/svg+xml');
    expect(headers.get('content-security-policy')).toContain("default-src 'none'");
  });

  it('streams an unknown extension as application/octet-stream without a CSP header', async () => {
    seedRowWithArtifact(db, artifactsRoot, {
      runId: 'crun_bin',
      projectId: 'p1',
      body: 'binary-ish',
      extension: 'bin',
    });

    const { status, headers, body } = await get(
      `${baseUrl}/api/projects/p1/critique/crun_bin/artifact`,
    );

    expect(status).toBe(200);
    expect(headers.get('content-type')).toBe('application/octet-stream');
    expect(headers.get('content-security-policy')).toBeNull();
    expect(body).toBe('binary-ish');
  });

  // ---- 404: unknown / cross-project / missing artifact ---------------------

  it('returns 404 when the run does not exist', async () => {
    const { status, body } = await get(
      `${baseUrl}/api/projects/p1/critique/ghost/artifact`,
    );
    expect(status).toBe(404);
    expect(JSON.parse(body)).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('returns 404 when the runId belongs to a different project (cross-project leak guard)', async () => {
    seedRowWithArtifact(db, artifactsRoot, {
      runId: 'crun_other',
      projectId: 'p2',
      body: '<html>p2</html>',
      extension: 'html',
    });

    const { status } = await get(
      `${baseUrl}/api/projects/p1/critique/crun_other/artifact`,
    );
    expect(status).toBe(404);
  });

  it('returns 404 when the row has no artifactPath (still running, or never shipped)', async () => {
    insertCritiqueRun(db, {
      id: 'crun_no_artifact',
      projectId: 'p1',
      status: 'running',
      protocolVersion: 1,
    });

    const { status, body } = await get(
      `${baseUrl}/api/projects/p1/critique/crun_no_artifact/artifact`,
    );
    expect(status).toBe(404);
    expect(JSON.parse(body)).toMatchObject({
      error: { code: 'NOT_FOUND', currentStatus: 'running' },
    });
  });

  it('returns 404 when artifactPath points outside the artifacts root', async () => {
    const outsideDir = mkdtempSync(join(tmpdir(), 'od-artifact-outside-'));
    try {
      const outsidePath = join(outsideDir, 'leaked.html');
      writeFileSync(outsidePath, '<html>leaked</html>', 'utf8');
      insertCritiqueRun(db, {
        id: 'crun_traversal',
        projectId: 'p1',
        status: 'shipped',
        score: 9,
        rounds: [{ n: 1, composite: 9, mustFix: 0, decision: 'ship' }],
        artifactPath: outsidePath,
        protocolVersion: 1,
      });

      const { status } = await get(
        `${baseUrl}/api/projects/p1/critique/crun_traversal/artifact`,
      );
      expect(status).toBe(404);
    } finally {
      await rm(outsideDir, { recursive: true, force: true });
    }
  });

  it('returns 404 when the file on disk has been deleted (row points at a vanished path)', async () => {
    const { absPath } = seedRowWithArtifact(db, artifactsRoot, {
      runId: 'crun_vanished',
      projectId: 'p1',
      body: '<html></html>',
      extension: 'html',
    });
    await rm(absPath);

    const { status } = await get(
      `${baseUrl}/api/projects/p1/critique/crun_vanished/artifact`,
    );
    expect(status).toBe(404);
  });

  it('returns 404 when artifactPath resolves to a symlink (refuses non-regular files)', async function symlinkCase() {
    // Symlinks fail with EPERM on Windows runners that lack the privilege.
    // Skip the assertion there rather than mark the suite flaky.
    const target = join(artifactsRoot, 'target.html');
    writeFileSync(target, '<html>real</html>', 'utf8');
    const linkDir = join(artifactsRoot, 'p1', 'crun_symlink');
    mkdirSync(linkDir, { recursive: true });
    const linkPath = join(linkDir, 'artifact.html');
    try {
      symlinkSync(target, linkPath);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'EPERM') return;
      throw err;
    }
    insertCritiqueRun(db, {
      id: 'crun_symlink',
      projectId: 'p1',
      status: 'shipped',
      score: 9,
      rounds: [{ n: 1, composite: 9, mustFix: 0, decision: 'ship' }],
      artifactPath: linkPath,
      protocolVersion: 1,
    });

    const { status } = await get(
      `${baseUrl}/api/projects/p1/critique/crun_symlink/artifact`,
    );
    expect(status).toBe(404);
  });

  // ---- 400: bad input ------------------------------------------------------

  it('returns 400 when runId is whitespace-only', async () => {
    const { status } = await get(
      `${baseUrl}/api/projects/p1/critique/%20/artifact`,
    );
    expect(status).toBe(400);
  });

  // ---- terminal-state coverage --------------------------------------------

  it('serves the artifact for every terminal status that ever wrote one', async () => {
    const cases: Array<['shipped' | 'below_threshold' | 'interrupted' | 'timed_out', string]> = [
      ['shipped', '<html>shipped</html>'],
      ['below_threshold', '<html>below</html>'],
      ['interrupted', '<html>cut</html>'],
      ['timed_out', '<html>tick</html>'],
    ];
    for (const [state, body] of cases) {
      const id = `crun_${state}`;
      const { absPath } = seedRowWithArtifact(db, artifactsRoot, {
        runId: id,
        projectId: 'p1',
        body,
        extension: 'html',
      });
      // Override status to the case-specific value.
      updateCritiqueRun(db, id, { status: state, artifactPath: absPath });

      const { status, body: served } = await get(
        `${baseUrl}/api/projects/p1/critique/${id}/artifact`,
      );
      expect(status).toBe(200);
      expect(served).toBe(body);
    }
  });
});
