/**
 * 一轮任务实际失败了,界面却显示「已完成 + 绿勾」。
 *
 * 生产现场(用户诊断包 `logs/daemon/latest.log`):daemon 自己**清清楚楚知道**这一轮
 * 的生图失败了,而且知道它属于哪个 run ——
 *
 *     [media] {"event":"failed","task_id":"6393c0cb-…",
 *              "run_id":"6dc36917-57de-49b9-aef3-d6d6199dd14a",
 *              "status":400,"elapsed_ms":55194,
 *              "error":"download media asset ma_kk… failed: … https://…s3…/[REDACTED]"}
 *
 * 同一个 run 的 end 事件却是
 * `{"status":"succeeded","code":0,"artifactCount":0,"endedWithUnfinishedWork":false}`,
 * 用户看到的是「已完成 1m 33s」+ 绿勾、右侧产物区空的,而正文里模型在道歉说图没
 * 生成出来。
 *
 * 两个洞,同一条不变量的两半:
 *
 *   洞 1 —— `routes/media.ts` 的失败路径只做三件事(标 task failed / 发埋点 /
 *     打日志),**没有任何回写**。`runId` 就在手上(`options.grant.runId`),却只喂给
 *     了埋点。于是 run 的终态只由子进程退出码决定,agent 道完歉退出 0,就是
 *     succeeded。
 *
 *   洞 2 —— 完成标记(`<od-done key=…/>` + 其后非空文字)对「未完成」有**一票否决
 *     权**,而判据从不看那段文字说了什么。这一轮里标记后面那段非空文字**恰好就是那句
 *     道歉**,而那句道歉是**我们自己写进系统提示词、要求模型逐字照抄的**
 *     (`prompts/media-contract.ts`,设计文档 S22)。也就是说:**道歉本身把「未完成」
 *     压掉了**。同一轮的最后一次 TodoWrite 里还有一项是 `cancelled` —— 本该算未完成,
 *     被标记挡掉了。
 *
 * 所以这里的判据必须来自 **daemon 自己的事实**(本 run 有它亲眼看着失败的 media
 * task),**绝不能去解析模型那句话说了什么** —— 文案是产品文案,改一次判据就静默失效。
 *
 * 层次:daemon HTTP 边界(`startServer` 起真 daemon,真 `POST /api/chat`,真
 * `POST /api/tools/media/generate`),provider 是本地起的一个**必定 400** 的
 * OpenAI 兼容端点。断言全部落在可观察的 run 终态字段上,不碰 CSS/DOM。
 */

import type http from 'node:http';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { startServer } from '../src/server.js';

/** provider 回一张真 1x1 PNG —— 成功那条对照组要真的写出字节来。 */
const ONE_BY_ONE_PNG_B64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

/**
 * 生产那一轮里,模型在完成标记后面写的**就是这句** —— 逐字来自
 * `apps/daemon/src/prompts/media-contract.ts`(镜像在 contracts 侧)。
 *
 * 它出现在这里不是为了被解析,恰恰相反:它在这里是为了证明**没有人解析它**。
 * 判据换成任何别的句子,结论都必须一模一样。
 */
const S22_APOLOGY =
  '图片没生成出来,不是你的操作有误 —— 这次是 Open Design 自己的问题,我们已经记下了。重试一般能恢复;反复出现的话联系我们。';

let baseUrl: string;
let server: http.Server;
let providerServer: http.Server;
let providerUrl: string;
const tempDirs: string[] = [];

interface TurnPlan {
  /** 派发一次媒体生成。`prompt` 以 `fail` 开头时 provider 必定 400。 */
  media?: { prompt: string; output: string };
  /** 最后一次 TodoWrite 快照。 */
  todos?: Array<{ content: string; status: string }>;
  /** 发一枚**合法**的完成标记(key 从这一轮自己的提示词里读出来)。 */
  emitDoneMarker?: boolean;
  /** 标记之后那段非空文字。 */
  conclusion?: string;
  /** 不退出,等着被用户取消。 */
  waitToBeCanceled?: boolean;
}

