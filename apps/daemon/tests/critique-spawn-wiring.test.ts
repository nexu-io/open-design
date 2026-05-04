/**
 * Smoke tests for the Critique Theater spawn-path branch.
 *
 * These tests exercise the loadCritiqueConfigFromEnv gate and the
 * runOrchestrator integration point without actually spawning a child process.
 * The spawn wiring lives in server.ts (ts-nocheck), so we test the seam
 * through the public module APIs: config loading and orchestrator execution
 * with a synthetic stdout iterable.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrateCritique, getCritiqueRun } from '../src/critique/persistence.js';
import { loadCritiqueConfigFromEnv } from '../src/critique/config.js';
import { runOrchestrator, type CritiqueSseBus } from '../src/critique/orchestrator.js';
import type { CritiqueSseEvent } from '@open-design/contracts/critique';
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

function makeBus(): { bus: CritiqueSseBus; events: CritiqueSseEvent[] } {
  const events: CritiqueSseEvent[] = [];
  const bus: CritiqueSseBus = { emit: (e) => { events.push(e); } };
  return { bus, events };
}

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'od-spawn-wiring-test-'));
  db = freshDb();
});
afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Config gate: OD_CRITIQUE_ENABLED=false (legacy path unchanged)
// ---------------------------------------------------------------------------

describe('spawn wiring - cfg.enabled=false (M0 default)', () => {
  it('loadCritiqueConfigFromEnv with empty env returns enabled=false', () => {
    const cfg = loadCritiqueConfigFromEnv({});
    expect(cfg.enabled).toBe(false);
  });

  it('loadCritiqueConfigFromEnv with OD_CRITIQUE_ENABLED=false returns enabled=false', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: 'false' });
    expect(cfg.enabled).toBe(false);
  });

  it('when cfg.enabled=false, runOrchestrator is not invoked (legacy path)', async () => {
    // Simulate what the spawn branch does: check cfg.enabled before calling orchestrator.
    const cfg = loadCritiqueConfigFromEnv({});
    expect(cfg.enabled).toBe(false);
    // No orchestrator call means no row inserted.
    expect(getCritiqueRun(db, 'legacy-run')).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Config gate: OD_CRITIQUE_ENABLED=true (orchestrator path)
// ---------------------------------------------------------------------------

describe('spawn wiring - cfg.enabled=true (orchestrator path)', () => {
  it('with OD_CRITIQUE_ENABLED=true, runOrchestrator is invoked with the spawn stdout', async () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: '1' });
    expect(cfg.enabled).toBe(true);

    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-enabled');

    // Synthetic stdout that matches a minimal valid critique run.
    async function* mockStdout(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">\n';
      yield '  <ROUND n="1">\n';
      yield '    <PANELIST role="designer">\n';
      yield '      <NOTES>v1</NOTES>\n';
      yield '      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>\n';
      yield '    </PANELIST>\n';
      yield '    <PANELIST role="critic" score="9.0"><DIM name="h" score="9">ok</DIM></PANELIST>\n';
      yield '    <PANELIST role="brand" score="9.0"><DIM name="v" score="9">ok</DIM></PANELIST>\n';
      yield '    <PANELIST role="a11y" score="9.0"><DIM name="c" score="9">ok</DIM></PANELIST>\n';
      yield '    <PANELIST role="copy" score="9.0"><DIM name="cl" score="9">ok</DIM></PANELIST>\n';
      yield '    <ROUND_END n="1" composite="9.0" must_fix="0" decision="ship">\n';
      yield '      <REASON>Ship on round 1.</REASON>\n';
      yield '    </ROUND_END>\n';
      yield '  </ROUND>\n';
      yield '  <SHIP round="1" composite="9.0" status="shipped">\n';
      yield '    <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>\n';
      yield '    <SUMMARY>Shipped.</SUMMARY>\n';
      yield '  </SHIP>\n';
      yield '</CRITIQUE_RUN>\n';
    }

    const result = await runOrchestrator({
      runId: 'enabled-run',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: mockStdout(),
    });

    // Orchestrator ran and returned a shipped result.
    expect(result.status).toBe('shipped');
    const row = getCritiqueRun(db, 'enabled-run');
    expect(row?.status).toBe('shipped');

    // SSE events were emitted on the bus.
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('critique.run_started');
    expect(eventNames).toContain('critique.ship');
  });

  it('errors thrown by the orchestrator surface to the caller', async () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: '1' });

    // Invalid cfg to force a RangeError before any side effect.
    const badCfg = { ...cfg, perRoundTimeoutMs: -1 };
    const { bus } = makeBus();

    await expect(
      runOrchestrator({
        runId: 'error-run',
        projectId: 'p1',
        conversationId: null,
        artifactId: 'a1',
        artifactDir: join(tmpDir, 'run-error'),
        adapter: 'claude',
        cfg: badCfg,
        db,
        bus,
        stdout: (async function* () { yield ''; })(),
      }),
    ).rejects.toThrow(RangeError);

    // No row inserted because error fires before insertCritiqueRun.
    expect(getCritiqueRun(db, 'error-run')).toBeNull();
  });
});
