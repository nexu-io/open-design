import type http from 'node:http';
import { randomUUID } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { delimiter, join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/*
 * 红测(W102,2026-09-03):**上游本来就是空串**的思考帧必须照发。
 *
 * ba3e64ea69(2026-09-02 14:49)在 `emitAgentEvent` 加了一道兜底剥离,判据写成
 * 「剥完还剩没剩」:
 *
 *     const visible = thinkingGrammarStripper.strip(ev.delta);
 *     if (!visible) { noteFirstOutputEvent(ev); return; }
 *
 * `strip('')` 返回 `''`,falsy —— 于是**空串帧一条不剩地被扔掉**。
 * 而 claude 的思考帧正文 100% 是空串(真 CLI 实测,opus-5 与 sonnet-4-5 各一轮;
 * `content_block_delta` 的 `delta` 就是 `{"type":"thinking_delta","thinking":"","estimated_tokens":50}`),
 * 所以对 claude 来说这道判据等于「思考帧全丢」。
 *
 * 丢掉的是两件东西:
 *  1. 壳头的「思考中」—— 规格 W11 写死「`thinking_delta` 到达(**哪怕 delta 为空**)
 *     就进入思考中」。一条都到不了,那一格永远是 false,用户盯着几分钟空白。
 *  2. **传输层心跳** —— `providers/daemon.ts` 每收到一条真运行帧就
 *     `markUpstreamActivity(runId)`。真机录制 `7ed15c2f`(1150 秒)里
 *     414/414 条 `thinking_delta` 的 `delta` 都是 `""`;把这条 drop 套上去,
 *     1357 帧只剩 943 帧,最长空档从 73.6 秒涨到 300.6 秒。
 *
 * 正确判据是「**上游到底送没送字符**」,不是「剥完还剩没剩」:
 *  - 原本就空 → 照发(心跳 + 思考中);
 *  - 送了字符、剥完一个不剩 → 扔(整片都是评审剧场协议标记,正是 ba3e64ea69 要治的)。
 *
 * 用 claude 而不是 codex:空思考帧是 claude 的出厂形态,codex 造不出来。
 * 帧的形状逐字抄自真 CLI 输出(`content_block_start` 的
 * `{"type":"thinking","thinking":"","signature":""}` 也照抄,别理想化)。
 */

/** 真 CLI 实测的空思考帧条数量级(一轮 26.5 秒的扩展思考是 20 条) */
const EMPTY_THINKING_FRAMES = 20;

/** 逐字取自用户现场的剧场语法;整片都是标记的那一帧 */
const ALL_GRAMMAR_THINKING = '<PANELIST role="Critic" score="8.1">';

/** 会说话的 agent 也有:非空思考正文必须原样通过 */
const REAL_THINKING_PROSE = 'W102_THINKING_PROSE_SENTINEL';

const ANSWER_TEXT = 'W102_ANSWER_SENTINEL';

type SseFrame = { event: string; data: any };

/** 把 SSE 正文拆成 (event, data) 序列 —— 断言"出现在出口上"只认这个 */
function parseSse(body: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of body.split('\n\n')) {
    let event = 'message';
    let raw = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event: ')) event = line.slice(7).trim();
      else if (line.startsWith('data: ')) raw += line.slice(6);
    }
    if (!raw) continue;
    try {
      frames.push({ event, data: JSON.parse(raw) });
    } catch {
      /* keepalive / 非 JSON 帧不参与断言 */
    }
  }
  return frames;
}

function thinkingDeltas(frames: SseFrame[]): string[] {
  return frames
    .filter((f) => f.event === 'agent' && f.data?.type === 'thinking_delta')
    .map((f) => String(f.data.delta ?? ''));
}

