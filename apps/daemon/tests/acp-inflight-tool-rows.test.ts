/**
 * W123 —— ACP 工具行「第一帧就上屏」。
 *
 * 现状(红):ACP 侧一次工具调用的 `tool_use`/`tool_result` **只在终态**发出
 * (`session.ts` 的 `emitTerminalToolPair`)。真语料里 202 次调用的 100% 生命周期
 * 都不可见 —— bash 中位 0.4s、p90 37.3s、最长 54.7s;一次 task 藏了 222.0s。
 *
 * 目标:第一帧就发一条「在途形态」的工具事件(工具名 + 当时已知的入参),
 * 后续帧带来真名/真命令/真路径时**覆盖同一行**,终态再发完整的那一对。
 * 端到端只能出现**一行**。
 *
 * ── 语料 ──────────────────────────────────────────────────────────────
 * `fixtures/w123-acp-inflight-frames.json` 是真语料,不是手搭夹具:
 *
 *   来源:`~/.amr/opencode-sessions/<sha>/data/opencode/opencode.db` 的 `event` 表,
 *        `type='message.part.updated.1'` 且 `part.type === 'tool'`(12 个真实 AMR
 *        session、202 次工具调用、911 帧,每帧带真实墙钟毫秒)。
 *   映射:逐行照抄 vela 自己的桥,不是我猜的 ——
 *        `nexu/vela apps/cli/internal/agent/opencode_client.go:971 mapOpenCodeToolPart`
 *        `nexu/vela apps/cli/internal/agent/acp_runtime.go:965     buildACPToolUpdate`
 *   导出:`apps/daemon/tests/fixtures/w123-export-acp-inflight-frames.ts`
 *
 * 底下 `真语料守卫` 那一组断言是防替换的:有人把它换成手搭夹具后,
 * 这些断言会红,而不是让节流/时间线测试变成真空。
 */
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

import { attachAcpSession } from '../src/agent-protocol/index.js';
import { runSseEventToPersistedAgentEvent } from '../src/runtimes/chat-run-messages.js';
import {
  acpArtifactWritePathRanked,
  acpTelemetryToolCallId,
} from '../src/agent-protocol/acp/updates.js';

// ── 语料 ────────────────────────────────────────────────────────────────

type AcpFrame = { offsetMs: number; update: Record<string, unknown> };
type AcpCall = {
  toolCallId: string;
  session: string;
  openCodeTool: string;
  spanMs: number;
  frames: AcpFrame[];
};

const CORPUS = JSON.parse(
  readFileSync(
    fileURLToPath(new URL('./fixtures/w123-acp-inflight-frames.json', import.meta.url)),
    'utf8',
  ),
) as { _provenance: Record<string, unknown>; calls: AcpCall[] };

const callsByTool = (tool: string): AcpCall[] =>
  CORPUS.calls.filter((call) => call.openCodeTool === tool);

const callById = (id: string): AcpCall => {
  const found = CORPUS.calls.find((call) => call.toolCallId === id);
  assert.ok(found, `语料里没有 ${id} —— 夹具被换过了?`);
  return found;
};

/** 语料里最长的三次调用,时间线取证就用它们。 */
const LONGEST_TASK = 'call_00_1OhEyAoUybUu7lXcbMMi0224'; // 222.0s
const LONGEST_WRITE = 'call_00_np9ClrsU3gbecAJKy6T21222'; //  67.2s
const LONGEST_BASH = 'call_00_RZFiWrvLKIQZ8meNCp6c8638'; //  57.0s

// ── 驱动 ────────────────────────────────────────────────────────────────

class FakeAcpChild extends EventEmitter {
  stdin = new PassThrough();
  stdout = new PassThrough();
  stderr = new PassThrough();
  killed = false;

  kill(): boolean {
    this.killed = true;
    return true;
  }
}

type Emitted = { event: string; payload: Record<string, unknown> };

