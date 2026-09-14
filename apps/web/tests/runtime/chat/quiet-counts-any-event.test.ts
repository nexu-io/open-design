/**
 * S12 的静默计时要认**任何一条事件**,不只是带时刻的那几条。
 *
 * 用户 2026-08-27:「这个是真的上游响应慢吗 还是我们的什么解析 bug 啊?」
 * 截图上「已等 86 秒」和总耗时 `1m 26s` **是同一个数** —— 这个相等本身就是判据:
 * 整轮没有任何一条事件被打上时刻,静默起点只能退回轮次开头。
 *
 * 真机数据(落盘 run `ab4779f8`):119 条 agent 事件,**只有 12 条带时刻**;
 * 其余 107 条是 thinking_delta / tool_input_delta / status —— claude 的推理增量
 * 一条时刻都不带。模型一直在吐字,界面却报「上游响应慢」。
 *
 * 所以判据换成客户端自己知道的**到达时刻**:`lastEventAtMs`。
 *
 * ⚠️ 这里测的是**纯函数怎么用这个入参**,不是它从哪来。喂它的人必须是传输层
 * (`providers/daemon.ts` → `runtime/chat/upstream-activity.ts`),不能是
 * 「事件条数变了没」—— 那把钥匙在流式期间根本不动,真机复现与四条 ablation
 * 见 `tests/components/chat/s12-upstream-alive.test.tsx`。
 * 「最近有没有东西落下来」是传输事实,不该依赖事件里那个大部分 agent 都不填的字段。
 * 带时刻的事件仍然优先(它更准),到达时刻只在它更晚时接手。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell } from '../../../src/runtime/chat/contract';

const T0 = 1_756_000_000_000;

function shellOf(input: Parameters<typeof buildTurnBlocks>[0]): ExecutionShell {
  const shell = buildTurnBlocks(input).find((b) => b.kind === 'shell');
  if (!shell) throw new Error('no shell');
  return shell as ExecutionShell;
}

/** 真机形状:claude 的推理增量,一条时刻都不带 */
const thinking = (): PersistedAgentEvent => ({ kind: 'thinking', text: '' } as PersistedAgentEvent);

describe('S12 静默计时认到达时刻', () => {
  it('整轮只有不带时刻的事件:静默从**最后一条到达**算,不是从轮次开头', () => {
    const shell = shellOf({
      events: [thinking(), thinking(), thinking()],
      runStatus: 'running',
      startedAtMs: T0,
      lastEventAtMs: T0 + 86_000,   // 1 秒前还在吐字
      nowMs: T0 + 87_000,
    });
    // 静默 1 秒,不是 87 秒
    expect(shell.quietMs).toBeLessThan(5_000);
  });

  it('不给到达时刻时按老规矩走 —— 不因为缺参数就把静默算没了', () => {
    const shell = shellOf({
      events: [thinking()],
      runStatus: 'running',
      startedAtMs: T0,
      nowMs: T0 + 87_000,
    });
    expect(shell.quietMs).toBeGreaterThan(80_000);
  });

  it('真的静默时照常报 —— 否则上面两条就是把 S12 关掉了', () => {
    const shell = shellOf({
      events: [thinking()],
      runStatus: 'running',
      startedAtMs: T0,
      lastEventAtMs: T0 + 2_000,    // 最后一条落在很早以前
      nowMs: T0 + 200_000,
    });
    expect(shell.quietMs).toBeGreaterThan(190_000);
  });

  it('带时刻的事件更晚时以它为准 —— 它比到达时刻准', () => {
    const events: PersistedAgentEvent[] = [
      { kind: 'tool_use', id: 't1', name: 'Read', input: {}, startedAt: T0 + 50_000 } as PersistedAgentEvent,
    ];
    const shell = shellOf({
      events,
      runStatus: 'running',
      startedAtMs: T0,
      lastEventAtMs: T0 + 10_000,   // 比事件时刻早
      nowMs: T0 + 60_000,
    });
    expect(shell.quietMs).toBeLessThan(15_000);
  });
});
