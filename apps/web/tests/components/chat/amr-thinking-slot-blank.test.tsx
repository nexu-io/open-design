// @vitest-environment jsdom
/**
 * 思考行右边那个槽,在用户 2026-09-06 报的两种真实场景下写什么。
 *
 * ⚠️ 文件名沿用它当红测时的名字(`…-slot-blank`),别按名字读结论 —— 两条现象的
 * 裁决**不一样**,一条维持空白、一条改成要写数,下面逐条写清楚了。
 *
 * 用户报的两条,他认为是同一件事:
 *   ① 「AMR 没有 token 输出计数」—— 用 AMR 跑的回合,界面上看不到 token 数。
 *   ② 「即使是第一个 thinking,思考过程中不显示耗时,但**结束还是要显示的吧**?」
 *
 * ── 这两条确实是同一格 ────────────────────────────────────────────────
 *
 * 整个聊天面板里能写出 token 数的地方只有一处:`ThoughtsRow` 右边那个槽
 * (i18n key `chat.record.thinkingTokens`,全仓唯一读者是那一行 `slot`);
 * 而「思考结束后的耗时」要写的也正是这个槽 —— 一个槽、一个值,由那条三元式二选一:
 *
 *     const elapsed = muted && live ? '' : formatElapsed(elapsedMs);
 *     const slot = tokens != null && … ? <CountingNumber …/> : elapsed;
 *
 * 于是槽写不出字只有一种走法:**token 那一半拿不到,而计时那一半被压成空串**。
 * 两条现象各自踩中「token 那一半拿不到」的一个原因:
 *
 *   ① AMR 走 ACP,而 `thinking_tokens` 事件在这个仓库里只有两个生产者 ——
 *      `runtimes/claude-stream.ts`(claude)与
 *      `agent-protocol/codex-app-server/normalize.ts`(codex)。
 *      ACP 那条路(`agent-protocol/acp/session.ts`)一个都不发。
 *      实测:本机 beta 数据目录 25 条 `agentId=amr` 的 run,`thinking_tokens` 出现
 *      **0 次**(对照:同期 claude run 每轮 22–2537 次)。
 *   ② `groupThinking` 只把 token 挂在**还活着**的那一格上
 *      (`runtime/chat/group-thinking.ts` 的 `if (live)`),
 *      而 `build-turn-blocks.ts` 更是只发给 `block.thinking === true` 的壳。
 *      回合一结束,`live` 与 `thinking` 同时为假 —— **所有** agent 的头一格都退回空槽。
 *
 * ── 裁决(用户 2026-09-06):两条分开处理 ──────────────────────────────
 *
 * 逐字:「**思考进行中不显示耗时(维持现状),但收尾之后要显示。**」
 *
 *   · **现象②(想完之后)= 修**。收掉头一格计时的理由是「和壳头写的是同一个数」,
 *     而那句话只在这一格**还在流**的时候成立:
 *       — 还在流 —— 壳头 `shellElapsed(isFirst)` 从 `input.startedAtMs` 走到 `nowMs`,
 *         头一格思考也是从轮次开头走到全轮共用的 `liveEndMs`,两个数同起同终。
 *       — 想完了 —— 这一格被下一件带时刻的事结账(`stamp()` → `closeThink(at)`)冻住,
 *         壳头那个数继续走到轮次收尾。两个数当场分叉,「重复」这个理由消失。
 *     实现是 `ThoughtsRow` 的 `muted && live`,下面第二节钉它。
 *
 *   · **现象①(还在想的时候)= 维持现状,不在这一层修**。裁决明说「进行中不显示耗时」,
 *     所以 AMR 正在思考那一格**仍然是空槽**,下面第一节把它从🔴翻成守卫钉住 ——
 *     谁哪天为了「让 AMR 也有个数」把压制整条拆掉,第一节当场红。
 *     用户那句「AMR 没有 token 输出计数」说的是 ACP 不发 `thinking_tokens`
 *     (原因①),那是 daemon/协议侧的缺口;在渲染层拿耗时去顶替它,等于替产品
 *     决定「AMR 的思考中改成显示秒数」—— 没有这条裁决,不许自造。
 */
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { I18nProvider } from '../../../src/i18n';
import { ExecutionShell } from '../../../src/components/chat/ExecutionShell';
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
 * 和 `thinking-token-count.test.tsx` / `first-thoughts-no-elapsed.test.tsx` 读的是
 * **同一个** testid —— 「一个槽、一个数」是产品要的形状,分两个 testid 去读会把
 * 「两个数同时摆着」测成合法。槽不存在时给哨兵,免得选择器没命中被读成「空槽」。
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