function startSession(): { child: FakeAcpChild; events: Emitted[] } {
  const child = new FakeAcpChild();
  const events: Emitted[] = [];
  attachAcpSession({
    child: child as never,
    prompt: 'w123',
    cwd: '/tmp/od-project',
    model: null,
    mcpServers: [],
    send: (event: string, payload: unknown) =>
      events.push({ event, payload: payload as Record<string, unknown> }),
  } as never);
  writeResult(child, 1, {});
  writeResult(child, 2, { sessionId: 'session-1' });
  return { child, events };
}

function writeUpdate(child: FakeAcpChild, update: unknown): void {
  child.stdout.write(`${JSON.stringify({ method: 'session/update', params: { update } })}\n`);
}

function writeResult(child: FakeAcpChild, id: number, result: unknown): void {
  child.stdout.write(`${JSON.stringify({ id, result })}\n`);
}

const agentPayloads = (events: Emitted[], type: string): Record<string, unknown>[] =>
  events.filter((e) => e.event === 'agent' && e.payload.type === type).map((e) => e.payload);

/** 一次调用在途形态的事件类型 —— 实现要发的就是这个。 */
const IN_FLIGHT = 'tool_in_flight';

/**
 * 按语料的**真实墙钟**回放一次调用。
 *
 * 时钟必须是真的:在途事件的节流判据是 `Date.now()`,把六帧背靠背喂进去会把
 * 真实间隔 2.3 秒压成 0 毫秒,于是「节流生效」和「升级会发第二条」两条断言
 * 同时变成假的 —— 一条假红、一条假绿。虚拟时钟按 `offsetMs` 往前走,
 * 量到的就是线上会发生的事。
 */
const CLOCK_BASE = 1_787_820_000_000;

function replayCall(child: FakeAcpChild, call: AcpCall, upTo = call.frames.length): void {
  for (const frame of call.frames.slice(0, upTo)) {
    vi.setSystemTime(CLOCK_BASE + frame.offsetMs);
    writeUpdate(child, frame.update);
  }
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(CLOCK_BASE);
});

afterEach(() => {
  vi.useRealTimers();
});

// ── 真语料守卫 ──────────────────────────────────────────────────────────

test('W123 夹具是真语料,不是手搭的', () => {
  assert.equal(CORPUS.calls.length, 202, '真语料是 202 次调用');
  assert.equal(
    CORPUS.calls.reduce((n, c) => n + c.frames.length, 0),
    911,
    '真语料是 911 帧',
  );
  // 12 个不同 session,不是同一段复制粘贴出来的。
  assert.ok(new Set(CORPUS.calls.map((c) => c.session)).size >= 10);
  // 真实墙钟:手搭夹具的 offset 会是 0 / 整百的等差数列。
  const offsets = CORPUS.calls.flatMap((c) => c.frames.map((f) => f.offsetMs));
  assert.ok(offsets.some((ms) => ms > 200_000), '语料里必须还有那次 222 秒的 task');
  assert.ok(
    offsets.filter((ms) => ms > 0 && ms % 100 !== 0).length > 300,
    '真实毫秒不会成片地整除 100',
  );
  // 关键形态一个都不能少。
  for (const tool of ['bash', 'write', 'edit', 'read', 'task', 'todowrite', 'grep', 'glob']) {
    assert.ok(callsByTool(tool).length > 0, `语料缺少 ${tool}`);
  }
  // 第一帧的 rawInput 是空的 —— 整条设计就建立在这个事实上。
  const firstFrames = CORPUS.calls.map((c) => c.frames[0]!.update);
  const withInput = firstFrames.filter((u) => Object.keys((u.rawInput ?? {}) as object).length > 0);
  assert.equal(withInput.length, 0, '第一帧不该带入参 —— 若带了,整套「先无名后补名」的前提就变了');
});

// ── ① 第一帧就上屏 ──────────────────────────────────────────────────────

