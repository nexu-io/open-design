// @vitest-environment node
/**
 * 红测:**思考那一格右边要有它自己的耗时**。
 *
 * 用户 2026-08-27 真机指认三连:
 *   「thought 是不是本身右边也要显示一个耗时? 为啥 todo 外的一个耗时都没显示?」
 *   「todo 内的倒是每个工具调用都有耗时, thought 也要有耗时」
 *
 * ── 怎么算 ────────────────────────────────────────────────────────────
 *
 * thinking 事件**一个时刻都不带**:daemon 那边的载荷就是
 * `{ type: 'thinking_delta', delta }`,`PersistedAgentEvent` 里也只有
 * `{ kind: 'thinking'; text }`。所以「量它自己」这条路根本不存在,能观测到的只有
 * **它填掉了哪一段空白** —— 上一件带时刻的事结束到下一件带时刻的事开始。
 *
 * 三条边界:
 *  · 开头那一段:上一件事不存在时,起点是**轮次开头**(`startedAtMs`);
 *  · 收尾那一段:下一件事不存在时,终点是**轮次收尾**(`endedAtMs`);还在跑就不结账;
 *  · 空白里**不止它一个**(中间落过正文 / 工具行)时:一个数都不给。
 *    那段空白是几件事分掉的,分给谁都是编(§2.2b「拿不到就不显示,不估算」)。
 *
 * ── 跨事件合并 ────────────────────────────────────────────────────────
 *
 * `groupThinking` 会把**连续的几段推理**收成一格 —— 中间隔着的是**不落行**的事件
 * (最典型的是 `TodoWrite`:它只改清单,壳里不留行)。每一段各记各的空白,而相邻两段
 * 的空白**共用同一个时刻端点**(那个 TodoWrite 的 `startedAt` 既是前一段的终点、
 * 也是后一段的起点),所以相加正好等于端到端跨度:不重复计、也不漏掉夹在中间那一瞬。
 *
 * ── ToolSearch 那一行不是 bug ─────────────────────────────────────────
 *
 * 用户截图里顶层那行 `ToolSearch` 也没有耗时。查真实数据:那次调用
 * `startedAt=1787828745434` / `completedAt=1787828745473`,**39ms** ——
 * 低于 `UNKNOWN_ELAPSED_BELOW_MS`,是「调用与结果同批到达」的那一档,
 * 按 §2.2b 本来就该不显示。那一行是对的,底下的 `ToolSearch 那一行` 用例把它钉住。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { groupThinking, type ThoughtsGroup } from '../../../src/runtime/chat/group-thinking';
import { formatElapsed, UNKNOWN_ELAPSED_BELOW_MS } from '../../../src/runtime/chat/format';
import type { BuildTurnInput, ExecutionShell, ToolRow } from '../../../src/runtime/chat/contract';
import thinkingHeavy from '../../fixtures/chat/thinking-heavy.turn0.json';

const sole = (input: BuildTurnInput): ExecutionShell => {
  const shells = buildTurnBlocks(input).filter((b): b is ExecutionShell => b.kind === 'shell');
  expect(shells.length, '这几例都该只有一张壳').toBe(1);
  return shells[0]!;
};

/** 壳顶层收拢之后的那几格思考 */
const thoughtsOf = (shell: ExecutionShell): ThoughtsGroup[] =>
  groupThinking(shell.items, false).filter((g): g is ThoughtsGroup => g.kind === 'thoughts');

/** 同一份清单发第 N 次:原地更新,壳里不新增行 —— 前后两段推理因此挨在一起 */
const todos = (id: string, startedAt?: number): PersistedAgentEvent => ({
  kind: 'tool_use',
  id,
  name: 'TodoWrite',
  input: { todos: [{ content: '做第一件事', status: 'in_progress' }] },
  ...(startedAt != null ? { startedAt } : {}),
});

const call = (
  id: string,
  startedAt: number,
  completedAt: number,
): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'Bash', input: { command: 'ls' }, startedAt },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false, completedAt },
]);

