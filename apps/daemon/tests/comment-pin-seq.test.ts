import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { CollabCloudComment } from '@open-design/contracts';
import {
  closeDatabase,
  confirmPreviewCommentPinSeq,
  getPreviewComment,
  insertConversation,
  insertProject,
  mergeSyncedPreviewComment,
  openDatabase,
  reorderPreviewComment,
  upsertPreviewComment,
} from '../src/db.js';

let tempDir: string | null = null;
let extraTempDirs: string[] = [];

afterEach(() => {
  closeDatabase();
  if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
  tempDir = null;
  for (const dir of extraTempDirs) fs.rmSync(dir, { recursive: true, force: true });
  extraTempDirs = [];
});

function target(patch: Record<string, unknown> = {}) {
  return {
    filePath: 'index.html',
    elementId: 'hero-title',
    selector: '[data-od-id="hero-title"]',
    label: 'h1.hero-title',
    text: 'Current title',
    position: { x: 10, y: 20, width: 300, height: 80 },
    htmlHint: '<h1 data-od-id="hero-title">',
    ...patch,
  };
}

/** Opens a fresh sqlite db under its own temp dir, seeded with one project +
 *  one conversation. Standalone (does not reuse the module-level `tempDir`
 *  var) so a test can hold two independent "devices" open in the same
 *  process by re-opening whichever one it needs next — see the concurrency
 *  test below for why that matters. */
function newDeviceDb(label: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `od-pin-seq-${label}-`));
  const db = openDatabase(dir, { dataDir: dir });
  insertProject(db, { id: 'project-1', name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'conversation-1', projectId: 'project-1', title: 'Chat', createdAt: 1, updatedAt: 1 });
  return { dir, db };
}

function seededDb() {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'od-pin-seq-'));
  const db = openDatabase(tempDir, { dataDir: tempDir });
  insertProject(db, { id: 'project-1', name: 'Project', createdAt: 1, updatedAt: 1 });
  insertConversation(db, { id: 'conversation-1', projectId: 'project-1', title: 'Chat', createdAt: 1, updatedAt: 1 });
  return db;
}

describe('pin_seq assignment (recvq5BVsolIxi)', () => {
  it('assigns pin_seq starting at 1 and never rewrites it on a later edit', () => {
    const db = seededDb();
    const first = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'a' }),
      note: 'First',
    });
    const second = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'b' }),
      note: 'Second',
    });
    expect(first?.pinSeq).toBe(1);
    expect(second?.pinSeq).toBe(2);

    // Editing the FIRST comment (by id) must not touch its pin_seq, even
    // though a naive "recompute MAX+1" would now see two existing rows.
    const edited = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      id: first!.id,
      target: target({ elementId: 'a' }),
      note: 'First, edited',
    });
    expect(edited?.pinSeq).toBe(1);
    expect(edited?.note).toBe('First, edited');
  });

  it('scopes pin_seq per (project, file) — a different file restarts at 1', () => {
    const db = seededDb();
    const onIndex = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ filePath: 'index.html', elementId: 'a' }),
      note: 'Index comment',
    });
    const onAbout = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ filePath: 'about.html', elementId: 'a' }),
      note: 'About comment',
    });
    const secondOnIndex = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ filePath: 'index.html', elementId: 'b' }),
      note: 'Second index comment',
    });
    expect(onIndex?.pinSeq).toBe(1);
    expect(onAbout?.pinSeq).toBe(1);
    expect(secondOnIndex?.pinSeq).toBe(2);
  });

  it('assigns a default sort_key so a fresh comment sorts to the front by default', () => {
    const db = seededDb();
    const older = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'a' }),
      note: 'Older',
    });
    const newer = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'b' }),
      note: 'Newer',
    });
    expect(newer!.sortKey!).toBeGreaterThan(older!.sortKey!);
  });

  it('reorderPreviewComment rewrites only the dragged row\'s sort_key, never pin_seq', () => {
    const db = seededDb();
    const older = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'a' }),
      note: 'Older',
    });
    const newer = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'b' }),
      note: 'Newer',
    });
    // Drag the older comment above the newer one.
    const reordered = reorderPreviewComment(
      db,
      'project-1',
      'conversation-1',
      older!.id,
      newer!.sortKey! + 1,
    );
    expect(reordered?.sortKey).toBe(newer!.sortKey! + 1);
    expect(reordered?.pinSeq).toBe(older!.pinSeq); // identity unchanged
    // The untouched comment's own sort_key is unaffected.
    const untouched = getPreviewComment(db, 'project-1', 'conversation-1', newer!.id);
    expect(untouched?.sortKey).toBe(newer!.sortKey);
  });
});

