// @vitest-environment jsdom
/**
 * 【产品裁决 2026-09-04,推翻同日更早的「不许动」】思考行右边那个 token 读数要
 * **自己数上去**,不是一帧换个数。
 *
 * ── 一天里的三条,后一条推翻前一条的**做法**,需求始终是同一件事 ────────────
 *
 *  ① 「token 数量怎么没有什么数字滚动的效果啊? 这个太生硬了..」
 *  ② 「token 最好也有个**增长的过程**,而不是直接从 100 跳到 200,而是逐渐从 100
 *     数字滚动到 200,这个滚动过程可以快一点,但是能让用户感受到这里好像有一个
 *     **流式的感觉**」
 *  ③ 看到实物之后:「我看到实现的数字滚动**跳动**了,**太花哨了,自然一点**...」
 *     「**实在不行就不要动画了**,直接**数字自增**的那种动画就行,自增的**单位可以
 *     随机一些**?比如一次 1 一次 3 一次 5 啥的啥的」
 *
 * 中间那一版是「每一位一条 0–9 字带 + CSS transition」,被 ③ 否掉了(199 → 200 时
 * 低位要倒着滚 9 格、高位正着滚 1 格,三位同时动、方向相反),连同它的 CSS Module
 * 一起删干净了。**这份测试里因此一条 CSS / transform 的断言都没有** —— 留着就是
 * 名不副实的守卫。
 *
 * ── 下面钉的四条,是产品逐条点名的硬约束 ────────────────────────────────
 *
 *  1. 刷新页面**不从 0 数上来**(挂载即落定,而且一个 tick 都不排);
 *  2. **永不过冲** —— 屏幕上任何时刻都不出现比已收到读数更大的数;
 *  3. 新读数一到就**从当前显示值改朝新目标**,不重置、不排队;
 *  4. 必须在**下一条读数通常到达之前**数完(claude 帧间隔 p50 = 1.4s)。
 *
 * ⚠️ 用假时钟推进自增:它由 `setInterval` 驱动,真时钟下这套断言会变成靠 sleep
 * 碰运气。步长里的随机在需要确定性的那几条里显式接管 `Math.random`。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { countUpStep } from '../../../src/components/chat/CountingNumber';
import type {
  ExecutionShell as Shell,
  ShellItem,
} from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const shellOf = (items: ShellItem[], over: Partial<Shell> = {}): Shell => ({
  kind: 'shell', id: 'shell-1', status: 'running', items, segments: [],
  thinking: false, stopped: false, elapsedMs: null, quietMs: null,
  thinkingTokens: null, ...over,
});

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);

const thinkingShell = (count: number, stale = false): Shell =>
  shellOf([], { thinking: true, thinkingTokens: { count, stale } });

const thought = (text: string, elapsedMs: number): ShellItem =>
  ({ kind: 'text', text, thinking: true, elapsedMs } as ShellItem);

/** 两格思考中间要隔一件事,否则 `groupThinking` 会把它们收成一格 */
const tool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', name: 'Read', title: `读取 ${id}`, rawTitle: false,
  file: null, pattern: null, hits: null, delta: null, elapsedMs: 400,
  pending: false, failed: false, failReason: null, command: null, terminal: null,
} as ShellItem);

/** 思考行右边那个槽(token 和计时共用同一个 —— 「一个槽、一个数」) */
function slotOf(root: HTMLElement): HTMLElement {
  const slot = root.querySelector<HTMLElement>(
    'details[class*="thoughts"] summary [data-testid="chat-foldable-elapsed"]',
  );
  if (!slot) throw new Error('思考行右边那个槽没渲染出来 —— 选择器没命中,不是自增的问题');
  return slot;
}

const reading = (root: HTMLElement): string => slotOf(root).textContent ?? '';

/** 假时钟推 `ms` 毫秒,顺手把这段时间里出现过的每一个读数按序记下来(去掉连续重复) */
function tickCollecting(root: HTMLElement, ms: number, stepMs = 5): string[] {
  const seen: string[] = [reading(root)];
  for (let t = 0; t < ms; t += stepMs) {
    act(() => { vi.advanceTimersByTime(stepMs); });
    const now = reading(root);
    if (seen[seen.length - 1] !== now) seen.push(now);
  }
  return seen;
}

/** 「3.3k tokens」→ 3300;用来判单调、判不过冲 */
function numOf(text: string): number {
  const m = /([\d.]+)(k?)/.exec(text);
  if (!m) throw new Error(`读不出数:${text}`);
  return Number.parseFloat(m[1]!) * (m[2] ? 1000 : 1);
}