test('bash 的 pending 帧一到,行就在了 —— 不用等终态', () => {
  const { child, events } = startSession();
  const call = callById(LONGEST_BASH);
  replayCall(child, call, 1); // 只喂 pending

  const inFlight = agentPayloads(events, IN_FLIGHT);
  assert.equal(inFlight.length, 1, 'pending 帧必须立刻画出一行');
  assert.equal(inFlight[0]!.id, acpTelemetryToolCallId(call.toolCallId));
  assert.equal(inFlight[0]!.name, 'Bash', '第一帧的 kind=bash 已经够定工具名');
  assert.equal(
    typeof inFlight[0]!.startedAt,
    'number',
    '秒表的锚点要跟着走(st.firstSeenAt)',
  );

  // 终态还没来,完成态那一对一条都不许有。
  assert.deepEqual(agentPayloads(events, 'tool_use'), []);
  assert.deepEqual(agentPayloads(events, 'tool_result'), []);
});

test('在途那一行没有 file_path,也不做成可点链接', () => {
  const { child, events } = startSession();
  replayCall(child, callById(LONGEST_BASH), 1);

  const input = agentPayloads(events, IN_FLIGHT)[0]!.input as Record<string, unknown>;
  assert.equal('file_path' in input, false, '第一帧 rawInput 是空的,没有任何真路径可显示');
});

test('running 帧带来真命令后补上,而且不多出一行', () => {
  const { child, events } = startSession();
  const call = callById(LONGEST_BASH);
  replayCall(child, call, 2); // pending + 第一个 running

  const inFlight = agentPayloads(events, IN_FLIGHT);
  assert.equal(inFlight.length, 2, '升级是「再发一条同 id 的在途形态」,由 web 侧留最后一条');
  assert.ok(inFlight.every((p) => p.id === acpTelemetryToolCallId(call.toolCallId)), '同一个 id');

  const upgraded = inFlight[inFlight.length - 1]!.input as Record<string, unknown>;
  assert.equal(typeof upgraded.command, 'string');
  assert.ok(String(upgraded.command).includes('media generate'), '真命令要出现在行上');
});

test('终态到达后只剩一对完成态事件,且带完整入参和结果', () => {
  const { child, events } = startSession();
  const call = callById(LONGEST_BASH);
  replayCall(child, call);

  const toolUses = agentPayloads(events, 'tool_use');
  const toolResults = agentPayloads(events, 'tool_result');
  assert.equal(toolUses.length, 1, 'st.emitted 不能因为先发了在途形态就把终态整个吞掉');
  assert.equal(toolResults.length, 1);
  assert.equal(toolUses[0]!.id, acpTelemetryToolCallId(call.toolCallId));
  assert.equal(toolUses[0]!.name, 'Bash');
  const settled = toolUses[0]!.input as Record<string, unknown>;
  assert.ok(String(settled.command ?? '').includes('media generate'));
  assert.ok(String(toolResults[0]!.content ?? '').length > 0);
});

test('write:pending 无名 → 终态补上真路径,全程一个 id', () => {
  const { child, events } = startSession();
  const call = callById(LONGEST_WRITE);
  replayCall(child, call, 1);
  const first = agentPayloads(events, IN_FLIGHT)[0]!;
  assert.equal(first.name, 'Write');
  assert.equal('file_path' in (first.input as Record<string, unknown>), false);

  replayCall(child, call);
  const settled = agentPayloads(events, 'tool_use');
  assert.equal(settled.length, 1);
  assert.match(
    String((settled[0]!.input as Record<string, unknown>).file_path),
    /\.od\/projects\/59f3dc9c-dd93-4f3d-ace2-1fa63035008f\/creator-analytics-dashboard\.html$/,
  );
  // 「先无名、后补名」不会闪:真语料 202 次里路径从没变过。
  const ids = new Set([
    ...agentPayloads(events, IN_FLIGHT).map((p) => p.id),
    ...settled.map((p) => p.id),
  ]);
  assert.equal(ids.size, 1);
});

test('task:222 秒那次也在第一帧就上屏', () => {
  const { child, events } = startSession();
  const call = callById(LONGEST_TASK);
  replayCall(child, call, 1);
  const inFlight = agentPayloads(events, IN_FLIGHT);
  assert.equal(inFlight.length, 1);
  assert.equal(inFlight[0]!.name, 'Task');
});

