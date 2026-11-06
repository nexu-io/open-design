import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell } from '../../../src/runtime/chat/contract';
import {
  THINKING_TOKENS_STALL_ENTER_MS,
  THINKING_TOKENS_STREAM_ALIVE_MS,
  countThinkingSlotFlips,
  thinkingSlotMode,
} from '../../../src/runtime/chat/thinking-slot';

/**
 * 「思考中」那个槽不许来回闪(用户 2026-09-04 的红线)。
 *
 * 闪动是**过程**属性:每一帧单独看都对,错的是一轮里翻了几十次面。所以这里的
 * 判据是**翻面次数**,不是终态 —— 只断言「最后显示的是 token」的用例看不见这个缺陷。
 */

/** 真实语料:codex run 7136ca59(codex-cli 0.153.0)一轮 24 条读数的到达间隔,毫秒。 */
const REAL_CODEX_GAPS_MS = [
  16_130, 12_180, 6_590, 6_570, 9_380, 13_780, 14_060, 118_970, 12_020,
  252_080, 14_310, 12_810, 12_360, 46_210, 14_290, 7_040, 6_110, 55_670,
  24_990, 17_510, 10_660, 15_320, 16_370,
] as const;

/** 真实语料:claude 的健康推理帧距(p50 1.4s、最大观测 4.88s)。 */
const REAL_CLAUDE_GAPS_MS = [
  1_400, 900, 1_400, 4_880, 1_100, 1_400, 2_200, 1_400, 1_300, 3_100, 1_400,
] as const;

const T0 = 1_700_000_000_000;

function arrivalsFrom(gaps: readonly number[]): number[] {
  const out = [T0];
  for (const gap of gaps) out.push((out.at(-1) as number) + gap);
  return out;
}

/** 每秒看一眼屏幕,从第一条读数一直看到最后一条之后 30 秒。 */
function tickClock(arrivals: readonly number[]): number[] {
  const end = (arrivals.at(-1) as number) + 30_000;
  const out: number[] = [];
  for (let t = arrivals[0] as number; t <= end; t += 1_000) out.push(t);
  return out;
}

describe('思考槽的形态切换必须稀疏', () => {
  const codexArrivals = arrivalsFrom(REAL_CODEX_GAPS_MS);
  const codexClock = tickClock(codexArrivals);

  it('单门槛(原来的 8s 判据)在真实 codex 语料上会疯狂闪动 —— 这是被修的缺陷', () => {
    // 旧判据一字不改地复刻在这里:`build-turn-blocks` 的
    // `isThinkingTokenCountStale` 就是 `now - 最后一条 > 8s` 这一句。
    // 复刻而不是调用,是因为修好之后那个函数已经不再是这个形状了 ——
    // 这一条用例的存在意义是把「被修掉的行为」钉住,让后来人看得见差距。
    const OLD_STALL_MS = 8_000;
    const oldModeAt = (now: number): 'tokens' | 'elapsed' => {
      const visible = codexArrivals.filter((at) => at <= now);
      const last = visible.at(-1);
      if (last == null) return 'tokens';
      return now - last > OLD_STALL_MS ? 'elapsed' : 'tokens';
    };
    let flips = 0;
    let previous: 'tokens' | 'elapsed' | null = null;
    for (const now of codexClock) {
      const mode = oldModeAt(now);
      if (previous != null && mode !== previous) flips += 1;
      previous = mode;
    }
    // 24 条读数里 19 个间隔超过 8s,每个都是「翻过去 + 翻回来」。
    expect(flips).toBeGreaterThan(30);
  });

  it('迟滞之后,同一轮的切换次数落到个位数', () => {
    const flips = countThinkingSlotFlips(codexArrivals, codexClock);
    expect(flips).toBeLessThanOrEqual(9);
    // 而且不是靠「永远显示 token」蒙混过去:真停顿(119s / 252s)照样接管。
    expect(flips).toBeGreaterThan(0);
  });

  it('健康的 claude 流一次都不翻 —— 迟滞没有把密流也拖进秒数', () => {
    const claudeArrivals = arrivalsFrom(REAL_CLAUDE_GAPS_MS);
    const lastArrival = claudeArrivals.at(-1) as number;
    const clock: number[] = [];
    for (let t = claudeArrivals[0] as number; t <= lastArrival; t += 500) clock.push(t);
    expect(countThinkingSlotFlips(claudeArrivals, clock)).toBe(0);
  });
});

/**
 * 上面几条测的是判据本身。这一条测的是**接线** —— 判据再对,`build-turn-blocks`
 * 只要还按老规矩把「最后一帧的年龄」交出去,屏幕上照旧闪。
 */
