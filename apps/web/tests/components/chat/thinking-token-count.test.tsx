// @vitest-environment jsdom
/**
 * 【产品裁决 2026-09-04】思考行右边那个槽,报**此刻还在动的那件事**。
 *
 * ── 补的是哪个画面 ──────────────────────────────────────────────────────
 *
 * claude 的 extended thinking 有一档只计费、不给字:API 收下推理 token、账单照收,
 * 回来的只有一个加密签名(真机 CLI 2.1.260:3060 个计费 token、**0 个字符**)。
 * 用户那一轮盯着「思考中」和一只空窗看了 57 秒 —— 三方比对(CLI 自己的 transcript、
 * daemon 事件日志、落库行)证明**什么都没丢**,是上游没给。空窗是诚实的,而且还会再来。
 *
 * 但 CLI 一直在报想了多少(`system`/`thinking_tokens` 帧),daemon 以前把它丢在地上。
 * 那个数**恰恰在正文永远不会来的时候存在**,所以它就是这一格该说的话。
 *
 * ── 槽里到底写哪个数(产品 2026-09-04)────────────────────────────────
 *
 * 原话:「不能同时出现计时和 token 变化」「有 token 变化立刻显示 token 变化」
 * 「token 很久没变化时再显示计时」「第一次 thinking 永远是 token 变化」。
 *
 * 组织这四句的一句话:**槽永远报此刻还活着的那件事。**模型在推理时,活的是 token 数;
 * 推理卡住了,唯一还活着的事实就只剩「已经等了多久」,于是计时接手。
 * 两个数同时摆着,读者会去**比**它们,而不是**读**它们。
 *
 * ⚠️ 这**不是**把今早刚收走的那个计时又放回来。整轮头一格**还在想时**的计时被收掉,
 * 是因为它和壳头那个数同起同终、写的是同一个事实(`first-thoughts-no-elapsed.test.tsx`)。
 * token 不是复读 —— 它是那一格**一直缺的**那个数。所以头一格这个槽在**思考中**归 token,
 * 别看见「头一格思考中又有秒数了」就顺手把 `formatElapsed` 接回去。
 *
 * ── 2026-09-06 那条裁决**碰不到这个文件的产品规则** ────────────────────
 *
 * 用户「结束还是要显示的吧?」让头一格**想完之后**把秒数写出来
 * (`ThoughtsRow` 的 `muted && live`)。它和 token 在时间上不重叠:
 * token 只挂在 `live` 那一格上(`group-thinking.ts` 的 `if (live)`,
 * `build-turn-blocks` 更是只发给 `block.thinking === true` 的壳),
 * 想完的那一刻 `tokens` 已经是 `null`。所以「一个槽、一个数」原样成立,
 * 一格之内也只切换一次、方向单向,不会来回闪。
 *
 * 下面**改了三处夹具的期望值**,改的都是同一件事:那几张壳的**头一格早就想完了**
 * (后面压着一次带时刻的调用),它写出的 `1m 2s` 是它自己那 62 秒。
 * 每一处都在就近注释里写了。token 相关的断言一条没动。
 *
 * ── 「很久」定在 8 秒,量出来的 ────────────────────────────────────────
 *
 * 健康推理时这些帧的间隔 p50 是 1.4s(`specs/current/chat-panel-next.md` 那两份真实
 * 录制量的正是这个数),整轮里见过的最大间隔 4.88s。门槛压在 5s 以下,健康推理会
 * 一路来回翻面。8s ≈ 5.7 倍 p50、1.6 倍最大间隔,又远在壳那两个 60s 门槛
 * (`SLOW_UPSTREAM_AFTER_MS` / `WAITING_FIRST_OUTPUT_AFTER_MS`)之前。
 *
 * 数据面在 `tests/runtime/chat/thinking-token-count.test.ts`;
 * 解析面在 `apps/daemon/tests/runtimes/w134-thinking-token-count.test.ts`。
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
} from '../../../src/runtime/chat/contract';

afterEach(cleanup);

const T0 = 1_800_000_000_000;

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

const thought = (text: string, elapsedMs: number): ShellItem =>
  ({ kind: 'text', text, thinking: true, elapsedMs } as ShellItem);

const tool = (id: string): ShellItem => ({
  kind: 'tool', id, tool: 'read', name: 'Read', title: `读取 ${id}`, rawTitle: false,
  file: null, pattern: null, hits: null, delta: null, elapsedMs: 400,
  pending: false, failed: false, failReason: null, command: null, terminal: null,
} as ShellItem);

/**
 * 每一格「思考」右边那个槽的文字,按出现顺序。
 *
 * 读的是**槽本身**,而且 token 和计时共用**同一个** testid —— 这不是偷懒:
 * 「一个槽、一个数」正是产品要的形状,拿两个 testid 去读会把「同时出现」测成合法。
 * 槽不存在时给显眼哨兵,免得选择器没命中被读成「压住了」。
 */
