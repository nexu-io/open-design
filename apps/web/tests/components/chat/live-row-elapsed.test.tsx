// @vitest-environment jsdom
/**
 * 【**有意偏离设计稿**】进行中的行也要报耗时 —— 渲染面。
 *
 * ── 稿子怎么说的 ──────────────────────────────────────────────────────
 *
 * `docs/design/chat-panel/src/body-components.html` 的 Thinking 那一格逐字写着:
 *   「**不挂耗时**:这一行**只活到第一个字落地为止**,给一个马上要消失的状态配一个
 *     跳动的秒数,只会把注意力钉在一个从此不再相关的数字上;总耗时在任务进度那一格里。」
 * 全稿 10/10 条进行中都没有 `.ms` 槽的值,14/14 条已完成都有。工具行那边留了个
 * **空的** `.ms` 槽(`<span class="ms"></span>`),纯粹是为了数值落地时箭头不横跳。
 *
 * ── 产品为什么推翻 ────────────────────────────────────────────────────
 *
 * 「只活到第一个字落地为止」这个前提对推理模型**不成立**。真实数据里有**单轮思考
 * 28.5 分钟**、**单个 Bash 卡住 14.1 分钟**的案例(诊断包 run `3fc3b3ae`)。
 * 一个要持续半小时的状态,说它「马上要消失」是错的 —— 用户当时的实感是
 * 「跑了 40 分钟什么都没出来」,而那 40 分钟里执行记录上一个数字都没有。
 * 产品原话:「为啥思考中不会有计时?我感觉**进行中的 toolrow 都得有计时**吧?」
 *
 * 稿子给工具行留的那个空槽正好派上用场:值直接填进去,箭头一格都不用挪。
 *
 * ── 三条边界 ─────────────────────────────────────────────────────────
 *
 *  · 零新增 timer:秒数全部从 `nowMs` 推(`AssistantMessage` 那一个既有 interval),
 *    组件里不许再起第二个 —— 下面「一个 timer」那一节钉住。
 *  · 窄侧栏不许把耗时折行(OPEND-2548):让位的只能是标题槽。
 *  · **不许挂 `aria-live`** —— 挂了读屏会每秒念一次秒数。
 *
 * 数据面的断言在 `tests/runtime/chat/live-row-elapsed.test.ts`。
 *
 * ── 2026-09-04:这条裁决被收窄了**一个位置** ───────────────────────────
 *
 * 「整轮**头一格**推理」不再报时长 —— 它填的空白起点就是轮次开头,和壳头那个数
 * 同起同终,两行贴着说同一件事。别的位置(后面几格推理 / 工具行 / 步骤行 / 生图行)
 * 一格没动,下面几条照旧。新规则与理由在 `first-thoughts-no-elapsed.test.tsx`,
 * 实现在 `ExecutionShell.tsx` 的 `stackOwningFirstThoughts`。
 *
 * ⚠️ 这个文件**取代**了 `running-todo-no-elapsed.test.tsx`。那一条是稿子那半边的守卫
 * (「哪怕数据里有耗时,进行中那一行也不渲染它」),整条前提被上面这次裁决推翻了;
 * 它守着的另一半 —— 已完成那一行照常有数字 —— 搬到了下面的「反向守卫」一节,
 * 免得连人带证据一起丢掉。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { ReactElement } from 'react';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import type {
  ExecutionShell as Shell,
  ShellItem,
  TodoStatus,
} from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const T0 = 1_800_000_000_000;

const shellOf = (items: ShellItem[], over: Partial<Shell> = {}): Shell => ({
  kind: 'shell', id: 'shell-1', status: 'running', items, segments: [],
  thinking: false, stopped: false, elapsedMs: null, quietMs: null, ...over,
});

const show = (shell: Shell): ReactElement => (
  <I18nProvider initial="zh-CN">
    <ExecutionShell shell={shell} deferCollapsedBodies={false} />
  </I18nProvider>
);

const thought = (text: string, elapsedMs: number): ShellItem =>
  ({ kind: 'text', text, thinking: true, elapsedMs } as ShellItem);

const todo = (content: string, status: TodoStatus, elapsedMs: number | null): ShellItem =>
  ({ kind: 'todo', segment: { content, status, recalled: false, abandoned: false, implicit: false, items: [], elapsedMs } } as ShellItem);

const tool = (over: Partial<Extract<ShellItem, { kind: 'tool' }>> = {}): ShellItem => ({
  kind: 'tool', id: 't1', tool: 'read', name: 'Read', title: '读取 a.ts', rawTitle: false,
  file: null, pattern: null, hits: null, delta: null, elapsedMs: null,
  pending: false, failed: false, failReason: null, command: null, terminal: null,
  ...over,
} as ShellItem);

/**
 * 生图批次行(组件 12)。稿子给这一档画的是「球 + 『生成配套插图 2/4』+ 一排大格」,
 * **头上没有耗时槽** —— 收成一行那一档才有。上面那次裁决(2026-09-02)的覆盖范围
 * 也只写了三类(思考中 / 工具行 / 步骤行),生图行不在内。
 *
 * 产品 2026-09-03 口述把范围补齐:「工具调用最好都有显示的逐渐增长的计时,
 * **尽可能所有都有**,包括 thinking,这样用户能感受到当前哪里卡住了」。
 * 生图是最慢的一类动作,原来那几分钟里这一行上一个数字都没有。
 */