/**
 * 把一份 TurnPlan 编成假 `opencode` 的脚本。
 *
 * 完成标记的 key 是**每轮新铸**的 nonce,只出现在这一轮自己的提示词里(经 stdin 送进
 * 来)。脚本把它读出来再原样发回去 —— 这是唯一能造出「合法完成标记」的办法,也正是
 * 生产里模型走的那条路。伪造不出来的东西,测试也不该伪造。
 */
function agentScript(plan: TurnPlan): string {
  return `
const chunks = [];
process.stdin.on('data', (c) => chunks.push(c));
process.stdin.on('error', () => {});
(async () => {
  await new Promise((resolve) => {
    process.stdin.on('end', resolve);
    process.stdin.on('close', resolve);
    setTimeout(resolve, 5000);
  });
  const prompt = Buffer.concat(chunks).toString('utf8');
  const doneKey = (/<od-done key="([A-Za-z0-9_-]{4,64})"\\/>/.exec(prompt) || [])[1] || '';
  const emit = (o) => console.log(JSON.stringify(o));
  const media = ${JSON.stringify(plan.media ?? null)};
  const todos = ${JSON.stringify(plan.todos ?? null)};
  emit({ type: 'step_start' });

  let narration = 'donekey=' + doneKey + '=donekey';
  if (media) {
    const daemonUrl = process.env.OD_DAEMON_URL;
    const auth = {
      'content-type': 'application/json',
      authorization: 'Bearer ' + process.env.OD_TOOL_TOKEN,
    };
    try {
      const resp = await fetch(daemonUrl + '/api/tools/media/generate', {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({
          surface: 'image',
          model: 'custom-image',
          prompt: media.prompt,
          output: media.output,
        }),
      });
      const taskId = JSON.parse(await resp.text()).taskId;
      let status = '';
      for (let i = 0; i < 40 && status !== 'done' && status !== 'failed'; i += 1) {
        const waited = await fetch(daemonUrl + '/api/media/tasks/' + taskId + '/wait', {
          method: 'POST',
          headers: auth,
          body: JSON.stringify({ timeoutMs: 1000 }),
        });
        status = JSON.parse(await waited.text()).status;
      }
      narration += ' mediastatus=' + status + '=mediastatus taskid=' + taskId + '=taskid';
    } catch (err) {
      narration += ' dispatcherror=' + String(err && err.message ? err.message : err) + '=dispatcherror';
    }
  }

  if (todos) {
    emit({
      type: 'tool_use',
      part: { tool: 'todowrite', callID: 'todo-1', state: { input: { todos } } },
    });
  }
  emit({ type: 'text', part: { text: narration + '\\n' } });
  ${plan.emitDoneMarker ? `emit({ type: 'text', part: { text: '<od-done key="' + doneKey + '"/>' } });` : ''}
  ${plan.conclusion ? `emit({ type: 'text', part: { text: ${JSON.stringify(plan.conclusion)} } });` : ''}
  emit({ type: 'step_finish', part: { tokens: { input: 1, output: 1 } } });
  ${plan.waitToBeCanceled ? 'await new Promise(() => {});' : 'process.exit(0);'}
})();
`;
}

async function withFakeAgent<T>(script: string, run: () => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(join(tmpdir(), 'od-media-fail-bin-'));
  tempDirs.push(dir);
  const oldPath = process.env.PATH;
  try {
    if (process.platform === 'win32') {
      const runner = join(dir, 'opencode-test-runner.cjs');
      await fsp.writeFile(runner, script);
      await fsp.writeFile(join(dir, 'opencode.cmd'), `@echo off\r\nnode "${runner}" %*\r\n`);
    } else {
      const bin = join(dir, 'opencode');
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

interface StoredMessage {
  id: string;
  role: string;
  runId?: string;
  runStatus?: string;
}

interface RunTerminal {
  runId: string;
  status: string;
  exitCode: number | null;
  endedWithUnfinishedWork: boolean;
  mediaTaskFailures?: Array<{
    taskId: string;
    surface?: string;
    model?: string;
    failedAt: number;
    error: { message: string; status?: number; code?: string };
  }>;
  artifactCount?: number;
}

async function createProject(name: string): Promise<{ projectId: string; conversationId: string }> {
  const projectId = `proj-${randomUUID()}`;
  const created = await fetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: projectId, name }),
  });
  expect(created.ok).toBe(true);
  const conversations = await fetch(`${baseUrl}/api/projects/${projectId}/conversations`);
  expect(conversations.ok).toBe(true);
  const conversationId = ((await conversations.json()) as {
    conversations: Array<{ id: string }>;
  }).conversations[0]?.id;
  expect(conversationId).toBeTruthy();
  return { projectId, conversationId: conversationId! };
}

