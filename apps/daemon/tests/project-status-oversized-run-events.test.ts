import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listLatestProjectRunStatuses,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import {
  EVENT_LOG_PAYLOAD_SENTINEL,
  legacyCursorTurnEvents,
} from './helpers/cursor-agent-stream-shapes.js';
import { captureDbReads, readsCarrying } from './helpers/db-read-capture.js';

/*
 * `GET /api/projects` projects every project's latest run status, and a
 * `succeeded` run is downgraded to `incomplete` from its persisted events
 * (#1247 / #1060). In 0.22.x that projection selected `events_json` for EVERY
 * run message of every project and parsed the winner's whole event log in JS —
 * for the incident conversation that is hundreds of MB loaded on each project
 * list, to read a TodoWrite snapshot, a done marker and a usage stop reason.
 *
 * Invariant pinned here (I2): the projection's verdicts are unchanged, and no
 * database read it makes hands a run's tool payloads to JS. Rows are seeded
 * exactly as 0.22.x left them (verbatim tool lines written straight into
 * `events_json`); a sentinel sits inside those payloads only.
 */

type Db = ReturnType<typeof openDatabase>;

function seedProject(db: Db, projectId: string) {
  insertProject(db, { id: projectId, name: projectId, createdAt: 1, updatedAt: 1 });
  insertConversation(db, {
    id: `${projectId}-conv`,
    projectId,
    title: projectId,
    createdAt: 1,
    updatedAt: 1,
  });
}

/** A finished turn whose stored events are the 0.22.x verbatim shape plus `extra`. */
function seedLegacyRun(
  db: Db,
  projectId: string,
  turn: number,
  extra: Array<Record<string, unknown>> = [],
  runStatus = 'succeeded',
) {
  const id = `${projectId}-assistant-${turn}`;
  upsertMessage(db, `${projectId}-conv`, {
    id,
    role: 'assistant',
    content: '',
    runId: `${projectId}-run-${turn}`,
    runStatus,
    events: [],
    startedAt: 1_000 + turn * 10,
    endedAt: 1_005 + turn * 10,
  });
  const events = [
    ...legacyCursorTurnEvents({ turn, doneKey: `${projectId}-key-${turn}`, fileBytes: 400_000 }),
    ...extra,
  ];
  db.prepare(`UPDATE messages SET events_json = ? WHERE id = ?`).run(JSON.stringify(events), id);
}

describe('listLatestProjectRunStatuses over 0.22.x oversized run events', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-project-status-oversized-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('keeps each verdict and never loads a run event log into JS', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });

    // Unfinished declared work on the latest turn -> incomplete.
    seedProject(db, 'unfinished');
    for (let turn = 0; turn < 12; turn += 1) seedLegacyRun(db, 'unfinished', turn);
    seedLegacyRun(db, 'unfinished', 12, [
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        input: {
          todos: [
            { content: 'Draft layout', status: 'completed' },
            { content: 'Build components', status: 'pending' },
          ],
        },
      },
      { kind: 'tool_result', toolUseId: 'todo-1', content: 'x'.repeat(300_000), isError: false },
    ]);

    // The same pending plan, but the Run authenticated its own conclusion
    // (done_key + marker + visible prose) -> succeeded.
    seedProject(db, 'concluded');
    for (let turn = 0; turn < 12; turn += 1) seedLegacyRun(db, 'concluded', turn);
    seedLegacyRun(db, 'concluded', 12, [
      {
        kind: 'tool_use',
        id: 'todo-1',
        name: 'TodoWrite',
        input: { todos: [{ content: 'Build components', status: 'pending' }] },
      },
      { kind: 'text', text: '<od-done key="concluded-key-12"/>\n\nDelivered the page.' },
    ]);

    // Truncated mid-generation on the latest turn -> incomplete.
    seedProject(db, 'truncated');
    seedLegacyRun(db, 'truncated', 0, [{ kind: 'usage', outputTokens: 10, stopReason: 'max_tokens' }]);

    // A clean text-only turn -> succeeded.
    seedProject(db, 'clean');
    seedLegacyRun(db, 'clean', 0);

    // A failed latest turn is reported as failed whatever its events say.
    seedProject(db, 'failed');
    seedLegacyRun(db, 'failed', 0, [], 'failed');

    const { result, reads } = captureDbReads(db, () => listLatestProjectRunStatuses(db));

    expect(result.get('unfinished')?.value).toBe('incomplete');
    expect(result.get('unfinished')?.runId).toBe('unfinished-run-12');
    expect(result.get('concluded')?.value).toBe('succeeded');
    expect(result.get('truncated')?.value).toBe('incomplete');
    expect(result.get('clean')?.value).toBe('succeeded');
    expect(result.get('failed')?.value).toBe('failed');
    expect(readsCarrying(reads, EVENT_LOG_PAYLOAD_SENTINEL)).toEqual([]);
  });
});
