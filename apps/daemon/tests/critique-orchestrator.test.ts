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
    <ARTIFACT mime="text/html"><![CDATA[<html><body>final</body></html>]]></ARTIFACT>
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

    // Phase 6.2 artifact persistence: the SHIP <ARTIFACT> body lands on
    // disk, the row carries an absolute path to it, and the file contains
    // the exact bytes the agent shipped (CDATA wrapper stripped).
    expect(result.artifactPath).toBeTruthy();
    expect(row?.artifactPath).toBe(result.artifactPath);
    expect(existsSync(result.artifactPath!)).toBe(true);
    expect(result.artifactPath!.endsWith('artifact.html')).toBe(true);
    expect(readFileSync(result.artifactPath!, 'utf8')).toBe('<html><body>final</body></html>');

    // SSE events emitted: should include run_started and ship.
    const eventNames = events.map((e) => e.event);
    expect(eventNames).toContain('critique.run_started');
    expect(eventNames).toContain('critique.ship');

    // SSE ship payload must NOT carry the artifact body or the mime,
    // those travel only through the parser side-channel and the on-disk
    // file. Broadcasting megabytes of HTML to every SSE subscriber would
    // ruin the bus.
    const shipEvent = events.find((e) => e.event === 'critique.ship');
    expect(shipEvent).toBeTruthy();
    const shipData = shipEvent?.data as Record<string, unknown>;
    expect(shipData['body']).toBeUndefined();
    expect(shipData['mime']).toBeUndefined();
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

  // Regression: lefarcen P1 on PR #1085. SSE clients react to
  // critique.ship by fetching the artifact endpoint, so the file must
  // exist on disk AND the row must already have artifactPath populated
  // by the time critique.ship goes out, otherwise a fast client races
  // the writer and gets a 404 against a row that is about to gain its
  // path on the next finalize call.
  it('does not emit critique.ship until the artifact is on disk and the row has artifactPath', async () => {
    const events: CritiqueSseEvent[] = [];
    const observations: Array<{
      artifactPathOnRow: string | null;
      fileExistsOnDisk: boolean;
    }> = [];
    const artifactDir = join(tmpDir, 'run-ordering');
    const bus: CritiqueSseBus = {
      emit: (e) => {
        events.push(e);
        if (e.event === 'critique.ship') {
          // Snapshot the row + filesystem AT THE MOMENT the ship event
          // fires. Any client subscribed to the SSE bus would observe
          // exactly this state when it reacts to the event.
          const row = getCritiqueRun(db, 'r-order-race');
          observations.push({
            artifactPathOnRow: row?.artifactPath ?? null,
            fileExistsOnDisk:
              row?.artifactPath != null ? existsSync(row.artifactPath) : false,
          });
        }
      },
    };

    await runOrchestrator({
      runId: 'r-order-race',
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

    // Exactly one critique.ship event was observed and at that instant
    // the row already carried artifactPath and the file already
    // existed on disk.
    expect(observations).toHaveLength(1);
    expect(observations[0]?.artifactPathOnRow).toBeTruthy();
    expect(observations[0]?.fileExistsOnDisk).toBe(true);
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

// ---------------------------------------------------------------------------
// Child exit races (Defect 4)
// ---------------------------------------------------------------------------

describe('runOrchestrator - child exit race (Defect 4)', () => {
  it('child exits non-zero mid-stream: result is failed with cli_exit_nonzero', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-child-exit');

    // Stub child that exits with code 1 immediately.
    let killCalled = false;
    const stubChild = { kill: (_sig?: number | NodeJS.Signals) => { killCalled = true; return true as boolean; } };

    // childExitPromise resolves with code=1 after a short delay.
    const childExitPromise = new Promise<{ code: number | null; signal: string | null }>(
      (resolve) => setTimeout(() => resolve({ code: 1, signal: null }), 20),
    );

    // Stdout that emits the run header then stalls.
    // Uses a short delay (longer than childExitPromise's 20ms) so the child
    // exit race wins before the stall promise resolves, but the generator
    // itself does eventually resolve so iter.return() cleanup doesn't hang.
    async function* stallingStdout(): AsyncIterable<string> {
      yield '<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">\n';
      yield '  <ROUND n="1">\n';
      // Stall for longer than the child exit delay (20ms) but eventually resolve
      // so the generator can be cleaned up by iter.return() in applyTimeouts.
      await new Promise<void>((resolve) => setTimeout(resolve, 5000));
    }

    const cfg: CritiqueConfig = {
      ...defaultCritiqueConfig(),
      // Long timeouts so only the child exit race wins; we don't want the
      // per-round or total timer to fire before childExitPromise resolves.
      perRoundTimeoutMs: 30_000,
      totalTimeoutMs: 30_000,
    };

    const result = await runOrchestrator({
      runId: 'r-child-exit',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: stallingStdout(),
      child: stubChild,
      childExitPromise,
    });

    expect(result.status).toBe('failed');
    const row = getCritiqueRun(db, 'r-child-exit');
    expect(row?.status).toBe('failed');
    expect(killCalled).toBe(true);

    const failedEvents = events.filter((e) => e.event === 'critique.failed');
    expect(failedEvents).toHaveLength(1);
  }, 10000);

  it('child exits zero before parser completes: parser continues until stream ends', async () => {
    const { bus } = makeBus();
    const artifactDir = join(tmpDir, 'run-child-exit-zero');

    // Child exits with code 0 (zero is not an error).
    const childExitPromise = new Promise<{ code: number | null; signal: string | null }>(
      (resolve) => setTimeout(() => resolve({ code: 0, signal: null }), 10),
    );

    // A complete valid 1-round stream that finishes after the child exit.
    async function* delayedStream(): AsyncIterable<string> {
      await new Promise<void>((r) => setTimeout(r, 30));
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
      runId: 'r-child-exit-zero',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: delayedStream(),
      childExitPromise,
    });

    // Zero exit does not disrupt the parser; it should complete as shipped.
    expect(result.status).toBe('shipped');
  }, 10000);
});

// ---------------------------------------------------------------------------
// Timeout / abort best-so-far fallback (Defect 7)
// ---------------------------------------------------------------------------

describe('runOrchestrator - fallback on timeout/abort (Defect 7)', () => {
  it('timeout after 2 completed rounds: status=timed_out, score=max(composite)', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-timeout-fallback');

    // 2 complete rounds then stall.
    // Two complete rounds. After emitting both ROUND_END events, stall so the
    // total-timeout fires and the orchestrator elects a fallback round.
    const twoRounds = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="9.0" scale="10">
  <ROUND n="1">
    <PANELIST role="designer"><NOTES>v1</NOTES><ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT></PANELIST>
    <PANELIST role="critic" score="6.0"><DIM name="h" score="6">ok</DIM></PANELIST>
    <PANELIST role="brand" score="6.0"><DIM name="v" score="6">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="6.0"><DIM name="c" score="6">ok</DIM></PANELIST>
    <PANELIST role="copy" score="6.0"><DIM name="cl" score="6">ok</DIM></PANELIST>
    <ROUND_END n="1" composite="6.0" must_fix="0" decision="continue"><REASON>continue</REASON></ROUND_END>
  </ROUND>
  <ROUND n="2">
    <PANELIST role="designer"><NOTES>v2</NOTES></PANELIST>
    <PANELIST role="critic" score="7.5"><DIM name="h" score="7">better</DIM></PANELIST>
    <PANELIST role="brand" score="7.5"><DIM name="v" score="7">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="7.5"><DIM name="c" score="7">ok</DIM></PANELIST>
    <PANELIST role="copy" score="7.5"><DIM name="cl" score="7">ok</DIM></PANELIST>
    <ROUND_END n="2" composite="7.5" must_fix="0" decision="continue"><REASON>continue</REASON></ROUND_END>
  </ROUND>`;

    async function* stallingAfterTwoRounds(): AsyncIterable<string> {
      yield* streamOf(twoRounds, 64);
      // After both rounds land, stall so the total-timeout fires.
      await new Promise<void>((resolve) => setTimeout(resolve, 10_000));
    }

    const cfg: CritiqueConfig = {
      ...defaultCritiqueConfig(),
      // Per-round timeout starts when the first panelist_open of a new round
      // fires. Set it to 200ms so it fires quickly once the stall begins.
      // Total timeout is long so only the per-round timer fires.
      // But we yield the stall after ROUND_END so no panelist_open is active.
      // Use total timeout of 300ms which fires after the stall begins.
      perRoundTimeoutMs: 60_000,
      totalTimeoutMs: 300,
      fallbackPolicy: 'ship_best',
    };

    const result = await runOrchestrator({
      runId: 'r-timeout-fallback',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: stallingAfterTwoRounds(),
    });

    expect(result.status).toBe('timed_out');
    // Best round is 2 with composite 7.5.
    expect(result.composite).toBeCloseTo(7.5, 1);

    const row = getCritiqueRun(db, 'r-timeout-fallback');
    expect(row?.status).toBe('timed_out');
    expect(row?.score).toBeCloseTo(7.5, 1);

    // A synthetic ship event should have been emitted.
    const shipEvents = events.filter((e) => e.event === 'critique.ship');
    expect(shipEvents).toHaveLength(1);
  }, 15000);

  it('abort after 1 completed round: status=interrupted, score matches that round', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'run-abort-fallback');
    const controller = new AbortController();

    const oneRound = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="9.0" scale="10">
  <ROUND n="1">
    <PANELIST role="designer"><NOTES>v1</NOTES><ARTIFACT mime="text/html"><![CDATA[<p>v1</p>]]></ARTIFACT></PANELIST>
    <PANELIST role="critic" score="8.0"><DIM name="h" score="8">ok</DIM></PANELIST>
    <PANELIST role="brand" score="8.0"><DIM name="v" score="8">ok</DIM></PANELIST>
    <PANELIST role="a11y" score="8.0"><DIM name="c" score="8">ok</DIM></PANELIST>
    <PANELIST role="copy" score="8.0"><DIM name="cl" score="8">ok</DIM></PANELIST>
    <ROUND_END n="1" composite="8.0" must_fix="0" decision="continue"><REASON>continue</REASON></ROUND_END>
  </ROUND>`;

    async function* abortAfterRound(): AsyncIterable<string> {
      yield* streamOf(oneRound, 64);
      controller.abort();
      // One more yield after abort to ensure the abort is caught.
      yield '  <ROUND n="2">\n';
    }

    const cfg: CritiqueConfig = {
      ...defaultCritiqueConfig(),
      fallbackPolicy: 'ship_best',
    };

    const result = await runOrchestrator({
      runId: 'r-abort-fallback',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg,
      db,
      bus,
      stdout: abortAfterRound(),
      signal: controller.signal,
    });

    expect(result.status).toBe('interrupted');
    expect(result.composite).toBeCloseTo(8.0, 1);

    const row = getCritiqueRun(db, 'r-abort-fallback');
    expect(row?.status).toBe('interrupted');
    expect(row?.score).toBeCloseTo(8.0, 1);

    const shipEvents = events.filter((e) => e.event === 'critique.ship');
    expect(shipEvents).toHaveLength(1);
  });
});
