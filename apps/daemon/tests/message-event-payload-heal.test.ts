import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { runMessageEventPayloadHealPass } from '../src/storage/message-event-payload-heal.js';
import {
  jsonBytes,
  legacyCursorTurnEvents,
  syntheticHtmlDocument,
} from './helpers/cursor-agent-stream-shapes.js';

/*
 * Invariant pinned here (I3): rows that 0.22.x already wrote with unbounded
 * run-event payloads are healed once, in the background, by the same budget
 * the writer now applies — one row per transaction, never a whole
 * conversation, never a row whose run is still active, and a second pass
 * changes nothing. The seeded rows are exactly what 0.22.x left on disk:
 * verbatim event lists written straight into the daemon's own tables.
 */

const PERSISTED_EVENT_BUDGET_BYTES = 64 * 1024;
const CONVERSATION_ID = 'heal-conv';

type Db = ReturnType<typeof openDatabase>;
type StoredEvent = Record<string, unknown>;

function seedConversation(db: Db) {
  insertProject(db, { id: 'heal-project', name: 'Heal', createdAt: 1, updatedAt: 1 });
  insertConversation(db, {
    id: CONVERSATION_ID,
    projectId: 'heal-project',
    title: 'Heal',
    createdAt: 1,
    updatedAt: 1,
  });
}

/** A 0.22.x turn mixing cursor raw lines with Claude-shaped oversized tool events. */
function legacyMixedTurn(turn: number): StoredEvent[] {
  const writtenFile = syntheticHtmlDocument(500_000, `write-${turn}`);
  return [
    ...legacyCursorTurnEvents({ turn, doneKey: `heal-key-${turn}` }),
    { kind: 'tool_use', id: `write-${turn}`, name: 'Write', input: { file_path: `/p/page-${turn}.html`, content: writtenFile } },
    { kind: 'tool_result', toolUseId: `write-${turn}`, content: 'File created successfully.', isError: false },
    { kind: 'tool_use', id: `read-${turn}`, name: 'Read', input: { file_path: `/p/page-${turn}.html` } },
    { kind: 'tool_result', toolUseId: `read-${turn}`, content: syntheticHtmlDocument(300_000, `read-${turn}`), isError: false },
    {
      kind: 'tool_use',
      id: `todo-${turn}`,
      name: 'TodoWrite',
      input: { todos: [{ content: 'Ship it', status: 'completed', activeForm: 'Shipping it' }] },
    },
  ];
}

function seedAssistant(db: Db, id: string, runStatus: string, events: StoredEvent[]) {
  upsertMessage(db, CONVERSATION_ID, {
    id,
    role: 'assistant',
    content: `Answer ${id}.`,
    runId: `run-${id}`,
    runStatus,
    events: [],
    startedAt: 10,
    endedAt: runStatus === 'running' ? undefined : 20,
  });
  // What 0.22.x wrote: the verbatim event list, no budget.
  db.prepare(`UPDATE messages SET events_json = ? WHERE id = ?`).run(JSON.stringify(events), id);
}