describe('pin_seq cloud reconciliation (recvq5BVsolIxi)', () => {
  it('confirmPreviewCommentPinSeq overwrites an unconfirmed row exactly once', () => {
    const db = seededDb();
    const created = upsertPreviewComment(
      db,
      'project-1',
      'conversation-1',
      { target: target({ elementId: 'a' }), note: 'Shared project comment' },
      { pinPendingCloudConfirm: true },
    );
    // Provisional local guess while unconfirmed.
    expect(created?.pinSeq).toBe(1);

    // The collab-cloud push resolves with the authoritative, globally
    // serialized seq for this project's comment stream.
    expect(confirmPreviewCommentPinSeq(db, 'project-1', created!.id, 501)).toBe(true);
    const confirmed = getPreviewComment(db, 'project-1', 'conversation-1', created!.id);
    expect(confirmed?.pinSeq).toBe(501);

    // A later push resolution (e.g. from an edit) must NOT rewrite it again.
    expect(confirmPreviewCommentPinSeq(db, 'project-1', created!.id, 999)).toBe(false);
    const stillConfirmed = getPreviewComment(db, 'project-1', 'conversation-1', created!.id);
    expect(stillConfirmed?.pinSeq).toBe(501);
  });

  it('a non-team comment is already final (pin_seq_confirmed=1) — confirming it later is a no-op', () => {
    const db = seededDb();
    const created = upsertPreviewComment(db, 'project-1', 'conversation-1', {
      target: target({ elementId: 'a' }),
      note: 'Personal workspace comment',
    });
    // No `pinPendingCloudConfirm` (matches the off-team POST route path) →
    // already final; nothing to reconcile.
    expect(confirmPreviewCommentPinSeq(db, 'project-1', created!.id, 42)).toBe(false);
    const unchanged = getPreviewComment(db, 'project-1', 'conversation-1', created!.id);
    expect(unchanged?.pinSeq).toBe(1);
  });

  it('mergeSyncedPreviewComment adopts the wire seq directly for a brand-new pulled comment', () => {
    const db = seededDb();
    const wire: CollabCloudComment = {
      id: 'comment-from-peer',
      projectId: 'project-1',
      conversationId: 'conversation-on-peer',
      memberId: 'member-peer',
      seq: 777,
      note: 'From a teammate',
      filePath: 'index.html',
      elementId: 'hero-title',
      selector: '[data-od-id="hero-title"]',
      label: 'h1.hero-title',
      text: 'Hero',
      htmlHint: '<h1>',
      position: { x: 0, y: 0, width: 10, height: 10 },
      status: 'open',
      createdAt: 1000,
      updatedAt: 1000,
    };
    expect(mergeSyncedPreviewComment(db, 'project-1', 'conversation-1', wire)).toBe(true);
    const merged = getPreviewComment(db, 'project-1', 'conversation-1', 'comment-from-peer');
    expect(merged?.pinSeq).toBe(777);

    // An in-place EDIT merge (same id, newer updatedAt) must not touch pin_seq.
    expect(
      mergeSyncedPreviewComment(db, 'project-1', 'conversation-1', {
        ...wire,
        seq: 900,
        note: 'Edited note',
        updatedAt: 2000,
      }),
    ).toBe(true);
    const edited = getPreviewComment(db, 'project-1', 'conversation-1', 'comment-from-peer');
    expect(edited?.pinSeq).toBe(777);
    expect(edited?.note).toBe('Edited note');
  });
});