describe('思考那一格的耗时 · 它填掉的那段空白', () => {
  it('开头那一段:轮次开头 → 第一个工具开跑', () => {
    const shell = sole({
      events: [
        { kind: 'thinking', text: '先想清楚要动哪几个文件。' },
        ...call('t1', 1_030_000, 1_031_000),
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_040_000,
    });
    expect(thoughtsOf(shell).map((g) => g.elapsedMs)).toEqual([30_000]);
    expect(formatElapsed(thoughtsOf(shell)[0]!.elapsedMs)).toBe('30.0s');
  });

  it('中间那一段:上一次调用**结束** → 下一次调用开跑', () => {
    const shell = sole({
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '看完了,再想想。' },
        ...call('t2', 1_009_500, 1_010_000),
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_020_000,
    });
    expect(thoughtsOf(shell).map((g) => g.elapsedMs)).toEqual([7_500]);
  });

  it('收尾那一段:最后一次调用结束 → 轮次收尾', () => {
    const shell = sole({
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '想想还差什么。' },
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_020_000,
    });
    expect(thoughtsOf(shell).map((g) => g.elapsedMs)).toEqual([18_000]);
  });

  /**
   * 还在跑的时候**也结账**,终点换成「现在」(产品 2026-09-02,有意偏离设计稿)。
   *
   * 这一条原来断言的是 `[null]`,依据是稿子「进行中的行不挂耗时」。产品推翻了它的
   * 前提 —— 真实数据里有单轮思考 28.5 分钟的案例,那半小时里执行记录上一个数字都没有。
   * 完整因果在 `build-turn-blocks.ts` 的 `liveEndMs` 注释与
   * `tests/runtime/chat/live-row-elapsed.test.ts`。
   *
   * 关键是**同一个表达式**:收尾那一段的终点在跑着的时候是 `nowMs`、停了是 `endedAtMs`,
   * 上一条用例(`收尾那一段:最后一次调用结束 → 轮次收尾`)和这一条只差这一个终点。
   */
  it('轮次还在跑:收尾那一段结算到「现在」', () => {
    const shell = sole({
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '还在想…' },
      ],
      runStatus: 'running',
      startedAtMs: 1_000_000,
      nowMs: 1_020_000,
    });
    expect(thoughtsOf(shell).map((g) => g.elapsedMs)).toEqual([18_000]);
  });

  /** 反向对照:没有「现在」可用(历史消息重渲染)时仍然不编数 */
  it('轮次还在跑但拿不到 `nowMs`:一个数都不给', () => {
    const shell = sole({
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '还在想…' },
      ],
      runStatus: 'running',
      startedAtMs: 1_000_000,
    });
    expect(thoughtsOf(shell).map((g) => g.elapsedMs)).toEqual([null]);
  });

  /** 反向对照:空白里不止它一个 —— 中间那段正文也占了时间,谁都说不清占了多少 */
  it('推理和正文分掉同一段空白时,谁都不给数', () => {
    const shell = sole({
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '想一下。' },
        { kind: 'text', text: '我先说一句。' },
        ...call('t2', 1_030_000, 1_031_000),
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_040_000,
    });
    expect(thoughtsOf(shell).map((g) => g.elapsedMs)).toEqual([null]);
  });

  /** 反向对照:不到 100ms 的空白是「同一批到达」,不是「想得快」 */
  it('空白不到 100ms:当作不知道,不显示', () => {
    const shell = sole({
      events: [
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '嗯。' },
        ...call('t2', 1_002_039, 1_003_000),
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_010_000,
    });
    expect(39).toBeLessThan(UNKNOWN_ELAPSED_BELOW_MS);
    expect(thoughtsOf(shell).map((g) => g.elapsedMs)).toEqual([null]);
  });

  /**
   * 跨事件合并:两段推理中间只隔着一次 `TodoWrite`(它不落行,所以收成同一格),
   * 报的是**端到端**那一条,不是两截各报一次、也不是漏掉中间那一瞬。
   */
  it('几段推理收成一格时:相加 = 端到端,一秒不多一秒不少', () => {
    const shell = sole({
      events: [
        todos('p0', 1_000_000),
        ...call('t1', 1_000_000, 1_002_000),
        { kind: 'thinking', text: '先想第一件。' },
        // 同一份清单再发一次 → 原地更新,壳里不新增任何一行,前后两段推理因此相邻
        todos('p1', 1_006_000),
        { kind: 'thinking', text: '再想第二件。' },
        ...call('t2', 1_012_000, 1_013_000),
      ],
      runStatus: 'succeeded',
      startedAtMs: 1_000_000,
      endedAtMs: 1_020_000,
    });
    const cells = groupThinking(shell.segments[0]!.items, false)
      .filter((g): g is ThoughtsGroup => g.kind === 'thoughts');
    expect(cells.length, '两段推理收成一格').toBe(1);
    expect(cells[0]!.texts.length, '这一格里确实是两段').toBe(2);
    // 1_002_000 → 1_006_000 (4s) 加 1_006_000 → 1_012_000 (6s) = 端到端 10s
    expect(cells[0]!.elapsedMs).toBe(10_000);
  });

  it('一格里有一段算不出来时,整格不给数 —— 只加算得出的那几段是偏小的假数', () => {
    const shell = sole({
      events: [
        // 这一条不带时刻(清单事件常常没有),所以开头那一段推理的起点无从谈起
        todos('p0'),
        { kind: 'thinking', text: '开头这一段没有起点。' },
        todos('p1', 1_006_000),
        { kind: 'thinking', text: '这一段算得出来。' },
        ...call('t2', 1_012_000, 1_013_000),
      ],
      runStatus: 'succeeded',
      // 故意不给 startedAtMs:开头那一段的起点因此未知
      endedAtMs: 1_020_000,
    });
    const cells = groupThinking(shell.segments[0]!.items, false)
      .filter((g): g is ThoughtsGroup => g.kind === 'thoughts');
    expect(cells.length).toBe(1);
    expect(cells[0]!.texts.length).toBe(2);
    expect(cells[0]!.elapsedMs).toBeNull();
  });
});

