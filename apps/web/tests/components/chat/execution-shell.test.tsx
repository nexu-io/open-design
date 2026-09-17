// @vitest-environment jsdom
/**
 * 执行记录组件:把 buildTurnBlocks 的产出画出来。
 * 这里**不重复测落块规则**(那在 runtime/chat 的单测里),测的是「同一份数据画成什么样」——
 * 壳头四种样子、清单分段、划线与可展开、平铺形态。
 *
 * 用真实的 buildTurnBlocks 产出当输入,而不是手捏 shell 对象:
 * 手捏的话组件与数据层可能各自漂移,接起来才发现对不上。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import type { ReactElement } from 'react';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell as ShellData } from '../../../src/runtime/chat/contract';

afterEach(() => { cleanup(); });

const render = (ui: ReactElement) => rtlRender(<I18nProvider initial="zh-CN">{ui}</I18nProvider>);

const shellView = (shell: ShellData): ReactElement => (
  <ExecutionShell shell={shell} deferCollapsedBodies={false} />
);

function shellsOf(events: PersistedAgentEvent[], runStatus?: 'succeeded' | 'failed' | 'canceled' | 'running'): ShellData[] {
  return buildTurnBlocks({ events, runStatus, nowMs: 60_000 })
    .filter((b): b is ShellData => b.kind === 'shell');
}

const nth = <T,>(arr: readonly T[], i: number): T => {
  const v = arr[i];
  if (v === undefined) throw new Error(`index ${i} missing`);
  return v;
};

function call(id: string, name: string, input: unknown, opts: { content?: string; startedAt?: number; completedAt?: number } = {}): PersistedAgentEvent[] {
  return [
    opts.startedAt != null
      ? { kind: 'tool_use', id, name, input, startedAt: opts.startedAt }
      : { kind: 'tool_use', id, name, input },
    {
      kind: 'tool_result',
      toolUseId: id,
      content: opts.content ?? 'ok',
      isError: false,
      ...(opts.completedAt != null ? { completedAt: opts.completedAt } : {}),
    },
  ];
}

const todo = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([content, status]) => ({ content, status })) } },
]);

describe('壳头', () => {
  it('运行中:会动的「进行中」+ 球,默认摊开', () => {
    const [shell] = shellsOf([{ kind: 'status', label: 'requesting' }, ...call('t1', 'Bash', { command: 'ls' })], 'running');
    render(<ExecutionShell shell={shell as ShellData} />);
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(document.querySelector('[data-orb="connecting"]')).not.toBeNull();
    expect(document.querySelector('details')?.open).toBe(true);
  });

  /**
   * S21 的「即使一个字都没有」不变;**变的是它出现在哪**(2026-08-27 用户裁决):
   * 「思考中」从壳头搬进壳里那一格思考(`ThoughtsRow` 的 live 形态),壳头留给「进行中」。
   *
   * `getByText` 在命中多个时会抛 —— 这条因此**同时是一道防重复的闸**:
   * 谁把「思考中」在壳头再画一遍,这里当场红。
   */
  it('收到 thinking 就出「思考中」并带三个点 —— 即使一个字都没有(S21)', () => {
    const [shell] = shellsOf([{ kind: 'thinking', text: '' }], 'running');
    render(<ExecutionShell shell={shell as ShellData} />);
    const label = screen.getByText(/思考中/);
    expect(label).toBeTruthy();
    expect(document.querySelector('[data-orb="composing"]')).not.toBeNull();
    // 它住在壳头之外:壳头此刻说的是「进行中」
    expect(label.closest('details[class*="flat"] > summary')).toBeNull();
    expect(document.querySelector('details[class*="flat"] > summary')?.textContent)
      .toContain('进行中');
  });

  it('结束:纯文本「已完成」,默认收起,球撤掉', () => {
    const [shell] = shellsOf(call('t1', 'Bash', { command: 'ls' }), 'succeeded');
    render(<ExecutionShell shell={shell as ShellData} />);
    expect(screen.getByText('已完成')).toBeTruthy();
    expect(document.querySelector('[data-orb]')).toBeNull();
    expect(document.querySelector('details')?.open).toBe(false);
  });

  it('整轮失败:状态词换成「运行失败」,默认收起(原因交给报错卡)', () => {
    const [shell] = shellsOf(call('t1', 'Bash', { command: 'npm run build' }), 'failed');
    render(<ExecutionShell shell={shell as ShellData} />);
    expect(screen.getByText('运行失败')).toBeTruthy();
    expect(document.querySelector('details')?.open).toBe(false);
  });

  /*
   * ⚠️ 这一条 OPEND-2626 **翻过案**。原来钉的是「状态词仍是『进行中』」,理由是
   * 手动停止不是第四态、下面那行「已手动停止」已经说清楚了。翻案的原因是那句
   * 「下面那行」在**历史回合**上是 `opacity: 0`(OPEND-2542 的 hover 揭示),
   * 于是一轮已经停掉的活,屏幕上常驻的唯一说法就是「进行中」+ 一个几分钟的秒数。
   * 详见 `ExecutionShell` 里 `head` 的注释与
   * `tests/components/chat/opend-2626-stopped-turn-history.test.tsx`。
   *
   * 没变的三样仍然钉在这里:不挂球、不是第四种 `status`(壳仍走 `stopped` 旗标)、
   * 不退成红色的「运行失败」。
   */
  it('手动停止:状态词是「已取消」,不挂球(秒数停住,仍不是第四种状态)', () => {
    const [shell] = shellsOf(call('t1', 'Bash', { command: 'ls' }), 'canceled');
    render(<ExecutionShell shell={shell as ShellData} />);
    expect(screen.getByText('已取消')).toBeTruthy();
    expect(screen.queryByText('进行中')).toBeNull();
    expect(screen.queryByText('运行失败')).toBeNull();
    expect(document.querySelector('[data-orb]')).toBeNull();
  });

  it('空态:没有内容时不出箭头(D21)', () => {
    const [shell] = shellsOf([{ kind: 'status', label: 'requesting' }], 'running');
    render(<ExecutionShell shell={shell as ShellData} />);
    expect(document.querySelector('details svg')).toBeNull();
  });

  it('壳头耗时按粗档写(31s 而不是 31.0s)', () => {
    const [shell] = shellsOf(call('t1', 'Bash', { command: 'ls' }, { startedAt: 0, completedAt: 31_000 }), 'succeeded');
    render(<ExecutionShell shell={shell as ShellData} />);
    expect(screen.getByText('31s')).toBeTruthy();
  });
});

