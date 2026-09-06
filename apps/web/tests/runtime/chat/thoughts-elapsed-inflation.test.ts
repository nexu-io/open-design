// @vitest-environment node
/**
 * 红测:**思考那一格报出的耗时不能比它自己占的那段空白大**。
 *
 * 思考的耗时是「量它填掉的那段空白」推出来的(thinking 事件一个时刻都不带)。
 * §2.2b 那条保护是:空白里不止它一个就**一个数都不给** —— 只把算得出的那几截
 * 加起来是偏小的假数,把别人的那几截也算上是**偏大的假数**,后者更糟:
 * 偏小还看得出「怎么这么快」,偏大是一个用户会信的数字。
 *
 * 这个文件钉住那条保护**在两种顺序下失效**的两个口子。两个口子同一个根:
 * `openThink.from` 从 `lastEndedAt` 播种,而**不带时刻的条目**(正文、作废的推理)
 * 永远不会推进 `lastEndedAt`;而收尾那道守卫问的是「我**现在**是不是这摞的末尾」,
 * 不是「这段空白里在我**之前**有没有落过别的东西」。
 *
 *   · 口子一(顺序不对称):`思考 → 正文 → 工具` 正确拒绝,`正文 → 思考 → 工具`
 *     报满整段 —— 同样一段空白,正文那几秒被全算到推理头上。
 *   · 口子二(尾部推理吞掉兄弟):空白里是 `思考A → 正文 → 思考B` 时,A 被正确作废,
 *     B 却认领了整段空白 —— 连 A 那一份和正文那一份一起。
 *
 * ⚠️ 反向对照就在这个文件里(`反向对照` 那一段)和 `thoughts-elapsed.test.ts` /
 *    `thoughts-elapsed-top-level.test.ts` 里:**空白里只有它一个时照旧出数**。
 *    「全都不给数」也能让上面两条断言变绿,那是错的修法。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { groupThinking, type ThoughtsGroup } from '../../../src/runtime/chat/group-thinking';
import type { BuildTurnInput, ExecutionShell } from '../../../src/runtime/chat/contract';
import codexParchment from '../../fixtures/chat/codex-parchment.turn0.json';

const sole = (input: BuildTurnInput): ExecutionShell => {
  const shells = buildTurnBlocks(input).filter((b): b is ExecutionShell => b.kind === 'shell');
  expect(shells.length, '这几例都该只有一张壳').toBe(1);
  return shells[0]!;
};

const thoughtsIn = (items: ExecutionShell['items']): ThoughtsGroup[] =>
  groupThinking(items, false).filter((g): g is ThoughtsGroup => g.kind === 'thoughts');

const call = (
  id: string,
  startedAt: number,
  completedAt: number,
): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'Bash', input: { command: 'ls' }, startedAt },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false, completedAt },
]);

const TURN = { runStatus: 'succeeded', startedAtMs: 1_000_000, endedAtMs: 1_100_000 } as const;

describe('口子一 · 顺序不该改变结论', () => {
  /** 同一段 `1_002_000 → 1_052_000` 的空白,里面同样是一段推理加一段正文 */
  const thinkFirst = (): number[] => thoughtsIn(sole({
    ...TURN,
    events: [
      ...call('t1', 1_000_000, 1_002_000),
      { kind: 'thinking', text: '想一下。' },
      { kind: 'text', text: '我先说一句。' },
      ...call('t2', 1_052_000, 1_053_000),
    ],
  }).items).map((g) => g.elapsedMs!);

  const proseFirst = (): number[] => thoughtsIn(sole({
    ...TURN,
    events: [
      ...call('t1', 1_000_000, 1_002_000),
      { kind: 'text', text: '我先说一句。' },
      { kind: 'thinking', text: '想一下。' },
      ...call('t2', 1_052_000, 1_053_000),
    ],
  }).items).map((g) => g.elapsedMs!);

  it('`思考 → 正文 → 工具`:拒绝(这一支本来就是对的)', () => {
    expect(thinkFirst()).toEqual([null]);
  });

  it('`正文 → 思考 → 工具`:同样要拒绝,不能把正文那几秒记到推理头上', () => {
    expect(proseFirst()).not.toEqual([50_000]);
    expect(proseFirst()).toEqual([null]);
  });

  it('两种顺序结论一致 —— 只测一种顺序照不出不对称', () => {
    expect(proseFirst()).toEqual(thinkFirst());
  });

  /**
   * 同一条不对称,推理被**一个还在飞的调用**隔开的形态。
   *
   * ⚠️ 这条用例 2026-09-02 换了前提(OPEND-2419,`e8bd2a726d`)。原来的写法是
   * 「发出去了但结果还没回来的调用**不落行**(D3),所以两截推理仍收成同一格」,
   * 断言 `cells.length === 1` + 整格作废。**D3 已作废**:调用一发出就落行
   * (产品原话「调用时不管成功没,都要立刻渲染」),那一行现在实实在在夹在两截中间。
   *
   * 于是分格判据照 `groupThinking` 的硬规矩走 —— 「中间隔了工具行就是两段推理,
   * 分别成格」,和本文件 `口子二` 里正文切两格是同一条。屏幕上是两格,
   * §2.2b 也就**按格各算各的**:
   *
   *   前一格「想一下。」 空白 `1_002_000 → 1_010_000`,里面还躺着正文 → 作废。
   *                      报 8s 就是把正文那 8 秒记到推理头上,正是本文件要挡的偏大假数。
   *   后一格「接着想。」 空白 `1_010_000 → 1_020_000`,里面**只有它一个** → 照旧出数。
   *
   * 后一格那 10s 不再是「偏小的假数」:偏小的说法成立的前提是两截同属一格、
   * 只报了其中一截。两截各自成格之后,10s 就是那一格自己填掉的整段空白,
   * 报出来是对的 —— 这也是本文件头上要的反向对照:**不许靠「全都不给数」变绿**。
   */
  it('`正文 → 思考 → 在飞的调用 → 思考 → 工具`:前一格作废,后一格照旧出数', () => {
    const shell = sole({
      ...TURN,
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'text', text: '我先说一句。' },
        { kind: 'thinking', text: '想一下。' },
        // 结果还没回来 —— OPEND-2419 之后它**落行**,把两段推理隔成两格
        { kind: 'tool_use', id: 't2', name: 'Bash', input: { command: 'sleep 8' }, startedAt: 1_010_000 },
        { kind: 'thinking', text: '接着想。' },
        ...call('t3', 1_020_000, 1_021_000),
      ],
    });
    // 前提本身要钉住:那一行确实在,不然下面两格是别的原因分开的
    const inflight = shell.items.filter((i) => i.kind === 'tool' && i.pending);
    expect(inflight.length, '在飞的调用要落成一行(OPEND-2419)').toBe(1);

    const cells = thoughtsIn(shell.items);
    expect(cells.length, '中间那行把两截推理隔成两格').toBe(2);
    expect(cells.map((g) => g.texts.join('')), '两格的次序按事件次序').toEqual(['想一下。', '接着想。']);

    expect(cells[0]!.elapsedMs, '8s 是把正文那 8 秒记到推理头上').not.toBe(8_000);
    expect(cells[0]!.elapsedMs, '这一格的空白里不止它一个,一个数都不给').toBeNull();
    expect(cells[1]!.elapsedMs, '这一格的空白里只有它,照旧出数').toBe(10_000);
  });
});

