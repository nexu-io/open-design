/**
 * 推理 token 计数从哪一种帧里读出来 —— 断言全部打在**真实录制**上
 * (`../fixtures/claude-cli-recordings/`,CLI 2.1.259),不用手搭帧。
 *
 * ── 补的是哪个画面 ──────────────────────────────────────────────────────
 *
 * claude 的 extended thinking 有一档**只计费、不给字**:API 收下推理 token、
 * 账单照收,回来的却只有一个加密签名,`thinking` 一路是空串。真机复现(CLI 2.1.260)
 * 是 3060 个计费 thinking token、**0 个字符**;用户那一轮盯着「思考中」和一只空窗
 * 看了 57 秒。屏幕上没有任何东西说「它在想,而且想了很多」。
 *
 * 但 CLI **一直在报**想了多少,只是 daemon 把那种帧丢在地上:
 * `handleObject` 认得 `system/init` 与 `system/status`,`system/thinking_tokens`
 * 直接落到底。这个文件先钉住「那种帧确实存在、值确实是真的」,再钉住它被发出来。
 *
 * ── 为什么读 `system/thinking_tokens` 而不是 `thinking_delta.estimated_tokens` ──
 *
 * 两件事在录制里都看得见,但只有前者是可靠的。第一节的语料守卫就是拿来钉这条判据的,
 * 别照着直觉把实现改去读 delta 上那个字段:
 *
 *   · **delta 那个字段一半是 null。** 每个 thinking 块的最后一帧必然是
 *     `{"thinking":"","estimated_tokens":null}` —— 仓库里那条「`estimated_tokens`
 *     走不通」的旧结论(`specs/current/chat-panel-feedback.md`)看的正是这个字段,
 *     它对**那个字段**是对的。
 *   · **delta 那个字段是增量,不是累计。** `partial-single-turn` 第二个块:
 *     系统帧累计 50 / 150 / 300 / 450,同批 delta 却是 50 / 100 / 150 / 150。
 *     把它当累计用,数会一路往回跳。
 *   · **不开 `--include-partial-messages` 时 delta 帧根本不存在。**
 *     `no-partial-*` 两份录制里 `stream_event` 一帧都没有,而系统帧一帧不少。
 *
 * 系统帧则是 36 帧全部非空、带累计值也带增量,两种 CLI 配置下都在。
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createClaudeStreamHandler } from '../../src/runtimes/claude-stream.js';
import { daemonAgentPayloadToPersistedAgentEvent } from '../../src/runtimes/chat-run-messages.js';

type Frame = Record<string, unknown>;
type Event = Record<string, unknown>;

function readRecording(name: string): string {
  return readFileSync(
    fileURLToPath(new URL(`../fixtures/claude-cli-recordings/${name}`, import.meta.url)),
    'utf8',
  );
}

function frames(name: string): Frame[] {
  return readRecording(name)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Frame);
}

function replayRecording(name: string, options: Record<string, unknown> = {}): Event[] {
  const events: Event[] = [];
  const handler = createClaudeStreamHandler((event) => events.push(event as Event), options);
  handler.feed(readRecording(name));
  handler.flush();
  return events;
}

/** 录制里那种独立系统帧的累计值,按出现顺序 */
function recordedSystemCounts(name: string): unknown[] {
  return frames(name)
    .filter((f) => f.type === 'system' && f.subtype === 'thinking_tokens')
    .map((f) => f.estimated_tokens);
}

/** `thinking_delta` 上那个同名字段,按出现顺序 */
function recordedDeltaCounts(name: string): unknown[] {
  const out: unknown[] = [];
  for (const f of frames(name)) {
    if (f.type !== 'stream_event') continue;
    const event = f.event as Record<string, unknown> | undefined;
    const delta = event?.delta as Record<string, unknown> | undefined;
    if (delta?.type === 'thinking_delta') out.push(delta.estimated_tokens);
  }
  return out;
}

function emittedCounts(events: Event[]): unknown[] {
  return events.filter((e) => e.type === 'thinking_tokens').map((e) => e.tokens);
}