function thoughtsSlot(root: HTMLElement): string[] {
  const rows = Array.from(root.querySelectorAll<HTMLElement>('details[class*="thoughts"]'));
  if (!rows.length) throw new Error('一格思考都没渲染出来 —— 选择器没命中,不是槽的问题');
  return rows.map((row) => {
    const slots = row.querySelectorAll('summary [data-testid="chat-foldable-elapsed"]');
    if (slots.length > 1) return `<${slots.length} 个槽>`;
    return slots.length ? (slots[0]!.textContent ?? '') : '<无槽>';
  });
}

describe('推理 token 计数落在思考行上', () => {
  it('用户那个画面:整轮头一格推理,空窗,右边写着想了多少', () => {
    const { container } = render(show(shellOf([], {
      thinking: true,
      thinkingTokens: { count: 3278, stale: false },
    })));
    // 正向对照:确实是「思考中」那一档
    expect(container.textContent).toContain('思考中');
    expect(thoughtsSlot(container)).toEqual(['3.3k tokens']);
  });

  it('数字随帧变化 —— 同一个槽,三次不同的读数', () => {
    const seen: string[] = [];
    for (const count of [50, 1_240, 3_278]) {
      const { container, unmount } = render(show(shellOf([], {
        thinking: true, thinkingTokens: { count, stale: false },
      })));
      seen.push(thoughtsSlot(container)[0]!);
      unmount();
    }
    expect(seen).toEqual(['50 tokens', '1.2k tokens', '3.3k tokens']);
  });

  /**
   * 「同时出现」问的是**一个槽里**有没有两个数 —— `thoughtsSlot` 那个
   * `<N 个槽>` 哨兵守的就是这一句,和别的行写不写数无关。
   *
   * ⚠️ 头一格从 `''` 改成 `1m 2s`:那一格后面压着一次调用,它**早就想完了**,
   * 2026-09-06 的裁决让它报自己那 62 秒。还在流的是第三格,它照旧只写 token。
   */
  it('一个槽、一个数 —— 计时和 token 绝不同时出现', () => {
    // 后面那一格既算得出耗时、又拿得到 token:产品要的是**只写 token**
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 62_000), tool('a.ts'), thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: { count: 3_278, stale: false } },
    )));
    expect(thoughtsSlot(container)).toEqual(['1m 2s', '3.3k tokens']);
    expect(container.textContent, '那一格的秒数不许同时摆着').not.toContain('28m 30s');
  });

  /** 头一格那个 `1m 2s` 的来历同上一条;这里钉的是**第二格**让位给 `28m 30s`。 */
  it('token 很久没变了,后面那一格把槽让给计时', () => {
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 62_000), tool('a.ts'), thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: { count: 3_278, stale: true } },
    )));
    expect(thoughtsSlot(container)).toEqual(['1m 2s', '28m 30s']);
    expect(container.textContent, '让位就是让位,不许两个都写').not.toContain('3.3k');
  });

  /**
   * 让位的判据是「**有没有表可让**」,不是「是不是头一格」——
   * 一条判据同时盖住产品那三句话,不必给头一格再写一条特例。
   *
   * 头一格**还在想的时候**的计时因为「和壳头重复」被收掉(槽在、值空);
   * claude 空推理那一档更是连槽都没有(那一格是 `groupThinking` 补出来的,
   * 压根算不出耗时)。两种情况下槽里都没有第二个数可写,所以 token 停了也照旧写着
   * 最后那个读数 —— 退回空槽等于把刚说清楚的事又抹掉。
   *
   * ⚠️ 2026-09-06 之后这条判据**一个字没改**,因为两条规则的相位不重叠:
   * 这张壳是 `thinking: true` 且头一格就是还在流的那一格,压制仍然生效
   * (`elapsed` 是空串)→ 没有表可让 → 照旧写 token。等它想完,`tokens` 会同时
   * 变成 `null`,槽直接归秒数,不经过这条三元的第一个分支。
   */
  it('头一格还在流:永远是 token —— 计时被压着,数停了也不退回空槽', () => {
    const { container } = render(show(shellOf(
      [thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: { count: 3_278, stale: true } },
    )));
    expect(thoughtsSlot(container)).toEqual(['3.3k tokens']);
    expect(container.textContent, '被收走的那个数不许借着让位溜回来').not.toContain('28m 30s');
  });

  it('空窗那一格同样 —— 它连耗时都算不出来,更没有表可让', () => {
    const { container } = render(show(shellOf([], {
      thinking: true, thinkingTokens: { count: 3_278, stale: true },
    })));
    expect(thoughtsSlot(container)).toEqual(['3.3k tokens']);
  });

  /**
   * ⚠️ 这一条原来叫「头一格**空槽**、后面那格写秒数」,断言 `['', '28m 30s']`。
   *
   * 那个 `''` 是当时的现状被顺手钉成了预期:这张壳的头一格后面压着一次调用,
   * 它**早就想完**,压制不覆盖这个相位(用户 2026-09-06)。
   * 「拿不到 token 时一切照旧」这句话本身没变 —— 变的是「照旧」指的是什么:
   * 没有 token 的那一档,每一格都写自己那段推理的耗时,一格不多、一格不少。
   * 「思考中的头一格仍然空槽」由 `first-thoughts-no-elapsed.test.tsx` 第一节守。
   */
  it('反向守卫:拿不到 token 时一切照旧 —— 两格各写各的秒数', () => {
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 62_000), tool('a.ts'), thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: null },
    )));
    expect(thoughtsSlot(container)).toEqual(['1m 2s', '28m 30s']);
    expect(container.textContent).not.toContain('tokens');
  });

  it('反向守卫:别家 agent 一个字都不多写 —— 没有零、没有占位、连槽都不新开', () => {
    // 只有 claude 的流带这种帧;别家 `thinkingTokens` 恒为 null。
    // 「拿不到数」那一档在这个仓库里是**连槽都没有**(和「槽在、值空」分得开)。
    const { container } = render(show(shellOf([], { thinking: true, thinkingTokens: null })));
    expect(thoughtsSlot(container)).toEqual(['<无槽>']);
    expect(container.textContent).not.toContain('0 tokens');
    expect(container.textContent).not.toContain('tokens');
  });

  it('写法:未满一千写原数,过千才收成 k', () => {
    const read = (count: number): string => {
      const { container, unmount } = render(show(shellOf([], {
        thinking: true, thinkingTokens: { count, stale: false },
      })));
      const text = thoughtsSlot(container)[0]!;
      unmount();
      return text;
    };
    expect(read(1)).toBe('1 tokens');
    expect(read(950)).toBe('950 tokens');
    expect(read(999)).toBe('999 tokens');
    expect(read(1_000)).toBe('1k tokens');
    expect(read(1_050)).toBe('1.1k tokens');
    expect(read(3_278)).toBe('3.3k tokens');
    expect(read(64_000)).toBe('64k tokens');
  });
});