describe('口子二 · 尾部那一格不该吞掉被作废的兄弟', () => {
  it('合成:`思考A → 正文 → 思考B` 时 A 和 B 都不给数', () => {
    const shell = sole({
      ...TURN,
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '先想第一件。' },
        { kind: 'text', text: '中间说一句。' },
        { kind: 'thinking', text: '再想第二件。' },
        ...call('t2', 1_052_000, 1_053_000),
      ],
    });
    const cells = thoughtsIn(shell.items);
    expect(cells.length, '中间那段正文把两段推理切成两格').toBe(2);
    expect(cells.map((g) => g.elapsedMs)).toEqual([null, null]);
  });

  /**
   * 真实录音 —— `.od/runs/f7695c01-…`(agent=codex),**重放成已完成**。
   *
   * 这个口子只在轮次终止之后显形:还在跑时 `finishTurn` 那道 `!running` 闸
   * 根本不给收尾那一段结账,于是屏幕上看不见。录音尾巴长这样:
   *
   *   Bash        startedAt=1787840698353   ← 最后一件带时刻的事
   *     thinking  「Planning brand-spec.md structure and…」  ← 抽屉里倒数第三格
   *     text      「视觉系统采用 #f5f4ed 连续纸面作为背景…」  ← 一段正文
   *     thinking  「Planning document editor features」      ← 抽屉里最后一格
   *   轮次收尾     1787840850080
   *
   * 那段空白是 `698353 → 850080` = **151,727ms**,三件事分掉的。
   */
  it('真实录音重放成已完成:抽屉里最后一格不报 151,727ms', () => {
    const f = codexParchment as unknown as {
      startedAtMs: number; endedAtMs: number; events: PersistedAgentEvent[];
    };
    const shell = sole({
      events: f.events,
      runStatus: 'canceled',
      startedAtMs: f.startedAtMs,
      endedAtMs: f.endedAtMs,
    });
    const drawer = shell.segments[0]!;
    const cells = thoughtsIn(drawer.items);
    expect(cells.length, '抽屉里三格思考:12.4s / 被作废那格 / 尾部那格').toBe(3);
    expect(f.endedAtMs - 1_787_840_698_353, '那段空白确实是 151,727ms').toBe(151_727);
    expect(cells[2]!.elapsedMs, '尾部那格把兄弟和正文的时间一起吞了').not.toBe(151_727);
    expect(cells[2]!.elapsedMs).toBeNull();
    expect(cells[1]!.elapsedMs, '被正文切开的那格本来就作废').toBeNull();
  });
});