describe('pin_seq concurrency — two devices, no collision after confirmation (recvq5BVsolIxi)', () => {
  it('two devices creating a comment in the same poll window get colliding provisional numbers but distinct confirmed ones', () => {
    // Device A creates its own new comment on a team-shared project. It
    // computes pin_seq from ITS OWN local rows only (there are none yet), so
    // it lands on 1 — a provisional guess, unconfirmed.
    const deviceA = newDeviceDb('a');
    extraTempDirs.push(deviceA.dir);
    const commentA = upsertPreviewComment(
      deviceA.db,
      'project-1',
      'conversation-1',
      { target: target({ elementId: 'from-a' }), note: 'From device A' },
      { pinPendingCloudConfirm: true },
    );
    expect(commentA?.pinSeq).toBe(1);

    // Device B — a SEPARATE local sqlite file, standing in for a second
    // daemon on a second machine — independently creates its OWN new comment
    // within the same ~5s poll window, before either side's collab-cloud
    // sync has caught up. Opening it closes device A's handle (the daemon
    // process model is one active db at a time); the file on disk keeps
    // device A's committed row.
    const deviceB = newDeviceDb('b');
    extraTempDirs.push(deviceB.dir);
    const commentB = upsertPreviewComment(
      deviceB.db,
      'project-1',
      'conversation-1',
      { target: target({ elementId: 'from-b' }), note: 'From device B' },
      { pinPendingCloudConfirm: true },
    );
    // THE RACE: computed independently, with no visibility into the other
    // device's row, both land on the same provisional number.
    expect(commentB?.pinSeq).toBe(1);
    expect(commentB?.pinSeq).toBe(commentA?.pinSeq);

    // The collab-cloud push for device B's comment resolves first (order is
    // arbitrary — the mechanism does not depend on which side wins the
    // network race) with its globally-serialized, project-wide seq.
    expect(confirmPreviewCommentPinSeq(deviceB.db, 'project-1', commentB!.id, 502)).toBe(true);
    const confirmedB = getPreviewComment(deviceB.db, 'project-1', 'conversation-1', commentB!.id);
    expect(confirmedB?.pinSeq).toBe(502);

    // Device A's own push resolves too, with a DIFFERENT cloud-assigned seq.
    const deviceAAgain = openDatabase(deviceA.dir, { dataDir: deviceA.dir });
    expect(confirmPreviewCommentPinSeq(deviceAAgain, 'project-1', commentA!.id, 501)).toBe(true);
    const confirmedA = getPreviewComment(deviceAAgain, 'project-1', 'conversation-1', commentA!.id);
    expect(confirmedA?.pinSeq).toBe(501);

    // No collision once both sides are confirmed — the whole point of the fix.
    expect(confirmedA?.pinSeq).not.toBe(confirmedB?.pinSeq);

    // And the system converges: when device A later PULLS device B's comment
    // through the collab cloud, it adopts the exact same confirmed seq device
    // B settled on (777 → wire seq path already covered above; here 502),
    // landing distinct from its own comment's number too.
    const pulled: CollabCloudComment = {
      id: commentB!.id,
      projectId: 'project-1',
      conversationId: 'conversation-on-b',
      memberId: 'member-b',
      seq: 502,
      note: commentB!.note,
      filePath: commentB!.filePath,
      elementId: commentB!.elementId,
      selector: commentB!.selector,
      label: commentB!.label,
      text: commentB!.text,
      htmlHint: commentB!.htmlHint,
      position: commentB!.position,
      status: commentB!.status,
      createdAt: commentB!.createdAt,
      updatedAt: commentB!.updatedAt,
    };
    expect(mergeSyncedPreviewComment(deviceAAgain, 'project-1', 'conversation-1', pulled)).toBe(true);
    const mergedOnA = getPreviewComment(deviceAAgain, 'project-1', 'conversation-1', commentB!.id);
    expect(mergedOnA?.pinSeq).toBe(502);
    expect(mergedOnA?.pinSeq).not.toBe(confirmedA?.pinSeq);
  });
});
