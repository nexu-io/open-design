/**
 * OPEND-2195:一次「生成配套插图」是**一行 N/M**,不是 N 行各一格。
 *
 * 用户看见的缺口:并行发三个生图任务,轮询先于 terminal `tool_use` 到达时,
 * 聊天里画出来的是**三行**,每行一个绿球一格 —— 而它们是同一个动作的三张图。
 * 「1/3」这个进度因此根本无处可写。
 *
 * 修法不是在前端猜:daemon 现在按「同 runId + 同 surface + 生命周期有重叠」把任务
 * 分好组,每条任务自带 `batchId` / `batchIndex`(N)/ `batchSize`(M)。前端只负责
 * **照着分组画**:
 *   · 有 `batchId`  → 同一批合成一行,格子按 `batchIndex - 1` 就位,总数取 `batchSize`
 *   · 没有 `batchId`→ 生产方没分组,当成一批一个(**不许猜**),行为和以前一模一样
 *
 * ⚠️ 别在测试里假设一定有 N>1:真实 AMR/ACP 有可能把 shell 调用串行化,那样每批就是 1。
 * 一批一个必须也画对 —— 下面有专门的反向对照。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent, ProjectMediaTask } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell, ImageRow, ShellItem } from '../../../src/runtime/chat/contract';

function shells(blocks: ReturnType<typeof buildTurnBlocks>): ExecutionShell[] {
  return blocks.filter((b): b is ExecutionShell => b.kind === 'shell');
}
function images(items: ShellItem[]): ImageRow[] {
  return items.filter((i): i is ImageRow => i.kind === 'image');
}
function firstShell(blocks: ReturnType<typeof buildTurnBlocks>): ExecutionShell {
  const shell = shells(blocks)[0];
  if (!shell) throw new Error('没有执行壳');
  return shell;
}

const task = (over: Partial<ProjectMediaTask> & { taskId: string }): ProjectMediaTask => ({
  runId: 'run',
  surface: 'image',
  status: 'running',
  startedAt: 100,
  endedAt: null,
  elapsed: 0,
  progress: [],
  progressCount: 0,
  ...over,
});

const bash = (id: string, command: string): PersistedAgentEvent =>
  ({ kind: 'tool_use', id, name: 'Bash', input: { command } } as PersistedAgentEvent);

describe('轮询先到时:同一批合成一行', () => {
  it('三个并行任务是一行三格,不是三行', () => {
    const blocks = buildTurnBlocks({
      events: [],
      mediaTasks: [
        task({ taskId: 'm1', batchId: 'b1', batchIndex: 1, batchSize: 3, startedAt: 100 }),
        task({ taskId: 'm2', batchId: 'b1', batchIndex: 2, batchSize: 3, startedAt: 100, sequence: 2 }),
        task({ taskId: 'm3', batchId: 'b1', batchIndex: 3, batchSize: 3, startedAt: 100, sequence: 3 }),
      ],
      runStatus: 'running',
    });
    const rows = images(firstShell(blocks).items);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.id).toBe('media-batch:b1');
    expect([row.total, row.done, row.failed, row.pending]).toEqual([3, 0, 0, true]);
    expect(row.cells).toEqual([
      { taskId: 'm1', status: 'pending' },
      { taskId: 'm2', status: 'pending' },
      { taskId: 'm3', status: 'pending' },
    ]);
  });

  it('批还开着时,M 就是当前的 batchSize,没到的格子先空着', () => {
    const blocks = buildTurnBlocks({
      events: [],
      mediaTasks: [
        task({ taskId: 'm1', batchId: 'b1', batchIndex: 1, batchSize: 3 }),
        task({ taskId: 'm2', batchId: 'b1', batchIndex: 2, batchSize: 3 }),
      ],
      runStatus: 'running',
    });
    const row = images(firstShell(blocks).items)[0]!;
    expect(row.total).toBe(3);
    expect(row.cells).toEqual([
      { taskId: 'm1', status: 'pending' },
      { taskId: 'm2', status: 'pending' },
      { status: 'pending' },
    ]);
  });

  it('格子按 batchIndex 就位 —— 到达顺序反了也不换位', () => {
    const blocks = buildTurnBlocks({
      events: [],
      mediaTasks: [
        // 后到的是第 1 格
        task({ taskId: 'late', batchId: 'b1', batchIndex: 1, batchSize: 2, startedAt: 300 }),
        task({ taskId: 'early', batchId: 'b1', batchIndex: 2, batchSize: 2, startedAt: 100 }),
      ],
      runStatus: 'running',
    });
    const row = images(firstShell(blocks).items)[0]!;
    expect(row.cells?.map((c) => c.taskId)).toEqual(['late', 'early']);
  });

  it('反向对照:生产方没分组时照旧一任务一行 —— 不许拿时间猜出一个批', () => {
    const blocks = buildTurnBlocks({
      events: [],
      mediaTasks: [
        task({ taskId: 'm1', startedAt: 100 }),
        task({ taskId: 'm2', startedAt: 101 }),
      ],
      runStatus: 'running',
    });
    const rows = images(firstShell(blocks).items);
    expect(rows.map((r) => [r.id, r.total])).toEqual([
      ['media-task:m1', 1],
      ['media-task:m2', 1],
    ]);
  });

  it('反向对照:串行化的真机里每批就是 1 —— 一行一格,照样对', () => {
    const blocks = buildTurnBlocks({
      events: [],
      mediaTasks: [task({ taskId: 'm1', batchId: 'b1', batchIndex: 1, batchSize: 1 })],
      runStatus: 'running',
    });
    const rows = images(firstShell(blocks).items);
    expect(rows).toHaveLength(1);
    expect([rows[0]!.id, rows[0]!.total]).toEqual(['media-batch:b1', 1]);
  });
});

describe('tool_use 到达后:M 认 batchSize,不认命令行里数出来的次数', () => {
  it('一条命令只写了一次 generate,批里有三张,就画三格', () => {
    const blocks = buildTurnBlocks({
      events: [bash('g1', 'od media generate --count 3')],
      mediaTasks: [
        task({ taskId: 'm1', batchId: 'b1', batchIndex: 1, batchSize: 3, status: 'done', endedAt: 400, file: { name: 'a.png' } }),
        task({ taskId: 'm2', batchId: 'b1', batchIndex: 2, batchSize: 3 }),
      ],
      runStatus: 'running',
    });
    const row = images(firstShell(blocks).items)[0]!;
    expect(row.total).toBe(3);
    expect(row.cells).toEqual([
      { taskId: 'm1', status: 'done', path: 'a.png' },
      { taskId: 'm2', status: 'pending' },
      { status: 'pending' },
    ]);
    // 失败格重排后仍保住自己的坐标:重试用的 index 就是 batchIndex - 1
    expect(row.done).toBe(1);
  });

  it('`--help` 不再偷走下一次真实调用的任务', () => {
    /*
     * 潜伏 bug:`mediaCallCount` 靠正则数 `media generate`,`--help` 也算一次,
     * 于是位置游标往前推了一格;而 `readImageCall` 又把 `--help` 拒掉。
     * 结果这一格任务被静默吃掉 —— 真正那次调用拿到空 slice,画不出格子。
     */
    const blocks = buildTurnBlocks({
      events: [
        bash('h1', 'od media generate --help'),
        bash('g1', 'od media generate a'),
      ],
      mediaTasks: [task({ taskId: 'm1', batchId: 'b1', batchIndex: 1, batchSize: 1 })],
      runStatus: 'running',
    });
    const rows = images(firstShell(blocks).items);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.cells).toEqual([{ taskId: 'm1', status: 'pending' }]);
  });
});