/**
 * 真实回放 —— 用户截图那一轮(`.od/runs/4347efff-…`)。
 * 认得出来是因为清单那两条抽屉的耗时逐字对上了截图:`1m 46s` / `1m 11s`。
 */
describe('真实一轮回放 · 截图里那三行顶层条目', () => {
  const f = thinkingHeavy as unknown as BuildTurnInput & { startedAtMs: number; endedAtMs: number };
  const shell = sole({
    events: f.events,
    runStatus: 'succeeded',
    startedAtMs: f.startedAtMs,
    endedAtMs: f.endedAtMs,
  });
  const top = groupThinking(shell.items, false);

  it('顶层就是截图那三行:思考 / ToolSearch / 思考', () => {
    expect(top.slice(0, 3).map((g) => (g.kind === 'tool' ? g.name : g.kind)))
      .toEqual(['thoughts', 'ToolSearch', 'thoughts']);
  });

  it('两格思考各自报出自己的耗时(截图里两格都是空的)', () => {
    const cells = top.filter((g): g is ThoughtsGroup => g.kind === 'thoughts');
    expect(cells.map((g) => formatElapsed(g.elapsedMs))).toEqual(['2m 34s', '4.0s']);
  });

  /**
   * **`ToolSearch` 那一行没有耗时不是 bug**,是 39ms 低于门槛 ——
   * 真实数据 `startedAt=1787828745434` / `completedAt=1787828745473`。
   */
  it('ToolSearch 那一行照旧不显示 —— 39ms 是「同一批到达」不是「跑得快」', () => {
    const search = top.find((g): g is ToolRow => g.kind === 'tool' && g.name === 'ToolSearch');
    expect(search, '截图里那一行').toBeTruthy();
    expect(search!.elapsedMs).toBeNull();
    expect(formatElapsed(search!.elapsedMs)).toBeNull();
  });

  it('清单抽屉里夹在工具行中间的每一格思考也都有耗时了', () => {
    const drawer = shell.segments.find((s) => s.content === '交付前自检');
    expect(drawer, '截图三那只抽屉').toBeTruthy();
    const inner = groupThinking(drawer!.items, false)
      .filter((g): g is ThoughtsGroup => g.kind === 'thoughts');
    expect(inner.length, '截图里这只抽屉夹着好几格思考').toBeGreaterThan(3);
    expect(inner.every((g) => g.elapsedMs != null), '截图里它们全是空的').toBe(true);
    expect(inner.map((g) => formatElapsed(g.elapsedMs)))
      .toEqual(['5.4s', '4.3s', '42.8s', '7.0s', '8.9s']);
  });
});