// ── 坑 2:在途形态不许污染 AMR 无输出检测 ──────────────────────────────

test('只发在途形态时,不产生 tool_result,也不算「已产出」', () => {
  const { child, events } = startSession();
  replayCall(child, callById(LONGEST_BASH), 3);
  // 先证明这条断言不是真空的:行确实上屏了,只是没带结果。
  assert.ok(agentPayloads(events, IN_FLIGHT).length > 0, '行必须已经在了,否则下面那条恒真');
  assert.deepEqual(
    agentPayloads(events, 'tool_result'),
    [],
    '在途形态绝不能走 emitTerminalToolPair —— 那会顺手置 emittedConcreteToolEvent',
  );
});

test('think 类工具不上屏', () => {
  const { child, events } = startSession();
  writeUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'think-1',
    status: 'pending',
    kind: 'think',
    title: 'thinking',
  });
  assert.deepEqual(agentPayloads(events, IN_FLIGHT), [], 'think 帧是噪音,不是工具行');
});

test('上了屏的行,后来被判成 think 也必须收尾', () => {
  // `thinkOnly` 是「一旦为真永不清零」的,所以**后一帧**可以把一次已经画出来的
  // 调用翻成 think。原来的 think 过滤会连终态一起丢掉 —— 屏幕上就留下一行永远
  // 转圈的东西,正是这次改动要消灭的那种「是不是卡住了」。
  // 真语料 202 次里一次都没翻过(名字只变过 1 次,还是变准了),但代价太低,
  // 不值得赌。
  const { child, events } = startSession();
  writeUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'late-think',
    status: 'pending',
    kind: 'execute',
    title: 'bash',
    rawInput: { command: 'ls' },
  });
  assert.equal(agentPayloads(events, IN_FLIGHT).length, 1, '先上屏');

  vi.setSystemTime(CLOCK_BASE + 5_000);
  writeUpdate(child, {
    sessionUpdate: 'tool_call_update',
    toolCallId: 'late-think',
    status: 'completed',
    title: 'thinking about it',
  });
  assert.equal(agentPayloads(events, 'tool_use').length, 1, '画出来的行必须有结尾');
  assert.equal(agentPayloads(events, 'tool_result').length, 1);
});

// ── 坑 3:取消时的 flush 不许补出第二行 ────────────────────────────────

test('run 被中途取消,flush 只补一对完成态,不多出一行', () => {
  const { child, events } = startSession();
  const call = callById(LONGEST_BASH);
  replayCall(child, call, 4); // pending + 三个 running,没有终态

  assert.ok(agentPayloads(events, IN_FLIGHT).length > 0, '取消前行已经在了');

  // 子进程死掉 → failWithPayload → flushOpenAcpTools(true)
  child.emit('close', 1, null);

  const toolUses = agentPayloads(events, 'tool_use');
  assert.equal(toolUses.length, 1, 'flush 只写这次调用的结尾,不是新起一次调用');
  assert.equal(toolUses[0]!.id, acpTelemetryToolCallId(call.toolCallId));
  assert.equal(agentPayloads(events, 'tool_result').length, 1);
  assert.equal(agentPayloads(events, 'tool_result')[0]!.isError, true);
});

// ── 在途形态不落库 ────────────────────────────────────────────────────

test('在途形态不落库 —— 重载后一次调用只能有一行', () => {
  const inFlight = {
    type: 'tool_in_flight',
    id: 'abc',
    name: 'Bash',
    input: { command: 'ls' },
    startedAt: 1,
  };
  assert.equal(
    runSseEventToPersistedAgentEvent('agent', inFlight),
    null,
    'run 结束后同一份信息已经在完成态里了;落库会让重载后的会话对同一次调用画两行',
  );
  // 反向:完成态照旧落库,别把这条守卫写成「凡是 tool_ 开头都丢」。
  assert.ok(
    runSseEventToPersistedAgentEvent('agent', {
      type: 'tool_use',
      id: 'abc',
      name: 'Bash',
      input: { command: 'ls' },
      startedAt: 1,
    }),
  );
});

