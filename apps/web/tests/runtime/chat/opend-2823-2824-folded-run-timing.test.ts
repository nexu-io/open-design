// @vitest-environment node
/**
 * 红测:**折叠轮次里,每个物理 run 的钟必须是它自己的那一口**(OPEND-2823 / OPEND-2824)。
 *
 * ## 两张单是同一个真因
 *
 * `foldStrategyTaskTurns` 在**重新打开历史**时把 N 个物理 run 接成一条消息,却只留
 * 了 run 0 的 `createdAt` 和最后一个 run 的 `endedAt` —— **中间每一道 run 边界连同
 * 每个后继 run 自己的起点,全被丢掉了**。于是 `buildTurnBlocks` 手上只有**一口钟**
 * 要给 N 个 run 用,两张单各是这口钟的一头:
 *
 *  · OPEND-2823 「已完成旁边没有耗时」——
 *    壳头耗时的兜底(`shellElapsed` 里的轮次起止)挂在「整轮第一张壳 / 整轮最后一张
 *    壳」上。折叠之后,中间那几个 run 的壳两头都够不着,而**它们恰恰是最需要兜底
 *    的那一批**:澄清 run 通常只说一段话,一个带时刻的事件都没有(plain-stream 那
 *    一族整轮如此)。两头都取不到 → `elapsedMs` 恒为 null → 壳头只剩光秃秃一句
 *    「已完成」。
 *
 *  · OPEND-2824 「进行中的总耗时小于下面的思考耗时」——
 *    推理没有自己的时刻,只能靠「它填掉了哪一段空白」反推,而那段空白的起点
 *    `lastEndedAt` 是**全轮共用**的。折叠之后它直接跨过 run 边界,把前面几个 run
 *    的墙上时间(含用户盯着 `<question-form>` 想答案的那几分钟)一并算进当前 run
 *    的一格「思考过程」里;壳头却仍只报自己这一个 run。于是卡里那一行比卡头还大。
 *
 * ## 判据:同一条会话,折叠前后必须是同一批数字
 *
 * 这不是新发明的口径,是这个仓库自己早就写下的那条等式的延伸 ——
 * `tests/components/chat/odnext-reload-run-boundaries.test.tsx` 已经钉住
 * 「折起来那一条算出的**块序** === 三个 run 各自算出的块序首尾相接」。
 * 折叠是**视图层的拼接**,那么块上的**耗时**同样不该因为拼接而变。
 *
 * 语料是真机那一条会话的原始字节(`fixtures/chat/odnext-parchment.reload.json`,
 * 直接从用户库里的 `messages` 行导出),不是照着形状重打的夹具。三个 run 的真实跨度
 * 分别是 1m 20s / 2m 39s / 4m 42s,库里逐字记着。
 *
 * ⚠️ **不许靠调数字收口。** 提单人明确写过:两个值若分属不同轮次或统计范围,要把范围
 * 说清楚,而不是把小的那个改大。这里的修法是**把丢掉的 run 边界找回来**,让两个数
 * 从一开始就落在同一个范围里 —— 修完之后 reload 的每一个数都等于 live 的那一个,
 * 一个都没有被「调整」过。
 */
import { describe, expect, it } from 'vitest';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { foldStrategyTaskTurns } from '../../../src/components/ChatPane';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { groupThinking, type ThoughtsGroup } from '../../../src/runtime/chat/group-thinking';
import { formatElapsed, formatShellElapsed } from '../../../src/runtime/chat/format';
import type { BuildTurnInput, ExecutionShell, ShellItem, TurnBlock } from '../../../src/runtime/chat/contract';
import fixture from '../../fixtures/chat/odnext-parchment.reload.json';

/** 历史接口返回的那一份:带 daemon join 进来的任务位置 → 会被折叠。 */
const RELOAD = fixture.messages as unknown as ChatMessage[];
/** live 手上的那一份:同样的行,但 SSE 链路从不写任务位置 → 不折叠。 */
const LIVE: ChatMessage[] = RELOAD.map((m) => {
  const rest = { ...(m as unknown as Record<string, unknown>) };
  delete rest['strategyTaskExecutionId'];
  delete rest['strategyTaskRunIndex'];
  return rest as unknown as ChatMessage;
});
const RUNS = LIVE.filter((m) => m.role === 'assistant');

