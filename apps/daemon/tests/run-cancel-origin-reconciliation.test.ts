// 红测:run 结束时,**daemon 自己**把「谁取消的」写到那条助手消息上。
//
// 为什么不能只靠客户端 PUT 带上来:客户端按停之后会先把自己那条消息标成
// `canceled` 并 PUT 一次,状态闩由此落定;而「是谁停的」这件事客户端根本答不出来
// —— `runStatus: 'canceled'` 分不出用户按停与 daemon 关机 / 项目清理杀掉。
// daemon 是唯一的证人,所以它在 run 落终态时**无条件**补写这一列,
// 不受「状态还没落定」那道闩的限制。
//
// 这条测试守的是 §4 R8:daemon 重启后,那一行不能显示成「你手动停了任务」。

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {
  closeDatabase,
  insertConversation,
  insertProject,
  listMessages,
  openDatabase,
  upsertMessage,
} from '../src/db.js';
import { reconcileAssistantMessageOnRunEnd } from '../src/plugins/share-helpers.js';

describe('reconcileAssistantMessageOnRunEnd records who cancelled', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'od-cancel-origin-recon-'));
  });

  afterEach(() => {
    closeDatabase();
    rmSync(tempDir, { recursive: true, force: true });
  });

  function seed(db: ReturnType<typeof openDatabase>, runStatus: 'running' | 'canceled') {
    const now = Date.now();
    insertProject(db, { id: 'proj-1', name: 'P', createdAt: now, updatedAt: now });
    insertConversation(db, {
      id: 'conv-1',
      projectId: 'proj-1',
      title: 'C',
      createdAt: now,
      updatedAt: now,
    });
    upsertMessage(db, 'conv-1', {
      id: 'assistant-1',
      role: 'assistant',
      content: '',
      runId: 'run-1',
      runStatus,
      startedAt: now,
    });
  }

  const waiter = (status: string, cancelOrigin: string | null) => ({
    wait: async () => ({ status, cancelOrigin }),
  });

  it('writes the origin even when the client already latched `canceled`', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    // The client stopped its own stream first — this is the normal ordering.
    seed(db, 'canceled');

    reconcileAssistantMessageOnRunEnd(
      db,
      waiter('canceled', 'user_stop'),
      { id: 'run-1', assistantMessageId: 'assistant-1' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(listMessages(db, 'conv-1')[0]!.cancelOrigin).toBe('user_stop');
  });

  // 这条是重点:daemon 关机杀掉的一轮,来源必须如实是 `daemon_shutdown`,
  // 客户端才不会把它画成「已手动暂停任务」。
  it('records a daemon-side kill as itself, never as a user stop', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seed(db, 'running');

    reconcileAssistantMessageOnRunEnd(
      db,
      waiter('canceled', 'daemon_shutdown'),
      { id: 'run-1', assistantMessageId: 'assistant-1' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stored = listMessages(db, 'conv-1')[0]!;
    expect(stored.runStatus).toBe('canceled');
    expect(stored.cancelOrigin).toBe('daemon_shutdown');
    expect(stored.cancelOrigin).not.toBe('user_stop');
  });

  it('leaves the column empty for a run that ended without being cancelled', async () => {
    const db = openDatabase(tempDir, { dataDir: tempDir });
    seed(db, 'running');

    reconcileAssistantMessageOnRunEnd(
      db,
      waiter('succeeded', null),
      { id: 'run-1', assistantMessageId: 'assistant-1' },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    const stored = listMessages(db, 'conv-1')[0]!;
    expect(stored.runStatus).toBe('succeeded');
    expect(stored.cancelOrigin).toBeUndefined();
  });
});
