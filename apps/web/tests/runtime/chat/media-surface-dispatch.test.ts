/**
 * OPEND-2625:音频 / 视频生成被画成生图。
 *
 * 用户看见的缺口(Beta 0.21.1-beta.7,Media generation 项目,音频模型
 * `minimax-tts`、视频模型 `vela/doubao-seedance-2-0-260128`):不管生成的是
 * 音频还是视频,执行记录上写的都是 `Generating illustrations · 1 images`,
 * 音频那一条还挂着一枚破图缩略图。
 *
 * 事实在后端**是有的** —— daemon 的 `media_tasks` 如实记了 `surface`,
 * `/api/projects/:id/media/tasks` 也逐字回传(`routes/media.ts:1278`),
 * 命令行自己还带着 `--surface audio`(`cli.ts:1838`,这个 flag 是必填的)。
 * 丢的是**落行这一层**:`ImageRow` 契约里根本没有承载媒体类型的字段,
 * 三个构造点(`pendingMediaBatchRow` / `readImageCall` 的两条路)把
 * `task.surface` 原地扔掉,渲染层于是只剩「图片」一种可讲。
 *
 * 判据落在这一层而不是组件层:组件拿到的是行,行上没有类型,组件再聪明也编不出来。
 *
 * 产品原则(用户 2026-09-04 口述):「我们不应该矫正 agent 自己的什么行为,
 * 我们 UI 就是把它行为观测到展示出来」—— 把音频画成图片,是替 agent
 * 说了它没说过的话。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent, ProjectMediaTask } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell, ImageRow, ShellItem } from '../../../src/runtime/chat/contract';

function firstShell(blocks: ReturnType<typeof buildTurnBlocks>): ExecutionShell {
  const shell = blocks.filter((b): b is ExecutionShell => b.kind === 'shell')[0];
  if (!shell) throw new Error('没有执行壳');
  return shell;
}
function images(items: ShellItem[]): ImageRow[] {
  return items.filter((i): i is ImageRow => i.kind === 'image');
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

/*
 * 夹具照 `PersistedAgentEvent` 的真实形状写,**不用 `as` 压过去** ——
 * 压过一次就再也看不出「结果事件的键是 `toolUseId` 不是 `id`」这种错,
 * 单测全绿而真机毫无变化。
 */
const bash = (id: string, command: string): PersistedAgentEvent =>
  ({ kind: 'tool_use', id, name: 'Bash', input: { command }, startedAt: 100 });

const bashResult = (toolUseId: string, content: string): PersistedAgentEvent =>
  ({ kind: 'tool_result', toolUseId, content, isError: false, completedAt: 5000 });