describe('有清单:按 todo 分段', () => {
  const events = [
    ...todo('p1', [['复刻商品列表页', 'in_progress'], ['抽出商品卡', 'pending'], ['按同一套间距做设置页', 'pending']]),
    ...call('t1', 'Bash', { command: 'grep -n gap a.css' }, { content: 'a.css:1: gap' }),
    ...todo('p2', [['复刻商品列表页', 'completed'], ['抽出商品卡', 'completed'], ['按同一套间距做设置页', 'in_progress']]),
    ...call('t2', 'Write', { file_path: 'card.html', content: 'x\ny' }),
  ];

  it('清单卡先出「执行计划 · N 步」', () => {
    const shells = shellsOf(events, 'succeeded');
    render(shellView(nth(shells, shells.length - 1)));
    expect(screen.getByText('执行计划 · 3 步')).toBeTruthy();
  });

  it('做过事的那条可展开;一次性关掉、名下没内容的那条划线且没有箭头(D35)', () => {
    const shells = shellsOf(events, 'succeeded');
    render(shellView(nth(shells, shells.length - 1)));
    const drawers = [...document.querySelectorAll('details details')];
    const byName = (name: string) => drawers.find((d) => d.querySelector('summary')?.textContent?.includes(name));

    const worked = byName('复刻商品列表页');
    expect(worked?.querySelector('summary svg')).not.toBeNull();   // 有箭头 = 可展开

    const empty = byName('抽出商品卡');
    expect(empty?.querySelector('summary svg')).toBeNull();        // 无箭头
    const strucked = empty?.querySelector('summary span[class*="struck"]');
    expect(strucked).not.toBeNull();                               // 划线
  });

  it('正在跑的那条默认摊开', () => {
    // 必须用「还在跑」的轮次:轮次一结束,没关掉的 todo 会被收成停止态,自然也就不该再摊开
    const shells = shellsOf(events, 'running');
    render(<ExecutionShell shell={nth(shells, shells.length - 1)} />);
    const drawers = [...document.querySelectorAll('details details')] as HTMLDetailsElement[];
    const current = drawers.find((d) => d.querySelector('summary')?.textContent?.includes('按同一套间距'));
    expect(current?.open).toBe(true);
  });
});

describe('没有清单:平铺', () => {
  it('工具行直接挂在壳下,不出分段', () => {
    const [shell] = shellsOf([
      ...call('t1', 'Bash', { command: 'cat 规格.md' }),
      ...call('t2', 'Bash', { command: 'grep -n gap a.css' }, { content: 'a.css:1: gap' }),
    ], 'succeeded');
    render(shellView(shell as ShellData));
    expect(document.querySelectorAll('details details')).toHaveLength(0);
    expect(screen.getByText('读取')).toBeTruthy();
    expect(screen.getByText('搜索')).toBeTruthy();
  });

  /*
   * 2026-08-26 **最终裁决**:done 之前的一切都在卡片里 —— 普通正文和工具调用
   * 一样收在壳内。中间那版「没有 todo 时正文落壳外」已被用户在真机上撤销
   * (开场白因此排到了整张卡之后)。
   */
  it('没有清单时,普通正文照样在壳里(2026-08-26 最终裁决)', () => {
    const [shell] = shellsOf([
      { kind: 'text', text: '我先看一下工作区里的规格文件。' },
      ...call('t1', 'Bash', { command: 'cat 规格.md' }),
    ], 'running');
    render(<ExecutionShell shell={shell as ShellData} />);
    expect(screen.getByText('我先看一下工作区里的规格文件。')).toBeTruthy();
    // 工具行照旧在壳里,而且排在那句话后面
    expect(screen.getByText('读取')).toBeTruthy();
  });
});