// ── ② 中间输出 ────────────────────────────────────────────────────────

test('in_progress 帧带 content 时,在途那一行的输出跟着长', () => {
  const { child, events } = startSession();
  const base = {
    sessionUpdate: 'tool_call',
    toolCallId: 'grow-1',
    kind: 'bash',
    title: 'bash',
    rawInput: { command: 'pnpm build' },
  };
  writeUpdate(child, { ...base, status: 'pending', rawInput: {} });
  vi.setSystemTime(CLOCK_BASE + 4_000);
  writeUpdate(child, {
    ...base,
    status: 'in_progress',
    content: [{ type: 'content', content: { type: 'text', text: 'a'.repeat(120) } }],
  });
  vi.setSystemTime(CLOCK_BASE + 9_000);
  writeUpdate(child, {
    ...base,
    status: 'in_progress',
    content: [{ type: 'content', content: { type: 'text', text: 'a'.repeat(400) } }],
  });

  const outputs = agentPayloads(events, IN_FLIGHT)
    .map((p) => (typeof p.output === 'string' ? p.output.length : 0))
    .filter((n) => n > 0);
  assert.ok(outputs.length >= 2, `中间输出至少要变过两次,实际 ${outputs.length} 次`);
  for (let i = 1; i < outputs.length; i += 1) {
    assert.ok(outputs[i]! >= outputs[i - 1]!, '输出长度必须单调不减');
  }
});

// ── 节流 ──────────────────────────────────────────────────────────────

test('节流:整批真语料跑完,在途事件数远小于帧数', () => {
  let frames = 0;
  let inFlight = 0;
  for (const call of CORPUS.calls) {
    const { child, events } = startSession();
    replayCall(child, call);
    frames += call.frames.length;
    inFlight += agentPayloads(events, IN_FLIGHT).length;
  }
  assert.equal(frames, 911, '真语料 911 帧');
  // 实测:911 帧里 709 帧非终态,只发出 350 条在途事件(bash 538 帧 → 144 条,
  // 削掉 73%)。载荷没变就不发,变了也要隔 250ms —— 见
  // `ACP_IN_FLIGHT_TOOL_MIN_INTERVAL_MS` 的注释。
  assert.equal(inFlight, 350, `在途事件应为 350 条,实际 ${inFlight}`);
  assert.ok(
    inFlight * 2 < frames,
    `在途事件 ${inFlight} 条 / 帧 ${frames} 条 —— 载荷没变时不许重发`,
  );
});

// ── ③ 目录不当文件路径 ────────────────────────────────────────────────

test('locations 是目录时不当 file_path 用', () => {
  // opencode 的 bash 兜底:没有 workdir/cwd 入参时把 session cwd(一个目录)塞进
  // locations(`m()` → `_o()`)。vela 今天没透传,哪天透传了就会在界面上出现一个
  // 指向目录的「文件」链接。
  const dirUpdate = {
    sessionUpdate: 'tool_call',
    toolCallId: 'bash-dir',
    status: 'in_progress',
    kind: 'execute',
    title: 'bash',
    rawInput: { command: 'ls', cwd: '/tmp/od-project/apps/web' },
    locations: [{ path: '/tmp/od-project/apps/web' }],
  };
  assert.equal(
    acpArtifactWritePathRanked(dirUpdate, { sessionCwd: '/tmp/od-project' }),
    null,
    'execute 家族的 locations 只是 cwd 兜底,不是写入目标',
  );

  // 尾部分隔符是目录的硬证据,任何来源都不认。
  assert.equal(
    acpArtifactWritePathRanked({
      sessionUpdate: 'tool_call',
      toolCallId: 'w',
      kind: 'write',
      title: 'write',
      locations: [{ path: '/tmp/od-project/out/' }],
    }),
    null,
  );

  // 等于 session cwd 的路径同样不是文件。
  assert.equal(
    acpArtifactWritePathRanked(
      {
        sessionUpdate: 'tool_call',
        toolCallId: 'w2',
        kind: 'write',
        title: 'write',
        rawInput: { path: '/tmp/od-project' },
      },
      { sessionCwd: '/tmp/od-project' },
    ),
    null,
  );

  // 反向:真文件一如既往地认。
  assert.deepEqual(
    acpArtifactWritePathRanked({
      sessionUpdate: 'tool_call',
      toolCallId: 'w3',
      kind: 'write',
      title: 'write',
      locations: [{ path: '/tmp/od-project/index.html' }],
    }),
    { path: '/tmp/od-project/index.html', rank: 3 },
  );
});

