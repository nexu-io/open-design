/**
 * 一轮跑完之后,那份产物到底有没有**归档到消息上** —— Plane OPEND-2598 / 2608。
 *
 * 两单的定位证据是同一句话:run 成功了(2598 的 `end` 事件写着
 * `status=succeeded, artifactCount=1, artifactPaths=[wallpaper-capybara.png]`)、
 * 文件真的躺在项目里、右侧能打开,可数据库里那条 assistant message 的
 * `produced_files_json` / `trace_object_files_json` / `telemetry_finalized_at`
 * **全是 null**。ChatPanel 的产物卡只认落库的 `producedFiles`
 * (`AssistantMessage.media-produced-cards.test.tsx` 钉过渲染层那一半),
 * 于是对话里什么都不显示。
 *
 * 为什么会 null:`produced_files_json` 今天**只有 web 客户端写**
 * (`PUT /api/projects/:id/conversations/:cid/messages/:mid` 是唯一入口),
 * 而算它的那段代码住在 `ProjectView` 的 SSE `onDone` 闭包里。用户在跑的时候离开
 * 项目 —— 或者只是切了会话 —— `ProjectView` 卸载,`abortRef.current.abort()` 把流
 * 摘掉,`daemon.ts` 里的 `AbortError` 分支直接 `return`,`onDone` 永远不执行。
 * daemon 这边照常把消息 promote 成 `succeeded`
 * (`reconcileAssistantMessageOnRunEnd`),**但不带任何产物关联**。等用户回来,
 * `shouldReplayTerminalRunMessage` 见到一条「succeeded + 有正文 + 没产物」的行,
 * 5 分钟的 `DESIGN_DELIVERY_RECONCILIATION_WINDOW_MS` 一过就不再补齐(#6505 留下的
 * 防循环闸)。那张卡从此永远不会出现。
 *
 * 所以这条测试**故意不扮演客户端**:它跑一轮真的 run、真的写文件,然后一次
 * `PUT .../messages/:mid` 都不发,直接问 daemon 要这条会话的消息。产物关联必须
 * 已经在那儿了 —— 这正是 2598 的验收原话:「无论当前项目视图是否挂载,成功运行的
 * artifactPaths 都应可靠关联并持久化到对应 assistant message」。
 *
 * 夹具用媒体产物(png / mp3)而不是 html:两张单讲的都是媒体轮,而且媒体文件
 * 是媒体任务写进项目的、不经过 Write/Edit 工具行,`AssistantMessage` 那条
 * `inferProducedFilesFromTurn` 的正文闸对它完全不生效 —— 落库是唯一的来源。
 */

import type http from 'node:http';
import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startServer } from '../src/server.js';
import { associateRunProducedFiles } from '../src/runtimes/run-produced-files.js';

/**
 * Open the running server's own database, the way the cover suite does.
 *
 * `await`s the callback before closing — a sync `finally` would close the
 * handle out from under an async caller and the statement would run on a dead
 * connection.
 */
async function withDb<T>(fn: (db: Database.Database) => T | Promise<T>): Promise<T> {
  const dir = process.env.OD_DATA_DIR;
  if (!dir) throw new Error('OD_DATA_DIR is required for this suite');
  const db = new Database(resolve(dir, 'app.sqlite'));
  try {
    return await fn(db);
  } finally {
    db.close();
  }
}

interface StoredMessage {
  id: string;
  role: string;
  runId?: string;
  runStatus?: string;
  producedFiles?: Array<{ name: string; kind?: string; mime?: string; size?: number }>;
}

let baseUrl: string;
let server: http.Server;
const tempDirs: string[] = [];

/** 把一个假 agent 塞到 PATH 最前面 —— 与 `chat-artifacts-run-cover.test.ts` 同一套。 */
async function withFakeAgent<T>(binName: string, script: string, run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-produced-bin-'));
  tempDirs.push(dir);
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, `${binName}-test-runner.cjs`);
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(dir, `${binName}.cmd`), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, binName);
      await fsp.writeFile(bin, `#!/usr/bin/env node\n${script}`);
      await fsp.chmod(bin, 0o755);
    }
    process.env.PATH = `${dir}${delimiter}${oldPath ?? ''}`;
    return await run();
  } finally {
    process.env.PATH = oldPath;
  }
}

