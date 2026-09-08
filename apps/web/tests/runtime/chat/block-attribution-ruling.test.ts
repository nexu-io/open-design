// @vitest-environment node
/**
 * 落块规则(2026-08-26 用户裁决的**最终版**,原话见 `specs/current/chat-panel-feedback.md` D 节)。
 *
 *   1. **done 之前:一切都在卡片里** —— 工具调用、普通正文、thinking 一律收进当前 sink
 *      (有 todo 就进当前那条 todo,没有就进壳)。
 *   2. **done 之后:只有正文出卡片**;之后若还有工具调用,仍然收进卡片 —— 它是过程不是回答。
 *   3. **卡片之间的边界由「卡外落过东西」决定,不由清单决定** —— 一轮正常跑完就是
 *      **一张**过程卡;只有 done 之后 agent 又开新计划继续干时,才在结论下面另起一张。
 *
 * 这一版推翻了同日早些时候的两条中间裁决,两条都由用户在真机上指认后撤销:
 *   · 「还没有 todo 时正文落壳外」—— 开场白因此排到了整张卡**之后**
 *     (`ensureShell` 在循环开头就把壳压进 `blocks` 了),还和 done 之后的结论粘成一段;
 *   · 「一出现 TodoWrite 就收起前一张、新开一张」—— 两张卡之间**永远不会有东西隔开**
 *     (卡外唯一会出现的是 done 之后的结论,而 TodoWrite 必然在 done 之前),
 *     产物一定是两张紧贴的卡:两个「已完成 + 秒数」的头,说的却是同一段连续过程。
 *     它还制造过两张卡头**显示同一个耗时**的坏画面(thinking 事件不带时刻)。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell, TurnBlock } from '../../../src/runtime/chat/contract';

const call = (id: string, name: string, input: unknown): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name, input },
  { kind: 'tool_result', toolUseId: id, content: 'ok', isError: false },
]);

const todos = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([content, status]) => ({ content, status })) } },
]);

const build = (events: PersistedAgentEvent[], runStatus: 'running' | 'succeeded' = 'running'): TurnBlock[] =>
  buildTurnBlocks({ events, runStatus, nowMs: 60_000 });

const shellsOf = (blocks: TurnBlock[]): ExecutionShell[] =>
  blocks.filter((b): b is ExecutionShell => b.kind === 'shell');

const proseOf = (blocks: TurnBlock[]): string[] =>
  blocks.filter((b) => b.kind === 'prose').map((b) => (b as { text: string }).text);

const shellTexts = (shell: ExecutionShell): string[] =>
  shell.items.filter((i) => i.kind === 'text').map((i) => (i as { text: string }).text);

const KEY = 'a7f3c91ed2b40561';
/** done 标记是**每轮一次性密钥**,夹具必须连 `done_key` 事件一起给,否则对不上 */
const doneWith = (tail: string): PersistedAgentEvent =>
  ({ kind: 'text', text: `<od-done key="${KEY}"/>\n${tail}` } as PersistedAgentEvent);

const withKey = (events: PersistedAgentEvent[]): PersistedAgentEvent[] =>
  [{ kind: 'done_key', key: KEY } as unknown as PersistedAgentEvent, ...events];

const textsInTodo = (shell: ExecutionShell, index: number): string[] =>
  (shell.segments[index]?.items ?? [])
    .filter((i) => i.kind === 'text').map((i) => (i as { text: string }).text);

describe('规则 1 · done 之前:一切都在卡片里', () => {
  const events: PersistedAgentEvent[] = [
    { kind: 'thinking', text: '先看一眼两张图的栅格。' },
    ...call('t1', 'Read', { file_path: '首页.png' }),
    { kind: 'text', text: '两页都好了,商品卡已经抽成共享组件。' },
  ];

  it('普通正文也在卡片里 —— 壳外一条都没有', () => {
    expect(proseOf(build(events))).toEqual([]);
    expect(shellTexts(shellsOf(build(events))[0]!))
      .toContain('两页都好了,商品卡已经抽成共享组件。');
  });

  it('thinking 与工具调用同样在卡片里,顺序不乱', () => {
    const shell = shellsOf(build(events))[0]!;
    expect(shell.items.map((i) => i.kind)).toEqual(['text', 'tool', 'text']);
  });

  it('这句在建清单**之前**说 → 它排在清单前面,而不是整张卡之后', () => {
    const shell = shellsOf(build([
      { kind: 'text', text: '我会严格按 4 步执行。' },
      ...todos('p1', [['第一步', 'in_progress']]),
    ]))[0]!;
    expect(shell.items.map((i) => i.kind)).toEqual(['text', 'plan', 'todo']);
  });
});

