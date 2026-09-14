// @vitest-environment jsdom
/**
 * 逐字化开铺开到「所有普通文本」,并且**后端一次性给的也要走完效果**(用户 2026-08-27)。
 *
 * 用户原话:
 *   「能不能 thinking 还是用有个流式输出的效果, 你找一下, 设计稿 就是后面出来的文本有个
 *     动态模糊再逐渐清晰的效果, 包括我们所有普通文本, 都应该有这个流式输出的效果才对,
 *     不能直接刷一下子整个出来..」
 *   「如果不是真正流式的, 可能背后 daemon 还是一次性出来, 但展示的时候, 也保留一个流式的
 *     效果, 可能完整走完这个流式输出效果 2s 左右的动画, 加速一下」
 *
 * 设计稿(`docs/design/chat-panel-next.html` @ `1bbdce0b06`,md5 `28ea4c65…`)给的是
 * **单字**的值:0.4s、字与字错开 0.01s、`blur(10px) brightness(0%)` → `blur(0) brightness(100%)`。
 * 「整段 2s 铺完」是用户给的**总时长**目标,稿子里没有 —— 两者是不同的量,这个文件分开钉。
 *
 * 修前的真实基线(无头 Chrome 量的,不是推测):
 *   一次性到达 2000 字 → `.rv` span **0 个**(整段瞬间刷出来,就是用户说的那一下)
 *   每帧 10 字增量     → `.rv` span 10 个(这一路本来就是好的)
 *   思考流            → `.rv` span **0 个**(从来没接过)
 *
 * ── 2026-09-04:「一次性到达」的夹具形态改了,量的东西没改 ─────────────────
 *
 * 同日立了另一条不变式:**逐字化开只属于「本次挂载中正在到达的字」;host 挂上来时
 * 已经在里头的字是历史,首帧就是落定态**(用户:「已经输出过的,刷新页面或者从设置
 * 页面返回,还是会有流式的效果」;判据在 `reveal-mount-settled.test.tsx`)。
 *
 * 于是 `render(<Prose text={一大段} streaming />)` 这种**带着正文直接挂载**的写法
 * 不再代表「一次性到达」—— 它现在正好是那条 bug 的形状。下面凡是量「一次性到达」的
 * 用例都改成**先挂上来、再一次长满**:`render(text="")` → `rerender(text=一大段)`。
 * 这既是真实直播路径(消息行早就在屏幕上,daemon 的整包正文才落进来),也让每一条
 * 断言量的还是原来那件事(预算、单位加粗、span 数封顶、字符不丢)。
 *
 * ⚠️ **待产品拍板**:「历史带着完整正文进场」和「非流式 agent 一次性吐出整段、正文
 * 随 host 一起进场」在 DOM 上一模一样,渲染层分不出来。按较晚的裁决执行之后,后者
 * 不再化开。要两条都保住,得由数据侧告诉渲染层「这一段是刚到的」(`ProjectView` 的活)。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { useRef, type ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { THINKING_MARKDOWN_COMMIT_MS } from '../../../src/components/chat/ThinkingMarkdown';
import { useCharReveal, planReveal, REVEAL_BUDGET_MS, CHAR_MS, STAGGER_MS, MAX_UNITS } from '../../../src/components/chat/useCharReveal';
import type { ExecutionShell as Shell, ShellItem } from '../../../src/runtime/chat/contract';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

function Prose({ text, streaming }: { text: string; streaming: boolean }): ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  useCharReveal(ref, streaming);
  return <div ref={ref} data-testid="prose"><p>{text}</p></div>;
}

const spans = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('.rv')];
const visible = (sel = '[data-testid="prose"]'): string => document.querySelector(sel)?.textContent ?? '';
const delayOf = (el: HTMLElement): number => Number.parseFloat(el.style.animationDelay || '0');

/**
 * 「一次性到达」的夹具:host 先空着挂上来(消息行早就在屏幕上),再一帧长满。
 *
 * **不能**写成 `render(<Prose text={一大段} streaming />)` —— 带着正文直接挂载是
 * 「历史重挂」那条 bug 的形状,首帧按不变式就该是落定的(见文件头)。
 */
function arrivesAtOnce(text: string): ReturnType<typeof render> {
  const view = render(<Prose text="" streaming />);
  view.rerender(<Prose text={text} streaming />);
  return view;
}

