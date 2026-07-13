/**
 * Boot-reconcile tests for Critique Theater (Defect 6).
 *
 * Verifies that reconcileStaleRuns is called on daemon boot (simulated here
 * by calling it directly as the server would) and that it flips old 'running'
 * rows to 'interrupted' with recoveryReason='daemon_restart'.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import {
  migrateCritique,
  insertCritiqueRun,
  getCritiqueRun,
  reconcileStaleRuns,
} from '../src/critique/persistence.js';
import { defaultCritiqueConfig } from '@open-design/contracts/critique';

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
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
  `);
  migrateCritique(db);
  return db;
}

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'od-boot-reconcile-test-'));
  db = freshDb();
});
afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

describe('boot reconcile (Defect 6)', () => {
  it('seeds an old running row then flips it to interrupted on simulated boot', () => {
    const cfg = defaultCritiqueConfig();
    const staleAfterMs = cfg.totalTimeoutMs;

    // Insert a 'running' row whose updated_at is older than staleAfterMs.
    const oldTs = Date.now() - staleAfterMs - 10_000;
    insertCritiqueRun(db, {
      id: 'stale-run-1',
      projectId: 'p1',
      conversationId: null,
      status: 'running',
      protocolVersion: 1,
      createdAt: oldTs,
      updatedAt: oldTs,
    });

    // Simulate what the daemon boot path does after openDatabase.
    const flipped = reconcileStaleRuns(db, { staleAfterMs });
    expect(flipped).toBe(1);

    // The row should now be 'interrupted' with recoveryReason='daemon_restart'.
    const row = getCritiqueRun(db, 'stale-run-1');
    expect(row?.status).toBe('interrupted');
    // rounds_json is accessible via row.rounds; the recoveryReason is an internal
    // field not exposed on CritiqueRunRow. Access the raw value via the DB directly.
    const raw = db
      .prepare(`SELECT rounds_json FROM critique_runs WHERE id = ?`)
      .get('stale-run-1') as { rounds_json: string } | undefined;
    const payload = raw ? (JSON.parse(raw.rounds_json) as { recoveryReason?: string }) : {};
    expect(payload.recoveryReason).toBe('daemon_restart');
  });

  it('does not flip a recently-running row (within staleAfterMs)', () => {
    const cfg = defaultCritiqueConfig();
    const staleAfterMs = cfg.totalTimeoutMs;

    // Insert a 'running' row whose updated_at is recent (not stale).
    const recentTs = Date.now() - 100;
    insertCritiqueRun(db, {
      id: 'fresh-run-1',
      projectId: 'p1',
      conversationId: null,
      status: 'running',
      protocolVersion: 1,
      createdAt: recentTs,
      updatedAt: recentTs,
    });

    const flipped = reconcileStaleRuns(db, { staleAfterMs });
    expect(flipped).toBe(0);

    const row = getCritiqueRun(db, 'fresh-run-1');
    expect(row?.status).toBe('running');
  });

  it('is idempotent: a second call on the same db flips 0 rows', () => {
    const cfg = defaultCritiqueConfig();
    const staleAfterMs = cfg.totalTimeoutMs;

    const oldTs = Date.now() - staleAfterMs - 10_000;
    insertCritiqueRun(db, {
      id: 'stale-run-2',
      projectId: 'p1',
      conversationId: null,
      status: 'running',
      protocolVersion: 1,
      createdAt: oldTs,
      updatedAt: oldTs,
    });

    const first = reconcileStaleRuns(db, { staleAfterMs });
    expect(first).toBe(1);

    // Second call: the row is now 'interrupted', not 'running', so nothing more to flip.
    const second = reconcileStaleRuns(db, { staleAfterMs });
    expect(second).toBe(0);
  });
});
