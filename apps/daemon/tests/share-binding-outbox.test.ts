import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import { createShareBindingOutbox, recordPendingShareBinding, type ShareBindingIntent } from '../src/collab/share-binding-outbox.js';
const intent = (): ShareBindingIntent => ({ resourceTeamId: 'w', ownerMemberId: 'o', resourceId: 'r', projectId: 'p', publicationRevision: 'rev1',
  receipt: { filePath: 'index.html', slug: 'stable', publishedAt: 123, version: 1, versionId: 'immutable1', entryPath: 'index.html' } });
it('persists separately from stop tasks and never resets a duplicate failure budget', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'od-binding-')); let db = new Database(path.join(root, 'queue.sqlite'));
  try {
    let box = createShareBindingOutbox(db); const input = intent(); box.enqueue(input);
    for (let i = 0; i < 6; i++) box.fail(box.list()[0]!);
    expect(box.enqueue(input).failureCount).toBe(5);
    db.close(); db = new Database(path.join(root, 'queue.sqlite')); box = createShareBindingOutbox(db);
    expect(box.list()).toEqual([expect.objectContaining({ failureCount: 5, receipt: input.receipt })]);
    expect(recordPendingShareBinding(box, input, true)).toMatchObject({ status: 'binding_pending', binding: { retrying: false } });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name LIKE '%stop%'").all()).toEqual([]);
  } finally { db.close(); rmSync(root, { recursive: true, force: true }); }
});
it('isolates identities and generations, and stale completions cannot consume updated tasks', () => {
  const db = new Database(':memory:');
  try {
    const box = createShareBindingOutbox(db); const old = box.enqueue(intent());
    box.enqueue({ ...intent(), ownerMemberId: 'other' });
    box.enqueue({ ...intent(), publicationRevision: 'rev2', receipt: { ...intent().receipt, version: 2, versionId: 'immutable2' } });
    box.fail(old); box.complete(old); // stale failure count must not clear the task
    expect(box.list()).toHaveLength(3);
    box.complete(box.list()[0]!); expect(box.list()).toHaveLength(2);
    expect(box.list().every(task => task.failureCount === 1)).toBe(true);
    expect(() => box.enqueue({ ...intent(), publicationRevision: 'rev2', receipt: { ...intent().receipt, versionId: 'wrong' } })).toThrow('SHARE_BINDING_GENERATION_CONFLICT');
  } finally { db.close(); }
});
it('fails closed on corrupt stored receipts without exposing stored content', () => {
  const db = new Database(':memory:');
  try {
    const box = createShareBindingOutbox(db); box.enqueue(intent());
    db.exec("UPDATE share_binding_outbox SET receipt_json = 'private-invalid-json'");
    expect(() => box.list()).toThrow(/^SHARE_BINDING_STORAGE_INVALID$/);
    expect(recordPendingShareBinding(box, intent(), true)).toMatchObject({ status: 'binding_pending', binding: { retrying: false, code: 'SHARE_BINDING_RETRY_UNAVAILABLE' } });
  } finally { db.close(); }
});

it('reports confirmed partial publication honestly on unavailable retry and database failure, without internal IDs', () => {
  const db = new Database(':memory:'); const box = createShareBindingOutbox(db); const input = intent();
  Object.assign(input.receipt, { ownerMemberId: 'private', revisionToken: 'private' });
  try {
    expect(recordPendingShareBinding(box, input)).toEqual({ status: 'binding_pending', receipt: intent().receipt, binding: { retrying: false } });
    expect(recordPendingShareBinding(box, input, true)).toMatchObject({ binding: { retrying: true } });
    db.close();
    expect(recordPendingShareBinding(box, input, true)).toEqual({ status: 'binding_pending', receipt: intent().receipt, binding: { retrying: false, code: 'SHARE_BINDING_RETRY_UNAVAILABLE' } });
    expect(() => recordPendingShareBinding(box, { ...input, receipt: { ...input.receipt, versionId: '' } })).toThrow('SHARE_RECEIPT_REQUIRED');
  } finally { if (db.open) db.close(); }
});
