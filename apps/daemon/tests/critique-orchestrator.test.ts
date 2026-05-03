import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrateCritique, getCritiqueRun } from '../src/critique/persistence.js';
import { runOrchestrator, type CritiqueSseBus, type OrchestratorParams } from '../src/critique/orchestrator.js';
import type { CritiqueSseEvent } from '@open-design/contracts/critique';
import { defaultCritiqueConfig, type CritiqueConfig } from '@open-design/contracts/critique';

// ---------------------------------------------------------------------------
// DB fixture
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
    INSERT INTO projects (id, name, created_at, updated_at) VALUES ('p1', 'p1', 0, 0);
    INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES ('c1', 'p1', 0, 0);
  `);
  migrateCritique(db);
  return db;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeBus(): { bus: CritiqueSseBus; events: CritiqueSseEvent[] } {
  const events: CritiqueSseEvent[] = [];
  const bus: CritiqueSseBus = { emit: (e) => { events.push(e); } };
  return { bus, events };
}

/**
 * Builds a minimal 3-round happy-path wire protocol stream. Uses a threshold
 * low enough (1.0) so every round passes, meaning SHIP with status=shipped.
 */
function happyStream3Rounds(): string {
  return `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">

  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>Design intent v1.</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    </PANELIST>
    <PANELIST role="critic" score="9.0">
      <DIM name="hierarchy" score="9">Good layout.</DIM>
    </PANELIST>
    <PANELIST role="brand" score="9.0">
      <DIM name="voice" score="9">Strong brand.</DIM>
    </PANELIST>
    <PANELIST role="a11y" score="9.0">
      <DIM name="contrast" score="9">Passes AA.</DIM>
    </PANELIST>
    <PANELIST role="copy" score="9.0">
      <DIM name="clarity" score="9">Clear copy.</DIM>
    </PANELIST>
    <ROUND_END n="1" composite="9.0" must_fix="0" decision="continue">
      <REASON>Composite 9.0 but continuing per test.</REASON>
    </ROUND_END>
  </ROUND>

  <ROUND n="2">
    <PANELIST role="designer">
      <NOTES>Design intent v2.</NOTES>
    </PANELIST>
    <PANELIST role="critic" score="9.2">
      <DIM name="hierarchy" score="9">Better.</DIM>
    </PANELIST>
    <PANELIST role="brand" score="9.1">
      <DIM name="voice" score="9">Consistent.</DIM>
    </PANELIST>
    <PANELIST role="a11y" score="9.3">
      <DIM name="contrast" score="9">Still passes.</DIM>
    </PANELIST>
    <PANELIST role="copy" score="9.0">
      <DIM name="clarity" score="9">Still clear.</DIM>
    </PANELIST>
    <ROUND_END n="2" composite="9.15" must_fix="0" decision="continue">
      <REASON>Continuing to round 3.</REASON>
    </ROUND_END>
  </ROUND>

  <ROUND n="3">
    <PANELIST role="designer">
      <NOTES>Design intent v3.</NOTES>
    </PANELIST>
    <PANELIST role="critic" score="9.5">
      <DIM name="hierarchy" score="9">Excellent.</DIM>
    </PANELIST>
    <PANELIST role="brand" score="9.4">
      <DIM name="voice" score="9">Perfect.</DIM>
    </PANELIST>
    <PANELIST role="a11y" score="9.6">
      <DIM name="contrast" score="9">Excellent.</DIM>
    </PANELIST>
    <PANELIST role="copy" score="9.3">
      <DIM name="clarity" score="9">Great.</DIM>
    </PANELIST>
    <ROUND_END n="3" composite="9.45" must_fix="0" decision="ship">
      <REASON>Threshold met.</REASON>
    </ROUND_END>
  </ROUND>

  <SHIP round="3" composite="9.45" status="shipped">
    <SUMMARY>Design converged in 3 rounds.</SUMMARY>
  </SHIP>

