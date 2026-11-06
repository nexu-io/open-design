import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  openDatabase,
  upsertMessage,
} from '../../src/db.js';
import {
  finalizeRunMessageEvents,
  persistRunEventToAssistantMessage,
} from '../../src/runtimes/chat-run-messages.js';
import { createJsonEventStreamHandler } from '../../src/runtimes/json-event-stream.js';
import {
  CURSOR_MODEL,
  cursorAssistantDeltaLine,
  cursorAssistantFinalLine,
  cursorEditCompletedLine,
  cursorEditStartedLine,
  cursorReadCompletedLine,
  cursorResultLine,
  cursorShellCompletedLine,
  cursorSystemInitLine,
  cursorThinkingDeltaLine,
  cursorUserEchoLine,
  jsonBytes,
} from '../helpers/cursor-agent-stream-shapes.js';

/*
 * Incident 2026-09-14 (cursor-agent, one conversation, ~169 turns).
 *
 * OD's cursor-agent parser recognises only `system/init`, `assistant` and
 * `result`; every other stdout line — `tool_call` started/completed, the
 * `user` prompt echo, thinking deltas — becomes `{ type: 'raw', line }`, and
 * the persistence path stored those lines verbatim. One `editToolCall`
 * completion carries the edited file twice (~1.2 MB) and the `user` echo
 * repeats the whole composed prompt (~200 KB, growing with the transcript),
 * so every turn stored ~1.4 MB that nothing ever renders. The renderer, the
 * daemon and `GET …/messages` then ran out of memory / string length.
 *
 * Invariant pinned here (I1): a persisted run event never carries an unbounded
 * payload — every stored event fits the per-event budget — while the events
 * that carry meaning (status, done_key, text, usage) are stored unchanged and
 * no event is dropped.
 */

/** The per-event storage budget (UTF-8 bytes of one event's JSON). */
const PERSISTED_EVENT_BUDGET_BYTES = 64 * 1024;

describe('cursor-agent oversized stream lines through the real parser + persistence path', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-cursor-oversized-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('stores every event of a 1.4 MB cursor turn within the budget and keeps the meaningful events intact', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'Cursor project', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Cursor conversation',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      agentId: 'cursor-agent',
      runId: 'run-1',
      runStatus: 'running',
      events: [],
      startedAt: now,
    });
    const run = {
      id: 'run-1',
      assistantMessageId: 'assistant-1',
      conversationId: 'conv-1',
      agentId: 'cursor-agent',
      status: 'running',
    };

    const edit = cursorEditCompletedLine('call-edit', '/synthetic/project/index.html', 620_000);
    const userEcho = cursorUserEchoLine(200_000);
    const readCompleted = cursorReadCompletedLine('call-read', '/synthetic/project/index.html', 180_000);
    const shellCompleted = cursorShellCompletedLine('call-shell', 1_500);
    const lines = [
      cursorSystemInitLine(),
      userEcho,
      cursorThinkingDeltaLine('Planning the edit.', 1789392588539),
      cursorAssistantDeltaLine('Updating the ', 1789392588600),
      cursorAssistantDeltaLine('hero section.', 1789392588700),
      cursorEditStartedLine('call-edit', edit.filePath),
      edit.line,
      readCompleted,
      shellCompleted,
      cursorAssistantFinalLine('Updating the hero section.', 'model-call-1'),
      cursorResultLine(),
    ];
    // Sanity: the fixture reproduces the incident's per-turn weight.
    expect(Buffer.byteLength(edit.line)).toBeGreaterThan(1_200_000);
    expect(Buffer.byteLength(userEcho)).toBeGreaterThan(200_000);

    const liveRawLines: string[] = [];
    persistRunEventToAssistantMessage(db, run, 'start', { bin: 'cursor-agent' });
    persistRunEventToAssistantMessage(db, run, 'agent', { type: 'done_key', key: 'done-key-1' });
    const handler = createJsonEventStreamHandler('cursor-agent', (event) => {
      if (event.type === 'raw') liveRawLines.push(String(event.line));
      persistRunEventToAssistantMessage(db, run, 'agent', event);
    });
    for (const line of lines) handler.feed(`${line}\n`);
    handler.flush();
    persistRunEventToAssistantMessage(db, run, 'end', { status: 'succeeded' });
    finalizeRunMessageEvents(db, run);

    const row = db
      .prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get('assistant-1') as { eventsJson: string };
    const stored = JSON.parse(row.eventsJson) as Array<Record<string, unknown>>;

    // I1: no stored event exceeds the per-event budget.
    const oversized = stored
      .map((event, index) => ({ index, kind: event.kind, bytes: jsonBytes(event) }))
      .filter((entry) => entry.bytes > PERSISTED_EVENT_BUDGET_BYTES);
    expect(oversized).toEqual([]);
    // The whole turn is a small fraction of the ~1.6 MB of raw lines it saw.
    expect(Buffer.byteLength(row.eventsJson)).toBeLessThan(256 * 1024);

    // Nothing is dropped: one raw event per unrecognised line, in order.
    const raw = stored.filter((event) => event.kind === 'raw');
    expect(raw).toHaveLength(6);

    // The events that carry meaning are stored exactly as before.
    expect(stored.filter((event) => event.kind !== 'raw')).toEqual([
      { kind: 'status', label: 'starting', detail: 'cursor-agent' },
      { kind: 'done_key', key: 'done-key-1' },
      { kind: 'status', label: 'initializing', detail: CURSOR_MODEL },
      { kind: 'text', text: 'Updating the hero section.' },
      { kind: 'usage', inputTokens: 1200, outputTokens: 340, durationMs: 4200 },
    ]);

    // The retained edit line is still meaningful: valid JSON with the path,
    // the diff summary and the outcome; the full file copies are replaced by
    // an explicit marker that names how much was omitted.
    const editEvent = raw.find((event) => String(event.line).includes('"editToolCall"')
      && String(event.line).includes('"completed"'));
    expect(editEvent).toBeDefined();
    const editLine = JSON.parse(String(editEvent!.line));
    const success = editLine.tool_call.editToolCall.result.success;
    expect(success.path).toBe(edit.filePath);
    expect(success.diffString).toBe(edit.diffString);
    expect(success.linesAdded).toBe(1);
    expect(success.linesRemoved).toBe(1);
    expect(String(success.beforeFullFileContent)).toContain(String(Buffer.byteLength(edit.before)));
    expect(String(success.beforeFullFileContent).length).toBeLessThan(1_024);
    expect(editEvent!.truncated).toEqual({ originalBytes: Buffer.byteLength(edit.line) });

    // The prompt echo keeps its head and says how much was cut.
    const echoEvent = raw.find((event) => String(event.line).startsWith('{"type":"user"'));
    expect(echoEvent).toBeDefined();
    expect(echoEvent!.truncated).toEqual({ originalBytes: Buffer.byteLength(userEcho) });

    // Live stream (renderer memory): the raw lines the parser hands to the SSE
    // fan-out are bounded the same way as the stored ones.
    expect(liveRawLines).toHaveLength(6);
    for (const line of liveRawLines) {
      expect(Buffer.byteLength(line)).toBeLessThanOrEqual(PERSISTED_EVENT_BUDGET_BYTES);
    }
  });
});
