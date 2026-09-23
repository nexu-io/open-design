/**
 * 媒体产物是**在这一轮结束之后**才落盘的 —— Plane OPEND-2608 / OPEND-2609。
 *
 * `run-produced-files.ts` 那道地板跑在 run 的 terminal chokepoint 上,吃的是这一轮
 * 自己的文件系统 diff。可媒体生成是 202 异步的:`handleGenerate` 立刻返回,
 * provider 的 promise 晚几十秒才 resolve,文件是在**快照拍完之后**才写进项目的。
 * 于是那一刻的 diff 是空的,地板第一行 `touchedPaths.length === 0` 直接 return。
 *
 * 客户端那一半同样够不着:`ProjectView` 的 `onDone` 也是在 terminal 那一刻算
 * `computeProducedFiles`,晚到的文件不在它的 `authoritativeArtifactPaths` 里、也
 * 不在它刚拉的文件列表里。所以它会给这条消息写一份**不含该媒体文件**的清单
 * (常常是 `[]`)—— 这正是 2609 的症状:音频生成出来了、右侧能播,聊天里没有卡。
 *
 * 这条测试把顺序本身钉死,而不是相信推理:
 *   1. 一轮真的 run,agent 只做一件事 —— 用 run 自己的 `OD_TOOL_TOKEN` 打
 *      `POST /api/tools/media/generate`,拿到 202 就退出(真实里就是 `od media
 *      generate` 25s 轮询预算耗尽后的那条 "still running" 交接)。
 *   2. 等 `runStatus` 变成 terminal,**当场断言文件还没落盘** —— 这一步是事实
 *      本身,不是断言风格问题:它证明这一轮的 diff 里不可能有这个文件。
 *   3. 等媒体任务 done,断言该文件已经关联到这条 assistant message 上。
 *
 * provider 用的是 `custom-image`(OpenAI 兼容、baseUrl 可配),指向测试自己起的
 * 一个**故意慢**的本地 HTTP server。这样「晚于 terminal」是构造出来的,不是赌
 * 出来的;stub fallback 全程关闭,provider 出问题就直接红,不会悄悄写占位字节。
 */

import type http from 'node:http';
import Database from 'better-sqlite3';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';
import { associateLateRunProducedFile } from '../src/runtimes/run-produced-files.js';

/** Open the running server's own database, the way the neighbouring suite does. */
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

/** provider 回一张真 1x1 PNG —— `sniffImageExt` 认它,写盘也是真字节。 */
const ONE_BY_ONE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * provider 至少要慢这么久。
 *
 * run 的 terminal 只差「子进程退出 + 一次项目快照」,量级是几十毫秒;把 provider
 * 压到秒级,顺序就不再是竞态而是构造。
 */
const PROVIDER_DELAY_MS = 4_000;

let baseUrl: string;
let server: http.Server;
let providerServer: http.Server;
let providerUrl: string;
let dataDir: string;
const tempDirs: string[] = [];