describe('现象一:AMR 正在思考时,头一格右边仍然一个数都没有(裁决:维持现状)', () => {
  /**
   * 防真空 —— **先证明这把尺子看得见那个数**。
   *
   * 下面那条守卫断言的是「槽里是空的」,而「空」在选择器没命中或组件根本没渲染时
   * 会以另一种方式成立。这一条用**完全相同的壳形状**、只把 `thinkingTokens` 填上,
   * 读出 `3.3k tokens` —— 证明差别只在那一个字段。
   */
  it('量法对照:同一张壳,claude 那档(有 thinking_tokens)读得到 3.3k tokens', () => {
    const { container } = render(show(shellOf(
      [thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: { count: 3_278, stale: false } },
    )));
    expect(container.textContent).toContain('思考中');
    expect(thoughtsSlot(container)).toEqual(['3.3k tokens']);
  });

  /**
   * 用户那个画面:AMR 正在思考,右边什么都没有 —— **裁决维持它**。
   *
   * 这一条原来是🔴(「槽里必须有字」)。用户 2026-09-06 的裁决把现象①和②分开了:
   * 「思考进行中不显示耗时(维持现状)」。所以它现在是**防修过头**的守卫:
   * 把 `ThoughtsRow` 那句 `muted && live` 里的 `muted` 拆掉、或者整条压制去掉,
   * 这一条当场红。
   *
   * `thinkingTokens: null` 不是夹具偷懒 —— 它是 AMR 的**唯一**可能取值:
   * ACP 那条路一条 `thinking_tokens` 都不发(见文件抬头的实测),
   * 所以 `build-turn-blocks` 那个 `if (thinkingTokenCount != null)` 永远进不去。
   * 要让 AMR 这一格也有 token 数,得在 daemon/ACP 侧补事件,不在这一层。
   */
  it('AMR 思考中:头一格仍然是空槽,不许拿耗时去顶 token 的位置', () => {
    const { container } = render(show(shellOf(
      [thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: null },
    )));
    expect(container.textContent, '正向对照:确实渲染到了「思考中」那一档').toContain('思考中');
    expect(
      thoughtsSlot(container),
      '裁决「思考进行中不显示耗时(维持现状)」—— 槽在、值空',
    ).toEqual(['']);
    expect(container.textContent, '被压住的那个数不许溜出来').not.toContain('28m 30s');
  });

  /**
   * 防真空的第二半:**同一个 `elapsedMs` 挪到第二格照旧写得出来**。
   *
   * ⚠️ 头一格从 `''` 改成 `1m 2s` 是现象②的裁决落地,不是这一条放松了:
   * 这张壳的头一格后面压着一次调用,它**早就想完**,压制不覆盖那个相位。
   * 还在流的是第二格,它才是「进行中」那一档。
   */
  it('量法对照:AMR 也照旧写得出秒数 —— 想完的头一格 1m 2s、在流的第二格 28m 30s', () => {
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 62_000), tool('a.ts'), thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: null },
    )));
    expect(thoughtsSlot(container)).toEqual(['1m 2s', '28m 30s']);
  });
});

describe('现象二:思考结束之后,头一格要把自己那段耗时写出来(所有 agent)', () => {
  /**
   * 回合已收尾:两格推理都想完了,各写各的数。
   *
   * 这一条原来断言 `['', '1m 2s']` —— 那个 `''` 守的是「收尾之后也不显示」,
   * 前提已被 2026-09-06 的裁决作废。
   */
  it('回合已收尾:头一格写自己那 28m 30s,第二格写自己的 1m 2s', () => {
    const { container } = render(show(shellOf([
      thought('开场那一段。', 1_710_000),
      tool('a.ts'),
      thought('两次调用之间那一段。', 62_000),
      tool('b.ts'),
    ], { status: 'done', thinking: false })));
    expect(thoughtsSlot(container)).toEqual(['28m 30s', '1m 2s']);
  });

  /**
   * 用户原话:「即使是第一个 thinking,思考过程中不显示耗时,但**结束还是要显示的吧**?」
   *
   * 收掉头一格计时的理由是「和壳头写的是同一个数」,而那句话只在**跑着的时候**成立:
   *   · 跑着时 —— 壳头 `shellElapsed(isFirst)` 从 `input.startedAtMs` 走到 `nowMs`,
   *     头一格思考也是从轮次开头走到 `nowMs`,两个数确实同起同终。
   *   · 收尾后 —— 壳头那个数变成**整轮**跨度(`isLast` 分支把终点推到 `endedAtMs`),
   *     而头一格思考只覆盖到第一件带时刻的事为止。两个数不再相等,「重复」这个理由消失了。
   *
   * 这一档和 agent 无关:token 只发给 `live` 那一格(`group-thinking.ts`),
   * 回合一结束 claude 也拿不到,于是 claude 的头一格走的是同一条路。
   */
  it('回合已收尾:整轮头一格思考,槽里写出它自己那一段', () => {
    const { container } = render(show(shellOf(
      [thought('开场那一段。', 1_710_000), tool('a.ts')],
      { status: 'done', thinking: false, thinkingTokens: null },
    )));
    expect(container.textContent, '正向对照:确实是收尾那一档').toContain('思考过程');
    const [slot] = thoughtsSlot(container);
    expect(slot, '用户:「结束还是要显示的吧」').toBe('28m 30s');
  });

  /**
   * 同一件事在 claude 上:跑着时写 token,一想完就换成自己那段耗时。
   *
   * 这一条把「现象二与 agent 无关」钉死 —— 别把它当成 AMR 的专属缺陷去修。
   * 顺带钉住**换手只发生一次、方向单向**:`tokens` 只挂在 `live` 那一格上,
   * 想完的那一刻它已经是 `null`,所以槽不会在 token 和秒数之间来回闪。
   */
  it('claude 也一样:跑着时 3.3k tokens,想完之后换成 28m 30s', () => {
    const live = render(show(shellOf(
      [thought('还在想…', 1_710_000)],
      { thinking: true, thinkingTokens: { count: 3_278, stale: false } },
    )));
    expect(thoughtsSlot(live.container), '跑着的时候写的是 token').toEqual(['3.3k tokens']);
    live.unmount();

    // 收尾:`groupThinking` 的 `live` 与 `build-turn-blocks` 的 `block.thinking`
    // 同时为假,于是 `thinkingTokens` 再也挂不上去 —— 这就是收尾后的真实取值。
    const { container } = render(show(shellOf(
      [thought('还在想…', 1_710_000)],
      { status: 'done', thinking: false, thinkingTokens: null },
    )));
    expect(thoughtsSlot(container), '想完之后换成这一格自己的耗时').toEqual(['28m 30s']);
  });
});