function blocksOf(message: ChatMessage): TurnBlock[] {
  return buildTurnBlocks({
    events: (message.events ?? []) as PersistedAgentEvent[],
    runStatus: message.runStatus ?? 'succeeded',
    ...(message.createdAt != null ? { startedAtMs: message.createdAt } : {}),
    ...(message.endedAt != null ? { endedAtMs: message.endedAt } : {}),
  });
}

const shellsOf = (blocks: TurnBlock[]): ExecutionShell[] =>
  blocks.filter((b): b is ExecutionShell => b.kind === 'shell');

const foldedTurn = (): ChatMessage => {
  const folded = foldStrategyTaskTurns(RELOAD).filter((m) => m.role === 'assistant');
  expect(folded, '这条会话就是要折成一条').toHaveLength(1);
  return folded[0]!;
};

/** 一张壳里所有「思考过程」那一格 —— 顶层的,以及落在 todo 抽屉里的。 */
function thoughtsIn(items: readonly ShellItem[]): ThoughtsGroup[] {
  const out: ThoughtsGroup[] = [];
  for (const group of groupThinking(items as ShellItem[], false)) {
    if (group.kind === 'thoughts') out.push(group);
    else if (group.kind === 'todo') out.push(...thoughtsIn(group.segment.items));
  }
  return out;
}

/** 屏幕上那一行到底写了什么 —— 只看渲染出来的字,不看字段。 */
const headText = (shell: ExecutionShell): string | null => formatShellElapsed(shell.elapsedMs);

describe('OPEND-2823 · 折叠轮次里每张壳都要报得出耗时', () => {
  /**
   * 先证「量法看得见」:live 那三条各自都报得出耗时,而且就是库里那三个真实跨度。
   * 这一条绿是下面那条断言不空转的前提 —— 没见过绿的对照组,红读数说明不了问题。
   */
  it('对照组 · live 三个 run 各自报得出真实跨度', () => {
    const live = RUNS.map((run) => shellsOf(blocksOf(run)));
    expect(live.map((shells) => shells.length)).toEqual([1, 1, 1]);
    expect(live.map(([shell]) => shell!.elapsedMs)).toEqual([79_779, 159_066, 282_314]);
    expect(live.map(([shell]) => headText(shell!))).toEqual(['1m 20s', '2m 39s', '4m 42s']);
  });

  /**
   * 真正的不变量:**折叠是拼接,不是重算** —— 同一条会话,重新打开之后每张壳报的
   * 耗时必须和它自己在 live 时报的一模一样。
   *
   * 红的样子(`origin/main`):`['1m 20s','2m 39s','4m 42s']` → `[null, null, '1m 45s']`。
   * 前两张壳的「已完成」旁边一个数都没有,第三张还少报了整整三分钟。
   */
  it('重新打开之后,每张壳的耗时和 live 时逐字相同', () => {
    const liveHeads = RUNS.map((run) => headText(shellsOf(blocksOf(run))[0]!));
    const reloadHeads = shellsOf(blocksOf(foldedTurn())).map(headText);
    expect(reloadHeads).toEqual(liveHeads);
  });

  /**
   * 把这张单的原话钉死一遍:**有完整计时数据时,「已完成」旁边必须有耗时**。
   * 三个 run 在库里都带着自己的 `createdAt` / `endedAt`,数据是齐的。
   */
  it('数据齐全时没有一张壳是光秃秃的「已完成」', () => {
    for (const shell of shellsOf(blocksOf(foldedTurn()))) {
      expect(shell.status).toBe('done');
      expect(headText(shell), '「已完成」旁边不许没有耗时').not.toBeNull();
    }
  });
});

