import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { getMessage, listMessages, openDatabase, upsertMessage } from '../src/db.js';

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'od-quality-message-'));
  roots.push(root);
  const db = openDatabase(root, { dataDir: path.join(root, 'data') });
  db.prepare('INSERT INTO projects (id,name,created_at,updated_at) VALUES (?,?,?,?)').run('p', 'P', 1, 1);
  db.prepare('INSERT INTO conversations (id,project_id,created_at,updated_at) VALUES (?,?,?,?)').run('c', 'p', 1, 1);
  return db;
}
const evidence = { schema: 'open-design.deliverable-quality/v1', checker: 'prototype-interaction@1',
  candidateHash: 'a'.repeat(64), status: 'fail', entryFile: 'index.html', checkedAt: 123, durationMs: 20,
  coverage: { expected: 1, checked: 1, complete: true },
  checks: [{ id: 'nav', kind: 'navigation', status: 'fail', reason: 'content_unchanged' }] };
describe('host-owned deliverable quality persistence', () => {
  it('keeps host failure across client rewrites, refuses a spoofed pass, and clears it for a new Run', () => {
    const db = fixture();
    try {
      const message = { id: 'm', role: 'assistant', content: 'generated', runId: 'r1', runStatus: 'succeeded' };
      upsertMessage(db, 'c', { ...message, deliverableQuality: { ...evidence, status: 'pass' } });
      expect(getMessage(db, 'm')?.deliverableQuality).toBeUndefined();
      db.prepare('UPDATE messages SET deliverable_quality_json=? WHERE id=?').run(JSON.stringify(evidence), 'm');
      upsertMessage(db, 'c', { ...message, content: 'client refresh' });
      expect(getMessage(db, 'm')?.deliverableQuality).toEqual(evidence);
      upsertMessage(db, 'c', { ...message, deliverableQuality: { ...evidence, status: 'pass' } });
      expect(listMessages(db, 'c')[0]?.deliverableQuality).toEqual(evidence);
      upsertMessage(db, 'c', { ...message, runId: 'r2', runStatus: 'running' });
      expect(getMessage(db, 'm')?.deliverableQuality).toBeUndefined();
    } finally { db.close(); }
  });
  it('preserves historical messages without inventing quality evidence', () => {
    const db = fixture();
    try {
      upsertMessage(db, 'c', { id: 'old', role: 'assistant', content: 'done', runStatus: 'succeeded' });
      expect(listMessages(db, 'c')[0]?.deliverableQuality).toBeUndefined();
    } finally { db.close(); }
  });
});