const PARTIAL_RECORDINGS = [
  'claude-2.1.259-partial-two-turns.jsonl',
  'claude-2.1.259-partial-same-turn-echo.jsonl',
  'claude-2.1.259-partial-single-turn.jsonl',
  'claude-2.1.259-partial-forwarded-subagent.jsonl',
];
const NO_PARTIAL_RECORDINGS = [
  'claude-2.1.259-no-partial-messages.jsonl',
  'claude-2.1.259-no-partial-two-turns.jsonl',
];
const ALL_RECORDINGS = [...PARTIAL_RECORDINGS, ...NO_PARTIAL_RECORDINGS];

// --------------------------------------------------------------------------
// 语料守卫。先证明这把尺子量得着东西 —— 否则下面那些断言可以在一份空录制上恒绿。
// --------------------------------------------------------------------------
describe('录制语料:进度信号确实在流里', () => {
  it('六份录制每一份都带 `system/thinking_tokens`,累计值一个 null 都没有', () => {
    const total: unknown[] = [];
    for (const name of ALL_RECORDINGS) {
      const counts = recordedSystemCounts(name);
      expect(counts.length, `${name} 里一帧都没有`).toBeGreaterThan(0);
      total.push(...counts);
    }
    expect(total.length, '语料规模变了就重新量一遍').toBe(36);
    expect(
      total.every((n) => typeof n === 'number' && Number.isFinite(n) && n > 0),
      '系统帧的累计值全是正整数',
    ).toBe(true);
  });

  it('反面:`thinking_delta` 上那个同名字段一半是 null —— 旧结论看的是它', () => {
    const all = PARTIAL_RECORDINGS.flatMap((name) => recordedDeltaCounts(name));
    expect(all.length, 'partial 录制里确实有 thinking_delta').toBeGreaterThan(0);
    expect(all.some((n) => n === null), '每个块的收尾帧都是 null').toBe(true);
  });

  it('反面:delta 上那个字段是**增量**,当累计用会一路往回跳', () => {
    // `partial-single-turn` 第二个 thinking 块:系统帧累计 50/150/300/450,
    // delta 却报 50/100/150/150 —— 后者是每帧新增的量。
    const name = 'claude-2.1.259-partial-single-turn.jsonl';
    expect(recordedSystemCounts(name)).toEqual([50, 146, 50, 150, 300, 450, 561]);
    expect(recordedDeltaCounts(name)).toEqual([50, null, 50, 100, 150, 150, null]);
  });

  /**
   * ⚠️ **别照着「算得更准」把实现改去读计费值。**
   *
   * 同一份录制里还有第三个数:`message_delta` / `result` 的
   * `usage.output_tokens_details.thinking_tokens` —— 那是**结算**值,块跑完才有。
   * 它和系统帧报的估算值**对不上**,而且系统帧一律偏大(单块 146 vs 计费 91、
   * 561 vs 计费 450,高约 25% 与 60%)。
   *
   * 屏幕上要的是**块跑着的时候**的进度,而结算值恰恰在那一刻不存在;等它到了,
   * 那一格「思考中」也已经收掉了(claude 空推理那一档跑完连行都不留)。
   * 所以这里报的是 CLI 自己叫「estimated」的那个估算值,**不是账单**。
   * 这条守卫把两个数的差记在案,免得下一个人把它们当成同一个数去「修」。
   */
  it('反面:结算值是另一个数,而且系统帧一律偏大 —— 两者不可互换', () => {
    const name = 'claude-2.1.259-partial-single-turn.jsonl';
    const billed: number[] = [];
    for (const f of frames(name)) {
      if (f.type !== 'stream_event') continue;
      const event = f.event as Record<string, unknown> | undefined;
      if (event?.type !== 'message_delta') continue;
      const usage = event.usage as Record<string, unknown> | undefined;
      const details = usage?.output_tokens_details as Record<string, unknown> | undefined;
      if (typeof details?.thinking_tokens === 'number') billed.push(details.thinking_tokens);
    }
    // 每块的估算收尾值 vs 同一块的计费值
    expect(billed).toEqual([91, 450]);
    const estimatedBlockEnds = [146, 561];
    for (const [i, settled] of billed.entries()) {
      expect(estimatedBlockEnds[i]! > settled, `第 ${i + 1} 块的估算值应当偏大`).toBe(true);
    }
  });

  it('反面:不开 `--include-partial-messages` 时 delta 帧一帧都没有,系统帧一帧不少', () => {
    for (const name of NO_PARTIAL_RECORDINGS) {
      expect(recordedDeltaCounts(name), `${name} 没有 stream_event`).toEqual([]);
      expect(recordedSystemCounts(name).length, `${name} 的系统帧还在`).toBeGreaterThan(0);
    }
  });
});