describe('OPEND-2824 · 卡头的总耗时不得小于卡里的阶段耗时', () => {
  /**
   * 提单人截图里的形状:「进行中 1m44s」下面挂着「思考过程 4m3s」。
   * 真机语料算出来的是 **1m 45s / 7m 2s** —— 同一个形状,数量级也对得上。
   *
   * 这里断言的是**渲染出来的那两行字**背后的同一对值:卡头 ≥ 卡里任何一格。
   */
  it('折叠轮次里,没有一格「思考过程」比它所在的卡头更大', () => {
    const shells = shellsOf(blocksOf(foldedTurn()));
    const offenders: string[] = [];
    for (const shell of shells) {
      for (const thoughts of thoughtsIn(shell.items)) {
        if (shell.elapsedMs == null || thoughts.elapsedMs == null) continue;
        if (thoughts.elapsedMs > shell.elapsedMs) {
          offenders.push(
            `卡头 ${formatShellElapsed(shell.elapsedMs)} < 思考过程 ${formatElapsed(thoughts.elapsedMs)}`,
          );
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  /**
   * 同一条不变量在**还在跑**的那一帧也要成立 —— 截图拍到的正是「进行中」那一档。
   * 折叠轮次里只有最后一个 run 可能还在跑,前面几个早已定死。
   */
  it('还在跑的那一帧同样成立', () => {
    const folded = foldedTurn();
    const shells = shellsOf(buildTurnBlocks({
      events: (folded.events ?? []) as PersistedAgentEvent[],
      runStatus: 'running',
      startedAtMs: folded.createdAt,
      nowMs: folded.endedAt! + 60_000,
    }));
    for (const shell of shells) {
      for (const thoughts of thoughtsIn(shell.items)) {
        if (shell.elapsedMs == null || thoughts.elapsedMs == null) continue;
        expect(
          thoughts.elapsedMs,
          `卡头 ${shell.elapsedMs}ms 装不下一格 ${thoughts.elapsedMs}ms 的思考`,
        ).toBeLessThanOrEqual(shell.elapsedMs);
      }
    }
  });

  /**
   * 一段推理**不许跨过 run 边界去认领时间**。
   *
   * run 2 那一格「思考过程」在 live 时是 2m 57s(它自己那个 run 里的空白);折叠之后
   * 变成 7m 2s —— 多出来的四分钟是 run 0、run 1 的时间,以及用户盯着表单想答案的
   * 那 6 秒。那不是模型在想,是别人的钟被读了进来。
   */
  /**
   * 同一条不变量的**另一条路**:一个 run 里 agent 发了 done、又开新计划接着干,
   * 于是卡外那段结论把执行记录切成两张卡(`applyTodoList` 的边界规则)。
   *
   * 第二张卡的表从**它自己第一件带时刻的事**开始走,而落在它头上的那段推理比这更早
   * (推理一个时刻都不带,只能靠它填掉的空白反推)。于是卡头 10s、卡里 4m ——
   * 和折叠轮次那一幕是同一个形状,只是这次一个 run 就够了,连折叠都不用。
   *
   * 这里不是「两个数分属不同范围」:那段空白从头到尾只有这一行推理占着,
   * 它就在这张卡里,卡的跨度本来就该覆盖它。
   */
  it('一个 run 里另起的第二张卡,卡头同样装得下卡里的推理', () => {
    const KEY = 'a7f3c91ed2b40561';
    const events: PersistedAgentEvent[] = [
      { kind: 'done_key', key: KEY },
      { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' }, startedAt: 1_000_100 },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: 1_010_000 },
      { kind: 'text', text: `<od-done key="${KEY}"></od-done>初版好了。` },
      // done 之后又开一份新计划继续干 —— 结论把记录切成两张卡
      { kind: 'tool_use', id: 'td', name: 'TodoWrite', input: { todos: [{ content: '继续做', status: 'in_progress' }] }, startedAt: 1_010_500 },
      { kind: 'thinking', text: '这一步要想很久。' },
      { kind: 'tool_use', id: 't2', name: 'Bash', input: { command: 'ls' }, startedAt: 1_250_000 },
      { kind: 'tool_result', toolUseId: 't2', content: 'ok', isError: false, completedAt: 1_255_000 },
    ];
    const shells = shellsOf(buildTurnBlocks({
      events, runStatus: 'succeeded', startedAtMs: 1_000_000, endedAtMs: 1_260_000,
    }));
    expect(shells, '这一例就是要切成两张卡').toHaveLength(2);
    const second = shells[1]!;
    const thoughts = thoughtsIn(second.items);
    // 先证语料真的造出了那一格思考 —— 没有它下面两条会空转
    expect(thoughts).toHaveLength(1);
    expect(thoughts[0]!.elapsedMs).toBe(239_500);
    expect(second.elapsedMs).not.toBeNull();
    expect(thoughts[0]!.elapsedMs!).toBeLessThanOrEqual(second.elapsedMs!);
    // 抽屉那一级同样要装得下(`TodoRow` 右边也挂着一个耗时)
    const todo = second.items.find((it) => it.kind === 'todo');
    expect(todo?.kind).toBe('todo');
    const segment = (todo as { segment: { elapsedMs: number | null } }).segment;
    expect(segment.elapsedMs).not.toBeNull();
    expect(thoughts[0]!.elapsedMs!).toBeLessThanOrEqual(segment.elapsedMs!);
  });

  it('推理的耗时不跨 run 边界 —— 折叠前后逐字相同', () => {
    const live = RUNS.flatMap((run) => shellsOf(blocksOf(run)).flatMap((s) => thoughtsIn(s.items)))
      .map((g) => g.elapsedMs);
    const reload = shellsOf(blocksOf(foldedTurn())).flatMap((s) => thoughtsIn(s.items))
      .map((g) => g.elapsedMs);
    // 先证指纹认得出东西 —— 全 null 的话下面那条会空转
    expect(live.filter((ms) => ms != null).length).toBeGreaterThan(0);
    expect(reload).toEqual(live);
  });
});

/**
 * 评审 #7921 指出的**另一半**:补上 run 边界之后,壳头**仍然**会去借别的 run 的钟。
 *
 * `shellElapsed` 拿不到这张壳自己的 `shellSpan` 时,起止会回落到 `firstStartedAt` /
 * `lastEndedAt` —— 那两个是**全轮共用**的,`closeRun()` 也不清它们。于是一个
 * 「只有 status / text、一个带时刻的事件都没有」的后继 run(澄清 run 的典型形态),
 * 它那张壳会捡起**前一个 run** 的工具时刻,再和自己的 run 边界取 min / max,
 * 把前一个 run 整段算进自己名下。
 *
 * 这和这个文件开头那两张单是同一个毛病(数字来自别的 run),只是触发条件换了:
 * 前面修掉的是「中间 run 没有数字」,这一条是「中间 run 的数字是别人的」。
 *
 * ⚠️ 那条兜底**任何时候都说不出正确答案**:这张壳没有自己的 `shellSpan`,而
 * `firstStartedAt` / `lastEndedAt` 只可能由**别的壳**盖出来(它们是全轮所有时刻的
 * min / max)。所以「回落到全轮时钟」在构造上等价于「借另一张卡的表」,不存在
 * 它恰好等于本张卡的情形。清掉它,让秒表只认这张壳自己的事件 + 它那个 run 的边界。
 */
describe('评审 #7921 · 壳头不许借别的 run 的时钟', () => {
  const K0 = 'c1d2e3f4a5b60718';
  const K1 = 'f7e6d5c4b3a29180';
  const TASK = 'task-borrowed-clock';

  /** run 0:正常干活,有带时刻的工具事件 —— 它就是被借的那口钟。 */
  const RUN0: ChatMessage = {
    id: 'run0', role: 'assistant', content: '',
    createdAt: 1_000_000, endedAt: 1_060_000, runStatus: 'succeeded',
    strategyTaskExecutionId: TASK, strategyTaskRunIndex: 0,
    events: [
      { kind: 'done_key', key: K0 },
      { kind: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' }, startedAt: 1_010_000 },
      { kind: 'tool_result', toolUseId: 't1', content: 'ok', isError: false, completedAt: 1_050_000 },
      { kind: 'text', text: `<od-done key="${K0}"></od-done>初版给你了,要哪个方向?` },
    ],
  } as unknown as ChatMessage;

  /**
   * run 1:**只有 status 和 text**,一个 `startedAt` / `completedAt` 都没有。
   * 中间隔着四分钟 —— 用户在读上一轮的产出、想怎么回话,那段时间没有任何模型在跑。
   *
   * 头一段正文留在壳里(done 之前的过程叙述),所以这张壳不是空壳、不会被 B47 丢掉;
   * 而它一条 thinking 都没有,所以也不会有推理把 `shellSpan` 撑出来 ——
   * 正是评审描述的那个形态。
   */
  const RUN1: ChatMessage = {
    id: 'run1', role: 'assistant', content: '',
    createdAt: 1_300_000, endedAt: 1_320_000, runStatus: 'succeeded',
    strategyTaskExecutionId: TASK, strategyTaskRunIndex: 1,
    events: [
      { kind: 'done_key', key: K1 },
      { kind: 'status', label: 'starting' },
      { kind: 'text', text: '先看看你的项目。' },
      { kind: 'text', text: `<od-done key="${K1}"></od-done>已经按第二个方向改好了。` },
    ],
  } as unknown as ChatMessage;

  const foldedPair = (): ChatMessage => {
    const folded = foldStrategyTaskTurns([RUN0, RUN1]).filter((m) => m.role === 'assistant');
    expect(folded, '两个 run 要折成一条').toHaveLength(1);
    return folded[0]!;
  };

  /** 先证语料真的造出了那个形态 —— 不然下面几条会空转。 */
  it('对照组 · run 1 确实一个带时刻的事件都没有', () => {
    const stamped = (RUN1.events ?? []).filter(
      (e) => (e as { startedAt?: number }).startedAt != null
        || (e as { completedAt?: number }).completedAt != null,
    );
    expect(stamped).toHaveLength(0);
    // 而 run 0 有 —— 它就是会被借走的那口钟
    expect((RUN0.events ?? []).some((e) => (e as { startedAt?: number }).startedAt != null)).toBe(true);
  });

  it('折叠之后,run 1 的壳头报的是它自己那 20 秒,不是从 run 0 开始的五分钟', () => {
    const shells = shellsOf(blocksOf(foldedPair()));
    expect(shells, '两个 run 各一张壳').toHaveLength(2);
    const second = shells[1]!;
    // 它自己的跨度:1_320_000 - 1_300_000
    expect(second.elapsedMs).toBe(20_000);
    expect(headText(second)).toBe('20s');
  });

  /**
   * 同一件事换个说法钉一遍:壳头**绝不能**把 run 之间那段没人在跑的时间算进来。
   * 红的时候这里是 310_000ms(从 run 0 的第一个工具一路量到 run 1 收尾)。
   */
  it('run 1 的壳头装不下 run 之间那段空白', () => {
    const shells = shellsOf(blocksOf(foldedPair()));
    const second = shells[1]!;
    const ownSpan = RUN1.endedAt! - RUN1.createdAt!;
    const sinceRun0 = RUN1.endedAt! - RUN0.createdAt!;
    expect(second.elapsedMs).not.toBeNull();
    expect(second.elapsedMs!).toBeLessThanOrEqual(ownSpan);
    expect(second.elapsedMs!, '把 run 0 也算进来了').toBeLessThan(sinceRun0);
  });

  /** 还是那条最强的锚:折叠出来的数字必须逐字等于它自己 live 时的数字。 */
  it('折叠前后逐字相同 —— 两张壳都是', () => {
    const live = [RUN0, RUN1].map((run) => headText(shellsOf(blocksOf(run))[0]!));
    const reload = shellsOf(blocksOf(foldedPair())).map(headText);
    expect(live).toEqual(['1m 0s', '20s']);
    expect(reload).toEqual(live);
  });
});

describe('反向锚点 · 真的没有计时数据时,展示规则保持一致', () => {
  /** 一个带时刻的事件都没有、轮次自己的起止也没有 —— 这时候「不知道」就是不知道。 */
  const NOTHING: PersistedAgentEvent[] = [
    { kind: 'status', label: 'starting' },
    { kind: 'thinking', text: '先看看要改哪里。' },
    { kind: 'text', text: '按你说的改好了。' },
  ];

  const build = (input: Partial<BuildTurnInput>): ExecutionShell[] =>
    shellsOf(buildTurnBlocks({ events: NOTHING, runStatus: 'succeeded', ...input }));

  it('两头都取不到:壳头不显示耗时,而不是编一个 0s,也不抛', () => {
    const shells = build({});
    expect(shells).toHaveLength(1);
    expect(shells[0]!.elapsedMs).toBeNull();
    expect(headText(shells[0]!)).toBeNull();
  });

  it('只缺一头也一样 —— 缺就是缺,不拿另一头顶上', () => {
    expect(headText(build({ startedAtMs: 1_000_000 })[0]!)).toBeNull();
    expect(headText(build({ endedAtMs: 1_042_000 })[0]!)).toBeNull();
  });

  it('两头都有就必须报出来 —— 同一批数据不许一会儿有一会儿没有', () => {
    expect(headText(build({ startedAtMs: 1_000_000, endedAtMs: 1_042_000 })[0]!)).toBe('42s');
  });
});