/**
 * 数字每 1.4 秒跳一次,**逐位等宽**才不会横着抖。
 *
 * 这一格不需要新加 CSS:token 用的就是耗时那个槽(`.meta`),而它的字族是
 * `--chat-font-mono` —— 等宽字族本来就每个字形同宽,这正是今天那个每秒跳一次的
 * 秒数不抖的原因。所以这里钉的是「**别把它挪出那个字族**」:
 * 谁哪天把这个数换到正文字体的槽里(比如 `.meta.num` 那一档),这条当场红,
 * 提醒他把 `font-variant-numeric: tabular-nums` 一起带上。
 */
describe('等宽数字 · 跳字不横移', () => {
  const CSS = readFileSync(
    resolve(__dirname, '../../../src/components/chat/primitives/record.module.css'),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, '');

  it('token 落在耗时那个槽里 —— 同一个 class,同一套写法', () => {
    const { container } = render(show(shellOf([], {
      thinking: true, thinkingTokens: { count: 3_278, stale: false },
    })));
    const slot = container.querySelector<HTMLElement>(
      'details[class*="thoughts"] summary [data-testid="chat-foldable-elapsed"]',
    );
    expect(slot?.textContent).toBe('3.3k tokens');
    expect(slot?.className, '就是 `.meta` 那一枚,没有另起一个槽').toMatch(/meta/);
  });

  it('那个槽的字族是等宽的 —— 数字逐位同宽', () => {
    const meta = CSS.match(/\.meta\s*\{([^}]*)\}/);
    expect(meta, '`.meta` 还在').not.toBeNull();
    expect(meta![1]).toContain('--chat-font-mono');
  });

  it('正文字体那一档(`.meta.num`)照旧自带 tabular-nums —— 挪过去也不会抖', () => {
    const num = CSS.match(/\.meta\.num\s*\{([^}]*)\}/);
    expect(num, '`.meta.num` 还在').not.toBeNull();
    expect(num![1]).toContain('tabular-nums');
  });
});

