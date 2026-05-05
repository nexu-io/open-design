/**
 * Regression tests for the round 2 review feedback on PR #481:
 *   - Daemon-computed composite is authoritative; agent-supplied
 *     <ROUND_END composite=...> and <SHIP composite=...> are advisory.
 *   - When SHIP refers to a round whose daemon composite is below the
 *     configured threshold, the run finalizes as below_threshold even when
 *     the agent claimed status="shipped".
 *   - A composite divergence beyond COMPOSITE_TOLERANCE emits a
 *     composite_mismatch parser_warning event.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync } from 'node:fs';
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

async function* streamOf(text: string, chunkSize = 64): AsyncIterable<string> {
  for (let i = 0; i < text.length; i += chunkSize) {
    yield text.slice(i, i + chunkSize);
  }
}

let tmpDir: string;
let db: Database.Database;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'od-authority-test-'));
  db = freshDb();
});

afterEach(async () => {
  db.close();
  await rm(tmpDir, { recursive: true, force: true });
});

/**
 * One round, all panelists score ~6.0 so the daemon-computed composite is
 * well below the default threshold of 8.0. The agent lies in both
 * <ROUND_END composite="9.5"> and <SHIP composite="9.5" status="shipped"> to
 * try to force a ship despite low panelist scores.
 */
function lyingShipStream(): string {
  return `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>v1</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    </PANELIST>
    <PANELIST role="critic" score="6.0">
      <DIM name="hierarchy" score="6">ok</DIM>
    </PANELIST>
    <PANELIST role="brand" score="6.0">
      <DIM name="voice" score="6">ok</DIM>
    </PANELIST>
    <PANELIST role="a11y" score="6.0">
      <DIM name="contrast" score="6">ok</DIM>
    </PANELIST>
    <PANELIST role="copy" score="6.0">
      <DIM name="clarity" score="6">ok</DIM>
    </PANELIST>
    <ROUND_END n="1" composite="9.5" must_fix="0" decision="ship">
      <REASON>liar</REASON>
    </ROUND_END>
  </ROUND>
  <SHIP round="1" composite="9.5" status="shipped">
    <ARTIFACT mime="text/html"><![CDATA[<html><body>fake</body></html>]]></ARTIFACT>
    <SUMMARY>Pretending we shipped.</SUMMARY>
  </SHIP>
</CRITIQUE_RUN>`;
}

/** Agent claims a slightly different composite than the daemon will compute,
 *  but well within threshold. Used to exercise composite_mismatch warning
 *  without flipping the ship decision. */
function nearMissCompositeStream(): string {
  return `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
  <ROUND n="1">
    <PANELIST role="designer">
      <NOTES>v1</NOTES>
      <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    </PANELIST>
    <PANELIST role="critic" score="9.0">
      <DIM name="hierarchy" score="9">good</DIM>
    </PANELIST>
    <PANELIST role="brand" score="9.0">
      <DIM name="voice" score="9">good</DIM>
    </PANELIST>
    <PANELIST role="a11y" score="9.0">
      <DIM name="contrast" score="9">good</DIM>
    </PANELIST>
    <PANELIST role="copy" score="9.0">
      <DIM name="clarity" score="9">good</DIM>
    </PANELIST>
    <ROUND_END n="1" composite="7.5" must_fix="0" decision="ship">
      <REASON>arithmetic skipped</REASON>
    </ROUND_END>
  </ROUND>
  <SHIP round="1" composite="7.5" status="shipped">
    <ARTIFACT mime="text/html"><![CDATA[<html><body>x</body></html>]]></ARTIFACT>
    <SUMMARY>Wrong composite reported but real scores are high.</SUMMARY>
  </SHIP>
</CRITIQUE_RUN>`;
}

describe('orchestrator daemon-authoritative scoring (PR #481 round 2 review)', () => {
  it('SHIP claiming shipped is downgraded to below_threshold when daemon composite is below threshold', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'authority-1');

    const result = await runOrchestrator({
      runId: 'r-lying',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: streamOf(lyingShipStream()),
    });

    expect(result.status).toBe('below_threshold');
    expect(result.composite).not.toBeNull();
    expect(result.composite!).toBeLessThan(8.0);
    const row = getCritiqueRun(db, 'r-lying');
    expect(row?.status).toBe('below_threshold');
    expect(row?.score).toBeLessThan(8.0);
    const shipEvents = events.filter((e) => e.event === 'critique.ship');
    expect(shipEvents).toHaveLength(1);
  });

  it('emits composite_mismatch parser_warning when ROUND_END/SHIP composite diverges beyond tolerance', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'authority-2');

    await runOrchestrator({
      runId: 'r-mismatch',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: streamOf(nearMissCompositeStream()),
    });

    const warnings = events.filter((e) => e.event === 'critique.parser_warning');
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    const mismatch = warnings.find((e) => 'kind' in e.data && e.data.kind === 'composite_mismatch');
    expect(mismatch).toBeDefined();
  });

  it('does not emit composite_mismatch when agent and daemon agree within tolerance', async () => {
    const { bus, events } = makeBus();
    const artifactDir = join(tmpDir, 'authority-3');

    // Build a stream where ROUND_END composite matches the weighted sum exactly.
    // Default weights: critic=0.4, brand=0.2, a11y=0.2, copy=0.2; all 9.0 -> 9.0.
    const aligned = `<CRITIQUE_RUN version="1" maxRounds="3" threshold="8.0" scale="10">
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
    <ARTIFACT mime="text/html"><![CDATA[<html></html>]]></ARTIFACT>
    <SUMMARY>aligned</SUMMARY>
  </SHIP>
</CRITIQUE_RUN>`;

    await runOrchestrator({
      runId: 'r-aligned',
      projectId: 'p1',
      conversationId: null,
      artifactId: 'a1',
      artifactDir,
      adapter: 'claude',
      cfg: defaultCritiqueConfig(),
      db,
      bus,
      stdout: streamOf(aligned),
    });

    const compositeWarnings = events.filter(
      (e) => e.event === 'critique.parser_warning'
        && 'kind' in e.data
        && e.data.kind === 'composite_mismatch',
    );
    expect(compositeWarnings).toHaveLength(0);
  });
});
