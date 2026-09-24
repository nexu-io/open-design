/**
 * conversation_compactions 表 = API 模式手动压缩的落盘点。
 *
 * 语义（issue #5991 第一版契约）：
 *  - 每个会话最多一条 checkpoint（PK = conversation_id），重复压缩覆盖旧行；
 *  - cut_at_message_id 之前的转录由 summary_text + ledger_json 替代；
 *  - ledger 是机器清洗产物（identifier 合并 + 键排序），必须字节稳定 round-trip，
 *    且读取端坏 JSON 时回落空账本而不是抛错；
 *  - 会话删除时 checkpoint 随 FK ON DELETE CASCADE 一并清除。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  deleteConversation,
  getConversationCompaction,
  openDatabase,
  upsertConversationCompaction,
} from '../src/db.js';
import type { CompactionLedgerEntry, ConversationCompactionRow } from '../src/db.js';

describe('conversation_compactions store', () => {
  let dataDir: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-compaction-store-'));
    db = openDatabase(dataDir, { dataDir });
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('proj-compaction', 'proj-compaction', now, now);
    db.prepare(
      `INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('conv-compaction', 'proj-compaction', now, now);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  function makeRow(overrides: Partial<ConversationCompactionRow> = {}): ConversationCompactionRow {
    return {
      conversationId: 'conv-compaction',
      cutAtMessageId: 'msg-42',
      summaryText: 'The user asked for a landing page; we built hero + pricing.',
      ledger: [
        { identifier: 'design:page:landing', description: 'Landing page artifact', fileName: 'index.html' },
        { identifier: 'design:page:pricing', description: 'Pricing section artifact', fileName: 'pricing.html' },
      ],
      modelId: 'gemini-3.8-flash',
      modelLabel: 'Gemini 3.8 Flash',
      createdAt: 1_000,
      updatedAt: 2_000,
      ...overrides,
    };
  }

  it('inserts a checkpoint and reads it back byte-stable', () => {
    const saved = upsertConversationCompaction(db, makeRow());
    expect(saved).not.toBeNull();

    const loaded = getConversationCompaction(db, 'conv-compaction');
    expect(loaded).toEqual({
      conversationId: 'conv-compaction',
      cutAtMessageId: 'msg-42',
      summaryText: 'The user asked for a landing page; we built hero + pricing.',
      ledger: [
        { identifier: 'design:page:landing', description: 'Landing page artifact', fileName: 'index.html' },
        { identifier: 'design:page:pricing', description: 'Pricing section artifact', fileName: 'pricing.html' },
      ],
      modelId: 'gemini-3.8-flash',
      modelLabel: 'Gemini 3.8 Flash',
      createdAt: 1_000,
      updatedAt: 2_000,
    });
  });

  it('overwrites the row on re-compaction (single checkpoint per conversation)', () => {
    upsertConversationCompaction(db, makeRow());
    const replaced = upsertConversationCompaction(
      db,
      makeRow({
        cutAtMessageId: 'msg-99',
        summaryText: 'Second compaction covers more turns.',
        ledger: [{ identifier: 'design:page:landing', description: 'Landing page artifact', fileName: 'index.html' }],
        createdAt: 3_000,
        updatedAt: 4_000,
      }),
    );

    expect(replaced?.cutAtMessageId).toBe('msg-99');
    const loaded = getConversationCompaction(db, 'conv-compaction');
    expect(loaded?.summaryText).toBe('Second compaction covers more turns.');
    expect(loaded?.updatedAt).toBe(4_000);
    // 覆盖后不保留旧行：同会话再查仍只有一条。
    expect(
      db
        .prepare(`SELECT COUNT(*) AS n FROM conversation_compactions WHERE conversation_id = ?`)
        .get('conv-compaction') as { n: number },
    ).toEqual({ n: 1 });
  });

  it('returns null when the conversation has no checkpoint', () => {
    expect(getConversationCompaction(db, 'conv-never-compacted')).toBeNull();
  });

  it('falls back to an empty ledger when ledger_json is corrupt', () => {
    upsertConversationCompaction(db, makeRow());
    db.prepare(
      `UPDATE conversation_compactions SET ledger_json = ? WHERE conversation_id = ?`,
    ).run('{not json', 'conv-compaction');

    const loaded = getConversationCompaction(db, 'conv-compaction');
    expect(loaded).not.toBeNull();
    expect(loaded?.ledger).toEqual([]);
    expect(loaded?.summaryText).toBe('The user asked for a landing page; we built hero + pricing.');
  });

  it('cascades away when the conversation is deleted', () => {
    upsertConversationCompaction(db, makeRow());
    deleteConversation(db, 'conv-compaction');
    expect(getConversationCompaction(db, 'conv-compaction')).toBeNull();
  });

  it('persists ledger entries exactly as washed (no re-ordering in storage)', () => {
    const washed: CompactionLedgerEntry[] = [
      { identifier: 'design:page:landing', description: 'Landing page artifact', fileName: 'index.html' },
      { identifier: 'design:page:pricing', description: 'Pricing section artifact', fileName: null },
    ];
    upsertConversationCompaction(db, makeRow({ ledger: washed }));
    const loaded = getConversationCompaction(db, 'conv-compaction');
    expect(JSON.stringify(loaded?.ledger)).toBe(JSON.stringify(washed));
  });
});