async function readMessages(projectId: string, conversationId: string): Promise<StoredMessage[]> {
  const res = await fetch(
    `${baseUrl}/api/projects/${projectId}/conversations/${conversationId}/messages`,
  );
  expect(res.ok).toBe(true);
  return ((await res.json()) as { messages: StoredMessage[] }).messages;
}

async function readRun(runId: string): Promise<RunTerminal> {
  const res = await fetch(`${baseUrl}/api/runs/${runId}`);
  expect(res.ok).toBe(true);
  return (await res.json()) as RunTerminal;
}

const TERMINAL = new Set(['succeeded', 'failed', 'canceled']);

/** 跑完一轮,把这一轮**可观察的终态**取回来。 */
async function runTurn(plan: TurnPlan & { message?: string }): Promise<{
  terminal: RunTerminal;
  narration: string;
  projectId: string;
}> {
  const { projectId, conversationId } = await createProject(`media terminal ${randomUUID()}`);
  const assistantMessageId = `assistant-${randomUUID()}`;
  const narration = await withFakeAgent(agentScript(plan), async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'opencode',
        projectId,
        conversationId,
        assistantMessageId,
        message: plan.message ?? '生成一张海报',
      }),
    });
    expect(response.ok).toBe(true);
    return await response.text();
  });

  expect(narration, 'the agent could not reach the media dispatcher')
    .not.toContain('dispatcherror=');
  if (plan.emitDoneMarker) {
    const key = /donekey=([0-9a-f]{4,64})=donekey/.exec(narration)?.[1];
    expect(
      key,
      '假 agent 没能从这一轮的提示词里读到 done key,发出去的就不是合法完成标记 —— '
        + '这条测试的前提不成立',
    ).toBeTruthy();
  }

  const message = await waitFor(
    async () => (await readMessages(projectId, conversationId)).find((m) => m.id === assistantMessageId),
    (m) => Boolean(m?.runId && m?.runStatus && TERMINAL.has(m.runStatus)),
  );
  expect(message?.runId, 'the turn never reached a terminal run').toBeTruthy();
  return { terminal: await readRun(message!.runId!), narration, projectId };
}