describe('壳上的 stale 走的是迟滞,不是最后一帧的年龄', () => {
  const codexArrivals = arrivalsFrom(REAL_CODEX_GAPS_MS);

  const events: PersistedAgentEvent[] = [
    { kind: 'thinking', text: '' } as PersistedAgentEvent,
    ...codexArrivals.map((at, i) =>
      ({ kind: 'thinking_tokens', tokens: (i + 1) * 400, at } as PersistedAgentEvent)),
  ];

  const staleAt = (nowMs: number): boolean => {
    const visible = events.filter(
      (e) => e.kind !== 'thinking_tokens' || (e as { at: number }).at <= nowMs,
    );
    const blocks = buildTurnBlocks({
      events: visible, runStatus: 'running', startedAtMs: codexArrivals[0], nowMs,
    });
    const shell = blocks.find((b): b is ExecutionShell => b.kind === 'shell');
    return shell?.thinkingTokens?.stale === true;
  };

  it('一整轮下来,壳上的形态只翻个位数次', () => {
    let flips = 0;
    let previous: boolean | null = null;
    const end = (codexArrivals.at(-1) as number) + 30_000;
    for (let now = codexArrivals[0] as number; now <= end; now += 1_000) {
      const stale = staleAt(now);
      if (previous != null && stale !== previous) flips += 1;
      previous = stale;
    }
    // 老判据(`now - 最后一帧 > 8s`)在同一串到达时刻上翻 38 次,见本文件第一条用例。
    expect(flips).toBeLessThanOrEqual(9);
  });

  it('正常节奏的那几分钟里一次都不让位 —— 包括两条读数**之间**', () => {
    // 只在读数到达的那一刻取样是看不见缺陷的:那一刻年龄为 0,老判据也说「新」。
    // 闪动全发生在**间隔中间**,所以这里专挑老判据必然翻面的位置去看
    // ——「上一条到了 9 秒之后」,刚过老的 8s 门槛。
    // 前 7 个间隔全在 6.6~16.1s,是完全健康的推理节奏。
    const steady = codexArrivals.slice(0, 8);
    for (let i = 0; i < steady.length - 1; i += 1) {
      const at = steady[i] as number;
      const next = steady[i + 1] as number;
      if (next - at <= 9_000) continue;
      expect(staleAt(at + 9_000), `间隔 ${i} 的第 9 秒`).toBe(false);
    }
  });

  it('真停顿(119s)照样把槽让给秒数 —— 不是靠永远显示 token 蒙混过去', () => {
    const stallStart = codexArrivals[7] as number;
    expect(staleAt(stallStart + THINKING_TOKENS_STALL_ENTER_MS + 1_000)).toBe(true);
  });
});

describe('两个门槛各自的判据', () => {
  it('数还在动就写 token', () => {
    const arrivals = [T0, T0 + 10_000, T0 + 20_000];
    expect(thinkingSlotMode(arrivals, T0 + 21_000)).toBe('tokens');
  });

  it('数站着不动超过 ENTER 才让给秒数', () => {
    expect(thinkingSlotMode([T0], T0 + THINKING_TOKENS_STALL_ENTER_MS)).toBe('tokens');
    expect(thinkingSlotMode([T0], T0 + THINKING_TOKENS_STALL_ENTER_MS + 1)).toBe('elapsed');
  });

  it('长停之后孤零零来一条,不翻回 token —— 那正是闪一下的来源', () => {
    const stall = THINKING_TOKENS_STALL_ENTER_MS + 10_000;
    // 停很久 → 来一条 → 又停很久。中间那条不足以证明流活了。
    const arrivals = [T0, T0 + stall, T0 + stall + stall];
    expect(thinkingSlotMode(arrivals, T0 + stall + stall + 1_000)).toBe('elapsed');
  });

  it('长停之后连着来两条,才把槽还给 token', () => {
    const stall = THINKING_TOKENS_STALL_ENTER_MS + 10_000;
    const resumed = T0 + stall;
    const arrivals = [T0, resumed, resumed + THINKING_TOKENS_STREAM_ALIVE_MS];
    expect(thinkingSlotMode(arrivals, resumed + THINKING_TOKENS_STREAM_ALIVE_MS + 1_000))
      .toBe('tokens');
  });

  it('一条读数都没有 / 拿不到此刻,一律写 token', () => {
    // 「不知道多久没变」不是「很久没变」。产品「第一段 thinking 永远显示 token」
    // 也落在这一条上。
    expect(thinkingSlotMode([], T0 + 600_000)).toBe('tokens');
    expect(thinkingSlotMode([T0], null)).toBe('tokens');
  });

  it('复活门槛不得高于停顿门槛,否则一旦让位就再也回不来', () => {
    /*
     * 这条守卫原本写的是「两个数必须不相等」—— 它钉的是「同一个门限判进出必然
     * 在边界上抖」。产品 2026-09-04 看过真实语料的翻面次数之后,选择把两个数
     * **统一到 20s**(原话「统一吧?都 20s?」「20s 即使来回翻,也还行了,
     * 不算太频繁了」),所以「必须不相等」这条已经作废。
     *
     * 真正不能破的是这一条:ALIVE 若**大于** ENTER,让位之后永远凑不出一对
     * 足够密的读数,槽就再也回不到 token —— 那是个单向门,不是迟滞。
     * 相等是允许的(等价于单门限),更小则重新拉开迟滞带。
     */
    expect(THINKING_TOKENS_STREAM_ALIVE_MS).toBeLessThanOrEqual(THINKING_TOKENS_STALL_ENTER_MS);
  });
});