const imageBatch = (over: Partial<Extract<ShellItem, { kind: 'image' }>> = {}): ShellItem => ({
  kind: 'image', id: 'img-1', total: 4, done: 1, failed: 0, thumbs: [],
  cells: [
    { status: 'done', path: 'a.png' },
    { status: 'pending' }, { status: 'pending' }, { status: 'pending' },
  ],
  pending: true, elapsedMs: null,
  ...over,
} as ShellItem);

describe('进行中的三类行都带耗时', () => {
  /**
   * ⚠️ **这一条被产品在 2026-09-04 收窄了一半,夹具跟着改过,断言的意思没变。**
   *
   * 原来的夹具是 `[thought('还在想…', 1_710_000)]` —— 壳里只有这一格推理,
   * 于是它同时是**整轮头一格**。产品那天看着一轮正在跑的执行记录说:
   * 「这里首次 thinking 我看是有一个计时的, 能不能不要计时, 不然跟上面一行的进行中的
   * 计时有点重复」。头一格填的空白起点就是轮次开头(thinking 事件不带时刻,时长只能
   * 靠填空反推),和壳头「进行中」那个数同起点同终点 —— 两行贴着写同一个数。
   *
   * **被推翻的只有「整轮头一格」这一个位置**,上面那段裁决说的「进行中的行都得有计时」
   * 在别的位置一格没动,所以这一条照旧要有:夹具往前补一格推理和一次调用,
   * 让「还在想…」变成**后面那一格** —— 它填的是两次调用之间的空白,是新信息。
   * 头一格那半边搬去了 `first-thoughts-no-elapsed.test.tsx`,连人带证据都在。
   */
  it('**思考中**那一格右边写着秒数(稿子这一格是空的)', () => {
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 62_000), tool({ elapsedMs: 400 }), thought('还在想…', 1_710_000)],
      { thinking: true },
    )));
    expect(container.textContent).toContain('思考中');
    expect(container.textContent).toContain('28m 30s');
  });

  it('**进行中的工具行**填的正是稿子留的那个空槽', () => {
    const { container } = render(show(shellOf([tool({ pending: true, elapsedMs: 847_000 })])));
    const row = container.querySelector<HTMLElement>('div[class*="tool"]');
    expect(row, '进行中的调用要落行').not.toBeNull();
    const meta = row!.querySelector('[class*="meta"]');
    expect(meta, '耗时槽还是原来那一个').not.toBeNull();
    expect(meta!.textContent, '槽不再是空的').toBe('14m 7s');
  });

  it('**进行中的命令折叠行**同样(稿子那条是 `<span class="ms"></span>`)', () => {
    const { container } = render(show(shellOf([tool({
      pending: true, tool: 'exec', name: 'Bash', title: '构建产物,看能不能跑通',
      command: 'npm run build', elapsedMs: 62_000,
    })])));
    const fold = container.querySelector<HTMLElement>('details[class*="fold"]:not([class*="flat"])');
    expect(fold, '有人话标题的命令行是折叠块').not.toBeNull();
    expect(fold!.querySelector('[data-testid="chat-foldable-elapsed"]')!.textContent).toBe('1m 2s');
  });

  it('**进行中的步骤行**右边也写着秒数', () => {
    const { container } = render(show(shellOf([todo('复刻商品列表页', 'in_progress', 90_000)])));
    expect(container.textContent).toContain('复刻商品列表页');
    expect(container.textContent).toContain('1m 30s');
  });

  it('**还在出图的生图批次行**头上也写着秒数(产品 2026-09-03 把范围补到第四类)', () => {
    const { container } = render(show(shellOf([imageBatch({ elapsedMs: 132_000 })])));
    // 正向对照:确实是大格那一档(还没出完),不是收成一行那一档
    expect(container.textContent).toContain('1/4');
    expect(container.textContent).toContain('2m 12s');
  });

  it('反向守卫:生图批次行拿不到耗时时什么都不写,不用 `0.0s` 顶上', () => {
    const { container } = render(show(shellOf([imageBatch({ elapsedMs: null })])));
    expect(container.textContent).toContain('1/4');
    expect(container.textContent).not.toContain('0.0s');
  });

  it('反向守卫:已完成那几行照旧带自己的数字(从 `running-todo-no-elapsed` 搬来)', () => {
    const { container } = render(show(shellOf([
      todo('复刻商品列表页', 'completed', 18_200),
      todo('按同一套间距做设置页', 'in_progress', 6_400),
    ], { status: 'done' })));
    // 两条都要有数,而且是**各自**的数 —— 不是同一个值抄两遍
    expect(container.textContent).toContain('18.2s');
    expect(container.textContent).toContain('6.4s');
  });

  it('反向守卫:拿不到耗时的那几行仍然什么都不写 —— 不用 `0.0s` 顶上', () => {
    const { container } = render(show(shellOf([
      tool({ pending: true, elapsedMs: null }),
      todo('还没开工', 'pending', null),
    ])));
    expect(container.textContent).not.toContain('0.0s');
    // 空槽照旧留着(稿子的理由仍然成立:值落地时箭头不横跳)
    const meta = container.querySelector('div[class*="tool"] [class*="meta"]');
    expect(meta, '槽还在').not.toBeNull();
    expect(meta!.textContent).toBe('');
  });
});