function storedEventsJson(db: Db, id: string): string {
  return (db.prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`).get(id) as {
    eventsJson: string;
  }).eventsJson;
}

function countEventWrites(db: Db): () => number {
  db.exec(`
    CREATE TABLE IF NOT EXISTS heal_test_writes (count INTEGER NOT NULL);
    DELETE FROM heal_test_writes;
    INSERT INTO heal_test_writes (count) VALUES (0);
    CREATE TRIGGER IF NOT EXISTS heal_test_message_writes AFTER UPDATE OF events_json ON messages
      BEGIN UPDATE heal_test_writes SET count = count + 1; END;
    CREATE TRIGGER IF NOT EXISTS heal_test_batch_writes AFTER UPDATE OF events_json ON message_event_batches
      BEGIN UPDATE heal_test_writes SET count = count + 1; END;
  `);
  return () => (db.prepare(`SELECT count FROM heal_test_writes`).get() as { count: number }).count;
}

/** Events the heal must leave byte-for-byte alone: everything not oversized. */
function untouchedEventJson(events: StoredEvent[]): string[] {
  return events
    .filter((event) => jsonBytes(event) <= PERSISTED_EVENT_BUDGET_BYTES)
    .map((event) => JSON.stringify(event));
}

describe('message event payload heal (existing 0.22.x rows)', () => {
  let tempDir: string;
  let db: Db;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-message-event-heal-'));
    db = openDatabase(tempDir, { dataDir: tempDir });
    seedConversation(db);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('bounds an oversized finished row, keeps every other event byte-identical, and a second pass is a no-op', async () => {
    const legacy = legacyMixedTurn(1);
    seedAssistant(db, 'finished', 'succeeded', legacy);
    seedAssistant(db, 'small', 'succeeded', [
      { kind: 'status', label: 'starting' },
      { kind: 'text', text: 'Tiny.' },
    ]);
    const smallBefore = storedEventsJson(db, 'small');
    const beforeBytes = Buffer.byteLength(storedEventsJson(db, 'finished'));
    expect(beforeBytes).toBeGreaterThan(2 * 1024 * 1024);

    const first = await runMessageEventPayloadHealPass({ db });

    const healedJson = storedEventsJson(db, 'finished');
    const healed = JSON.parse(healedJson) as StoredEvent[];
    expect(first.messagesRewritten).toBe(1);
    expect(first.bytesBefore).toBe(beforeBytes);
    expect(first.bytesAfter).toBe(Buffer.byteLength(healedJson));
    expect(Buffer.byteLength(healedJson)).toBeLessThan(256 * 1024);
    // Bounded, and nothing dropped.
    expect(healed).toHaveLength(legacy.length);
    for (const event of healed) {
      expect(jsonBytes(event)).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
    }
    // Every event that was already within budget is byte-identical, in order.
    expect(untouchedEventJson(healed).filter((json) => untouchedEventJson(legacy).includes(json)))
      .toEqual(untouchedEventJson(legacy));
    // Shortened events say so, and keep what the UI reads from them.
    const write = healed.find((event) => event.kind === 'tool_use' && event.name === 'Write') as StoredEvent;
    const writtenFile = (legacy.find((event) => event.kind === 'tool_use' && event.name === 'Write') as {
      input: { content: string };
    }).input.content;
    expect((write.input as Record<string, unknown>).file_path).toBe('/p/page-1.html');
    expect((write.input as Record<string, unknown>).od_diff_stat).toEqual({
      added: writtenFile.split('\n').length,
      removed: 0,
    });
    expect(write.truncated).toEqual({ originalBytes: jsonBytes({ file_path: '/p/page-1.html', content: writtenFile }) });
    const readResult = healed.find((event) => event.kind === 'tool_result' && event.toolUseId === 'read-1') as StoredEvent;
    expect(String(readResult.content)).toMatch(/open-design/);
    expect(readResult.isError).toBe(false);
    // Rows that were already small are not touched at all.
    expect(storedEventsJson(db, 'small')).toBe(smallBefore);
    // The transcript still reads the same turn.
    const listed = listMessages(db, CONVERSATION_ID).find((message) => message.id === 'finished');
    expect(listed?.content).toBe('Answer finished.');
    expect(listed?.events).toHaveLength(legacy.length);

    const writes = countEventWrites(db);
    const second = await runMessageEventPayloadHealPass({ db });
    expect(second.messagesRewritten).toBe(0);
    expect(second.batchesRewritten).toBe(0);
    // Forced rescan (ignores the completion marker) proves row-level idempotency.
    const rescan = await runMessageEventPayloadHealPass({ db, ignoreCompletionMarker: true });
    expect(rescan.messagesRewritten).toBe(0);
    expect(writes()).toBe(0);
    expect(storedEventsJson(db, 'finished')).toBe(healedJson);
  });

  it('never rewrites a row or batch whose run is still active', async () => {
    const legacy = legacyMixedTurn(2);
    seedAssistant(db, 'active', 'running', legacy);
    seedAssistant(db, 'queued', 'queued', legacy);
    const activeBefore = storedEventsJson(db, 'active');
    db.prepare(`INSERT INTO message_event_batches (message_id, events_json, created_at) VALUES (?, ?, ?)`)
      .run('active', JSON.stringify(legacy.slice(3, 7)), 30);
    const activeBatchBefore = (db.prepare(`SELECT events_json AS eventsJson FROM message_event_batches WHERE message_id = ?`)
      .get('active') as { eventsJson: string }).eventsJson;

    const report = await runMessageEventPayloadHealPass({ db });

    expect(report.messagesRewritten).toBe(0);
    expect(report.batchesRewritten).toBe(0);
    expect(report.skippedActive).toBeGreaterThanOrEqual(3);
    expect(storedEventsJson(db, 'active')).toBe(activeBefore);
    expect((db.prepare(`SELECT events_json AS eventsJson FROM message_event_batches WHERE message_id = ?`)
      .get('active') as { eventsJson: string }).eventsJson).toBe(activeBatchBefore);
    // An active row keeps the pass from declaring the heal complete, so the
    // next start looks again once the run has finished.
    expect(report.completed).toBe(false);
  });

  it('heals crash-left batches of a finished run', async () => {
    const legacy = legacyMixedTurn(3);
    seedAssistant(db, 'crashed', 'failed', [{ kind: 'status', label: 'starting' }]);
    db.prepare(`INSERT INTO message_event_batches (message_id, events_json, created_at) VALUES (?, ?, ?)`)
      .run('crashed', JSON.stringify(legacy), 30);

    const report = await runMessageEventPayloadHealPass({ db });

    expect(report.batchesRewritten).toBe(1);
    const batch = JSON.parse((db.prepare(`SELECT events_json AS eventsJson FROM message_event_batches WHERE message_id = ?`)
      .get('crashed') as { eventsJson: string }).eventsJson) as StoredEvent[];
    expect(batch).toHaveLength(legacy.length);
    for (const event of batch) {
      expect(jsonBytes(event)).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
    }
  });

  it('is safe to interrupt: each row is either untouched or fully healed, and a later pass finishes', async () => {
    for (let turn = 0; turn < 4; turn += 1) seedAssistant(db, `turn-${turn}`, 'succeeded', legacyMixedTurn(turn));
    const originals = new Map([0, 1, 2, 3].map((turn) => [`turn-${turn}`, storedEventsJson(db, `turn-${turn}`)]));

    let healedRows = 0;
    const interrupted = await runMessageEventPayloadHealPass({
      db,
      onRowHealed: () => { healedRows += 1; },
      shouldStop: () => healedRows >= 1,
    });
    expect(interrupted.completed).toBe(false);
    expect(interrupted.messagesRewritten).toBe(1);
    let untouched = 0;
    for (const [id, original] of originals) {
      const current = storedEventsJson(db, id);
      if (current === original) {
        untouched += 1;
        continue;
      }
      for (const event of JSON.parse(current) as StoredEvent[]) {
        expect(jsonBytes(event)).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
      }
    }
    expect(untouched).toBe(3);

    const resumed = await runMessageEventPayloadHealPass({ db });
    expect(resumed.messagesRewritten).toBe(3);
    expect(resumed.completed).toBe(true);
    for (const id of originals.keys()) {
      for (const event of JSON.parse(storedEventsJson(db, id)) as StoredEvent[]) {
        expect(jsonBytes(event)).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
      }
    }
  });
});