test('bash 的 locations 目录不会漏进在途行的 file_path', () => {
  const { child, events } = startSession();
  writeUpdate(child, {
    sessionUpdate: 'tool_call',
    toolCallId: 'bash-dir-2',
    status: 'pending',
    kind: 'execute',
    title: 'bash',
    rawInput: {},
    locations: [{ path: '/tmp/od-project' }],
  });
  const input = agentPayloads(events, IN_FLIGHT)[0]!.input as Record<string, unknown>;
  assert.equal('file_path' in input, false, '目录不是文件,不许出现在行上');
});

// ── 全形态覆盖 ────────────────────────────────────────────────────────

/**
 * 「先猜后改」到底会改多少 —— 这条是量出来的,不是推出来的。
 *
 * 工具名是 ACP 从 `kind`/`title` 推的、路径是从 `locations`/`rawInput`/title 推的,
 * 所以早期那一行上的两格都可能是猜的。真语料 202 次调用跑下来:
 *
 *  · **路径 0/202 变过** —— 「先无名、后补名」不会闪。
 *  · **名字 1/202 变过**,而且是那次 task:`Task → Survey OpenDesign chat panel`
 *    的首词。第一帧 title 就是 `task`(vela 的 `mapOpenCodeToolPart` 在 title 为空
 *    时回落成工具名),真标题要等 running 帧。这是**变准了**,不是变错了。
 *
 * 数字变大就是有新的猜法进来了,得重新看一眼值不值。
 */
test('在途行的名字/路径会不会改:量出来是 1/202 和 0/202', () => {
  const nameChurn: string[] = [];
  let pathChurn = 0;
  for (const call of CORPUS.calls) {
    const { child, events } = startSession();
    replayCall(child, call);
    const rows = agentPayloads(events, IN_FLIGHT).concat(agentPayloads(events, 'tool_use'));
    const names = new Set(rows.map((p) => String(p.name)));
    if (names.size > 1) nameChurn.push([...names].join(' → '));
    const paths = new Set(
      rows
        .map((p) => String((p.input as Record<string, unknown>).file_path ?? ''))
        .filter((v) => v),
    );
    if (paths.size > 1) pathChurn += 1;
  }
  expect(pathChurn, '路径一旦会变,行上的文件名就会当着用户的面跳').toBe(0);
  expect(nameChurn).toEqual(['Task → Survey']);
});

test('语料里每一次非 think 调用,都在第一帧就有了行,而且全程只有一行', () => {
  const missing: string[] = [];
  const extra: string[] = [];
  for (const call of CORPUS.calls) {
    const { child, events } = startSession();
    replayCall(child, call, 1);
    if (agentPayloads(events, IN_FLIGHT).length === 0) missing.push(call.toolCallId);
    replayCall(child, call);
    const settled = agentPayloads(events, 'tool_use');
    if (settled.length !== 1) extra.push(`${call.toolCallId}: ${settled.length} 条完成态`);
    const ids = new Set([
      ...agentPayloads(events, IN_FLIGHT).map((p) => p.id),
      ...settled.map((p) => p.id),
    ]);
    if (ids.size !== 1) extra.push(`${call.toolCallId}: ${ids.size} 个 id`);
  }
  expect(missing, '这些调用第一帧没上屏').toEqual([]);
  expect(extra, '这些调用画出了不止一行').toEqual([]);
});
