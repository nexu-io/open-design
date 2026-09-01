import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listConversations,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

/**
 * `listConversations` only needs a *summary* of each conversation's latest run:
 * status, timestamps, and — when the timestamps are incomplete — a `durationMs`
 * recovered from the run's last `usage` event.
 *
 * Its `latest_runs` CTE nevertheless selects `events_json` into the window
 * function that picks the latest assistant row, so SQLite has to materialize
 * every assistant message's full event log for the project just to sort them by
 * position. On an image-heavy project that payload is enormous — tool results
 * carry inline base64 — and the list endpoint pays for all of it while
 * returning a few hundred bytes.
 *
 * These specs pin the summary semantics (so the CTE can be narrowed without
 * silently dropping the `usage` fallback) and pin *which columns the summary
 * reads*: no event log when a run's own timestamps answer the question, exactly
 * one when they cannot.
 *
 * That second half is deliberately expressed as a count of event-log reads
 * rather than as elapsed time. The property is categorical — the query either
 * touches the column or it does not — so counting states it exactly, while a
 * latency threshold restates it as an inequality that a loaded CI machine can
 * violate for reasons that have nothing to do with this code.
 */
describe('listConversations event payload', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-list-conversations-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seedProject(db: ReturnType<typeof openDatabase>, id: string, now: number) {
    insertProject(db, { id, name: id, createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: `${id}-conv`,
      projectId: id,
      title: id,
      createdAt: now,
      updatedAt: now,
    });
  }

  it('reports the latest run summary from timestamps', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    seedProject(db, 'proj-timestamps', now);
    upsertMessage(db, 'proj-timestamps-conv', {
      id: 'assistant-1',
      role: 'assistant',
      content: 'done',
      runId: 'run-1',
      runStatus: 'succeeded',
      events: [{ kind: 'text', text: 'done' }],
      startedAt: now,
      endedAt: now + 1500,
    });

    const conversations = listConversations(db, 'proj-timestamps');
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.latestRun).toMatchObject({
      status: 'succeeded',
      startedAt: now,
      endedAt: now + 1500,
      durationMs: 1500,
    });
  });

  it('falls back to the last usage event when timestamps are incomplete', () => {
    // This is the ONLY reason the summary needs `events_json` at all. Narrowing
    // the CTE must keep it working, otherwise runs that never recorded an
    // `endedAt` silently lose their duration in the conversation list.
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    seedProject(db, 'proj-usage', now);
    upsertMessage(db, 'proj-usage-conv', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'run-1',
      runStatus: 'succeeded',
      events: [
        { kind: 'usage', durationMs: 900 },
        { kind: 'text', text: 'later block without usage' },
      ],
      startedAt: now,
      // endedAt deliberately omitted
    });

    const conversations = listConversations(db, 'proj-usage');
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.latestRun).toMatchObject({ status: 'succeeded', durationMs: 900 });
  });

  it('picks the newest assistant run, not an earlier one', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    seedProject(db, 'proj-order', now);
    for (const [index, status] of ['failed', 'succeeded'].entries()) {
      upsertMessage(db, 'proj-order-conv', {
        id: `assistant-${index}`,
        role: 'assistant',
        content: '',
        runId: `run-${index}`,
        runStatus: status,
        events: [{ kind: 'usage', durationMs: 100 * (index + 1) }],
        startedAt: now + index,
      });
    }

    const conversations = listConversations(db, 'proj-order');
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.latestRun).toMatchObject({ status: 'succeeded', durationMs: 200 });
  });

  /**
   * A string planted inside a message's event log. Nothing else in the fixture
   * contains it, so finding it in a query's result set proves that query handed
   * event-log bytes back to JS.
   */
  const SENTINEL = 'EVENT-LOG-SENTINEL-must-not-reach-the-conversation-list';

  /**
   * Record every row `run()` pulls out of SQLite, so a spec can assert *what
   * the summary reads* rather than how long it took to read it.
   *
   * Testing the SQL text instead would not work: `terminalRunDurationSql`
   * legitimately names `events_json` inside the total-duration CTE, but only as
   * a correlated subquery SQLite skips whenever the timestamps are present. The
   * regression this pins is different in kind — selecting the column into the
   * `latest_runs` window function, which materialises every assistant message's
   * full event log just to order rows by position. What separates the two is
   * not the SQL, it is whether the bytes come back.
   *
   * Wall-clock was the wrong instrument for the same reason: the property is
   * categorical — the bytes either cross into JS or they do not — so a latency
   * threshold restates an exact fact as an inequality a loaded CI box can
   * violate for reasons unrelated to this code.
   */
  function captureReadRows<T>(
    db: ReturnType<typeof openDatabase>,
    run: () => T,
  ): { result: T; reads: { sql: string; payload: string }[] } {
    const reads: { sql: string; payload: string }[] = [];
    const original = db.prepare.bind(db);
    (db as { prepare: typeof db.prepare }).prepare = ((source: string) => {
      const statement = original(source);
      for (const method of ['all', 'get'] as const) {
        const inner = statement[method].bind(statement);
        (statement as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
          const rows = (inner as (...a: unknown[]) => unknown)(...args);
          // Serialize NOW, not at assert time. `attachLatestRunEvents` assigns
          // the fetched log onto the very row objects the list query returned,
          // so holding a reference here would let a later write make an earlier
          // read look as though it had carried the log all along.
          reads.push({ sql: source, payload: JSON.stringify(rows ?? null) });
          return rows;
        };
      }
      return statement;
    }) as typeof db.prepare;
    try {
      return { result: run(), reads };
    } finally {
      (db as { prepare: typeof db.prepare }).prepare = original;
    }
  }

  const readsCarryingEventLog = (reads: { sql: string; payload: string }[]) =>
    reads.filter((read) => read.payload.includes(SENTINEL));

  it('reads no event logs at all when every run has complete timestamps', () => {
    // The invariant behind the whole change: event logs grow without bound (an
    // image tool result carries inline base64), so the conversation *list* must
    // never pull that column just to summarise a run whose own timestamps
    // already answer the question.
    //
    // Before the fix the `latest_runs` CTE selected `events_json` into its
    // window function, so SQLite materialised every assistant message's full
    // event log purely to order them by position — and this spec fails on the
    // very first row.
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    seedProject(db, 'proj-complete', now);
    for (let index = 0; index < 5; index += 1) {
      upsertMessage(db, 'proj-complete-conv', {
        id: `assistant-${index}`,
        role: 'assistant',
        content: '',
        runId: `run-${index}`,
        runStatus: 'succeeded',
        events: [{ kind: 'text', text: SENTINEL }],
        startedAt: now + index,
        endedAt: now + index + 5,
      });
    }

    const { result, reads } = captureReadRows(db, () =>
      listConversations(db, 'proj-complete'),
    );

    expect(result).toHaveLength(1);
    expect(result[0]!.latestRun).toMatchObject({ status: 'succeeded', durationMs: 5 });
    expect(readsCarryingEventLog(reads)).toEqual([]);
  });

  it('reads exactly one event log when a run is missing its endedAt', () => {
    // The complement of the spec above, and the reason the column cannot simply
    // be dropped: a run with no `endedAt` still owes the list a `durationMs`,
    // recovered from its last `usage` event. One conversation in that state
    // must cost exactly one event-log read — not zero (the duration would go
    // missing) and not one per conversation in the project.
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    seedProject(db, 'proj-incomplete', now);
    upsertMessage(db, 'proj-incomplete-conv', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'run-1',
      runStatus: 'succeeded',
      events: [{ kind: 'usage', durationMs: 900 }, { kind: 'text', text: SENTINEL }],
      startedAt: now,
      // endedAt deliberately omitted
    });

    const { result, reads } = captureReadRows(db, () =>
      listConversations(db, 'proj-incomplete'),
    );

    expect(result[0]!.latestRun).toMatchObject({ status: 'succeeded', durationMs: 900 });

    // Exactly one read carries the log, and it is the targeted by-id fetch —
    // not the list query, which must stay summary-sized however many
    // conversations are in the project.
    const carrying = readsCarryingEventLog(reads);
    expect(carrying).toHaveLength(1);
    expect(carrying[0]!.sql).toMatch(/WHERE id = \?/);
  });

  it('returns the same summary whether or not event logs are large', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    seedProject(db, 'proj-parity-small', now);
    seedProject(db, 'proj-parity-large', now);
    for (const [projectId, text] of [
      ['proj-parity-small', 'x'],
      ['proj-parity-large', 'x'.repeat(1024 * 1024)],
    ] as const) {
      upsertMessage(db, `${projectId}-conv`, {
        id: `${projectId}-assistant`,
        role: 'assistant',
        content: '',
        runId: `${projectId}-run`,
        runStatus: 'succeeded',
        events: [{ kind: 'text', text }, { kind: 'usage', durationMs: 700 }],
        startedAt: now,
      });
    }

    const [small] = listConversations(db, 'proj-parity-small');
    const [large] = listConversations(db, 'proj-parity-large');
    expect(small).toBeDefined();
    expect(large).toBeDefined();
    expect(large!.latestRun).toEqual(small!.latestRun);
    expect(large!.messageCount).toBe(small!.messageCount);
  }, 30_000);
});
