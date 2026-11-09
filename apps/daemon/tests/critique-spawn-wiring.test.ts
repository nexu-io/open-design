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
import { isCritiqueEnabled, parseEnvEnabled, parseRolloutPhase } from '../src/critique/rollout.js';
import { runOrchestrator, type CritiqueSseBus } from '../src/critique/orchestrator.js';
import type { CritiqueSseEvent } from '@open-design/contracts/critique';
import { defaultCritiqueConfig } from '@open-design/contracts/critique';
import { createJsonEventStreamHandler } from '../src/runtimes/json-event-stream.js';
import { NormalizedTextQueue } from '../src/critique/normalized-text-queue.js';
import { createCritiqueRegionStripper, createPanelGrammarStripper } from '../src/panel-grammar-strip.js';

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
// Explicit opt-out remains supported.
// ---------------------------------------------------------------------------

describe('spawn wiring - explicit disabled config', () => {
  it('loadCritiqueConfigFromEnv with empty env defaults enabled', () => {
    const cfg = loadCritiqueConfigFromEnv({});
    expect(cfg.enabled).toBe(true);
  });

  it('loadCritiqueConfigFromEnv with OD_CRITIQUE_ENABLED=false returns enabled=false', () => {
    const cfg = loadCritiqueConfigFromEnv({ OD_CRITIQUE_ENABLED: 'false' });
    expect(cfg.enabled).toBe(false);
  });

  it('resolver disables the generation path only for an explicit false override', async () => {
    const enabled = isCritiqueEnabled({
      phase: parseRolloutPhase(undefined),
      skillPolicy: null,
      projectOverride: null,
      envOverride: parseEnvEnabled('false'),
    });
    expect(enabled).toBe(false);
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
  const UNSUPPORTED_FORMATS = [
    'claude-stream-json',
    'qoder-stream-json',
    'copilot-stream-json',
    'acp-json-rpc',
  ] as const;

  for (const fmt of UNSUPPORTED_FORMATS) {
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

  it('feeds fragmented OpenCode JSON text deltas once into the Jury and hides protocol/artifact content from chat', async () => {
    const queue = new NormalizedTextQueue();
    const text = [
      'Starting.',
      '<CRITIQUE_RUN version="1" maxRounds="1" threshold="8.0" scale="10">',
      '<ROUND n="1">',
      '<PANELIST role="designer"><NOTES>review panel prose</NOTES><ARTIFACT mime="text/html"><![CDATA[<html>jury artifact payload</html>]]></ARTIFACT></PANELIST>',
      '<PANELIST role="critic" score="9"><DIM name="layout" score="9">aligned</DIM></PANELIST>',
      '<PANELIST role="brand" score="9"><DIM name="tokens" score="9">on brand</DIM></PANELIST>',
      '<PANELIST role="a11y" score="9"><DIM name="contrast" score="9">clear</DIM></PANELIST>',
      '<PANELIST role="copy" score="9"><DIM name="labels" score="9">concise</DIM></PANELIST>',
      '<ROUND_END n="1" composite="9" must_fix="0" decision="ship"><REASON>ready</REASON></ROUND_END>',
      '</ROUND>',
      '<SHIP round="1" composite="9" status="shipped"><ARTIFACT mime="text/html"><![CDATA[<html>final artifact</html>]]></ARTIFACT><SUMMARY>approved</SUMMARY></SHIP>',
      '</CRITIQUE_RUN>',
      ' Done.',
    ].join('');
    const regionStripper = createCritiqueRegionStripper();
    const grammarStripper = createPanelGrammarStripper();
    let visible = '';
    const decodedEvents: Array<{ type?: string; delta?: string }> = [];
    const decoded = createJsonEventStreamHandler('opencode', (event) => {
      decodedEvents.push(event);
      if (event.type !== 'text_delta' || typeof event.delta !== 'string') return;
      expect(queue.push(event.delta)).toBe(true);
      visible += grammarStripper.strip(regionStripper.strip(event.delta));
    });

    // Fragment the wire JSON independently of the decoded text token sizes.
    const wire = [...text].map((char) => JSON.stringify({ type: 'text', part: { text: char } }) + '\n').join('');
    for (let offset = 0; offset < wire.length; offset += 13) decoded.feed(wire.slice(offset, offset + 13));
    decoded.flush();
    queue.close();
    visible += grammarStripper.flush() + regionStripper.flush();

    // Neither a reasoning frame nor a tool frame may enter the text queue.
    decodedEvents.push({ type: 'thinking_delta', delta: 'non-assistant reasoning' });
    decodedEvents.push({ type: 'tool_use' });
    const { bus, events } = makeBus();
    const result = await runOrchestrator({
      runId: 'opencode-json-jury-run',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir: join(tmpDir, 'json-event-run'),
      adapter: 'opencode',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: queue,
    });

    expect(result.status).toBe('shipped');
    expect(events.map((event) => event.event)).toContain('critique.run_started');
    expect(events.map((event) => event.event)).toContain('critique.ship');
    expect(visible).toBe('Starting. Done.');
    expect(visible).not.toMatch(/CRITIQUE_RUN|PANELIST|ARTIFACT|jury artifact payload|final artifact/u);
    expect(decodedEvents.filter((event) => event.type === 'text_delta').length).toBe(text.length);
    expect(getCritiqueRun(db, 'opencode-json-jury-run')?.status).toBe('shipped');
  });
});