describe('秒表接线 · 一个 timer,数字自己走', () => {
  const events: PersistedAgentEvent[] = [
    { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'curl -O big.png' }, startedAt: T0 },
  ];
  const message = {
    id: 'm1', role: 'assistant', content: '', createdAt: T0, runStatus: 'running', events,
  } as ChatMessage;

  /**
   * 壳 body 里那一行(不是壳头)—— 壳头的总耗时由 `live-timer.test.tsx` 守着。
   *
   * ⚠️ 这一行的**形状**变过:`curl -O big.png` 的入参只有 `command`、没有
   * `description`,是 `rawTitle` 那一支;产品 2026-09-03 裁决把两种命令行统一成
   * 同一个折叠块之后,它从 `div.tool` 变成了 `details.fold`(见
   * `w132-raw-command-fold.test.tsx`)。**这一条测的是秒数会不会走,不是行长什么样**,
   * 所以选择器跟着形状走 —— 用的正是这个文件上面那条命令折叠行已经在用的写法
   * (`:not([class*="flat"])` 排掉壳自己那层 flat fold)。
   *
   * 取不到就抛,不回落成空串:空串遇上 `toContain` 只会报「'' 不含 3.0s」,
   * 读起来像秒表坏了,其实是选择器没命中。
   */
  const rowText = (root: HTMLElement): string => {
    const row = root.querySelector('div[class*="tool"], details[class*="fold"]:not([class*="flat"])');
    if (!row) throw new Error('壳 body 里没有那一行 —— 选择器没命中,不是秒表的问题');
    return row.textContent ?? '';
  };

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 3_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('进行中的那一行跟着虚拟时钟往前走', () => {
    const { container } = render(
      <I18nProvider initial="zh-CN"><AssistantMessage message={message} streaming /></I18nProvider>,
    );
    expect(rowText(container)).toContain('3.0s');
    act(() => { vi.advanceTimersByTime(6_000); });
    expect(rowText(container)).toContain('9.0s');
  });

  it('执行记录自己一个 timer 都不起 —— 秒数全部从 `nowMs` 推', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    render(show(shellOf([
      thought('还在想…', 1_710_000),
      tool({ pending: true, elapsedMs: 847_000 }),
      todo('复刻商品列表页', 'in_progress', 90_000),
    ], { thinking: true })));
    expect(spy, '三行同时在跑,组件层仍然零定时器').not.toHaveBeenCalled();
  });

  it('多行同时跑也只有那一个既有 interval —— 不是每行一个', () => {
    const one = vi.spyOn(globalThis, 'setInterval');
    render(<I18nProvider initial="zh-CN"><AssistantMessage message={message} streaming /></I18nProvider>);
    const withOneRow = one.mock.calls.length;
    cleanup();
    one.mockClear();

    const many: PersistedAgentEvent[] = [
      { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'a' }, startedAt: T0 },
      { kind: 'tool_use', id: 't2', name: 'Bash', input: { command: 'b' }, startedAt: T0 },
      { kind: 'tool_use', id: 't3', name: 'Bash', input: { command: 'c' }, startedAt: T0 },
      { kind: 'thinking', text: '还在想…' },
    ];
    render(
      <I18nProvider initial="zh-CN">
        <AssistantMessage message={{ ...message, events: many } as ChatMessage} streaming />
      </I18nProvider>,
    );
    expect(one.mock.calls.length, '行数翻了几倍,定时器数量一个不变').toBe(withOneRow);
  });
});