describe('规则 2 · 清单不另起一张卡', () => {
  const events: PersistedAgentEvent[] = [
    ...call('t1', 'Read', { file_path: '首页.png' }),
    { kind: 'text', text: '看完了,开始动手。' },
    ...todos('p1', [['复刻列表页', 'in_progress'], ['抽出商品卡', 'pending']]),
    ...call('t2', 'Write', { file_path: 'a.html', content: 'x' }),
  ];

  it('干过的活和清单在**同一张卡**里 —— 不出现两张紧贴的卡', () => {
    const shells = shellsOf(build(events));
    expect(shells).toHaveLength(1);
    expect(shellTexts(shells[0]!)).toContain('看完了,开始动手。');
    expect(shells[0]!.segments.map((s) => s.content))
      .toEqual(['复刻列表页', '抽出商品卡']);
  });

  it('done 之后又开一份新计划继续干 → 这时才另起一张,落在结论**下面**', () => {
    const blocks = buildTurnBlocks({
      events: withKey([
        ...todos('a', [['第一份计划', 'completed']]),
        doneWith('先答到这儿。'),
        ...todos('b', [['另一份计划', 'in_progress']]),
        ...call('t2', 'Bash', { command: 'ls' }),
      ]),
      runStatus: 'succeeded',
      nowMs: 60_000,
    });
    expect(blocks.map((b) => b.kind)).toEqual(['shell', 'prose', 'shell']);
  });
});

describe('规则 3 · 有 todo 之后,连正文也进当前那条 todo', () => {
  const events: PersistedAgentEvent[] = [
    ...todos('p1', [['复刻列表页', 'in_progress'], ['抽出商品卡', 'pending']]),
    ...call('t1', 'Write', { file_path: 'a.html', content: 'x' }),
    { kind: 'text', text: '列表页写完了,接着抽卡。' },
  ];

  it('正文不在壳外', () => {
    expect(proseOf(build(events))).not.toContain('列表页写完了,接着抽卡。');
  });

  it('正文落在进行中的那条 todo 里', () => {
    const card = shellsOf(build(events)).at(-1)!;
    const idx = card.segments.findIndex((s) => s.status === 'in_progress');
    expect(idx).toBeGreaterThanOrEqual(0);
    expect(textsInTodo(card, idx)).toContain('列表页写完了,接着抽卡。');
  });
});

describe('规则 4 · done 之后:只有正文出卡片', () => {
  it('结论落在壳外,工具调用仍然进壳', () => {
    const blocks = buildTurnBlocks({
      events: withKey([
        ...todos('p1', [['一步', 'completed']]),
        doneWith('结论在这儿。'),
        ...call('t9', 'Bash', { command: 'git status' }),
      ]),
      runStatus: 'succeeded',
      nowMs: 60_000,
    });
    expect(proseOf(blocks)).toEqual(['结论在这儿。']);
    const tools = shellsOf(blocks).flatMap((s) => [
      ...s.items.filter((i) => i.kind === 'tool'),
      ...s.segments.flatMap((seg) => seg.items.filter((i) => i.kind === 'tool')),
    ]);
    expect(tools).toHaveLength(1);
  });

  it('开场白和结论各自成块,不粘成一段', () => {
    const blocks = buildTurnBlocks({
      events: withKey([
        { kind: 'text', text: '我会严格按 4 步执行。' },
        ...todos('p1', [['一步', 'completed']]),
        doneWith('当前目录仅包含设计文件。'),
      ]),
      runStatus: 'succeeded',
      nowMs: 60_000,
    });
    expect(blocks.map((b) => b.kind)).toEqual(['shell', 'prose']);
    expect(proseOf(blocks)).toEqual(['当前目录仅包含设计文件。']);
    expect(shellTexts(shellsOf(blocks)[0]!)).toEqual(['我会严格按 4 步执行。']);
  });
});