async function withFakeAgent<T>(binName: string, script: string, run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-late-media-bin-'));
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

interface StoredMessage {
  id: string;
  role: string;
  runId?: string;
  runStatus?: string;
  producedFiles?: Array<{ name: string; kind?: string; mime?: string; size?: number }>;
}

async function readMessages(projectId: string, conversationId: string): Promise<StoredMessage[]> {
  const res = await fetch(
    `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(res.ok).toBe(true);
  return ((await res.json()) as { messages: StoredMessage[] }).messages;
}

async function waitFor<T>(
  probe: () => T | Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 20_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let last = await probe();
  while (!predicate(last) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 50));
    last = await probe();
  }
  return last;
}

const TERMINAL_RUN_STATUSES = new Set(['succeeded', 'failed', 'canceled']);

describe('a media file that lands after the run terminal still reaches its message', () => {
  beforeAll(async () => {
    // A deliberately slow OpenAI-compatible image endpoint.
    providerServer = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        // `prompt: fast …` opts a case out of the stall, so the same fixture can
        // also produce the OPPOSITE ordering (media lands during the run).
        let fast = false;
        try {
          fast = String(JSON.parse(body)?.prompt ?? '').startsWith('fast');
        } catch {
          fast = false;
        }
        setTimeout(() => {
          res.writeHead(200, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ data: [{ b64_json: ONE_BY_ONE_PNG_B64 }] }));
        }, fast ? 0 : PROVIDER_DELAY_MS);
      });
    });
    await new Promise<void>((done) => providerServer.listen(0, '127.0.0.1', () => done()));
    const address = providerServer.address();
    if (!address || typeof address === 'string') throw new Error('provider server has no port');
    providerUrl = `http://127.0.0.1:${address.port}/v1`;

    // Keep the provider credential out of the shared vitest data dir so no other
    // suite in this process inherits it.
    const configDir = await fsp.mkdtemp(join(tmpdir(), 'od-late-media-config-'));
    tempDirs.push(configDir);
    vi.stubEnv('OD_MEDIA_CONFIG_DIR', configDir);

    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    dataDir = process.env.OD_DATA_DIR!;

    const configured = await fetch(`${baseUrl}/api/media/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providers: {
          'custom-image': {
            apiKey: 'late-media-test-key',
            baseUrl: providerUrl,
            model: 'slow-image-model',
          },
        },
      }),
    });
    expect(configured.ok, 'the custom-image provider must be configured').toBe(true);
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((done) => server.close(() => done()));
    if (providerServer) await new Promise<void>((done) => providerServer.close(() => done()));
    for (const dir of tempDirs.splice(0)) {
      await fsp.rm(dir, { recursive: true, force: true });
    }
    vi.unstubAllEnvs();
  });

  /**
   * 跑一轮真的 run:agent 只派发一次媒体生成就退出,自己一个字节都不写。
   *
   * 返回前会**当场证明顺序** —— run 已经 terminal、文件还没落盘。这一步不是断言
   * 风格,是这条测试的全部前提:文件既然那时不存在,这一轮的 diff 里就不可能有它。
   */
  async function dispatchTurnThatFinishesBeforeItsMedia(outputName: string): Promise<{
    projectId: string;
    conversationId: string;
    messageId: string;
    taskId: string;
    outputPath: string;
  }> {
    const projectId = `proj-${randomUUID()}`;
    const assistantMessageId = `assistant-${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: `late media fixture ${outputName}` }),
    });
    expect(created.ok).toBe(true);

    const conversations = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversations.ok).toBe(true);
    const conversationId = ((await conversations.json()) as {
      conversations: Array<{ id: string }>;
    }).conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    // The agent does exactly what `od media generate` does when its polling
    // budget runs out: dispatch, take the 202, hand off, exit. It writes
    // nothing itself, so this run's own diff is empty.
    const script = `
(async () => {
  const daemonUrl = process.env.OD_DAEMON_URL;
  const token = process.env.OD_TOOL_TOKEN;
  let line = 'taskid=none=taskid';
  try {
    const resp = await fetch(daemonUrl + '/api/tools/media/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
      body: JSON.stringify({
        surface: 'image',
        model: 'custom-image',
        prompt: 'a poster that lands late',
        output: ${JSON.stringify(outputName)},
      }),
    });
    const text = await resp.text();
    let taskId = 'none';
    try { taskId = JSON.parse(text).taskId || 'none'; } catch {}
    line = 'status=' + resp.status + '=status taskid=' + taskId + '=taskid';
  } catch (err) {
    line = 'dispatcherror=' + String(err && err.message ? err.message : err) + '=dispatcherror';
  }
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: line } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
})();
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
          message: '生成一张海报',
        }),
      });
      expect(response.ok).toBe(true);
      return await response.text();
    });

    expect(body, 'the agent could not reach the media dispatcher').not.toContain('dispatcherror=');
    expect(/status=202=status/.test(body), `media dispatch was not accepted: ${body.slice(0, 2000)}`)
      .toBe(true);
    const taskId = /taskid=([0-9a-f-]{36})=taskid/.exec(body)?.[1];
    expect(taskId, 'the run must have queued a media task').toBeTruthy();

    // ---- the fact: the run reaches terminal before the file exists ----
    const terminal = await waitFor(
      async () =>
        (await readMessages(projectId, conversationId!)).find((m) => m.id === assistantMessageId),
      (m) => Boolean(m?.runStatus && TERMINAL_RUN_STATUSES.has(m.runStatus)),
    );
    expect(terminal?.runStatus).toBe('succeeded');

    const outputPath = join(dataDir, 'projects', projectId, outputName);
    expect(
      existsSync(outputPath),
      'the media file already existed at the run terminal — the ordering premise of this test does not hold',
    ).toBe(false);

    return {
      projectId,
      conversationId: conversationId!,
      messageId: assistantMessageId,
      taskId: taskId!,
      outputPath,
    };
  }

  /** Drive the task to completion through the same endpoint `od media wait` uses. */
  async function waitForMediaTask(taskId: string): Promise<string> {
    let status = '';
    for (let attempt = 0; attempt < 30 && status !== 'done' && status !== 'failed'; attempt += 1) {
      const waited = await fetch(`${baseUrl}/api/media/tasks/${taskId}/wait`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ timeoutMs: 2_000 }),
      });
      expect(waited.status).toBe(200);
      status = ((await waited.json()) as { status: string }).status;
    }
    return status;
  }

  it('associates the late media output with the run\'s assistant message', async () => {
    const turn = await dispatchTurnThatFinishesBeforeItsMedia('poster.png');

    expect(await waitForMediaTask(turn.taskId), 'the media task never completed').toBe('done');
    expect(existsSync(turn.outputPath), 'the provider never wrote the file').toBe(true);

    const message = await waitFor(
      async () =>
        (await readMessages(turn.projectId, turn.conversationId)).find((m) => m.id === turn.messageId),
      (m) => (m?.producedFiles ?? []).some((f) => f.name === 'poster.png'),
      10_000,
    );
    expect(
      (message?.producedFiles ?? []).map((f) => f.name),
      '晚落盘的媒体产物没有关联到这一轮的 assistant message',
    ).toContain('poster.png');

    // 形状必须是 ChatPanel 认的那种 `ProjectFile` —— 卡片按 `kind` / `mime`
    // 分图片卡与音频胶囊,`size` 还要显示出来。
    const card = message!.producedFiles!.find((f) => f.name === 'poster.png')!;
    expect(card.kind).toBe('image');
    expect(card.mime).toContain('image');
    expect(card.size).toBeGreaterThan(0);
  }, 90_000);

  /**
   * 它是**地板,不是判决** —— 而且比 terminal 那道地板更严。
   *
   * 客户端在这一轮 terminal 那一刻算出的清单是权威的,只是它同样看不见还没落盘的
   * 媒体文件。所以正确行为是**只补一条、一条都不动**:客户端写过的每一项原样留着,
   * 晚到的文件加在前面。写入还带一次 compare-and-set,客户端要是恰好同时写,赢的
   * 是客户端。最后再跑一次关联(重试 / 重放 / 幂等重入),那一列不许再变。
   */
  it('adds to the client\'s list without replacing any of it, and is idempotent', async () => {
    const turn = await dispatchTurnThatFinishesBeforeItsMedia('late-cover.png');

    // 客户端回来了,在媒体任务还在飞的时候给出**它自己**的结论。
    const before = (await readMessages(turn.projectId, turn.conversationId))
      .find((m) => m.id === turn.messageId)!;
    const clientList = [
      {
        name: 'hand-written-note.md',
        path: 'hand-written-note.md',
        type: 'file',
        size: 12,
        mtime: 1,
        kind: 'doc',
        mime: 'text/markdown',
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

    expect(await waitForMediaTask(turn.taskId), 'the media task never completed').toBe('done');

    const merged = await waitFor(
      async () =>
        (await readMessages(turn.projectId, turn.conversationId)).find((m) => m.id === turn.messageId),
      (m) => (m?.producedFiles ?? []).some((f) => f.name === 'late-cover.png'),
      10_000,
    );
    expect(
      (merged?.producedFiles ?? []).map((f) => f.name),
      '晚到的媒体文件把客户端写好的卡片清单顶掉了',
    ).toEqual(['late-cover.png', 'hand-written-note.md']);

    // 重入一次:同一个文件不许再加一遍,那一列一个字节都不许变。
    const outcome = await withDb((db) =>
      associateLateRunProducedFile(db, {
        runId: merged!.runId!,
        projectRoot: join(dataDir, 'projects', turn.projectId),
        projectRelativePath: 'late-cover.png',
      }),
    );
    expect(outcome.written, '重入又动了那一列').toBe(false);

    const afterSecondPass = (await readMessages(turn.projectId, turn.conversationId))
      .find((m) => m.id === turn.messageId);
    expect((afterSecondPass?.producedFiles ?? []).map((f) => f.name)).toEqual([
      'late-cover.png',
      'hand-written-note.md',
    ]);
  }, 90_000);

  /**
   * 反方向:媒体**在这一轮里**就完成了。
   *
   * 这时候文件早在 terminal 快照之前就落盘了,run 自己的 diff 里有它 —— 该由
   * run-terminal 那道地板一次性写全清单。晚到路径必须**当场让开**:它要是抢先
   * 写了 `[那一个媒体文件]`,terminal 地板再看那一列就是非 NULL,于是判为
   * 「客户端已拥有」直接跳过,同一轮里 agent 自己写的文件就永远丢了。
   *
   * 所以这条测试的断言不是「媒体文件在不在」,而是「**两个**文件都在」。
   */
  it('stands aside while the turn is still live, so the terminal floor still writes the whole list', async () => {
    const projectId = `proj-${randomUUID()}`;
    const assistantMessageId = `assistant-${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'in-turn media fixture' }),
    });
    expect(created.ok).toBe(true);

    const conversations = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
    expect(conversations.ok).toBe(true);
    const conversationId = ((await conversations.json()) as {
      conversations: Array<{ id: string }>;
    }).conversations[0]?.id;
    expect(conversationId).toBeTruthy();

    // Dispatch, wait for the task the way `od media wait` does, THEN write a
    // file of its own — so this turn's diff genuinely holds both.
    const script = `
const fs = require('node:fs');
const path = require('node:path');
(async () => {
  const daemonUrl = process.env.OD_DAEMON_URL;
  const token = process.env.OD_TOOL_TOKEN;
  const auth = { 'content-type': 'application/json', authorization: 'Bearer ' + token };
  let line = 'taskid=none=taskid';
  try {
    const resp = await fetch(daemonUrl + '/api/tools/media/generate', {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({
        surface: 'image',
        model: 'custom-image',
        prompt: 'fast cover for the same turn',
        output: 'in-turn-cover.png',
      }),
    });
    const taskId = JSON.parse(await resp.text()).taskId;
    let status = '';
    for (let i = 0; i < 30 && status !== 'done' && status !== 'failed'; i++) {
      const waited = await fetch(daemonUrl + '/api/media/tasks/' + taskId + '/wait', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ timeoutMs: 1000 }),
      });
      status = JSON.parse(await waited.text()).status;
    }
    line = 'status=' + status + '=status taskid=' + taskId + '=taskid';
  } catch (err) {
    line = 'dispatcherror=' + String(err && err.message ? err.message : err) + '=dispatcherror';
  }
  fs.writeFileSync(path.join(process.cwd(), 'agent-written.mp3'), Buffer.alloc(1024, 3));
  console.log(JSON.stringify({ type: 'step_start' }));
  console.log(JSON.stringify({ type: 'text', part: { text: line } }));
  console.log(JSON.stringify({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } }));
  process.exit(0);
})();
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
          message: '生成封面并写一段说明',
        }),
      });
      expect(response.ok).toBe(true);
      return await response.text();
    });
    expect(body, 'the agent could not reach the media dispatcher').not.toContain('dispatcherror=');
    expect(
      /status=done=status/.test(body),
      `the media task did not finish inside the turn: ${body.slice(0, 2000)}`,
    ).toBe(true);

    const message = await waitFor(
      async () =>
        (await readMessages(projectId, conversationId!)).find((m) => m.id === assistantMessageId),
      (m) => (m?.producedFiles ?? []).length > 0,
    );
    expect(message?.runStatus).toBe('succeeded');
    expect(
      (message?.producedFiles ?? []).map((f) => f.name).sort(),
      '早落盘的媒体文件抢在 terminal 地板前面写了那一列,同一轮的其他产物被跳过',
    ).toEqual(['agent-written.mp3', 'in-turn-cover.png']);
  }, 90_000);

  /**
   * 一次批量扇出里,同一个 run 的几个媒体任务几乎同时完成。
   *
   * 每次关联中间隔着一次 `fs.stat`(await),两个调用于是会**交错**:都先读到同一
   * 份旧清单,再各自回来写。所以「读—改—写」必须在 await **之后**重新读一次,并且
   * 只覆盖自己读到的那份字节;否则后写的那个会拿着过期清单把先写的那条盖掉,
   * 用户就只看得见其中一张卡。
   */
  it('does not let two near-simultaneous late files overwrite each other', async () => {
    const turn = await dispatchTurnThatFinishesBeforeItsMedia('batch-lead.png');
    expect(await waitForMediaTask(turn.taskId), 'the media task never completed').toBe('done');
    await waitFor(
      async () =>
        (await readMessages(turn.projectId, turn.conversationId)).find((m) => m.id === turn.messageId),
      (m) => (m?.producedFiles ?? []).some((f) => f.name === 'batch-lead.png'),
      10_000,
    );

    // Two more outputs of the same run, landing together.
    const projectDir = join(dataDir, 'projects', turn.projectId);
    await fsp.writeFile(join(projectDir, 'batch-two.png'), Buffer.from(ONE_BY_ONE_PNG_B64, 'base64'));
    await fsp.writeFile(join(projectDir, 'batch-three.mp3'), Buffer.alloc(512, 9));

    const runId = (await readMessages(turn.projectId, turn.conversationId))
      .find((m) => m.id === turn.messageId)!.runId!;
    // One connection, the way the daemon holds it — the interleaving under test
    // is the event loop's, not two databases'.
    await withDb(async (db) => {
      await Promise.all(
        ['batch-two.png', 'batch-three.mp3'].map((projectRelativePath) =>
          associateLateRunProducedFile(db, { runId, projectRoot: projectDir, projectRelativePath }),
        ),
      );
    });

    const message = (await readMessages(turn.projectId, turn.conversationId))
      .find((m) => m.id === turn.messageId);
    expect(
      (message?.producedFiles ?? []).map((f) => f.name).sort(),
      '并发落地的两份产物互相盖掉了',
    ).toEqual(['batch-lead.png', 'batch-three.mp3', 'batch-two.png']);
  }, 90_000);
});
