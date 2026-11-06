/**
 * Regression tests for round 3 review feedback on PR #481, plus the
 * Phase 6.2 artifact-extraction expansion:
 *   - A signal-terminated child (e.g. SIGTERM from /api/runs/:id/cancel)
 *     finalizes the critique row as 'interrupted', not 'below_threshold'.
 *     The synthetic ship event for the best-so-far round carries
 *     status='interrupted' so transcripts and SSE clients see the real cause.
 *   - Shipped runs now persist the SHIP <ARTIFACT> body to disk and pin
 *     the absolute path on the row, so the artifact endpoint can stream
 *     the bytes the agent shipped (CDATA wrapper stripped).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, existsSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';
import { migrateCritique, getCritiqueRun } from '../src/critique/persistence.js';
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
    INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES ('c1', 'p1', 0, 0);
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
  tmpDir = mkdtempSync(join(tmpdir(), 'od-lifecycle-test-'));
  db = freshDb();
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

/** A stream that yields a complete round 1 then awaits forever, emulating a
 *  CLI that produced partial output before being killed. */
async function* roundOneThenStall(): AsyncIterable<string> {
  yield `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
    <ROUND n="1">
      <PANELIST role="designer">
        <NOTES>v1</NOTES>
        <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
      </PANELIST>
      <PANELIST role="critic" score="9.0"><DIM name="h" score="9">ok</DIM></PANELIST>
      <PANELIST role="brand" score="9.0"><DIM name="v" score="9">ok</DIM></PANELIST>
      <PANELIST role="a11y" score="9.0"><DIM name="c" score="9">ok</DIM></PANELIST>
      <PANELIST role="copy" score="9.0"><DIM name="x" score="9">ok</DIM></PANELIST>
      <ROUND_END n="1" composite="9.0" must_fix="0" decision="continue"><REASON>continue</REASON></ROUND_END>
    </ROUND>
`;
  // Stall indefinitely so the orchestrator must rely on the child-exit race.
  await new Promise(() => { /* never resolves */ });
}

describe('orchestrator lifecycle (PR #481 round 3 review)', () => {
  it('child killed with SIGTERM after 1 closed round persists interrupted, not below_threshold', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'sigterm-1');

    let resolveExit!: (v: { code: number | null; signal: string | null }) => void;
    const childExitPromise = new Promise<{ code: number | null; signal: string | null }>((r) => { resolveExit = r; });
    const child = { kill: (): boolean => true };

    // Schedule the SIGTERM to arrive shortly after the parser closes round 1.
    setTimeout(() => resolveExit({ code: null, signal: 'SIGTERM' }), 75);

    const result = await runOrchestrator({
      runId: 'r-sigterm',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: roundOneThenStall(),
      child,
      childExitPromise,
    });

    expect(result.status).toBe('interrupted');
    const row = getCritiqueRun(db, 'r-sigterm');
    expect(row?.status).toBe('interrupted');

    // Synthetic ship event must carry status='interrupted' (not below_threshold).
    const shipEvents = events.filter((e) => e.event === 'critique.ship');
    expect(shipEvents).toHaveLength(1);
    const shipPayload = shipEvents[0]?.data as { status: string } | undefined;
    expect(shipPayload?.status).toBe('interrupted');

    // Round 1 closed with composite ~9.0, so the fallback round should hold.
    expect(result.composite).not.toBeNull();
    expect(result.composite!).toBeGreaterThan(8.0);
  });

  it('shipped run persists the SHIP <ARTIFACT> body to disk and pins the absolute path on the row', async () => {
    const { bus } = makeBus();
    const artifactDir = join(tmpDir, 'no-artifact');

    const stream = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
      <ROUND n="1">
        <PANELIST role="designer">
          <NOTES>v1</NOTES>
          <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
        </PANELIST>
        <PANELIST role="critic" score="9.0"><DIM name="h" score="9">ok</DIM></PANELIST>
        <PANELIST role="brand" score="9.0"><DIM name="v" score="9">ok</DIM></PANELIST>
        <PANELIST role="a11y" score="9.0"><DIM name="c" score="9">ok</DIM></PANELIST>
        <PANELIST role="copy" score="9.0"><DIM name="x" score="9">ok</DIM></PANELIST>
        <ROUND_END n="1" composite="9.0" must_fix="0" decision="ship"><REASON>ok</REASON></ROUND_END>
      </ROUND>
      <SHIP round="1" composite="9.0" status="shipped">
        <ARTIFACT mime="text/html"><![CDATA[<html><body>final</body></html>]]></ARTIFACT>
        <SUMMARY>Done.</SUMMARY>
      </SHIP>
    </CRITIQUE_RUN>`;

    async function* streamOf(text: string): AsyncIterable<string> {
      for (let i = 0; i < text.length; i += 64) yield text.slice(i, i + 64);
    }

    const result = await runOrchestrator({
      runId: 'r-shipped',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: streamOf(stream),
    });

    expect(result.status).toBe('shipped');
    expect(result.artifactPath).toBeTruthy();
    expect(result.artifactPath!.endsWith('artifact.html')).toBe(true);

    const row = getCritiqueRun(db, 'r-shipped');
    expect(row?.artifactPath).toBe(result.artifactPath);

    // The bytes on disk are exactly what the agent shipped, with the
    // CDATA wrapper from the SHIP <ARTIFACT> stripped.
    expect(existsSync(result.artifactPath!)).toBe(true);
    expect(readFileSync(result.artifactPath!, 'utf8')).toBe('<html><body>final</body></html>');
  });
});
