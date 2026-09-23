/**
 * OPEND-2419:**调用一发出就落行,不等它回来。**
 *
 * 真因不是「进行中的行没有耗时」,是**进行中的行根本不存在**:
 *   `buildToolRow` 开头一句 `if (!result) return null`(D3:「调用没回来就不落行」)。
 * 于是那个卡在 4KB/s 的维基图片下载,整整 14.1 分钟在界面上一个字都没有 ——
 * 用户看到的就是「转了 40 分钟什么都没出来」。
 *
 * 产品口径(2026-09-02)比补一个 pending 态更大:
 *   「执行中的工具调用要不要渲染成行 —— 肯定要啊,调用时不管成功没,都要立刻渲染,
 *     所有状态啥的东西都要尽快反应在界面上,不然用户会吐槽卡住了啥的」
 * 也就是**状态一产生就上屏**,别等落定。D3 那句作废,原因记在 `buildToolRow` 里。
 *
 * 词汇和生图那条已有的进行中路径**统一**:同一个 `pending` 字段,同一枚
 * `StatusMark status="running"`,不另起一套(`ImageRow` 早就是这么写的)。
 *
 * ⚠️ 这里只钉**数据**。「跑完了没停下来的那一行长什么样」是渲染判据,
 * 在 `tests/components/chat/tool-row-running.test.tsx` 里钉。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell, ToolRow, TurnBlock } from '../../../src/runtime/chat/contract';

const shells = (blocks: TurnBlock[]): ExecutionShell[] =>
  blocks.filter((b): b is ExecutionShell => b.kind === 'shell');
const tools = (items: readonly { kind: string }[]): ToolRow[] =>
  items.filter((i): i is ToolRow => i.kind === 'tool');

function rowsOf(events: PersistedAgentEvent[], runStatus?: 'succeeded' | 'failed' | 'canceled'): ToolRow[] {
  const blocks = buildTurnBlocks(runStatus ? { events, runStatus } : { events });
  const shell = shells(blocks)[0];
  return shell ? tools(shell.items) : [];
}

const use = (id: string, name = 'Read', input: unknown = { file_path: 'a.ts' }): PersistedAgentEvent =>
  ({ kind: 'tool_use', id, name, input, startedAt: 1_000 } as PersistedAgentEvent);
const result = (id: string, opts: { isError?: boolean; content?: string } = {}): PersistedAgentEvent =>
  ({
    kind: 'tool_result', toolUseId: id, content: opts.content ?? 'ok',
    isError: Boolean(opts.isError), completedAt: 4_000,
  } as PersistedAgentEvent);

describe('调用一发出就落行', () => {
  it('有 tool_use、还没有 result —— 行就在,状态是进行中,耗时是 null', () => {
    const rows = rowsOf([use('t1')]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe('t1');
    expect(row.pending).toBe(true);
    expect(row.failed).toBe(false);
    // 还没跑完就没有耗时可报 —— 不估算(§2.2b),稿子也把进行中那格的 `.ms` 留空
    expect(row.elapsedMs).toBeNull();
    // 从入参就能算出来的东西**立刻**给,不等 result:这正是「状态一产生就上屏」
    expect(row.title.length).toBeGreaterThan(0);
    expect(row.tool).toBe('read');
  });

  it('result 到达:还是**同一行**换状态,不是再多出一行', () => {
    const before = rowsOf([use('t1')]);
    const after = rowsOf([use('t1'), result('t1')]);
    expect(before).toHaveLength(1);
    expect(after).toHaveLength(1);
    // 行的身份是 tool_use id —— 换状态不换行
    expect(after[0]!.id).toBe(before[0]!.id);
    expect(after[0]!.pending).toBe(false);
    expect(after[0]!.failed).toBe(false);
    expect(after[0]!.elapsedMs).toBe(3_000);
  });

  it('失败的 result 立刻显示失败,不再等别的什么', () => {
    const rows = rowsOf([use('t1', 'Bash', { command: 'npm run build' }), result('t1', { isError: true, content: 'boom' })]);
    expect(rows).toHaveLength(1);
    expect([rows[0]!.pending, rows[0]!.failed]).toEqual([false, true]);
  });

  it('多个在飞的调用各自落各自的行,顺序就是发出的顺序', () => {
    const rows = rowsOf([use('t1'), use('t2', 'Grep', { pattern: 'foo' }), result('t1')]);
    expect(rows.map((r) => [r.id, r.pending])).toEqual([['t1', false], ['t2', true]]);
  });

  it('历史回放:旧会话每条调用都有 result —— 行数一条不多', () => {
    /*
     * 这一条守的是「新逻辑不会给旧数据凭空多画一行」。旧会话里 tool_use 和
     * tool_result 成对出现,`pending` 全是 false,行数必须和从前一模一样。
     */
    const rows = rowsOf([
      use('t1'), result('t1'),
      use('t2', 'Grep', { pattern: 'foo' }), result('t2'),
      use('t3', 'Bash', { command: 'ls' }), result('t3'),
    ], 'succeeded');
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => r.pending === false)).toBe(true);
  });

  it('同一个 id 的 result 重复到达也不会分裂成两行', () => {
    // daemon 侧曾经重复派发过同一条 tool_use / tool_result(见 `dedupeToolUsesById`)
    const rows = rowsOf([use('t1'), result('t1'), result('t1')]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.pending).toBe(false);
  });

  it('取消掉的那一轮:没回来的调用仍然留着行,而且**不报成功**', () => {
    const rows = rowsOf([use('t1'), use('t2')], 'canceled');
    expect(rows).toHaveLength(2);
    // 数据层如实记「它没回来」;渲染成中性灰而不是转圈,由组件按轮次状态定
    expect(rows.every((r) => r.pending === true)).toBe(true);
    expect(rows.every((r) => r.failed === false)).toBe(true);
  });
});