describe('a media generation the host watched fail reaches its run terminal', () => {
  beforeAll(async () => {
    // An OpenAI-compatible image endpoint that fails on demand. 400 is the
    // production status and is deliberately NOT in the retry set (429/503), so
    // the failure is one round-trip rather than a timing bet.
    providerServer = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        let fails = false;
        try {
          fails = String(JSON.parse(body)?.prompt ?? '').startsWith('fail');
        } catch {
          fails = false;
        }
        if (fails) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({
            error: { message: 'download media content: Get https://…s3…/[REDACTED]' },
          }));
          return;
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ b64_json: ONE_BY_ONE_PNG_B64 }] }));
      });
    });
    await new Promise<void>((done) => providerServer.listen(0, '127.0.0.1', () => done()));
    const address = providerServer.address();
    if (!address || typeof address === 'string') throw new Error('provider server has no port');
    providerUrl = `http://127.0.0.1:${address.port}/v1`;

    // Keep the provider credential out of the shared vitest data dir.
    const configDir = await fsp.mkdtemp(join(tmpdir(), 'od-media-fail-config-'));
    tempDirs.push(configDir);
    vi.stubEnv('OD_MEDIA_CONFIG_DIR', configDir);

    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;

    const configured = await fetch(`${baseUrl}/api/media/config`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        providers: {
          'custom-image': {
            apiKey: 'media-failure-test-key',
            baseUrl: providerUrl,
            model: 'failing-image-model',
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
   * 洞 1 —— 失败必须回流到 run。
   *
   * daemon 在日志里写下 `run_id` 的那一刻就已经知道是哪一轮了;这条测试要的是同一个
   * 事实出现在这一轮**自己的终态**里,而不是只出现在日志和埋点里。有了它,壳头才有
   * 东西可依据去渲染真正的错误卡 + 重试,而不是靠模型背台词。
   */
  it('records the failed generation on the run that dispatched it', async () => {
    const { terminal, narration } = await runTurn({
      media: { prompt: 'fail: a poster nobody will get', output: 'poster.png' },
    });

    expect(
      /mediastatus=failed=mediastatus/.test(narration),
      `媒体任务没有失败,这条测试的前提不成立: ${narration.slice(0, 2000)}`,
    ).toBe(true);
    const taskId = /taskid=([0-9a-f-]{36})=taskid/.exec(narration)?.[1];

    expect(terminal.status).toBe('succeeded');
    expect(terminal.exitCode).toBe(0);
    expect(
      terminal.mediaTaskFailures?.map((failure) => failure.taskId),
      'daemon 亲眼看着这一轮的生图失败了,却没有把这个事实挂回该 run',
    ).toEqual([taskId]);
    const failure = terminal.mediaTaskFailures![0]!;
    expect(failure.surface).toBe('image');
    expect(failure.model).toBe('custom-image');
    expect(failure.error.message, '失败原因没有跟着回流,错误卡没有东西可显示').toBeTruthy();
  }, 90_000);

  /**
   * 洞 2 —— 完成标记不能在宿主自己握着反证时压掉「未完成」。
   *
   * 这条是生产那一轮的**完整复刻**:合法的完成标记 + 标记后面那句我们自己让模型逐字
   * 照抄的道歉 + 一项 `cancelled` 的 todo。今天的判据只看「标记对得上 key + 后面还有
   * 非空文字」,于是道歉自己把未完成压成了「已完成 + 绿勾」。
   */
  it('does not let the turn-completion marker overrule it', async () => {
    const { terminal, narration } = await runTurn({
      media: { prompt: 'fail: the illustration for slide 2', output: 'slide-2.png' },
      todos: [
        { content: '梳理版式', status: 'completed' },
        { content: '生成插图', status: 'completed' },
        { content: '合成海报', status: 'cancelled' },
      ],
      emitDoneMarker: true,
      conclusion: S22_APOLOGY,
    });

    expect(/mediastatus=failed=mediastatus/.test(narration)).toBe(true);
    expect(terminal.status).toBe('succeeded');
    expect(terminal.exitCode).toBe(0);
    expect(
      terminal.endedWithUnfinishedWork,
      '这一轮的生图失败了,daemon 自己记着,壳头还是报「已完成 + 绿勾」',
    ).toBe(true);
  }, 90_000);

  /**
   * 反向锚点 1 —— 真正成功的一轮不许被牵连。
   *
   * 同一条路、同一个 provider、同一枚完成标记,只是生图这次真的成功了。
   */
  it('leaves a genuinely delivered turn alone', async () => {
    const { terminal, narration } = await runTurn({
      media: { prompt: 'ok: a poster that lands', output: 'delivered.png' },
      todos: [{ content: '生成海报', status: 'completed' }],
      emitDoneMarker: true,
      conclusion: '海报已经生成好了,右侧可以直接看。',
      message: '生成一张能用的海报',
    });

    expect(
      /mediastatus=done=mediastatus/.test(narration),
      `对照组的媒体任务没有成功,这条锚点不成立: ${narration.slice(0, 2000)}`,
    ).toBe(true);
    expect(terminal.status).toBe('succeeded');
    expect(terminal.endedWithUnfinishedWork).toBe(false);
    expect(terminal.mediaTaskFailures ?? []).toEqual([]);
  }, 90_000);

  /**
   * 反向锚点 2 —— 别把修复做成「有 done 标记也一律不信」。
   *
   * 完全没有媒体任务的普通一轮:一项 todo 还开着,但模型发了合法的完成标记。今天这
   * 一轮读作「已完成」,修完之后必须**一个字节都不变** —— 宿主手里没有任何反证,标记
   * 的否决权原样保留。这条锚点要是红了,说明修复把所有正常完成的任务都变成了未完成。
   */
  it('keeps the marker authoritative when the host holds no counter-evidence', async () => {
    const { terminal } = await runTurn({
      todos: [
        { content: '读一遍现有版式', status: 'completed' },
        { content: '可选:再补一版配色', status: 'pending' },
      ],
      emitDoneMarker: true,
      conclusion: '版式已经按你说的调好了,配色那一版看你要不要。',
      message: '帮我调一下版式',
    });

    expect(terminal.status).toBe('succeeded');
    expect(
      terminal.endedWithUnfinishedWork,
      '没有任何宿主反证的一轮被判成了未完成 —— 修复把完成标记一律不信了',
    ).toBe(false);
    expect(terminal.mediaTaskFailures ?? []).toEqual([]);
  }, 90_000);

  /**
   * 反向锚点 3 —— 完全没有媒体任务的一轮,行为不变。
   */
  it('leaves a plain text-only turn alone', async () => {
    const { terminal } = await runTurn({
      conclusion: '这个组件用 flex 就够了。',
      message: '这个组件该用 grid 还是 flex?',
    });

    expect(terminal.status).toBe('succeeded');
    expect(terminal.endedWithUnfinishedWork).toBe(false);
    expect(terminal.mediaTaskFailures ?? []).toEqual([]);
  }, 90_000);

  /**
   * 反向锚点 4 —— 用户主动取消的一轮,行为不变。
   *
   * 取消掉的一轮,终态由「谁停的」决定,不由这一轮里失败了什么决定 —— 和完成标记、
   * 提问收尾那两条已有规则的 `succeeded` 闸门是同一个道理。
   */
  it('leaves a user-canceled turn alone', async () => {
    const { projectId, conversationId } = await createProject(`media cancel ${randomUUID()}`);
    const assistantMessageId = `assistant-${randomUUID()}`;

    await withFakeAgent(
      agentScript({
        media: { prompt: 'fail: something the user will not wait for', output: 'abandoned.png' },
        waitToBeCanceled: true,
      }),
      async () => {
        const chat = fetch(`${baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId: 'opencode',
            projectId,
            conversationId,
            assistantMessageId,
            message: '生成一张海报',
          }),
        }).catch(() => null);

        // Cancel only once the host has actually recorded the failure — the
        // anchor is "a canceled run keeps its own verdict EVEN THEN", not
        // "we canceled before there was anything to see".
        const runId = (await waitFor(
          async () =>
            (await readMessages(projectId, conversationId))
              .find((m) => m.id === assistantMessageId)?.runId ?? null,
          (id) => Boolean(id),
        ))!;
        await waitFor(
          async () => (await readRun(runId)).mediaTaskFailures ?? [],
          (failures) => failures.length > 0,
        );

        const canceled = await fetch(`${baseUrl}/api/runs/${runId}/cancel`, { method: 'POST' });
        expect(canceled.ok).toBe(true);

        const terminal = await waitFor(
          () => readRun(runId),
          (run) => TERMINAL.has(run.status),
        );
        expect(terminal.status).toBe('canceled');
        expect(
          terminal.endedWithUnfinishedWork,
          '用户取消的一轮被改判了 —— 反证的 succeeded 闸门没有生效',
        ).toBe(false);
        expect((terminal.mediaTaskFailures ?? []).length).toBe(1);
        await chat;
      },
    );
  }, 90_000);
});