// --------------------------------------------------------------------------
// 解析面。
// --------------------------------------------------------------------------
describe('daemon 把推理 token 计数发出来', () => {
  it('每一份录制发出的数,逐个等于录制里那些系统帧的累计值', () => {
    for (const name of ALL_RECORDINGS) {
      expect(emittedCounts(replayRecording(name)), name).toEqual(recordedSystemCounts(name));
    }
  });

  it('不开 `--include-partial-messages` 的 CLI 上照样发得出来', () => {
    // 这一档没有任何 `stream_event`,系统帧是**唯一**的进度来源。
    const events = replayRecording('claude-2.1.259-no-partial-messages.jsonl');
    expect(events.some((e) => e.type === 'stream_event')).toBe(false);
    expect(emittedCounts(events)).toEqual([1, 16, 31, 43, 153, 1, 2, 14, 15, 104]);
  });

  it('计数按 thinking 块从头累计 —— 换一块就从小数重新开始', () => {
    // 屏幕上一格「思考中」= 一个 thinking 块,所以「块内累计」正好就是「那一格的累计」。
    const counts = emittedCounts(replayRecording('claude-2.1.259-no-partial-two-turns.jsonl'));
    expect(counts).toEqual([50, 150, 260, 50, 153, 50, 151]);
  });

  it('值原样搬运,不做换算 —— 发出来的数只可能来自帧里', () => {
    for (const name of ALL_RECORDINGS) {
      const recorded = new Set(recordedSystemCounts(name));
      for (const n of emittedCounts(replayRecording(name))) {
        expect(recorded.has(n), `${name} 发出了录制里没有的 ${String(n)}`).toBe(true);
      }
    }
  });

  it('不带计数的帧不发事件 —— 缺字段 / 非数 / 负数一律当没有', () => {
    const events: Event[] = [];
    const handler = createClaudeStreamHandler((e) => events.push(e as Event));
    handler.feed([
      '{"type":"system","subtype":"thinking_tokens","session_id":"s"}',
      '{"type":"system","subtype":"thinking_tokens","estimated_tokens":null,"session_id":"s"}',
      '{"type":"system","subtype":"thinking_tokens","estimated_tokens":"120","session_id":"s"}',
      '{"type":"system","subtype":"thinking_tokens","estimated_tokens":-5,"session_id":"s"}',
      '{"type":"system","subtype":"thinking_tokens","estimated_tokens":120,"session_id":"s"}',
      '',
    ].join('\n'));
    handler.flush();
    expect(emittedCounts(events)).toEqual([120]);
  });

  /**
   * **不落库。**这个数描述的是一块**还在跑**的推理,而重放出来的对话里没有这种块:
   * 要么推理正文摆在那儿可以读,要么(claude 只计费不给字那一档)那一行压根不存在。
   * 何况一块推理 ~40 帧,落库只是给每一帧写一行,换不回任何东西。
   *
   * 判据打在**行为**上而不是某一行代码上:实现是「不写分支,靠函数末尾的
   * `return null` 兜住」—— 写一个 `if (…) return null` 是无用功(拆掉它这条测试
   * 一样绿,已实测)。哪天有人给它补上一条会落库的分支,这条当场红。
   */
  it('不落库 —— 这种事件不许变成持久化事件', () => {
    expect(daemonAgentPayloadToPersistedAgentEvent({ type: 'thinking_tokens', tokens: 3278 }))
      .toBeNull();
    // 正向对照:同一个函数对**该落库**的事件照旧给得出东西,不是它对什么都返回 null
    expect(daemonAgentPayloadToPersistedAgentEvent({ type: 'thinking_delta', delta: '想…' }))
      .toEqual({ kind: 'thinking', text: '想…' });
  });

  it('系统帧照旧不落进正文 —— 一个字符都不许流到回答里', () => {
    for (const name of ALL_RECORDINGS) {
      const text = replayRecording(name)
        .filter((e) => e.type === 'text_delta' && typeof e.delta === 'string')
        .map((e) => e.delta as string)
        .join('');
      expect(text, name).not.toContain('thinking_tokens');
      expect(text, name).not.toContain('estimated_tokens');
    }
  });
});
