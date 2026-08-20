import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  latchConversationIntentSignals,
  openDatabase,
  readConversationIntentSignals,
} from '../src/db.js';

// Storage contract for the per-conversation intent-signal latch
// (specs/current/intent-signal-cache-hotfix.md R2): monotonic ON, merge —
// never replace — against the stored value, so a latch carrying one signal
// can never clobber a previously latched different signal (PR #5709 review).
// A deterministic in-thread race is not constructible — better-sqlite3 is
// synchronous, so two latch calls cannot interleave mid-function — hence
// these tests pin the observable merge semantics, including across two
// separate connections to the same database file, and the latch itself runs
// under BEGIN IMMEDIATE so the write lock precedes the read.

describe('conversation intent-signal latch', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-intent-signals-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seed() {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'P', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'C',
      createdAt: now,
      updatedAt: now,
    });
    return db;
  }

  it('reads all-false for a fresh row, a missing row, and unparsable JSON', () => {
    const db = seed();
    const none = { deck: false, media: false, platform: false };
    expect(readConversationIntentSignals(db, 'conv-1')).toEqual(none);
    expect(readConversationIntentSignals(db, 'conv-does-not-exist')).toEqual(none);
    db.prepare(`UPDATE conversations SET intent_signals_json = ? WHERE id = ?`).run(
      'not json',
      'conv-1',
    );
    expect(readConversationIntentSignals(db, 'conv-1')).toEqual(none);
  });

  it('merges monotonically: a later latch never clears or clobbers earlier bits', () => {
    const db = seed();
    const t1 = latchConversationIntentSignals(db, 'conv-1', {
      deck: true,
      media: false,
      platform: false,
    });
    expect(t1).toEqual({ deck: true, media: false, platform: false });

    // A different single signal on a later turn must MERGE with the stored
    // deck bit, not replace the blob with { media: true } only.
    const t2 = latchConversationIntentSignals(db, 'conv-1', {
      deck: false,
      media: true,
      platform: false,
    });
    expect(t2).toEqual({ deck: true, media: true, platform: false });

    // An all-false turn (history trimmed / no vocabulary) changes nothing.
    const t3 = latchConversationIntentSignals(db, 'conv-1', {
      deck: false,
      media: false,
      platform: false,
    });
    expect(t3).toEqual({ deck: true, media: true, platform: false });
    expect(readConversationIntentSignals(db, 'conv-1')).toEqual({
      deck: true,
      media: true,
      platform: false,
    });
  });

  it('merges across two separate connections to the same database file', () => {
    const db = seed();
    latchConversationIntentSignals(db, 'conv-1', {
      deck: true,
      media: false,
      platform: false,
    });

    // Second, independent connection (stand-in for another writer): latching
    // media must observe and keep the deck bit persisted by the first.
    const second = new Database(path.join(tempDir, 'app.sqlite'));
    try {
      const merged = latchConversationIntentSignals(second as never, 'conv-1', {
        deck: false,
        media: true,
        platform: false,
      });
      expect(merged).toEqual({ deck: true, media: true, platform: false });
    } finally {
      second.close();
    }
    expect(readConversationIntentSignals(db, 'conv-1')).toEqual({
      deck: true,
      media: true,
      platform: false,
    });
  });

  it('skips persistence for a conversationId without a row (fresh detection passthrough)', () => {
    const db = seed();
    const effective = latchConversationIntentSignals(db, 'conv-ghost', {
      deck: true,
      media: false,
      platform: false,
    });
    expect(effective).toEqual({ deck: true, media: false, platform: false });
    expect(readConversationIntentSignals(db, 'conv-ghost')).toEqual({
      deck: false,
      media: false,
      platform: false,
    });
  });
});