describe('W102 · 上游本来就是空的思考帧必须照发(心跳 + 思考中)', () => {
  let server: http.Server;
  let baseUrl: string;
  let binDir: string;
  const originalPath = process.env.PATH;

  beforeAll(async () => {
    binDir = await mkdtemp(join(tmpdir(), 'od-w102-thinking-'));
    const bin = join(binDir, 'claude');
    /*
     * 假 claude:形状逐字照抄真 CLI 的 `--output-format stream-json --verbose`
     * 输出(`stream_event` 包一层,`content_block_delta.delta.thinking` 是空串)。
     */
    await writeFile(
      bin,
      `#!/usr/bin/env node
const fs = require('node:fs');
const w = (o) => fs.writeSync(1, JSON.stringify(o) + '\\n');
if (process.argv.includes('--version')) { fs.writeSync(1, 'claude-code 2.1.259 (w102)\\n'); process.exit(0); }
if (process.argv.includes('--help')) { fs.writeSync(1, 'Usage: claude -p [--include-partial-messages] [--add-dir DIR]\\n'); process.exit(0); }
process.stdin.resume();
const se = (event) => w({ type: 'stream_event', event, session_id: 's-w102', parent_tool_use_id: null });

w({ type: 'system', subtype: 'init', model: 'claude-opus-5', session_id: 's-w102' });
se({ type: 'message_start', message: { model: 'claude-opus-5', id: 'msg_w102', type: 'message', role: 'assistant', content: [], stop_reason: null, usage: { input_tokens: 2, output_tokens: 1 } } });
// 思考块开场 —— 真 CLI 的 content_block 就是这三个字段,thinking/signature 都是空串
se({ type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '', signature: '' } });
for (let i = 0; i < ${EMPTY_THINKING_FRAMES}; i += 1) {
  se({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: '', estimated_tokens: (i + 1) * 50 } });
}
// 一片整段的剧场语法 —— 上游送了字符、剥完一个不剩,这一条该被扔
se({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: ${JSON.stringify(ALL_GRAMMAR_THINKING)} } });
// 真正的思考正文 —— 非空,必须原样通过
se({ type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: ${JSON.stringify(REAL_THINKING_PROSE)} } });
se({ type: 'content_block_stop', index: 0 });
se({ type: 'content_block_start', index: 1, content_block: { type: 'text', text: '' } });
se({ type: 'content_block_delta', index: 1, delta: { type: 'text_delta', text: ${JSON.stringify(ANSWER_TEXT)} } });
se({ type: 'content_block_stop', index: 1 });
se({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { input_tokens: 2, output_tokens: 160 } });
se({ type: 'message_stop' });
w({ type: 'assistant', parent_tool_use_id: null, message: { id: 'msg_w102', content: [{ type: 'text', text: ${JSON.stringify(ANSWER_TEXT)} }], stop_reason: 'end_turn' } });
w({ type: 'result', subtype: 'success', is_error: false, session_id: 's-w102' });
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
  }, 60_000);

  afterAll(async () => {
    if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(binDir, { recursive: true, force: true });
    if (originalPath == null) delete process.env.PATH;
    else process.env.PATH = originalPath;
  });

  let sseBody = '';

  async function runOnce(): Promise<string> {
    if (sseBody) return sseBody;
    const projectId = `w102-thinking-${randomUUID()}`;
    const created = await fetch(`${baseUrl}/api/projects`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: projectId, name: 'W102 empty thinking heartbeat' }),
    });
    expect(created.ok).toBe(true);

    const chat = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: 'claude', projectId, message: 'Think, then answer.' }),
    });
    expect(chat.ok).toBe(true);
    sseBody = await chat.text();
    // 这一轮真的跑完了 —— 否则下面所有"到了 / 没到"都是空的
    expect(sseBody).toContain('event: end');
    return sseBody;
  }

  it('正向:上游的空串思考帧原样出现在 SSE 上,一条不少', async () => {
    const frames = parseSse(await runOnce());
    const deltas = thinkingDeltas(frames);
    const empties = deltas.filter((d) => d === '');
    // 防真空:量法必须看得见"被扔掉"这件事。修复前这里是 0。
    expect(empties.length).toBe(EMPTY_THINKING_FRAMES);
  }, 60_000);

  it('反向:整片都是协议标记的思考帧仍然被扔(ba3e64ea69 的目的不回退)', async () => {
    const body = await runOnce();
    const deltas = thinkingDeltas(parseSse(body));
    // 标签名写死,不复用 `CRITIQUE_GRAMMAR_TAGS`:复用等于拿实现验实现
    expect(body).not.toMatch(
      /<\/?(?:CRITIQUE_RUN|ROUND|ROUND_END|PANELIST|SHIP|MUST_FIX|RESOLVED)(?=[\s/>])/u,
    );
    // 属性碎片也不许剩 —— 这两个字符串只可能来自标记内部
    expect(body).not.toContain('Critic');
    expect(body).not.toContain('8.1');
    // 而且它连一格空事件都不该变成:那一帧整条被扔,不是被改写成空串。
    // 空串帧的条数恰好等于上游送的空串条数,多一条就说明标记帧漏成了空事件。
    expect(deltas.filter((d) => d === '').length).toBe(EMPTY_THINKING_FRAMES);
  }, 60_000);

  it('反向:非空的正常思考内容照旧通过', async () => {
    const deltas = thinkingDeltas(parseSse(await runOnce()));
    expect(deltas).toContain(REAL_THINKING_PROSE);
    // 正文也没被牵连
    expect(await runOnce()).toContain(ANSWER_TEXT);
  }, 60_000);

  it('心跳:上游发了几帧思考,出口就有几帧 —— 一帧都不能少', async () => {
    const deltas = thinkingDeltas(parseSse(await runOnce()));
    // 上游一共 EMPTY_THINKING_FRAMES 条空串 + 1 条纯标记 + 1 条真正文。
    // 纯标记那条按设计扔掉,其余每一条都必须到达 —— 到达就是一次
    // `markUpstreamActivity`,静默计时的读数全靠它。
    expect(deltas.length).toBe(EMPTY_THINKING_FRAMES + 1);
  }, 60_000);
});
