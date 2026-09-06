/**
 * 落库的 `status:error` 事件要带上 daemon 的裁决。
 *
 * daemon 在 finalize 时算出 `retryable` 和 `user_action`
 * (`run-failure-classification.ts`),`server.ts` 把 `user_action` 盖成
 * `run.failureAction`。但 `persistRunFailureClassification` 只把
 * `failureCategory` / `failureDetail` 写进那条持久化事件,于是重载一次对话之后,
 * 前端那条「后端说重试没用就降档」的分支永远读不到裁决。
 *
 * 这里钉住三档,因为混成一档会削掉最该保留重试的那一格:
 *
 *  1. 后端命名 + 不可重试 → 两个字段都落盘(注意 `false` 是假值)
 *  2. 后端命名 + 可重试   → `retryable: true` 同样落盘
 *  3. run 上没有裁决(老 daemon / 早期分类器)→ 事件上一个字段都不长出来
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { closeDatabase, openDatabase } from '../src/db.js';
import { persistRunFailureClassification } from '../src/runtimes/chat-run-messages.js';

type StoredEvent = Record<string, unknown>;

describe('persistRunFailureClassification carries the daemon verdict', () => {
  let dataDir: string;
  let db: ReturnType<typeof openDatabase>;

  beforeEach(() => {
    dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-run-verdict-'));
    db = openDatabase(dataDir, { dataDir });
    const now = Date.now();
    db.prepare(
      `INSERT INTO projects (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('proj-verdict', 'proj-verdict', now, now);
    db.prepare(
      `INSERT INTO conversations (id, project_id, created_at, updated_at) VALUES (?, ?, ?, ?)`,
    ).run('conv-verdict', 'proj-verdict', now, now);
  });

  afterEach(() => {
    closeDatabase();
    rmSync(dataDir, { recursive: true, force: true });
  });

  /** Seed the assistant message with the bare error frame the child-close
   *  handler persists BEFORE finalize — the exact state the enrichment runs on. */
  function seedFailedMessage(id: string, detail: string): string {
    db.prepare(
      `INSERT INTO messages (id, conversation_id, role, content, position, created_at, events_json)
       VALUES (?, 'conv-verdict', 'assistant', '', 0, ?, ?)`,
    ).run(
      id,
      Date.now(),
      JSON.stringify([{ kind: 'status', label: 'error', detail }]),
    );
    return id;
  }

  function storedErrorEvent(messageId: string): StoredEvent {
    const row = db
      .prepare(`SELECT events_json AS eventsJson FROM messages WHERE id = ?`)
      .get(messageId) as { eventsJson?: string } | undefined;
    const events = JSON.parse(row?.eventsJson ?? '[]') as StoredEvent[];
    const error = [...events]
      .reverse()
      .find((event) => event.kind === 'status' && event.label === 'error');
    expect(error, 'stored message should carry a status:error event').toBeTruthy();
    return error as StoredEvent;
  }

  it('档 1 · 后端命名且不可重试 → retryable:false / failureAction:"none" 落盘', () => {
    const messageId = seedFailedMessage('msg-futile', 'agent exited with code 1');
    persistRunFailureClassification(db, {
      id: 'run-futile',
      assistantMessageId: messageId,
      errorCode: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'process_exit',
      failureDetail: 'spawn_enoexec',
      retryable: false,
      failureAction: 'none',
    });

    expect(storedErrorEvent(messageId)).toEqual({
      kind: 'status',
      label: 'error',
      detail: 'agent exited with code 1',
      code: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'process_exit',
      failureDetail: 'spawn_enoexec',
      retryable: false,
      failureAction: 'none',
    });
  });

  it('档 2 · 后端命名但可重试 → retryable:true / failureAction:"retry" 落盘', () => {
    const messageId = seedFailedMessage('msg-transient', 'upstream returned 503');
    persistRunFailureClassification(db, {
      id: 'run-transient',
      assistantMessageId: messageId,
      errorCode: 'UPSTREAM_UNAVAILABLE',
      failureCategory: 'upstream_unavailable',
      failureDetail: 'upstream_5xx',
      retryable: true,
      failureAction: 'retry',
    });

    expect(storedErrorEvent(messageId)).toEqual({
      kind: 'status',
      label: 'error',
      detail: 'upstream returned 503',
      code: 'UPSTREAM_UNAVAILABLE',
      failureCategory: 'upstream_unavailable',
      failureDetail: 'upstream_5xx',
      retryable: true,
      failureAction: 'retry',
    });
  });

  it('档 3 · run 上没有裁决 → 事件上一个字段都不长出来', () => {
    const messageId = seedFailedMessage('msg-legacy', 'agent exited with code 1');
    persistRunFailureClassification(db, {
      id: 'run-legacy',
      assistantMessageId: messageId,
      errorCode: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'process_exit',
      failureDetail: 'spawn_enoexec',
    });

    // 精确相等,不用否定式匹配 —— 「多长出一个 undefined 字段」也算回归。
    expect(storedErrorEvent(messageId)).toEqual({
      kind: 'status',
      label: 'error',
      detail: 'agent exited with code 1',
      code: 'AGENT_EXECUTION_FAILED',
      failureCategory: 'process_exit',
      failureDetail: 'spawn_enoexec',
    });
  });
});
