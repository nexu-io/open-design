/**
 * 推理 token 计数落进壳里 —— **数据面**。渲染面在
 * `tests/components/chat/thinking-token-count.test.tsx`,解析面在
 * `apps/daemon/tests/runtimes/w134-thinking-token-count.test.ts`。
 *
 * 这一层管三件事:
 *  ① 累计值 last-wins,**绝不求和**(daemon 送的就是块内累计值);
 *  ② 一开口 / 一动手就把数收掉 —— 那时 CLI 的计数也归零了;
 *  ③ 「很久没变」这件事在这里算,组件只负责画(零新增 timer)。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import {
  buildTurnBlocks,
  THINKING_TOKENS_STALL_MS,
} from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell } from '../../../src/runtime/chat/contract';

const T0 = 1_800_000_000_000;

function shells(events: PersistedAgentEvent[], nowMs = T0 + 10_000): ExecutionShell[] {
  return buildTurnBlocks({ events, runStatus: 'running', startedAtMs: T0, nowMs })
    .filter((b): b is ExecutionShell => b.kind === 'shell');
}

/** 唯一那张壳 —— 多于一张就是夹具变形了,当场说清楚而不是默默取第一张 */
function only(events: PersistedAgentEvent[], nowMs?: number): ExecutionShell {
  const found = shells(events, nowMs);
  expect(found.length, '这些夹具应当只落一张壳').toBe(1);
  return found[0]!;
}

const thinking = (): PersistedAgentEvent => ({ kind: 'thinking', text: '' } as PersistedAgentEvent);
const count = (tokens: number, at: number): PersistedAgentEvent =>
  ({ kind: 'thinking_tokens', tokens, at } as PersistedAgentEvent);

describe('累计值 last-wins,不求和', () => {
  it('一串帧下来,壳上是**最后**那个数,不是它们的和', () => {
    const shell = only([
      thinking(),
      count(50, T0 + 1_400),
      count(1_240, T0 + 2_800),
      count(3_278, T0 + 4_200),
    ]);
    expect(shell.thinkingTokens?.count).toBe(3_278);
  });

  it('同一帧重放两遍,数一个字不变 —— 求和的话这里会翻倍', () => {
    const dup = only([
      thinking(),
      count(3_278, T0 + 1_400),
      count(3_278, T0 + 1_400),
    ]);
    expect(dup.thinkingTokens?.count).toBe(3_278);
  });

  it('中途接上(重连只补到最后一帧)也直接给落定的数,不从零涨', () => {
    // 客户端错过了前面所有帧,只收到当前这一条累计值
    const shell = only([thinking(), count(3_278, T0 + 4_200)]);
    expect(shell.thinkingTokens?.count).toBe(3_278);
  });

  it('CLI 换块时自己从小数重来 —— 照收,不当成「掉了」去修', () => {
    const shell = only([thinking(), count(260, T0 + 1_400), count(50, T0 + 2_800)]);
    expect(shell.thinkingTokens?.count).toBe(50);
  });
});

describe('数只描述**正在跑**的那一块', () => {
  it('开口说话之后,数跟着「思考中」一起收掉', () => {
    const shell = only([thinking(), count(3_278, T0 + 1_400), { kind: 'text', text: '好了。' }]);
    expect(shell.thinking).toBe(false);
    expect(shell.thinkingTokens).toBeNull();
  });

  it('动手调工具之后同样', () => {
    const shell = only([
      thinking(),
      count(3_278, T0 + 1_400),
      { kind: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' }, startedAt: T0 + 2_000 },
    ]);
    expect(shell.thinkingTokens).toBeNull();
  });

  /**
   * 块交界那一瞬:上一块收尾了,新一块的第一帧还没到。
   * 不收数的话,新的那一格一出现就写着上一块的 3.3k ——「刚开始想就想了 3.3k」。
   */
  it('块交界的一瞬:新一格还没拿到自己的数,就什么都不写', () => {
    const shell = only([
      thinking(),
      count(3_278, T0 + 1_400),
      { kind: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' }, startedAt: T0 + 2_000 },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: T0 + 2_400 },
      thinking(),
    ]);
    expect(shell.thinking, '新一块确实开始了').toBe(true);
    expect(shell.thinkingTokens, '但它还没有自己的数').toBeNull();
  });

  it('新一块拿到自己的数之后,写的是新数', () => {
    const shell = only([
      thinking(),
      count(3_278, T0 + 1_400),
      { kind: 'tool_use', id: 't1', name: 'Read', input: { file_path: 'a.ts' }, startedAt: T0 + 2_000 },
      thinking(),
      count(50, T0 + 3_000),
    ]);
    expect(shell.thinkingTokens?.count).toBe(50);
  });
});

describe('「很久没变」在这一层算 —— 组件不起第二个 timer', () => {
  it(`还没到 ${THINKING_TOKENS_STALL_MS}ms 就是新的`, () => {
    const shell = only(
      [thinking(), count(3_278, T0)],
      T0 + THINKING_TOKENS_STALL_MS,
    );
    expect(shell.thinkingTokens).toEqual({ count: 3_278, stale: false });
  });

  it(`过了 ${THINKING_TOKENS_STALL_MS}ms 就标成停了`, () => {
    const shell = only(
      [thinking(), count(3_278, T0)],
      T0 + THINKING_TOKENS_STALL_MS + 1,
    );
    expect(shell.thinkingTokens).toEqual({ count: 3_278, stale: true });
  });

  it('门槛远在健康推理的帧距之上 —— p50 1.4s、最大观测 4.88s 都翻不动它', () => {
    // 语料出处写在 `THINKING_TOKENS_STALL_MS` 的注释里
    expect(THINKING_TOKENS_STALL_MS).toBeGreaterThan(4_880);
  });

  it('新帧一到就重新算新 —— 停过之后还能回来', () => {
    const shell = only(
      [thinking(), count(3_278, T0), count(3_400, T0 + 9_000)],
      T0 + 10_000,
    );
    expect(shell.thinkingTokens).toEqual({ count: 3_400, stale: false });
  });

  /**
   * 拿不到到达时刻(`at` 可选)就一律当**还新**。
   * 「不知道多久没变」和「很久没变」是两回事 —— 混起来会在一条完全健康的流上
   * 把 token 换成秒数。
   */
  it('拿不到到达时刻时当作还新,不当成停了', () => {
    const shell = only([
      thinking(),
      { kind: 'thinking_tokens', tokens: 3_278 } as PersistedAgentEvent,
    ], T0 + 600_000);
    expect(shell.thinkingTokens).toEqual({ count: 3_278, stale: false });
  });
});

describe('反向守卫', () => {
  it('别家 agent(没有这种事件)壳上恒为 null', () => {
    const shell = only([
      thinking(),
      { kind: 'tool_use', id: 't1', name: 'Read', input: {}, startedAt: T0 + 1_000 },
    ]);
    expect(shell.thinkingTokens).toBeNull();
  });

  it('非法读数一概不收 —— 零 / 负数 / NaN 都不写', () => {
    for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const shell = only([
        thinking(),
        { kind: 'thinking_tokens', tokens: bad, at: T0 + 1_400 } as PersistedAgentEvent,
      ]);
      expect(shell.thinkingTokens, `tokens=${String(bad)}`).toBeNull();
    }
  });

  it('这种事件不自己开一格 —— 壳里条目数一个不多', () => {
    const withCount = only([thinking(), count(3_278, T0 + 1_400)]);
    const without = only([thinking()]);
    expect(withCount.items.length).toBe(without.items.length);
  });
});