/**
 * 守卫的另一半 —— 「我是不是这摞的末尾」那一问**仍然承重**,没被记账取代。
 *
 * 记账只记 thinking / text 落下的条目(它们背后的事件没有时刻)。**没有时刻的
 * 调用**推下来的行不记账,也不会清空这一段空白 —— 那一档只有末尾判据看得见。
 * 消融证据:把末尾那一问拿掉,下面这一格立刻报出 50s。
 */
describe('守卫的另一半 · 没有时刻的调用推下来的行', () => {
  it('`思考 → 没有时刻的 TodoWrite → 工具`:仍然不给数', () => {
    const shell = sole({
      ...TURN,
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '想一下。' },
        // 没有 startedAt:时刻推不动,但清单行确实落在这段空白里
        {
          kind: 'tool_use',
          id: 'p0',
          name: 'TodoWrite',
          input: { todos: [{ content: '做第一件事', status: 'in_progress' }] },
        },
        ...call('t2', 1_052_000, 1_053_000),
      ],
    });
    expect(thoughtsIn(shell.items).map((g) => g.elapsedMs)).toEqual([null]);
  });
});

/**
 * 反向对照 —— **空白里只有它一个时照旧出数**。
 * 没有这一段,「全都不给数」也能让上面两个 describe 全绿。
 */
describe('反向对照 · 干净的空白照旧出数', () => {
  it('真实录音重放成已完成:抽屉里第一格照旧报 12.4s', () => {
    const f = codexParchment as unknown as {
      startedAtMs: number; endedAtMs: number; events: PersistedAgentEvent[];
    };
    const shell = sole({
      events: f.events,
      runStatus: 'canceled',
      startedAtMs: f.startedAtMs,
      endedAtMs: f.endedAtMs,
    });
    expect(thoughtsIn(shell.segments[0]!.items)[0]!.elapsedMs).toBe(12_433);
  });

  it('合成:`工具 → 思考 → 工具`,中间干干净净 → 报满 50s', () => {
    const shell = sole({
      ...TURN,
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '想一下。' },
        ...call('t2', 1_052_000, 1_053_000),
      ],
    });
    expect(thoughtsIn(shell.items).map((g) => g.elapsedMs)).toEqual([50_000]);
  });

  it('合成:开头那一段照旧退回轮次开头', () => {
    const shell = sole({
      ...TURN,
      events: [
        { kind: 'thinking', text: '先想清楚要动哪几个文件。' },
        ...call('t1', 1_030_000, 1_031_000),
      ],
    });
    expect(thoughtsIn(shell.items).map((g) => g.elapsedMs)).toEqual([30_000]);
  });

  it('合成:收尾那一段照旧退到轮次收尾', () => {
    const shell = sole({
      ...TURN,
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '想想还差什么。' },
      ],
    });
    expect(thoughtsIn(shell.items).map((g) => g.elapsedMs)).toEqual([98_000]);
  });
});