/* ── 1. 排期是纯函数,可以直接量 ───────────────────────────────── */

describe('planReveal:一段字怎么排进时间里', () => {
  it('稿子那句「五十来字约 0.9s 化完」对得上 —— 单字一个单位、错开 10ms', () => {
    const plan = planReveal(50);
    expect(plan.unitSize).toBe(1);
    expect(plan.staggerMs).toBe(STAGGER_MS);
    // 最后一个字起跑 = 49 × 10ms,它自己再开 0.4s
    expect(plan.totalMs).toBe(49 * STAGGER_MS + CHAR_MS);
    expect(plan.totalMs).toBeGreaterThan(800);
    expect(plan.totalMs).toBeLessThan(1000);
  });

  it('一次性给一大段:压进 2s 预算,靠**加粗单位**而不是无限缩间隔', () => {
    const plan = planReveal(34_731);       // 真实录制里 AMR 一轮推理的字数
    expect(plan.totalMs).toBeLessThanOrEqual(REVEAL_BUDGET_MS);
    expect(plan.units).toBeLessThanOrEqual(REVEAL_BUDGET_MS / STAGGER_MS);
    expect(plan.unitSize).toBeGreaterThan(1);
    expect(plan.units * plan.unitSize).toBeGreaterThanOrEqual(34_731);
  });

  it('反向对照:总时长**不是**写死的常量,短段落明显更快', () => {
    expect(planReveal(1).totalMs).toBe(CHAR_MS);
    expect(planReveal(50).totalMs).toBeLessThan(planReveal(500).totalMs);
    expect(planReveal(500).totalMs).toBeLessThanOrEqual(planReveal(34_731).totalMs);
  });

  it('单位数封顶之后,一个单位里塞多少字随长度线性长', () => {
    expect(planReveal(20_000).unitSize).toBeLessThan(planReveal(40_000).unitSize);
  });
});

/* ── 2. 一次性到达也要化开(用户那句「不能直接刷一下子整个出来」)──── */

describe('后端一次性给的一大段', () => {
  it('整段一帧到货就有字在化开 —— 修前这里是 0 个 span', () => {
    arrivesAtOnce('龘'.repeat(400));
    expect(spans().length).toBeGreaterThan(0);
    expect(visible()).toBe('龘'.repeat(400));
  });

  it('34,731 字不会拆出 34,731 个 span:节点数被预算封住', () => {
    arrivesAtOnce('龘'.repeat(34_731));
    expect(spans().length).toBeGreaterThan(0);      // 0 个的话下面那条上界会**空过**
    expect(spans().length).toBeLessThanOrEqual(REVEAL_BUDGET_MS / STAGGER_MS);
    expect(visible().length).toBe(34_731);          // 一个字都没丢
  });

  it('最后一个单位在 2s 预算内起跑', () => {
    arrivesAtOnce('龘'.repeat(34_731));
    expect(spans().length).toBeGreaterThan(0);      // 没有 span 时 Math.max 会给 -Infinity,断言会**空过**
    const last = Math.max(...spans().map(delayOf));
    expect(last).toBeLessThanOrEqual(REVEAL_BUDGET_MS - CHAR_MS);
  });

  it('反向对照:短句不会被拉长到 2s —— 它按 10ms 错开,几十毫秒就排完', () => {
    arrivesAtOnce('想好了,开始做');
    expect(spans().length).toBeGreaterThan(0);      // 同上:空数组会让下面这条空过
    const last = Math.max(...spans().map(delayOf));
    expect(last).toBeLessThan(200);
  });

  it('反向对照:同一段字**带着 host 一起挂上来**时不化开(那是历史,不是到货)', () => {
    render(<Prose text={'龘'.repeat(400)} streaming />);
    expect(visible()).toBe('龘'.repeat(400));       // 正向对照:字真的在,不是没渲染
    expect(spans()).toHaveLength(0);
  });
});

/* ── 3. 思考文字也要走同一套 ─────────────────────────────────── */

const think = (text: string): ShellItem => ({ kind: 'text', text, thinking: true });
function shellOf(items: ShellItem[], over: Partial<Shell> = {}): Shell {
  return {
    kind: 'shell', seq: 0, status: 'done', items, segments: [],
    thinking: false, stopped: false, elapsedMs: null, quietMs: null, ...over,
  } as Shell;
}
const showShell = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);

