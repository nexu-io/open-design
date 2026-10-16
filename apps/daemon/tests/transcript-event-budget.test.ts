/**
 * A transcript response must be bounded.
 *
 * Not "usually small" — bounded. `res.json` builds ONE string, V8 refuses a
 * string past ~512MB, and an unbounded transcript therefore does not degrade
 * when a conversation grows: it throws `RangeError: Invalid string length`,
 * answers 500 forever, and the chat panel can never initialize again (OPEND-3302).
 * Because the send gate waits on an authoritative transcript read, that also
 * disables the composer — the conversation is not slow, it is dead.
 *
 * So the budget is the fix, and these are its terms:
 *   1. granted event bytes never exceed the budget;
 *   2. one runaway message cannot eat the whole conversation's budget;
 *   3. an omission costs a message its EVENTS, never its CONTENT.
 *
 * (3) is the one worth guarding hardest. Withholding an execution record is a
 * render-quality decision the UI already has a fallback for; withholding text
 * would be silent data loss on screen.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  appendMessageAgentEvents,
  closeDatabase,
  grantTranscriptEventBudget,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

describe('grantTranscriptEventBudget', () => {
  it('grants within the budget and reports the rest as omitted', () => {
    const decisions = grantTranscriptEventBudget(
      [
        { id: 'oldest', bytes: 60 },
        { id: 'middle', bytes: 30 },
        { id: 'newest', bytes: 30 },
      ],
      100,
      1_000,
    );
    // Newest first: 30 + 30 fits in 100, the 60 does not.
    expect(decisions.get('newest')?.granted).toBe(true);
    expect(decisions.get('middle')?.granted).toBe(true);
    expect(decisions.get('oldest')).toEqual({ granted: false, bytes: 60 });
  });

  it('never lets granted bytes exceed the budget', () => {
    const weights = Array.from({ length: 50 }, (_, index) => ({
      id: `m${index}`,
      bytes: 700,
    }));
    const decisions = grantTranscriptEventBudget(weights, 3_000, 10_000);
    const grantedBytes = [...decisions.values()]
      .filter((decision) => decision.granted)
      .reduce((total, decision) => total + decision.bytes, 0);
    expect(grantedBytes).toBeLessThanOrEqual(3_000);
  });

  it('omits one runaway message without spending the budget on it', () => {
    const decisions = grantTranscriptEventBudget(
      [
        { id: 'older', bytes: 10 },
        { id: 'runaway', bytes: 5_000 },
        { id: 'newest', bytes: 10 },
      ],
      1_000,
      100,
    );
    expect(decisions.get('runaway')?.granted).toBe(false);
    // The whole point of not breaking out of the walk: a middle outlier must
    // not cost every OLDER message its events.
    expect(decisions.get('older')?.granted).toBe(true);
    expect(decisions.get('newest')?.granted).toBe(true);
  });

  it('grants empty messages for free', () => {
    const decisions = grantTranscriptEventBudget(
      [
        { id: 'empty-1', bytes: 0 },
        { id: 'empty-2', bytes: 0 },
      ],
      0,
      0,
    );
    expect(decisions.get('empty-1')?.granted).toBe(true);
    expect(decisions.get('empty-2')?.granted).toBe(true);
  });
});

describe('listMessages · event budget', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-transcript-budget-'));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seedConversation(db: ReturnType<typeof openDatabase>) {
    const now = Date.now();
    insertProject(db, {
      id: 'proj-1',
      name: 'Budget project',
      createdAt: now,
      updatedAt: now,
    });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'Budget run',
      createdAt: now,
      updatedAt: now,
    });
  }

  it('withholds events past the budget but keeps every message readable', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seedConversation(db);
    // A big early turn, then a small recent one.
    upsertMessage(db, 'conv-1', {
      id: 'assistant-old',
      role: 'assistant',
      content: 'The answer the user actually reads.',
      events: [{ kind: 'text', text: 'x'.repeat(4_000) }],
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-new',
      role: 'assistant',
      content: 'Recent turn.',
      events: [{ kind: 'text', text: 'small' }],
    });

    const messages = listMessages(db, 'conv-1', { eventsBudgetBytes: 1_000 });
    const old = messages.find((message) => message.id === 'assistant-old');
    const recent = messages.find((message) => message.id === 'assistant-new');

    expect(old?.events).toBeUndefined();
    expect(old?.eventsOmitted?.bytes).toBeGreaterThan(4_000);
    // The promise: an omission never costs a message its words.
    expect(old?.content).toBe('The answer the user actually reads.');

    expect(recent?.events).toEqual([{ kind: 'text', text: 'small' }]);
    expect(recent?.eventsOmitted).toBeUndefined();

    closeDatabase();
  });

  it('folds un-folded batch text into content even when events are withheld', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seedConversation(db);
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: 'Persisted half. ',
      events: [{ kind: 'text', text: 'y'.repeat(4_000) }],
    });
    // Text that lives ONLY in an un-folded batch. Skipping batches for an
    // omitted message would silently drop this from the body.
    appendMessageAgentEvents(db, 'assistant-1', [
      { kind: 'text', text: 'Streamed half.' },
    ]);

    const [message] = listMessages(db, 'conv-1', { eventsBudgetBytes: 10 });
    expect(message?.events).toBeUndefined();
    expect(message?.content).toBe('Persisted half. Streamed half.');

    closeDatabase();
  });

  it('returns every event when the caller opts out of the budget', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seedConversation(db);
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      events: [{ kind: 'text', text: 'z'.repeat(4_000) }],
    });

    const [message] = listMessages(db, 'conv-1', { eventsBudgetBytes: null });
    expect(message?.events).toHaveLength(1);
    expect(message?.eventsOmitted).toBeUndefined();

    closeDatabase();
  });
});