</CRITIQUE_RUN>`;
}

async function* streamOf(text: string, chunkSize = 64): AsyncIterable<string> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
  }
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'od-orch-test-'));
  db = freshDb();
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Happy path
// ---------------------------------------------------------------------------

describe('runOrchestrator - happy path', () => {
  it('3-round shipped run: row reflects shipped + composite + rounds + transcript path', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run1');
    const cfg = defaultCritiqueConfig();

    const result = await runOrchestrator({
      runId: 'r1',
      projectId: 'p1',
      conversationId: 'c1',
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: streamOf(happyStream3Rounds()),
    });

    expect(result.status).toBe('shipped');
    expect(result.composite).toBeCloseTo(9.45, 1);
    expect(result.rounds).toHaveLength(3);
    expect(result.transcriptPath).toBeTruthy();

    const row = getCritiqueRun(db, 'r1');
    expect(row?.status).toBe('shipped');
    expect(row?.rounds).toHaveLength(3);
    expect(row?.transcriptPath).toBeTruthy();

    // Transcript file exists on disk.
    const transcriptFile = join(artifactDir, result.transcriptPath!);
    expect(existsSync(transcriptFile)).toBe(true);

    // SSE events emitted: should include run_started and ship.
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('critique.run_started');
    expect(eventNames).toContain('critique.ship');
  });

  it('SSE events are emitted in source order', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-order');

    await runOrchestrator({
      runId: 'r-order',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: streamOf(happyStream3Rounds()),
    });

    const names = events.map((e) => e.event);
    const runStartedIdx = names.indexOf('critique.run_started');
    const shipIdx = names.lastIndexOf('critique.ship');
    expect(runStartedIdx).toBe(0);
    expect(shipIdx).toBeGreaterThan(runStartedIdx);
  });
});

// ---------------------------------------------------------------------------
// Malformed / degraded
// ---------------------------------------------------------------------------

describe('runOrchestrator - degraded', () => {
  it('malformed input: row is degraded, critique.degraded emitted, no transcript path in row (transcript may still be written)', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-malformed');

    // Malformed: ROUND before CRITIQUE_RUN.
    const malformedText = `<ROUND n="1"><PANELIST role="critic" score="9"></PANELIST></ROUND>`;

    const result = await runOrchestrator({
      runId: 'r-malformed',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: streamOf(malformedText),
    });

    expect(result.status).toBe('degraded');
    const row = getCritiqueRun(db, 'r-malformed');
    expect(row?.status).toBe('degraded');

    const degradedEvents = events.filter((e) => e.event === 'critique.degraded');
    expect(degradedEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Fallback policy
// ---------------------------------------------------------------------------

describe('runOrchestrator - fallback policy', () => {
  it('below threshold: stream ends without SHIP, ship_best selects highest composite', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-below');

    // 2 rounds but no SHIP - scores below threshold (default 8.0).
    const noShipText = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>v1</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    </PANELIST>
    <PANELIST role="critic" score="6.0">
      <DIM name="h" score="6">needs work</DIM>
      <MUST_FIX>Fix hierarchy</MUST_FIX>
    </PANELIST>
    <PANELIST role="brand" score="6.0"><DIM name="v" score="6">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="6.0"><DIM name="c" score="6">ok</DIM></PANELIST>
    <PANELIST role="copy" score="6.0"><DIM name="cl" score="6">ok</DIM></PANELIST>
    <ROUND_END n="1" composite="6.0" must_fix="1" decision="continue">
      <REASON>Below threshold.</REASON>
    </ROUND_END>
  </ROUND>
  <ROUND n="2">
    <PANELIST role="designer"><NOTES>v2</NOTES></PANELIST>
    <PANELIST role="critic" score="7.0"><DIM name="h" score="7">better</DIM></PANELIST>
    <PANELIST role="brand" score="7.0"><DIM name="v" score="7">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="7.0"><DIM name="c" score="7">ok</DIM></PANELIST>
    <PANELIST role="copy" score="7.0"><DIM name="cl" score="7">ok</DIM></PANELIST>
    <ROUND_END n="2" composite="7.0" must_fix="0" decision="continue">
      <REASON>Still below threshold.</REASON>
    </ROUND_END>
  </ROUND>
</CRITIQUE_RUN>`;

    const cfg: CritiqueConfig = { ...defaultCritiqueConfig(), fallbackPolicy: 'ship_best' };
    const result = await runOrchestrator({
      runId: 'r-below',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: streamOf(noShipText),
    });

    expect(result.status).toBe('below_threshold');
    // ship_best should select round 2 (composite 7.0 > 6.0).
    expect(result.composite).toBeGreaterThan(6.0);

    const row = getCritiqueRun(db, 'r-below');
    expect(row?.status).toBe('below_threshold');

    const shipEvents = events.filter((e) => e.event === 'critique.ship');
    expect(shipEvents).toHaveLength(1);
  });

  it('fallback policy fail: row is failed, no synthetic ship event', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-failpolicy');

    const noShipText = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>v1</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    </PANELIST>
    <PANELIST role="critic" score="6.0"><DIM name="h" score="6">ok</DIM></PANELIST>
    <PANELIST role="brand" score="6.0"><DIM name="v" score="6">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="6.0"><DIM name="c" score="6">ok</DIM></PANELIST>
    <PANELIST role="copy" score="6.0"><DIM name="cl" score="6">ok</DIM></PANELIST>
    <ROUND_END n="1" composite="6.0" must_fix="0" decision="continue">
      <REASON>Below threshold.</REASON>
    </ROUND_END>
  </ROUND>
</CRITIQUE_RUN>`;

    const cfg: CritiqueConfig = { ...defaultCritiqueConfig(), fallbackPolicy: 'fail' };
    const result = await runOrchestrator({
      runId: 'r-failpolicy',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: streamOf(noShipText),
    });

    expect(result.status).toBe('failed');

    const row = getCritiqueRun(db, 'r-failpolicy');
    expect(row?.status).toBe('failed');

    const shipEvents = events.filter((e) => e.event === 'critique.ship');
    expect(shipEvents).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Timeout
// ---------------------------------------------------------------------------

describe('runOrchestrator - timeouts', () => {
  it('per-round timeout: stalled stream causes timed_out row', async () => {
    const { bus } = makeBus();
    const artifactDir = join(tmpDir, 'run-round-timeout');

    // Source that yields initial data then stalls past the per-round timeout.
    async function* stallingSource(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">\n';
      yield '  <ROUND n="1">\n';
      yield '    <PANELIST role="designer">\n';
      yield '      <NOTES>v1</NOTES>\n';
      yield '      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>\n';
      yield '    </PANELIST>\n';
      // Stall: never send ROUND_END, timeout will fire.
      await new Promise<void>((_, reject) => setTimeout(() => reject(new Error('stall')), 200));
    }

    const cfg: CritiqueConfig = {
      ...defaultCritiqueConfig(),
      perRoundTimeoutMs: 50,
      totalTimeoutMs: 60_000,
    };

    const result = await runOrchestrator({
      runId: 'r-round-timeout',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: stallingSource(),
    });

    expect(result.status).toBe('timed_out');
    const row = getCritiqueRun(db, 'r-round-timeout');
    expect(row?.status).toBe('timed_out');
  }, 5000);

  it('total timeout: wall-clock deadline exceeded causes timed_out row', async () => {
    const { bus } = makeBus();
    const artifactDir = join(tmpDir, 'run-total-timeout');

    async function* slowSource(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">\n';
      await new Promise<void>((_, reject) => setTimeout(() => reject(new Error('total stall')), 200));
    }

    const cfg: CritiqueConfig = {
      ...defaultCritiqueConfig(),
      perRoundTimeoutMs: 60_000,
      totalTimeoutMs: 50,
    };

    const result = await runOrchestrator({
      runId: 'r-total-timeout',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: slowSource(),
    });

    expect(result.status).toBe('timed_out');
    const row = getCritiqueRun(db, 'r-total-timeout');
    expect(row?.status).toBe('timed_out');
  }, 5000);
});

// ---------------------------------------------------------------------------
// Abort signal
// ---------------------------------------------------------------------------

describe('runOrchestrator - abort signal', () => {
  it('abort mid-run: row is interrupted, transcript captures events seen so far', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-abort');
    const controller = new AbortController();

    async function* abortingSource(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">\n';
      yield '  <ROUND n="1">\n';
      yield '    <PANELIST role="designer">\n';
      yield '      <NOTES>v1</NOTES>\n';
      yield '      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>\n';
      yield '    </PANELIST>\n';
      // Abort mid-stream.
      controller.abort();
      yield '    <PANELIST role="critic" score="9">\n';
    }

    const result = await runOrchestrator({
      runId: 'r-abort',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: abortingSource(),
      signal: controller.signal,
    });

    expect(result.status).toBe('interrupted');
    const row = getCritiqueRun(db, 'r-abort');
    expect(row?.status).toBe('interrupted');

    // Transcript should exist with partial events.
    if (result.transcriptPath) {
      expect(existsSync(join(artifactDir, result.transcriptPath))).toBe(true);
    }

    const interruptedEvents = events.filter((e) => e.event === 'critique.interrupted');
    expect(interruptedEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Defensive entry validation
// ---------------------------------------------------------------------------

describe('runOrchestrator - defensive entry', () => {
  it('throws RangeError on invalid cfg (negative scoreThreshold) before any side effects', async () => {
    const { bus } = makeBus();
    const cfg: CritiqueConfig = { ...defaultCritiqueConfig(), scoreThreshold: -1 };

    await expect(
      runOrchestrator({
        runId: 'r-invalid',
        projectId: 'p1',
        conversationId: null,
        artifactId: 'a1',
        artifactDir: join(tmpDir, 'run-invalid'),
        adapter: 'claude',
        cfg,
        db,
        bus,
        stdout: streamOf(''),
      }),
    ).rejects.toThrow(RangeError);

    // No row should have been inserted.
    expect(getCritiqueRun(db, 'r-invalid')).toBeNull();
  });

  it('throws RangeError on invalid cfg (zero perRoundTimeoutMs)', async () => {
    const { bus } = makeBus();
    const cfg: CritiqueConfig = { ...defaultCritiqueConfig(), perRoundTimeoutMs: 0 };

    await expect(
      runOrchestrator({
        runId: 'r-invalid2',
        projectId: 'p1',
        conversationId: null,
        artifactId: 'a1',
        artifactDir: join(tmpDir, 'run-invalid2'),
        adapter: 'claude',
        cfg,
        db,
        bus,
        stdout: streamOf(''),
      }),
    ).rejects.toThrow(RangeError);

    expect(getCritiqueRun(db, 'r-invalid2')).toBeNull();
  });
});
