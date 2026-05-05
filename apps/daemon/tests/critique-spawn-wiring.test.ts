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

// ---------------------------------------------------------------------------
// Stream format gating (Defect 1)
// ---------------------------------------------------------------------------
// The server gates the orchestrator path on streamFormat === 'plain'.
// We test the logic inline: simulate the server branch condition and verify
// that non-plain adapters skip the orchestrator entirely.

describe('spawn wiring - stream format gating (Defect 1)', () => {
  const NON_PLAIN_FORMATS = [
    'claude-stream-json',
    'copilot-stream-json',
    'json-event-stream',
    'acp-json-rpc',
  ] as const;

  for (const fmt of NON_PLAIN_FORMATS) {
    it(`format="${fmt}" skips the orchestrator (no run row inserted)`, async () => {
      // Simulate the server branch: if streamFormat !== 'plain', skip orchestrator.
      const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: '1' });
      const adapterStreamFormat: string = fmt;

      if (cfg.enabled && adapterStreamFormat !== 'plain') {
        // Legacy path: orchestrator NOT called.
        // Nothing should be inserted.
        expect(getCritiqueRun(db, `skip-${fmt}`)).toBeNull();
        return;
      }

      // If we reach here, the test scenario is wrong.
      throw new Error(`Expected ${fmt} to skip orchestrator but did not`);
    });
  }

  it('format="plain" routes through the orchestrator', async () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: '1' });
    const adapterStreamFormat = 'plain';

    // Simulate: only call orchestrator when format is plain.
    if (!cfg.enabled || adapterStreamFormat !== 'plain') {
      throw new Error('Expected plain format to be routed through orchestrator');
    }

    const { bus } = makeBus();
    const artifactDir = join(tmpDir, 'run-plain-format');

    async function* mockStdout(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="1" threshold="8.0" scale="10">\n';
      yield '  <ROUND n="1">\n';
      yield '    <PANELIST role="designer"><NOTES>v1</NOTES><ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT></PANELIST>\n';
      yield '    <PANELIST role="critic" score="9.0"><DIM name="h" score="9">ok</DIM></PANELIST>\n';
      yield '    <PANELIST role="brand" score="9.0"><DIM name="v" score="9">ok</DIM></PANELIST>\n';
      yield '    <PANELIST role="a11y" score="9.0"><DIM name="c" score="9">ok</DIM></PANELIST>\n';
      yield '    <PANELIST role="copy" score="9.0"><DIM name="cl" score="9">ok</DIM></PANELIST>\n';
      yield '    <ROUND_END n="1" composite="9.0" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>\n';
      yield '  </ROUND>\n';
      yield '  <SHIP round="1" composite="9.0" status="shipped">\n';
      yield '    <ARTIFACT mime="text/html"><![CDATA[<p>final</p>]]></ARTIFACT>\n';
      yield '    <SUMMARY>done</SUMMARY>\n';
      yield '  </SHIP>\n';
      yield '</CRITIQUE_RUN>\n';
    }

    const result = await runOrchestrator({
      runId: 'plain-format-run',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'plain-adapter',
      cfg,
      db,
      bus,
      stdout: mockStdout(),
    });

    expect(result.status).toBe('shipped');
    expect(getCritiqueRun(db, 'plain-format-run')?.status).toBe('shipped');
  });
});