describe('思考流也逐字化开', () => {
  it('还在想的那一格里有字在化开 —— 修前这里是 0 个 span', async () => {
    vi.useFakeTimers();
    try {
      const { container, rerender } = render(showShell(
        shellOf([think('两张图的栅格看着是同一套。')], { status: 'running', thinking: true }),
      ));
      rerender(showShell(
        shellOf([think('两张图的栅格看着是同一套。先量一下列宽和沟槽。')], { status: 'running', thinking: true }),
      ));
      await act(async () => {
        await vi.advanceTimersByTimeAsync(THINKING_MARKDOWN_COMMIT_MS);
      });
      const inStream = container.querySelectorAll('[class*="stream"] .rv');
      /* 正向对照:这一格真的渲染出来了、文字真的在 —— 少了它,组件整个没渲染时下面也会「通过」 */
      expect(container.querySelector('[class*="stream"]')?.textContent).toContain('先量一下列宽');
      expect(inStream.length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('反向对照:想完了(不在流)的那一格不化开', () => {
    const { container } = render(showShell(
      shellOf([think('两张图的栅格看着是同一套。')], { status: 'done' }),
    ));
    expect(container.querySelector('[class*="think"]')?.textContent).toContain('栅格');
    expect(container.querySelectorAll('.rv')).toHaveLength(0);
  });
});

/* ── 4. 开完就撒手:不能一直挂着 filter,也不能每次重渲染重播 ──────── */

describe('开完的字要落定', () => {
  it('预算走完之后再渲染一次,span 全部收回,文字完好', () => {
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { rerender } = arrivesAtOnce('一二三四五');
    expect(spans().length).toBeGreaterThan(0);

    now += REVEAL_BUDGET_MS + CHAR_MS + 50;
    rerender(<Prose text="一二三四五" streaming />);
    expect(spans()).toHaveLength(0);
    expect(visible()).toBe('一二三四五');
  });

  it('反向对照:预算没走完时,重渲染不会把还在开的字提前收掉', () => {
    let now = 1_000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const { rerender } = arrivesAtOnce('龘'.repeat(400));
    now += 20;
    rerender(<Prose text={'龘'.repeat(400)} streaming />);
    expect(spans().length).toBeGreaterThan(0);
  });
});

/* ── 5. 关了动效完全不插手 ───────────────────────────────────── */

it('prefers-reduced-motion 下一个 span 都不拆', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(<Prose text={'龘'.repeat(400)} streaming />);
  expect(spans()).toHaveLength(0);
  expect(visible().length).toBe(400);
});

/* ── 6. 到点自己撒手:不能等下一次重渲染才收 span ────────────────── */

describe('开完之后 span 自己收回去', () => {
  it('一次渲染都没有,预算到点后 span 也归零', async () => {
    vi.useFakeTimers();
    try {
      arrivesAtOnce('龘'.repeat(34_731));
      expect(spans().length).toBeGreaterThan(0);
      /* 正向对照:收之前它们真的带着 filter 那条动画(class 是 CSS 里 `.rv` 的钩子) */
      expect(spans()[0]?.className).toBe('rv');

      await vi.advanceTimersByTimeAsync(REVEAL_BUDGET_MS + CHAR_MS + 100);
      expect(spans()).toHaveLength(0);
      expect(visible().length).toBe(34_731);      // 一个字都没丢
    } finally {
      vi.useRealTimers();
    }
  });

  it('反向对照:预算没到点时定时器**不**提前收', async () => {
    vi.useFakeTimers();
    try {
      arrivesAtOnce('龘'.repeat(34_731));
      await vi.advanceTimersByTimeAsync(200);
      expect(spans().length).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

/* ── 7. 壳内的过程叙述(普通正文)也走同一套 ────────────────────── */

const say = (text: string): ShellItem => ({ kind: 'text', text, thinking: false } as ShellItem);
const readTool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', title: `读取 ${id}`, name: 'Read', rawTitle: false,
  file: null, delta: null, hits: null, pattern: null, elapsedMs: 400,
  failed: false, failReason: null, command: null, terminal: null,
} as unknown as ShellItem);

describe('壳内的过程叙述', () => {
  it('还在跑、且排在最后的那一段会化开', () => {
    // 先让这一格挂上来(消息行早就在屏幕上),再让正文长进去 —— 带着正文直接挂载
    // 是「历史重挂」那条 bug 的形状,首帧按不变式就该落定(见文件头)
    const { container, rerender } = render(showShell(shellOf([readTool('a.png'), say('先')], { status: 'running' })));
    rerender(showShell(shellOf([readTool('a.png'), say('先把列表页搭起来。')], { status: 'running' })));
    expect(container.textContent).toContain('先把列表页搭起来');
    expect(container.querySelectorAll('.rv').length).toBeGreaterThan(0);
  });

  it('反向对照:跑完了的同一张壳,一个字都不化开', () => {
    const { container } = render(showShell(shellOf([readTool('a.png'), say('先把列表页搭起来。')], { status: 'done' })));
    expect(container.textContent).toContain('先把列表页搭起来');
    expect(container.querySelectorAll('.rv')).toHaveLength(0);
  });

  it('反向对照:后面已经压上工具行的那一段(早写完了)不化开', () => {
    const { container } = render(showShell(shellOf([say('先把列表页搭起来。'), readTool('a.png')], { status: 'running' })));
    expect(container.textContent).toContain('先把列表页搭起来');
    expect(container.querySelectorAll('.rv')).toHaveLength(0);
  });
});

/* ── 8. 带空格的文本(英文正文)────────────────────────────────
 *
 * 中文一路测不出这一族问题:**中文没有空格**。
 * 无头 Chrome 上用英文跑 34,731 字才照出来两条,两条都只在有空白时发生。
 */

const EN = 'The reveal has to keep every line break opportunity intact. ';

describe('带空格的正文', () => {
  it('化开再收回之后,文字**一个字符都不多** —— 空白不会被复制一份', () => {
    const text = EN.repeat(40);
    const { rerender } = arrivesAtOnce(text);
    expect(spans().length).toBeGreaterThan(0);          // 正向对照:确实化开了才谈得上收回
    rerender(<Prose text={text} streaming={false} />);
    expect(spans()).toHaveLength(0);
    expect(visible()).toBe(text);                       // 修前:空白被复制,长度比原文多出「空格数」那么多
  });

  it('反向对照:不带空格的同长度文本本来就不会出这个错', () => {
    const text = '龘'.repeat(EN.repeat(40).length);
    const { rerender } = render(<Prose text={text} streaming />);
    rerender(<Prose text={text} streaming={false} />);
    expect(visible()).toBe(text);
  });

  it('span 数照样被预算封住 —— 不会按「词」爆成几千个', () => {
    arrivesAtOnce(EN.repeat(600));                       // ≈36,000 字,近似那次真实录制的量级
    expect(spans().length).toBeGreaterThan(0);
    expect(spans().length).toBeLessThanOrEqual(MAX_UNITS);
  });
});

/*
 * 上面那条走的是**多字单位**(2,400 字 ⇒ 一个单位 15 个字,空白进 span)。
 * 小增量流式走的是**单字单位** —— 那一路空白按稿子的规矩裸着放在 span 外面,
 * 是另一条代码路径,单独钉一次。
 */
describe('带空格的正文 · 单字单位那一路(小增量流式)', () => {
  it('一个词一个词地流进来,收回之后文字一个字符都不多', () => {
    const words = 'the reveal keeps every line break opportunity intact'.split(' ');
    let text = words[0] ?? '';
    const { rerender } = render(<Prose text={text} streaming />);
    for (const w of words.slice(1)) {
      text = `${text} ${w}`;
      rerender(<Prose text={text} streaming />);
      // 每一帧的可见文字都得是对的,不能一路悄悄多出空格
      expect(visible()).toBe(text);
    }
    /* 正向对照:这一路确实是**单字**单位(一个 span 一个字),不是上面那条 */
    expect(spans().length).toBeGreaterThan(0);
    expect(spans().every((s) => (s.textContent ?? '').length === 1)).toBe(true);

    rerender(<Prose text={text} streaming={false} />);
    expect(spans()).toHaveLength(0);
    expect(visible()).toBe(text);
  });
});
