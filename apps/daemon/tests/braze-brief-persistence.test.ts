import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { migrateBraze, insertBrazeMessage, getBrazeMessage, updateBrazeMessage } from '../src/braze/persistence.js';

// brief_path 없는 레거시 braze_messages 테이블을 흉내내는 헬퍼.
function legacyDb(): Database.Database {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE conversations (id TEXT PRIMARY KEY);
    CREATE TABLE braze_messages (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, conversation_id TEXT NOT NULL,
      brand_id TEXT, title TEXT NOT NULL, goal TEXT, iam_format TEXT NOT NULL,
      delivery_model TEXT, trigger_event TEXT, trigger_props_json TEXT, segment_json TEXT,
      tone TEXT, emphasis TEXT, variant_count INTEGER NOT NULL DEFAULT 1,
      plan_json TEXT, status TEXT NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    );
    INSERT INTO projects (id) VALUES ('p1');
    INSERT INTO conversations (id) VALUES ('c1');
  `);
  return db;
}

describe('braze brief_path migration', () => {
  it('adds brief_path to an existing braze_messages table and preserves rows', () => {
    const db = legacyDb();
    db.prepare(`INSERT INTO braze_messages (id, project_id, conversation_id, title, iam_format, status, created_at, updated_at)
      VALUES ('m1','p1','c1','t','custom_html','plan_confirmed',1,1)`).run();
    migrateBraze(db); // 재실행 — 컬럼 추가되어야 함
    const cols = db.prepare(`PRAGMA table_info(braze_messages)`).all() as Array<{ name: string }>;
    expect(cols.map((c) => c.name)).toContain('brief_path');
    const msg = getBrazeMessage(db, 'm1');
    expect(msg).not.toBeNull();
    expect(msg!.briefPath).toBeNull();
  });

  it('round-trips briefPath through updateBrazeMessage', () => {
    const db = legacyDb();
    migrateBraze(db);
    insertBrazeMessage(db, { id: 'm2', projectId: 'p1', conversationId: 'c1', title: 't', status: 'plan_confirmed', now: 1 });
    updateBrazeMessage(db, 'm2', { briefPath: 'braze/m2-t/brief.md' }, 2);
    expect(getBrazeMessage(db, 'm2')!.briefPath).toBe('braze/m2-t/brief.md');
  });
});