describe('挂载即落定 —— 刷新页面不从 0 数上来', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('首帧就是落定的读数,时间往前推也不再变', () => {
    const { container } = render(show(thinkingShell(3_278)));
    // 这一行**在任何 effect / timer 跑之前**执行
    expect(reading(container)).toBe('3.3k tokens');
    expect(tickCollecting(container, 2_000), '没有一段可数的间,就不该有第二个读数')
      .toEqual(['3.3k tokens']);
  });

  it('挂载时一个 tick 都不排 —— 自增只发生在已经在屏上的值 → 新值之间', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    render(show(thinkingShell(3_278)));
    expect(interval, '挂载即落定,没有需要数的间').not.toHaveBeenCalled();
  });

  it('形态从计时切回 token 也不重新入场 —— 全新挂载直接就是落定值', () => {
    const { container } = render(show(thinkingShell(64_000)));
    expect(reading(container)).toBe('64k tokens');
  });
});

describe('新读数到了就数上去', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('新值到达的那一帧屏幕上还是旧读数 —— 没有跳变', () => {
    const { container, rerender } = render(show(thinkingShell(1_000)));
    expect(reading(container)).toBe('1k tokens');
    rerender(show(thinkingShell(9_000)));
    // 这一行在任何 tick 之前执行:一帧换到位的实现在这里就读到 9k 了
    expect(reading(container), '一帧换到位就是用户说的「直接从 100 跳到 200」')
      .toBe('1k tokens');
  });

  it('中间的读数一个个走过去,单调不回头,最后精确落在真值上', () => {
    const { container, rerender } = render(show(thinkingShell(1_000)));
    rerender(show(thinkingShell(9_000)));
    const seen = tickCollecting(container, 800);

    expect(seen[0], '从屏幕上已经有的那个数出发').toBe('1k tokens');
    expect(seen[seen.length - 1], '落在真值上,不是停在半路').toBe('9k tokens');
    expect(seen.length, `中间要真的走过 —— 实际只见到 ${seen.join(' → ')}`)
      .toBeGreaterThan(3);

    const nums = seen.map(numOf);
    for (let i = 1; i < nums.length; i += 1) {
      expect(nums[i]!, `第 ${i} 个读数回头了:${seen.join(' → ')}`)
        .toBeGreaterThan(nums[i - 1]!);
      expect(nums[i]!, `过冲了 —— 屏幕上出现了比真值更大的数:${seen.join(' → ')}`)
        .toBeLessThanOrEqual(9_000);
    }
  });

  it('数完就停 —— 表只开一次,数到了就关掉', () => {
    /*
     * ⚠️ 不能用 `vi.getTimerCount()`:它数的是**全场**待执行的定时器,思考行那一格
     * 自己还有别的(跟随、扫光)。这里只盯我们开的那一只 —— 开一次、不重开。
     */
    const interval = vi.spyOn(globalThis, 'setInterval');
    const clear = vi.spyOn(globalThis, 'clearInterval');
    const { container, rerender } = render(show(thinkingShell(1_000)));
    rerender(show(thinkingShell(1_040)));
    tickCollecting(container, 800);
    expect(reading(container)).toBe('1k tokens'); // 1040 → 1.0k → 「1k」
    expect(interval, '一段自增只开一只表').toHaveBeenCalledTimes(1);
    expect(clear, '数到了就该把表关掉,别留着空转').toHaveBeenCalled();
  });

  it('预算之内数完 —— 屏幕不许长期挂着一个落后于真值的假数', () => {
    const { container, rerender } = render(show(thinkingShell(1_000)));
    rerender(show(thinkingShell(9_000)));
    /*
     * claude 的 `thinking_tokens` 帧间隔实测 p50 = 1.4s(真实录制)。
     * 下一条读数通常到达之前必须已经数完,否则显示值永远追不上真值。
     */
    act(() => { vi.advanceTimersByTime(1_400); });
    expect(reading(container)).toBe('9k tokens');
  });

  it('上一段还没数完新值就到了:从当前显示值接着数,不回头重来', () => {
    const { container, rerender } = render(show(thinkingShell(1_000)));
    rerender(show(thinkingShell(5_000)));
    act(() => { vi.advanceTimersByTime(150) });
    const midway = numOf(reading(container));
    expect(midway, '这一刻正数到半路').toBeGreaterThan(1_000);
    expect(midway).toBeLessThan(5_000);

    // 新读数来了 —— 目标换成 9000,但起点必须是屏幕上此刻这个数
    rerender(show(thinkingShell(9_000)));
    const after = tickCollecting(container, 800);
    expect(numOf(after[0]!), '不许退回上一段的起点重来').toBeGreaterThanOrEqual(midway);
    expect(after[after.length - 1], '落点是最新的那条读数').toBe('9k tokens');
    for (const r of after) {
      expect(numOf(r), `过冲:${after.join(' → ')}`).toBeLessThanOrEqual(9_000);
    }
  });

  it('计数归零(换了一块推理)直接落定 —— 不倒着数', () => {
    const { container, rerender } = render(show(thinkingShell(9_000)));
    const interval = vi.spyOn(globalThis, 'setInterval');
    rerender(show(thinkingShell(120)));
    expect(reading(container), '变小是「换了一件事」,不是「想少了」').toBe('120 tokens');
    expect(interval, '落定就是落定,不排表').not.toHaveBeenCalled();
  });

  it('系统设了「减少动效」就不数 —— 直接给落定值', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    vi.stubGlobal('matchMedia', (q: string) => ({
      matches: q.includes('prefers-reduced-motion'),
      media: q,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    const { container, rerender } = render(show(thinkingShell(1_000)));
    rerender(show(thinkingShell(9_000)));
    expect(reading(container), '不数,但也不能不更新 —— 读数本身要是真值').toBe('9k tokens');
    expect(interval).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('只有 token 会数;槽让给计时那一档一个字都不动', () => {
    const interval = vi.spyOn(globalThis, 'setInterval');
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 62_000), tool('a.ts'), thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: { count: 3_278, stale: true } },
    )));
    const slots = Array.from(container.querySelectorAll<HTMLElement>(
      'details[class*="thoughts"] summary [data-testid="chat-foldable-elapsed"]',
    ));
    const last = slots[slots.length - 1]!;
    expect(last.textContent).toBe('28m 30s');
    expect(interval, '秒表每秒跳一次,再给它加一层自增就是那种「疯了」的闪动')
      .not.toHaveBeenCalled();
  });
});