/**
 * ⚠️ 这一节的抬头**改过**(产品 2026-09-04 当天推翻了自己更早那条)。
 *
 * 原来写的是「零新增 timer」:那时的裁决是「帧到了就换数,这才是实时」。
 * 用户看完实物之后要的是**增长过程**:「token 最好也有个增长的过程,而不是直接从
 * 100 跳到 200,而是逐渐从 100 数字滚动到 200…能让用户感受到这里好像有一个流式的感觉」。
 * 于是读数现在**会自己数上去**(`CountingNumber`,一只 `setInterval`,400ms 预算)。
 *
 * **没被推翻的是「不从零涨上来」那一条** —— 挂载即落定,而且挂载那一帧一个 tick 都不排。
 * 下面两条各钉一半:换数那条现在要把表推过去才读得到落点,刷新那条一个字没动。
 * 自增本身的判据(不过冲 / 接着数 / 预算)在 `thinking-token-count-up.test.tsx`。
 */
describe('接线 · 数会自己数上去,但不从零涨上来', () => {
  const eventsUpTo = (counts: number[]): PersistedAgentEvent[] => ([
    { kind: 'status', label: 'thinking' } as PersistedAgentEvent,
    { kind: 'thinking', text: '' } as PersistedAgentEvent,
    ...counts.map((tokens, i) => ({
      kind: 'thinking_tokens', tokens, at: T0 + 1_400 * (i + 1),
    } as PersistedAgentEvent)),
  ]);

  const messageWith = (events: PersistedAgentEvent[]): ChatMessage => ({
    id: 'm1', role: 'assistant', content: '', createdAt: T0, runStatus: 'running', events,
  } as ChatMessage);

  const live = (events: PersistedAgentEvent[]): ReactElement => (
    <I18nProvider initial="zh-CN">
      <AssistantMessage message={messageWith(events)} streaming />
    </I18nProvider>
  );

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0 + 3_000);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('整条真实链路:帧一批批到,同一个槽跟着数到新读数', () => {
    const { container, rerender } = render(live(eventsUpTo([50])));
    expect(thoughtsSlot(container)).toEqual(['50 tokens']);

    /*
     * 每一帧之后要把表推过去才读得到落点 —— 数是**数上去**的,不是一帧换到位
     * (产品 2026-09-04)。600ms 覆盖 400ms 的预算还富余,不是在等一个不确定的时长。
     */
    rerender(live(eventsUpTo([50, 1_240])));
    act(() => { vi.advanceTimersByTime(600); });
    expect(thoughtsSlot(container)).toEqual(['1.2k tokens']);

    rerender(live(eventsUpTo([50, 1_240, 3_278])));
    act(() => { vi.advanceTimersByTime(600); });
    expect(thoughtsSlot(container)).toEqual(['3.3k tokens']);
  });

  /**
   * 刷新页面那一档(产品原话:「刷新页面时,token 不能从零涨上来」)。
   *
   * 判据是**第一帧**:整批事件一次性喂进去、组件全新挂载,`render` 返回时读到的就是
   * 已经落定的那个数。任何「挂载后从 0 补间涨上去」的做法都会让这一条读到别的东西
   * —— 和入场动画每次重挂都重放是同一类毛病,一页几轮跑完的对话会同时抖起来。
   */
  it('刷新:整批事件一次性到,首帧就是落定的数,不从零涨', () => {
    const { container } = render(live(eventsUpTo([50, 1_240, 3_278])));
    // 这一行**在任何 effect / timer 跑之前**执行
    expect(thoughtsSlot(container)).toEqual(['3.3k tokens']);
    // 时间往前推也不会再涨 —— 挂载没有一段可数的间,自增压根没启动
    act(() => { vi.advanceTimersByTime(2_000); });
    expect(thoughtsSlot(container)).toEqual(['3.3k tokens']);
  });

  /**
   * 挂载那一帧**一个表都不排**。
   *
   * 这一条原来叫「执行记录自己一个 timer 都不起」,依据是当时「不许有补间」的裁决;
   * 裁决改了之后它**没有作废,而是变窄了**:自增只发生在「已经在屏上的值 → 新值」
   * 之间,挂载不算。谁哪天把这只闩去掉,一页几十轮的历史会话会同时从 0 数上来。
   */
  it('挂载那一帧不排表 —— 自增只发生在已经在屏上的值 → 新值之间', () => {
    const spy = vi.spyOn(globalThis, 'setInterval');
    render(show(shellOf([], { thinking: true, thinkingTokens: { count: 3_278, stale: false } })));
    expect(spy, '挂载即落定,没有需要数的间').not.toHaveBeenCalled();
  });
});