/**
 * D46'(2026-08-27 用户裁决改写):限高滚动窗**落在壳内的思考正文区**,不是整只壳 body。
 * 规格原文本来就写的是「壳内的思考正文区」;实现读成了「壳 body」,于是壳里原有的
 * 工具行和清单被一起塞进 96px 里滚走。裁决与理由:`specs/current/chat-panel-feedback.md` §F-15。
 */
describe('思考流(D46)', () => {
  it('思考中:限高滚动窗挂在思考那一格上,壳 body 不动', () => {
    const [shell] = shellsOf([{ kind: 'thinking', text: '两张图的栅格看着是同一套。' }], 'running');
    render(<ExecutionShell shell={shell as ShellData} />);
    // 壳 body 永远是 `.stack` —— 思考不改变壳的形态
    const body = document.querySelector('details > div[class*="body"]');
    expect(body?.className).toMatch(/stack/);
    expect(body?.className).not.toMatch(/stream/);
    // 窗子在思考那一格自己身上,而且推理正文确实在窗里
    const stream = document.querySelector('div[class*="stream"]');
    expect(stream).not.toBeNull();
    expect(stream).not.toBe(body);
    expect(stream?.textContent).toContain('两张图的栅格看着是同一套。');
  });

  it('一有工具行落下来就回到普通文本流 —— 它不是日志窗', () => {
    const [shell] = shellsOf([
      { kind: 'thinking', text: '先看一眼。' },
      ...call('t1', 'Bash', { command: 'ls' }),
    ], 'running');
    render(<ExecutionShell shell={shell as ShellData} />);
    const body = document.querySelector('details > div[class*="body"]');
    expect(body?.className).toMatch(/stack/);
    expect(body?.className).not.toMatch(/stream/);
  });

  it('跑完了不再流式', () => {
    const [shell] = shellsOf([{ kind: 'thinking', text: '想好了。' }], 'succeeded');
    render(<ExecutionShell shell={shell as ShellData} />);
    const body = document.querySelector('details > div[class*="body"]');
    expect(body?.className ?? '').not.toMatch(/stream/);
  });
});

describe('S12 · 静默再久,壳头也不换词', () => {
  /**
   * 这一节原来叫「等太久没动静时壳头换一句话」,断言的是
   * `docs/design/run-errors/error-ux-design.md:33`「60 秒没新输出显示
   * 『上游响应慢，已等 N 秒』」——**那句文案 2026-08-27 被产品撤回了**
   * (裁决原文在 `components/chat/ExecutionShell.tsx` 的 `head` 注释里,
   * 只撤展现、探测全留)。所以断言跟着翻面:运行中的壳头回到「壳头四种样子」那条
   * 不变量,只有「进行中 / 思考中」两种,静默多久都不再插一句话进来。
   *
   * 没有整段删掉,是因为它守的是**这个组件的不变量**:运行态壳头不因数据层多出来的
   * 字段而变形。撤回本身与保留的探测另有专门一份:`s12-copy-revert.test.tsx`。
   */
  const START = 1_000_000;
  const startedTurn = (nowMs: number): ShellData[] =>
    buildTurnBlocks({
      events: [{ kind: 'tool_use', id: 'item_1', name: 'Read', input: { file_path: '/a.ts' }, startedAt: START }] as PersistedAgentEvent[],
      runStatus: 'running',
      nowMs,
    }).filter((b): b is ShellData => b.kind === 'shell');

  it('still says 进行中 inside the first minute', () => {
    render(<ExecutionShell shell={nth(startedTurn(START + 30_000), 0)} />);
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
  });

  it('still says 进行中 well past the old 60s threshold', () => {
    render(<ExecutionShell shell={nth(startedTurn(START + 95_000), 0)} />);
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
  });

  it('stays 进行中 when something lands too — nothing about the head moves', () => {
    const shells = buildTurnBlocks({
      events: [
        { kind: 'tool_use', id: 'item_1', name: 'Read', input: { file_path: '/a.ts' }, startedAt: START },
        { kind: 'tool_use', id: 'item_2', name: 'Read', input: { file_path: '/b.ts' }, startedAt: START + 90_000 },
      ] as PersistedAgentEvent[],
      runStatus: 'running',
      nowMs: START + 95_000,
    }).filter((b): b is ShellData => b.kind === 'shell');
    render(<ExecutionShell shell={nth(shells, 0)} />);
    expect(screen.getByText('进行中')).toBeTruthy();
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
  });

  it('never says it on a turn that already ended', () => {
    const shells = shellsOf(call('item_1', 'Read', { file_path: '/a.ts' }, { startedAt: 0 }), 'succeeded');
    render(<ExecutionShell shell={nth(shells, 0)} />);
    expect(screen.queryByText(/上游响应慢/)).toBeNull();
  });
});