describe('OPEND-2625 · 媒体行要如实报出它是哪一类', () => {
  it('轮询先到的音频批:行上写的是 audio,不是 image', () => {
    const blocks = buildTurnBlocks({
      events: [],
      mediaTasks: [
        task({ taskId: 'a1', surface: 'audio', batchId: 'b1', batchIndex: 1, batchSize: 1 }),
      ],
      runStatus: 'running',
    });
    const row = images(firstShell(blocks).items)[0];
    expect(row).toBeTruthy();
    expect(row!.surface).toBe('audio');
  });

  it('轮询先到的视频批:行上写的是 video', () => {
    const blocks = buildTurnBlocks({
      events: [],
      mediaTasks: [
        task({ taskId: 'v1', surface: 'video', batchId: 'b1', batchIndex: 1, batchSize: 1 }),
      ],
      runStatus: 'running',
    });
    expect(images(firstShell(blocks).items)[0]?.surface).toBe('video');
  });

  it('terminal tool_use 结算的音频批:任务上的 surface 是权威', () => {
    const blocks = buildTurnBlocks({
      events: [
        bash('t1', 'od media generate --surface audio --model minimax-tts --prompt "读一段"'),
        bashResult('t1', '{"status":"done","file":{"name":"line.mp3"}}'),
      ],
      mediaTasks: [
        task({
          taskId: 'a1',
          surface: 'audio',
          batchId: 'b1',
          batchIndex: 1,
          batchSize: 1,
          status: 'done',
          endedAt: 4000,
          file: { name: 'line.mp3', mime: 'audio/mpeg' },
        }),
      ],
      runStatus: 'succeeded',
    });
    const row = images(firstShell(blocks).items)[0];
    expect(row).toBeTruthy();
    expect(row!.surface).toBe('audio');
  });

  it('一条任务都还没轮询到:命令行上的 --surface 就是证据', () => {
    const blocks = buildTurnBlocks({
      events: [
        bash('t1', 'od media generate --surface video --model vela/doubao-seedance-2-0-260128 --prompt "一段镜头"'),
        bashResult('t1', '{"status":"done","file":{"name":"shot.mp4"}}'),
      ],
      mediaTasks: [],
      runStatus: 'succeeded',
    });
    const row = images(firstShell(blocks).items)[0];
    expect(row).toBeTruthy();
    expect(row!.surface).toBe('video');
  });

  /**
   * 音视频放进来之后新出现的那个状态,当场钉死。
   *
   * daemon 的批本来就按类型分(`media/task-batches.ts` 的 `batchKey` 带 `surface`),
   * 而落行游标靠「从当前位置连着同一个 `batchId`」认边界。三类任务混进**一条**
   * 全局队列之后,一次生图和一次生音频并行在飞时,排序后的列表里两批是交错的 ——
   * 游标撞到第一条异类任务就停,那一批剩下的格子被永远落在游标前面。
   *
   * 判据:两批各自拿满自己的任务。分桶(`mediaQueues` / `mediaCursors`)撤掉之后
   * 这条必红。
   */
  it('两类批并行在飞、任务交错到达:各自那一批一格都不许丢', () => {
    const blocks = buildTurnBlocks({
      events: [
        bash('t1', 'od media generate --surface image --count 2 --model gpt-image-2 --prompt "两张封面"'),
        bashResult('t1', '{"status":"done"}'),
        bash('t2', 'od media generate --surface audio --count 2 --model minimax-tts --prompt "两段旁白"'),
        bashResult('t2', '{"status":"done"}'),
      ],
      // 交错:图 → 音 → 图 → 音,正是两批并行时轮询看到的顺序
      mediaTasks: [
        task({ taskId: 'i1', surface: 'image', batchId: 'bi', batchIndex: 1, batchSize: 2, status: 'done', startedAt: 100, sequence: 1, endedAt: 3000, file: { name: 'a.png' } }),
        task({ taskId: 'a1', surface: 'audio', batchId: 'ba', batchIndex: 1, batchSize: 2, status: 'done', startedAt: 110, sequence: 2, endedAt: 3100, file: { name: 'a.mp3' } }),
        task({ taskId: 'i2', surface: 'image', batchId: 'bi', batchIndex: 2, batchSize: 2, status: 'done', startedAt: 120, sequence: 3, endedAt: 3200, file: { name: 'b.png' } }),
        task({ taskId: 'a2', surface: 'audio', batchId: 'ba', batchIndex: 2, batchSize: 2, status: 'done', startedAt: 130, sequence: 4, endedAt: 3300, file: { name: 'b.mp3' } }),
      ],
      runStatus: 'succeeded',
    });
    const rows = images(firstShell(blocks).items);
    expect(rows.map((r) => r.surface)).toEqual(['image', 'audio']);
    expect(rows.map((r) => r.cells?.map((c) => c.taskId))).toEqual([
      ['i1', 'i2'],
      ['a1', 'a2'],
    ]);
    expect(rows.map((r) => [r.total, r.done, r.failed])).toEqual([[2, 2, 0], [2, 2, 0]]);
  });

  it('两次不同类型的连续调用不许合成一行 —— 合了就有一半在说谎', () => {
    const blocks = buildTurnBlocks({
      events: [
        bash('t1', 'od media generate --surface image --model gpt-image-2 --prompt "一张封面"'),
        bashResult('t1', '{"status":"done","file":{"name":"cover.png"}}'),
        bash('t2', 'od media generate --surface audio --model minimax-tts --prompt "读一段"'),
        bashResult('t2', '{"status":"done","file":{"name":"line.mp3"}}'),
      ],
      mediaTasks: [],
      runStatus: 'succeeded',
    });
    const rows = images(firstShell(blocks).items);
    expect(rows.map((r) => r.surface)).toEqual(['image', 'audio']);
  });
});
