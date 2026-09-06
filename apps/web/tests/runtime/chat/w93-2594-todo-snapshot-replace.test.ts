/**
 * W93 验证用红测 —— OPEND-2594
 * 「Todo 快照未正确替换,导致任务数量及卡片内外执行顺序不一致」
 *
 * 场景照抄票上的三张截图(Website Clone,agent 把一条粗步骤拆成三条重发):
 *   快照 1(8 条):… Build the local clone / Remove tracking… / Final compare…
 *   快照 2(9 条):… Build local mirror…(in_progress)/ Strip tracking… / Serve locally… / Final compare…
 * 两份快照在 6 条内容上重合 → 走「部分重叠」那一支。
 *
 * 「卡片外」= 输入框上方那枚药丸 + 悬停浮层,它读**最新那份快照**(`planPillState`);
 * 「卡片内」= 执行记录壳里那一列 todo 行,它读 `buildTurnBlocks` 的结果。
 * 票说的两件事就是这两边对不上:
 *   ① 数量  —— 药丸说 9 条,壳里排出 11 条
 *   ② 顺序  —— 药丸说「第 6 步」,壳里当前那条排在第 9 位
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import { planPillState } from '../../../src/runtime/chat/plan-pill';
import type { ExecutionShell, TodoSegment, TurnBlock } from '../../../src/runtime/chat/contract';

/** 真实记录的形状(取自生产库 `messages.events_json`:只有 tool_use,没有 tool_result) */
const todoWrite = (
  id: string,
  startedAt: number,
  todos: Array<[string, 'pending' | 'in_progress' | 'completed']>,
): PersistedAgentEvent => ({
  kind: 'tool_use',
  id,
  name: 'TodoWrite',
  startedAt,
  input: { todos: todos.map(([content, status]) => ({ content, status })) },
} as PersistedAgentEvent);

const INIT = 'Init clone scaffold (NOTES.md, RECON/)';
const SEARCH = 'Search GitHub for real source of open-design.ai';
const RECON = 'Recon the original site (CDP probe + screenshots)';
const HARVEST = 'Harvest fonts/images/assets to local';
const ASSESS = 'Assess complexity (L1-L6) and pick fidelity path';
const OLD_BUILD = 'Build the local clone';
const OLD_STRIP = 'Remove tracking + write NOTES.md + verify in browser';
const FINAL = 'Final compare/audit + deliver';
const NEW_BUILD = 'Build local mirror: rewrite refs to assets/, localize fonts/enhancers/manifest/videos';
const NEW_STRIP = 'Strip tracking (GA/PostHog/RUM/attribution) + write NOTES.md';
const NEW_SERVE = 'Serve locally + real-browser verify + screenshot compare';

/** 最新那份快照 —— 药丸(卡片外)看到的就是它 */
const LATEST: Array<[string, 'pending' | 'in_progress' | 'completed']> = [
  [INIT, 'completed'],
  [SEARCH, 'completed'],
  [RECON, 'completed'],
  [HARVEST, 'completed'],
  [ASSESS, 'completed'],
  [NEW_BUILD, 'in_progress'],
  [NEW_STRIP, 'pending'],
  [NEW_SERVE, 'pending'],
  [FINAL, 'pending'],
];

const EVENTS: PersistedAgentEvent[] = [
  todoWrite('turn_plan_1', 1_000, [
    [INIT, 'completed'],
    [SEARCH, 'completed'],
    [RECON, 'completed'],
    [HARVEST, 'completed'],
    [ASSESS, 'in_progress'],
    [OLD_BUILD, 'pending'],
    [OLD_STRIP, 'pending'],
    [FINAL, 'pending'],
  ]),
  todoWrite('turn_plan_2', 2_000, LATEST),
];

const shells = (blocks: TurnBlock[]): ExecutionShell[] =>
  blocks.filter((b): b is ExecutionShell => b.kind === 'shell');

/** 壳里那一列 todo 行,按文档序 */
function transcriptRows(blocks: TurnBlock[]): TodoSegment[] {
  const shell = shells(blocks)[0];
  if (!shell) throw new Error('没有壳');
  return shell.items
    .filter((i): i is { kind: 'todo'; segment: TodoSegment } => i.kind === 'todo')
    .map((i) => i.segment);
}

describe('OPEND-2594 · 替换式 todo 快照:卡片内外要说同一件事', () => {
  const blocks = buildTurnBlocks({ events: EVENTS, runStatus: 'running' });
  const pill = planPillState(
    LATEST.map(([content, status]) => ({ content, status })),
    true,
  );
  if (!pill) throw new Error('药丸没出来,夹具不对');

  /** 还算数的行 —— 作废(划线)的不参与计数与排序 */
  const live = transcriptRows(blocks).filter((s) => !s.abandoned);

  it('先证夹具能看见缺陷:药丸确实说「第 6 / 9 步」', () => {
    expect(pill.total).toBe(9);
    expect(pill.current).toBe(6);
  });

  it('① 数量:壳里还算数的 todo 行数 === 药丸的总步数', () => {
    expect(live.map((s) => s.content)).toEqual(LATEST.map(([content]) => content));
  });

  it('② 顺序:当前那条在壳里排第几 === 药丸说的第几步', () => {
    const currentIndex = live.findIndex((s) => s.status === 'in_progress');
    expect(currentIndex + 1).toBe(pill.current);
  });

  /*
   * 作废走 D14 那一档:`abandoned` 置真(`isStruck` 认它 → 划线),
   * 只有 `in_progress` 才顺手转完成态。所以判据是 `abandoned`,不是 status。
   */
  it('被拆掉的两条不再冒充「未开始」——划线作废,或干脆不在行里', () => {
    const rows = transcriptRows(blocks);
    for (const dropped of [OLD_BUILD, OLD_STRIP]) {
      const row = rows.find((s) => s.content === dropped);
      if (!row) continue;
      expect({ content: dropped, abandoned: row.abandoned })
        .toEqual({ content: dropped, abandoned: true });
    }
  });
});
