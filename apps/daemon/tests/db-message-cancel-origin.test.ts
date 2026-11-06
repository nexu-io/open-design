// 红测:「谁停的这一轮」必须**落库**。
//
// 交付稿第 81 格那一行灰字(`PauseLine`)只有在 `cancelOrigin === 'user_stop'`
// 时才画 —— 客户端今天只看 `runStatus: 'canceled'`,会把「用户按停」和
// 「daemon 关机 / 项目清理杀掉」混成一种,照那个判据画,daemon 重启后这一行
// 会**谎报**「你手动停了任务」。
//
// 所以这个字段必须是**存下来的列**,不是内存里的客户端旗标:刷新之后那一行
// 还得在,而且还得是同一个来源。`upsertMessage` 是显式列名写入 —— 不加列的话
// PUT 上来的 `cancelOrigin` 会被整个丢掉(`forkedInto` / `sendFailed` 两次都踩过)。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  getMessage,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';

describe('message cancelOrigin persistence', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-db-cancel-origin-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seedConversation(db: ReturnType<typeof openDatabase>) {
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'P', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'C',
      createdAt: now,
      updatedAt: now,
    });
    return now;
  }

  it('round-trips a user_stop cancelOrigin through INSERT and listMessages', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = seedConversation(db);
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'run-1',
      runStatus: 'canceled',
      startedAt: now,
      cancelOrigin: 'user_stop',
    });

    const reloaded = listMessages(db, 'conv-1');
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0]!.cancelOrigin).toBe('user_stop');
    expect(getMessage(db, 'assistant-1')!.cancelOrigin).toBe('user_stop');
  });

  it('round-trips it through the UPDATE branch too (the run is stopped after it exists)', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = seedConversation(db);
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'run-1',
      runStatus: 'running',
      startedAt: now,
    });
    expect(listMessages(db, 'conv-1')[0]!.cancelOrigin).toBeUndefined();

    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'run-1',
      runStatus: 'canceled',
      startedAt: now,
      cancelOrigin: 'user_stop',
    });

    expect(listMessages(db, 'conv-1')[0]!.cancelOrigin).toBe('user_stop');
  });

  // The whole point of storing the origin: a daemon-side kill must never come
  // back as "you stopped this". Every non-user origin round-trips as itself,
  // and an absent origin stays absent.
  it('keeps a daemon-side cancel distinguishable from a user stop', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = seedConversation(db);
    for (const [id, origin] of [
      ['assistant-shutdown', 'daemon_shutdown'],
      ['assistant-cleanup', 'project_cleanup'],
      ['assistant-unknown', 'unknown'],
    ] as const) {
      upsertMessage(db, 'conv-1', {
        id,
        role: 'assistant',
        content: '',
        runId: `run-${id}`,
        runStatus: 'canceled',
        startedAt: now,
        cancelOrigin: origin,
      });
    }
    upsertMessage(db, 'conv-1', {
      id: 'assistant-bare',
      role: 'assistant',
      content: '',
      runId: 'run-bare',
      runStatus: 'canceled',
      startedAt: now,
    });

    const byId = new Map(listMessages(db, 'conv-1').map((m) => [m.id, m]));
    expect(byId.get('assistant-shutdown')!.cancelOrigin).toBe('daemon_shutdown');
    expect(byId.get('assistant-cleanup')!.cancelOrigin).toBe('project_cleanup');
    expect(byId.get('assistant-unknown')!.cancelOrigin).toBe('unknown');
    expect(byId.get('assistant-bare')!.cancelOrigin).toBeUndefined();
  });

  it('rejects a garbage origin instead of storing it verbatim', () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    const now = seedConversation(db);
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'run-1',
      runStatus: 'canceled',
      startedAt: now,
      cancelOrigin: 'totally-made-up' as never,
    });

    expect(listMessages(db, 'conv-1')[0]!.cancelOrigin).toBeUndefined();
  });
});
