import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * 红测(W17,2026-09-02):**思考流**里的评审剧场语法也不许进客户端,更不许落库。
 *
 * 兜底剥离器(`apps/daemon/src/panel-grammar-strip.ts`)是 2026-08-26 为这件事建的,
 * 但它当时只挂在 `text_delta` 那条路上:`sendAgentEvent` 里 `text_delta` 过
 * `titleMarkerStripper`,其余事件类型一律直接 `emitAgentEvent(ev)` 原样放行。
 * `thinking_delta` 就走后面这条 —— **一个剥离器都不过**。
 *
 * 后果比"正文里露出标签"更糟,因为它会**永久化**:
 * `runtimes/chat-run-messages.ts` 的 `daemonAgentPayloadToPersistedAgentEvent`
 * 把 `thinking_delta` 原样存成 `{ kind: 'thinking', text }`,而持久化就挂在
 * `send()` 里(`server.ts` 的 `persistRunEventToAssistantMessage`)。所以剥离必须发生在
 * **`send()` 之前** —— 这也是为什么修复落在 `emitAgentEvent` 的入口,而不是某个适配器。
 *
 * 断言 SSE 流干净,等价于断言落库干净:两者是同一个 `send()` 的两个消费方,
 * 中间没有第二次加工。
 *
 * 这里用 codex 是因为它是**用户中招的那个 runtime**,而且它的 reasoning item
 * (`json-event-stream.ts` 的 `emitCodexReasoningItem`)是本仓最直接的 `thinking_delta` 来源。
 * 传输固定成 `exec-json`:出厂默认是 app-server(JSON-RPC),用假 CLI 不好摆,
 * 而两条传输在 `sendAgentEvent` 之后汇到同一条路上 —— 剥离的位置与传输无关。
 */

/** 逐字取自用户现场;`role="Critic" score="8.1"` 这一条出现在 Thoughts 展开里 */
const THINKING_LEAK = [
  '<ROUND index="2">',
  '<PANELIST role="Critic" score="8.1">',
  'THINKING_PROSE_SENTINEL_4f21 —— 这句人话必须原样留着。',
  '</PANELIST>',
].join('\n');

const ANSWER_PROSE = 'ANSWER_PROSE_SENTINEL_9b03';

describe('思考流也要过剧场语法剥离', () => {
  let server: http.Server;
  let baseUrl: string;
  let binDir: string;
  const originalPath = process.env.PATH;
  const originalTransport = process.env.OD_CODEX_TRANSPORT;

  beforeAll(async () => {
    process.env.OD_CODEX_TRANSPORT = 'exec-json';
    binDir = await mkdtemp(join(tmpdir(), 'od-thinking-grammar-'));
    const bin = join(binDir, 'codex');
    await writeFile(
      bin,
      `#!/usr/bin/env node
process.stdin.resume();
const line = (o) => console.log(JSON.stringify(o));
line({ type: 'thread.started', thread_id: '019eef4f-0000-7000-8000-0000000abcde' });
line({ type: 'turn.started' });
// 推理摘要 —— 走 thinking_delta。这一片在修复前会原样打到客户端并落库。
line({ type: 'item.completed', item: { id: 'r-1', type: 'reasoning', text: ${JSON.stringify(THINKING_LEAK)} } });
// 正文 —— 走 text_delta,这条路 2026-08-26 起就已经被剥离器盖住了。
line({ type: 'item.completed', item: { id: 'm-1', type: 'agent_message', text: ${JSON.stringify(ANSWER_PROSE)} } });
line({ type: 'turn.completed', usage: { input_tokens: 3, output_tokens: 2 } });
setTimeout(() => process.exit(0), 10);
`,
      'utf8',
    );
    await chmod(bin, 0o755);
    process.env.PATH = `${binDir}${delimiter}${originalPath ?? ''}`;

    const { startServer } = await import('../src/server.js');
    const started = (await startServer({ port: 0, returnServer: true })) as {
      url: string;
      server: http.Server;
    };
    baseUrl = started.url;
    server = started.server;
    // 冷启动要全量扫技能目录 + 设计体系,单跑这个文件时没有前面的文件帮忙暖缓存。
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(binDir, { recursive: true, force: true });
    if (originalPath == null) delete process.env.PATH;
    else process.env.PATH = originalPath;
    if (originalTransport == null) delete process.env.OD_CODEX_TRANSPORT;
    else process.env.OD_CODEX_TRANSPORT = originalTransport;
  });

  it('thinking_delta 里的剧场标记不进 SSE(也就不落库),标记之间的人话原样留着', async () => {
    const projectId = `thinking-grammar-${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'Thinking grammar fixture' }),
    });
    expect(created.ok).toBe(true);

    const chat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'codex',
        projectId,
        message: 'Draft the page.',
      }),
    });
    expect(chat.ok).toBe(true);
    const body = await chat.text();

    // 这一轮真的跑完了 —— 否则下面的"没漏"是空的
    expect(body).toContain('event: end');
    expect(body).toContain('thinking_delta');

    // 标签名写死,不复用 `CRITIQUE_GRAMMAR_TAGS`:复用等于拿实现验实现。
    expect(body).not.toMatch(
      /<\/?(?:CRITIQUE_RUN|ROUND|ROUND_END|PANELIST|SHIP|MUST_FIX|RESOLVED)(?=[\s/>])/u,
    );
    // 属性碎片也不许剩 —— 这两个字符串只可能来自标记内部
    expect(body).not.toContain('Critic');
    expect(body).not.toContain('8.1');

    // 剥壳不吞字:思考里的人话和正文都要在
    expect(body).toContain('THINKING_PROSE_SENTINEL_4f21');
    expect(body).toContain(ANSWER_PROSE);
  }, 60_000);
});
