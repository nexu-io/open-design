/**
 * The turn-completion marker is a real protocol, keyed per run.
 *
 * Three things have to hold on the daemon side:
 *   1. every run mints its own key, and it is unguessable;
 *   2. the key reaches the client on the same path as every other event, so it
 *      is there both live and after a reload;
 *   3. the marker rides the event stream but never lands in the message body —
 *      `content` is what copy/export/legacy-render read.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendMessageAgentEvent,
  closeDatabase,
  finalizeMessageAgentEvents,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { daemonAgentPayloadToPersistedAgentEvent } from '../src/runtimes/chat-run-messages.js';
import { createChatRunService } from '../src/runtimes/runs.js';
import { renderDoneMarker, stripDoneMarkers } from '@open-design/contracts';

function createRuns() {
  return createChatRunService({
    createSseResponse: () => ({ send: () => true, end: () => {}, cleanup: () => {} }),
    createSseErrorPayload: (code: string, message: string) => ({ error: { code, message } }),
    shutdownGraceMs: 10,
    ttlMs: 60_000,
  });
}

describe('done marker · per-run key', () => {
  it('mints a key for every run', () => {
    const runs = createRuns();
    const run = runs.create({ projectId: 'p1', conversationId: 'c1' }) as { doneKey?: string };
    expect(run.doneKey).toMatch(/^[0-9a-f]{16}$/);
  });

  /**
   * The whole security property is that the model cannot produce a key it was
   * not shown this turn. Two runs sharing a key would let turn N's content
   * forge turn N+1's boundary.
   */
  it('gives different runs different keys', () => {
    const runs = createRuns();
    const keys = new Set(
      Array.from({ length: 64 }, () => (runs.create({}) as { doneKey: string }).doneKey),
    );
    expect(keys.size).toBe(64);
  });

  /**
   * A same-run retry re-enters startChatRun against the SAME run object, so the
   * re-emitted key has to be the one already injected into the prompt.
   */
  it('keeps one key for the life of a run', () => {
    const runs = createRuns();
    const run = runs.create({}) as { id: string; doneKey: string };
    expect((runs.get(run.id) as { doneKey: string }).doneKey).toBe(run.doneKey);
  });
});

describe('done marker · wire shape', () => {
  it('renders the marker the prompt hands the model', () => {
    expect(renderDoneMarker('a7f3c91ed2b40561')).toBe('<od-done key="a7f3c91ed2b40561"/>');
  });

  it('translates a done_key agent payload into a persisted event', () => {
    expect(daemonAgentPayloadToPersistedAgentEvent({ type: 'done_key', key: 'a7f3c91ed2b40561' }))
      .toEqual({ kind: 'done_key', key: 'a7f3c91ed2b40561' });
  });

  it('drops a done_key payload with no key rather than persisting an empty one', () => {
    // An empty key would match nothing, but a client that trusts "a key exists"
    // would stop honouring the legacy bare marker — worse than having no key.
    expect(daemonAgentPayloadToPersistedAgentEvent({ type: 'done_key', key: '' })).toBeNull();
    expect(daemonAgentPayloadToPersistedAgentEvent({ type: 'done_key' })).toBeNull();
  });

  it('strips every marker shape a model might emit', () => {
    expect(stripDoneMarkers('a<od-done key="abcd1234"/>b')).toBe('ab');
    expect(stripDoneMarkers('a<od-done key="abcd1234" />b')).toBe('ab');
    expect(stripDoneMarkers("a<od-done key='abcd1234'>b")).toBe('ab');
    expect(stripDoneMarkers('a<OD-DONE KEY="abcd1234"/>b')).toBe('ab');
    // Two markers in one body (agent emitted a stray extra) — both go
    expect(stripDoneMarkers('<od-done key="a1b2c3d4"/>x<od-done key="a1b2c3d4"/>y')).toBe('xy');
  });

  it('leaves ordinary prose alone', () => {
    expect(stripDoneMarkers('when x < 3 and y > 4')).toBe('when x < 3 and y > 4');
    expect(stripDoneMarkers('<div>real markup</div>')).toBe('<div>real markup</div>');
    expect(stripDoneMarkers('')).toBe('');
  });
});

describe('done marker · message body', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-done-marker-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  /**
   * The regression this guards: `content` is assembled by concatenating the
   * turn's text deltas. The marker travels in those deltas on purpose (it is
   * how the chat client finds the boundary), so without an explicit strip it
   * ends up verbatim in the body that copy-to-clipboard and exports read.
   */
  it('keeps the marker in the events but out of the persisted content', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'P', createdAt: now, updatedAt: now });
    insertConversation(db, { id: 'c1', projectId: 'p1', title: 'T', createdAt: now, updatedAt: now });
    upsertMessage(db, 'c1', { id: 'm1', role: 'assistant', content: '', runId: 'r1' });

    appendMessageAgentEvent(db, 'm1', { kind: 'done_key', key: 'a7f3c91ed2b40561' });
    appendMessageAgentEvent(db, 'm1', { kind: 'text', text: 'Working on it. ' });
    appendMessageAgentEvent(db, 'm1', {
      kind: 'text',
      text: '<od-done key="a7f3c91ed2b40561"/>All done.',
    });
    finalizeMessageAgentEvents(db, 'm1');

    const message = listMessages(db, 'c1').find((m) => m.id === 'm1');
    expect(message?.content).toBe('Working on it. All done.');
    expect(message?.content).not.toContain('od-done');

    // …but the event stream still carries both the key and the marker, which is
    // what lets a reloaded conversation split the turn the same way it did live.
    const events = message?.events ?? [];
    expect(events).toContainEqual({ kind: 'done_key', key: 'a7f3c91ed2b40561' });
    expect(events.some((e) => e.kind === 'text' && e.text.includes('od-done'))).toBe(true);
  });

  it('a turn with no marker persists its content unchanged', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'p1', name: 'P', createdAt: now, updatedAt: now });
    insertConversation(db, { id: 'c1', projectId: 'p1', title: 'T', createdAt: now, updatedAt: now });
    upsertMessage(db, 'c1', { id: 'm1', role: 'assistant', content: '', runId: 'r1' });

    appendMessageAgentEvent(db, 'm1', { kind: 'text', text: 'Use `<done/>` to mark ' });
    appendMessageAgentEvent(db, 'm1', { kind: 'text', text: 'the end of the work phase.' });
    finalizeMessageAgentEvents(db, 'm1');

    const message = listMessages(db, 'c1').find((m) => m.id === 'm1');
    expect(message?.content).toBe('Use `<done/>` to mark the end of the work phase.');
  });
});