async function waitFor<T>(
  probe: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 8_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await probe();
  while (!predicate(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    last = await probe();
  }
  return last;
}

async function readMessages(projectId: string, conversationId: string): Promise<StoredMessage[]> {
  const res = await fetch(
    `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(res.ok).toBe(true);
  return ((await res.json()) as { messages: StoredMessage[] }).messages;
}

/**
 * 跑一轮真的 run,让它把两份媒体产物写进 run cwd。
 *
 * **客户端那一半刻意不做**:不发 `PUT .../messages/:mid`。这条测试模拟的就是
 * 「用户在跑的时候离开了项目」—— 浏览器根本没机会算产物、更没机会写回来。
 */
async function runTurnThatWritesMedia(): Promise<{
  projectId: string;
  conversationId: string;
  messageId: string;
  cwd: string;
}> {
  const projectId = `proj-${randomUUID()}`;
  const assistantMessageId = `assistant-${randomUUID()}`;
  const created = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name: 'media produced-files fixture' }),
  });
  expect(created.ok).toBe(true);

  const conversations = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
  expect(conversations.ok).toBe(true);
  const conversationId = ((await conversations.json()) as { conversations: Array<{ id: string }> })
    .conversations[0]?.id;
  expect(conversationId).toBeTruthy();

  // 一张真 1x1 PNG 和一段真 MP3 头:daemon 会 stat 它们并按后缀分类,
  // 内容只要不是空文件即可。
  const script = `
const fs = require('node:fs');
const path = require('node:path');
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
fs.writeFileSync(path.join(process.cwd(), 'wallpaper-capybara.png'), PNG);
fs.writeFileSync(path.join(process.cwd(), 'greeting-autumn-cn.mp3'), Buffer.alloc(2048, 7));
console.log(JSON.stringify({ type: 'step_start' }));
console.log(JSON.stringify({ type: 'text', part: { text: 'cwd=' + process.cwd() + '=cwd 图片已生成' } }));
console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
process.exit(0);
`;

  const body = await withFakeAgent('opencode', script, async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        assistantMessageId,
        message: '生成一张水豚壁纸和一段问候语音',
      }),
    });
    expect(response.ok).toBe(true);
    return await response.text();
  });

  const cwd = /cwd=(.+?)=cwd/.exec(body)?.[1];
  expect(cwd, 'the fake agent should report the run cwd').toBeTruthy();

  await waitFor(
    async () => (await readMessages(projectId, conversationId!)).find((m) => m.id === assistantMessageId),
    (m) => m?.runStatus === 'succeeded',
  );

  return { projectId, conversationId: conversationId!, messageId: assistantMessageId, cwd: cwd! };
}

describe('run terminal produced-file association', () => {
  beforeAll(async () => {
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
  }, 60_000);

  afterAll(async () => {
    for (const dir of tempDirs.splice(0)) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
    if (server) await new Promise<void>((done) => server.close(() => done()));
  });

  it('associates a succeeded run\'s artifacts with its assistant message without any client write', async () => {
    const turn = await runTurnThatWritesMedia();

    const message = await waitFor(
      async () => (await readMessages(turn.projectId, turn.conversationId))
        .find((m) => m.id === turn.messageId),
      (m) => (m?.producedFiles?.length ?? 0) > 0,
    );

    // 先证明这一轮确实跑成功了 —— 否则下面的断言在讲另一个故事
    expect(message?.runStatus).toBe('succeeded');

    const names = (message?.producedFiles ?? []).map((f) => f.name).sort();
    expect(names, '成功 run 的产物没有关联到 assistant message').toEqual([
      'greeting-autumn-cn.mp3',
      'wallpaper-capybara.png',
    ]);

    // 形状必须是 ChatPanel 认的那种 `ProjectFile`,不是一串裸文件名 ——
    // 卡片按 `kind` / `mime` 分图片卡与音频胶囊,`size` 还要显示出来。
    const audio = message!.producedFiles!.find((f) => f.name === 'greeting-autumn-cn.mp3');
    expect(audio?.kind).toBe('audio');
    expect(audio?.mime).toContain('audio');
    expect(audio?.size).toBe(2048);
  }, 40_000);

  /**
   * daemon 写的是**地板,不是判决**。
   *
   * 客户端见过 pre-turn 快照、daemon 没有,所以「哪些文件算这一轮的产物」终审权
   * 仍在客户端。这条测试把两个方向都钉住:客户端来了就以它为准;客户端已经写过
   * 之后,daemon 的兜底必须再也不动那一列(`WHERE produced_files_json IS NULL`)。
   * 少了后半条,一轮重试或一次重放就会把用户看到的卡换成另一批文件。
   */
  it('is a floor: the client overrides it, and it never writes over the client', async () => {
    const turn = await runTurnThatWritesMedia();
    await waitFor(
      async () => (await readMessages(turn.projectId, turn.conversationId))
        .find((m) => m.id === turn.messageId),
      (m) => (m?.producedFiles?.length ?? 0) > 0,
    );

    // 方向一:客户端回来了,给出**它自己**的结论。
    const before = (await readMessages(turn.projectId, turn.conversationId))
      .find((m) => m.id === turn.messageId)!;
    const clientList = [
      {
        name: 'wallpaper-capybara.png',
        path: 'wallpaper-capybara.png',
        type: 'file',
        size: 1,
        mtime: 1,
        kind: 'image',
        mime: 'image/png',
      },
    ];
    const put = await fetch(
      `${baseUrl}/api/projects/${turn.projectId}/conversations/${turn.conversationId}/messages/${turn.messageId}`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // 这条路由收的是**裸消息**,不是 `{ message: … }` 的信封。
        body: JSON.stringify({ ...before, producedFiles: clientList }),
      },
    );
    expect(put.ok).toBe(true);

    const afterClient = (await readMessages(turn.projectId, turn.conversationId))
      .find((m) => m.id === turn.messageId);
    expect(
      afterClient?.producedFiles?.map((f) => f.name),
      'daemon 的地板压过了客户端的权威清单',
    ).toEqual(['wallpaper-capybara.png']);

    // 方向二:再跑一次关联(重试 / 重放 / 幂等重入),那一列不许再变。
    const outcome = await withDb((db) => associateRunProducedFiles(db, {
      messageId: turn.messageId,
      projectRoot: turn.cwd,
      touchedPaths: [join(turn.cwd, 'greeting-autumn-cn.mp3')],
    }));
    expect(outcome.written, '兜底在客户端写过之后又动了那一列').toBe(false);

    const afterSecondPass = (await readMessages(turn.projectId, turn.conversationId))
      .find((m) => m.id === turn.messageId);
    expect(afterSecondPass?.producedFiles?.map((f) => f.name)).toEqual([
      'wallpaper-capybara.png',
    ]);
  }, 40_000);
});