/**
 * 步长这一条单独拿出来测:它是纯函数,产品那句「单位可以随机一些」和那句
 * 「永远落在真值上」都压在它身上,而随机在组件层不好逐值断言。
 */
describe('步长:自适应 + 抖动,且永不过冲', () => {
  it('自适应 —— 差得多就走大步,差得少就走小步', () => {
    // 同一个抖动系数下,只有「还差多少」在变
    const big = countUpStep(4_000, 8, 0.5);
    const small = countUpStep(24, 8, 0.5);
    expect(big).toBeGreaterThan(small);
    expect(small, '差 24 分 8 步,一步 3 上下 —— 不是硬编码的 1/3/5').toBeLessThan(10);
  });

  it('抖动 —— 同样的剩余量,不同随机数给出不同的步长', () => {
    const steps = new Set([0, 0.25, 0.5, 0.75, 1].map((j) => countUpStep(400, 8, j)));
    expect(steps.size, '每一步都一样大就没有「流」的手感').toBeGreaterThan(1);
  });

  it('永不过冲 —— 任何输入下都不超过剩余量', () => {
    for (const remaining of [1, 2, 3, 7, 40, 999, 4_000]) {
      for (const jitter of [0, 0.5, 1]) {
        for (const stepsLeft of [1, 2, 8]) {
          const step = countUpStep(remaining, stepsLeft, jitter);
          expect(step).toBeGreaterThanOrEqual(1);
          expect(step, `remaining=${remaining} stepsLeft=${stepsLeft}`)
            .toBeLessThanOrEqual(remaining);
        }
      }
    }
  });

  it('最后一步一定补齐 —— 落点精确等于真值', () => {
    expect(countUpStep(37, 1, 0)).toBe(37);
    expect(countUpStep(37, 1, 1)).toBe(37);
  });

  it('至少走一格 —— 否则表空转、数字卡住', () => {
    expect(countUpStep(1, 8, 0)).toBe(1);
  });
});

/**
 * 时长这一条读源码里的常量:它的**上界由上游帧率定**,不由观感定,
 * 而上游帧率不会出现在任何一次渲染里。
 */
describe('预算:比典型帧间隔短得多', () => {
  it('COUNT_UP_MS 落在 200–700ms', () => {
    const src = readFileSync(
      resolve(__dirname, '../../../src/components/chat/CountingNumber.tsx'),
      'utf8',
    );
    const ms = Number(/const COUNT_UP_MS = (\d+);/.exec(src)?.[1]);
    expect(Number.isFinite(ms), 'COUNT_UP_MS 还在,而且是个字面量').toBe(true);
    /*
     * 上界:claude 的 `thinking_tokens` 帧间隔 p50 = 1.4s(真实录制,
     * `specs/current/chat-panel-next.md`)。数不完就追不上真值,屏幕上是个假数。
     * 下界:低于 200ms 和直接换数没有区别,用户要的「过程」就没了。
     */
    expect(ms).toBeLessThanOrEqual(700);
    expect(ms).toBeGreaterThanOrEqual(200);
  });
});