/**
 * OPEND-2548 那条工单是「窄侧栏下耗时换行」。实时耗时会从 `0.0s` 长到 `1m 59s`
 * 再到 `14m 22s`,**宽度是变的**,所以那条不能靠假设。
 * (三个槽位的完整规则在 `summary-slots-no-wrap.test.tsx`,这里钉的是**进行中**那一档。)
 */
describe('OPEND-2548 · 进行中的耗时也不许换行', () => {
  const CSS = readFileSync(
    resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');
  const declsOf = (selector: string): string => {
    for (const m of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      for (const one of (m[1] ?? '').split(',')) {
        if (one.replace(/\s+/g, ' ').trim() === selector) return (m[2] ?? '').replace(/\s+/g, ' ').trim();
      }
    }
    return '';
  };

  it('耗时槽不缩不换行,让位的只能是标题', () => {
    expect(declsOf('.meta')).toMatch(/flex: none/);
    expect(declsOf('.meta')).toMatch(/white-space: nowrap/);
    expect(declsOf('.summaryContent')).toMatch(/flex: 0 1 auto/);
    expect(declsOf('.summaryContent')).toMatch(/min-width: 0/);
    expect(declsOf('.summaryContent')).toMatch(/overflow: hidden/);
    expect(declsOf('.summaryContent > .name')).toMatch(/text-overflow: ellipsis/);
  });

  it('结构:进行中那一行的耗时是 summary 的直接子代,没被塞进标题槽', () => {
    const { container } = render(show(shellOf([tool({
      pending: true, tool: 'exec', name: 'Bash',
      title: '一个长到足以把耗时挤出去的进行中标题,窄侧栏下必须由它让位',
      command: 'npm run build', elapsedMs: 119_000,
    })])));
    const summary = container.querySelector('details[class*="fold"]:not([class*="flat"]) > summary');
    expect(summary).not.toBeNull();
    const slot = summary!.querySelector(':scope > [data-testid="chat-foldable-summary-content"]');
    const elapsed = summary!.querySelector(':scope > [data-testid="chat-foldable-elapsed"]');
    expect(slot).not.toBeNull();
    expect(elapsed).not.toBeNull();
    // 完整的一段(「1m 59s」不是「1m」),而且没有被裹进标题槽
    expect(elapsed!.textContent).toBe('1m 59s');
    expect(slot!.querySelector('[data-testid="chat-foldable-elapsed"]')).toBeNull();
  });
});

describe('读屏不许每秒念一遍', () => {
  it('进行中的三类行,一个 `aria-live` / `role="status"` 都没有', () => {
    const { container } = render(show(shellOf([
      thought('还在想…', 1_710_000),
      tool({ pending: true, elapsedMs: 847_000 }),
      tool({ pending: true, id: 't2', tool: 'exec', name: 'Bash', title: '构建', command: 'npm run build', elapsedMs: 62_000 }),
      todo('复刻商品列表页', 'in_progress', 90_000),
    ], { thinking: true })));
    expect(container.querySelectorAll('[aria-live]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(0);
    expect(container.querySelectorAll('[role="timer"]')).toHaveLength(0);
  });
});
