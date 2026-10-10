// @vitest-environment jsdom
/**
 * 一个 OD Next 逻辑任务重新打开之后,**每个物理 run 仍然各是各的**。
 *
 * ## 这条 bug 是怎么被看见的
 *
 * 用户在打包 beta `0.21.1-beta.7`(`95f96ea0e6`)上跑完一轮「先问后做」,
 * **去设置页再回来**,整条转录就乱了。原话:
 *
 *   「我发现不是切换模型导致的, 是去设置页再回来, 整个轮次或排版就乱了」
 *
 * 乱的具体形态:上一轮那张已回答表单的「已确认」收口,跑到了**当前轮**里,
 * 和最后一轮的回答黏成一段;两个「思考过程」挨在一起。
 *
 * ## 为什么只有「回来」之后才乱
 *
 * `strategyTaskRunIndex` **只有历史接口会给**(`routes/project/conversations.ts`
 * 把 `strategy_task_runs` join 进每条消息);live 的 SSE 链路一处都没有写过它。
 * 于是:
 *
 *  · 跑的时候 —— 字段缺席,`foldStrategyTaskTurns` 第一行就原样返回,三个 run
 *    是三条独立助手消息,各自过一遍 `buildTurnBlocks`,各自一张壳一段结论;
 *  · 离开再回来 —— 重新拉历史,字段有了,三条消息折成**一条**,事件首尾相接成
 *    一条扁平流。而 `buildTurnBlocks` 不认识 run 边界:整条流只有**一个** done 闩
 *    (`doneSeen`)、**一个** done 密钥(`readRunDoneKey` 取第一枚)、**一张**壳。
 *    run 0 末尾那张 `<question-form>` 触发隐式 done,此后所有 run 的正文都被
 *    `pushProse` 续写进**同一个** prose 块,所有 run 的工具与推理都堆进**第一张**壳。
 *
 * 折叠是**视图层的拼接**(`foldStrategyTaskTurns` 的原话:fold into ONE
 * conversation turn),不该是重新分组。所以判据写成一条等式:
 *
 *   **折起来那一条算出的块序 === 三个 run 各自算出的块序首尾相接**
 *
 * 语料是真机那一条会话的**原始字节**(`fixtures/chat/odnext-parchment.reload.json`,
 * 直接从用户库里的 `messages` 行导出,一个字没改),不是照着形状重打的夹具。
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import type { ChatMessage, PersistedAgentEvent } from '@open-design/contracts';
import { I18nProvider } from '../../../src/i18n';
import { AssistantMessage } from '../../../src/components/AssistantMessage';
import { foldStrategyTaskTurns } from '../../../src/components/ChatPane';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell, TurnBlock } from '../../../src/runtime/chat/contract';
import fixture from '../../fixtures/chat/odnext-parchment.reload.json';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

/** 历史接口返回的那一份:带 daemon join 进来的任务位置。 */
const RELOAD = fixture.messages as unknown as ChatMessage[];
/** live 手上的那一份:同样的行,但没有任务位置 —— SSE 链路从不写这两个字段。 */
const LIVE: ChatMessage[] = RELOAD.map((m) => {
  const rest = { ...(m as unknown as Record<string, unknown>) };
  delete rest['strategyTaskExecutionId'];
  delete rest['strategyTaskRunIndex'];
  return rest as unknown as ChatMessage;
});
const RUNS = RELOAD.filter((m) => m.role === 'assistant');
const ANSWERS = RELOAD.find((m) => m.id === 'qf-answer-1evzhmzxrw45i-user')!.content;

/**
 * 一条块序的**形状**。
 *
 * 不比对逐字内容(耗时、壳 id 这些本来就该随折叠变),只比对
 * 「第几块是壳还是结论、壳里装了几行什么、结论是哪一个 run 说的话」——
 * 也就是用户在屏幕上看得见的编排。
 */
function signature(blocks: TurnBlock[]): string[] {
  return blocks.map((b) => {
    if (b.kind === 'shell') {
      const shell = b as ExecutionShell;
      const items = shell.items.map((it) => (it.kind === 'text' && it.thinking ? 'think' : it.kind));
      return `shell(${items.join(',')})`;
    }
    return `prose(${runTag((b as { text: string }).text)})`;
  });
}

/** 这段话是哪个 run 说的 —— 各取一句本 run 独有的原文当指纹。 */
function runTag(text: string): string {
  const tags: string[] = [];
  if (text.includes('推荐答案：')) tags.push('run0');
  if (text.includes('方向定了：')) tags.push('run1');
  if (text.includes('已写好，双击即可打开')) tags.push('run2');
  return tags.length ? tags.join('+') : '?';
}

function blocksOf(message: ChatMessage): TurnBlock[] {
  return buildTurnBlocks({
    events: (message.events ?? []) as PersistedAgentEvent[],
    runStatus: 'succeeded',
    ...(message.createdAt != null ? { startedAtMs: message.createdAt } : {}),
    ...(message.endedAt != null ? { endedAtMs: message.endedAt } : {}),
  });
}

describe('OD Next 折叠轮次 · run 边界(真机库字节)', () => {
  it('live 与重新打开是同一份编排:折起来 === 三个 run 首尾相接', () => {
    // live:字段缺席 → 不折叠,三条消息各自成轮
    expect(foldStrategyTaskTurns(LIVE)).toBe(LIVE);
    const liveSignature = RUNS.flatMap((run) => signature(blocksOf(run)));

    // 重新打开:历史接口带上任务位置 → 折成一条
    const folded = foldStrategyTaskTurns(RELOAD).filter((m) => m.role === 'assistant');
    expect(folded).toHaveLength(1);
    const reloadSignature = signature(blocksOf(folded[0]!));

    expect(reloadSignature).toEqual(liveSignature);
  });

  it('没有任何一段结论同时装着两个 run 的话', () => {
    const folded = foldStrategyTaskTurns(RELOAD).find((m) => m.role === 'assistant')!;
    const prose = blocksOf(folded)
      .filter((b) => b.kind === 'prose')
      .map((b) => runTag((b as { text: string }).text));
    // 先证指纹认得出来 —— 全是 '?' 的话下面那条断言会空转
    expect(prose).not.toHaveLength(0);
    expect(prose).not.toContain('?');
    expect(prose.filter((tag) => tag.includes('+'))).toEqual([]);
  });

  it('每个 run 一张执行壳,run 1 的推理不和 run 2 的工具堆在一起', () => {
    const folded = foldStrategyTaskTurns(RELOAD).find((m) => m.role === 'assistant')!;
    const shells = blocksOf(folded).filter((b): b is ExecutionShell => b.kind === 'shell');
    expect(shells).toHaveLength(RUNS.length);
    // run 2 的两次 Bash 必须落在 run 2 自己那张壳里,而不是 run 0 开的第一张
    expect(shells[0]!.items.some((it) => it.kind === 'tool')).toBe(false);
  });

  /**
   * 折叠轮次里,**只有最后一个 run 可能还在跑**。
   *
   * 前面几个 run 早就结束了(有后继就是证据),它们的壳必须就地定死:
   * 状态转「已完成」、不再跟着 `nowMs` 转圈。不定死的话,用户回到一条还在跑的
   * 折叠轮次上会看到三张壳一起转 —— 正是这个文件反复警告的「永远停在 running」。
   *
   * 同时钉住秒数的归属:最后那张壳只报**它自己**跑了多久,不能把前面几个 run
   * 的时间也算进去(表从轮次开头开始走的是**整轮第一张**壳,不是当前这一张)。
   */
  it('还在跑的折叠轮次:先跑完的 run 的壳已定死,秒数不越界', () => {
    const folded = foldStrategyTaskTurns(RELOAD).find((m) => m.role === 'assistant')!;
    const turnSpanMs = folded.endedAt! - folded.createdAt!;
    const shells = buildTurnBlocks({
      events: (folded.events ?? []) as PersistedAgentEvent[],
      runStatus: 'running',
      startedAtMs: folded.createdAt,
      nowMs: folded.endedAt! + 60_000,
    }).filter((b): b is ExecutionShell => b.kind === 'shell');

    expect(shells).toHaveLength(RUNS.length);
    expect(shells.slice(0, -1).map((s) => s.status)).toEqual(['done', 'done']);
    // 定死的壳不报静默 —— 静默是「这一刻还在等」,它们已经不等了
    expect(shells.slice(0, -1).every((s) => s.quietMs === null)).toBe(true);
    const last = shells[shells.length - 1]!;
    expect(last.status).toBe('running');
    // 最后这一张只算它自己那一截;把表拨回轮次开头就会 >= 整轮跨度
    expect(last.elapsedMs).not.toBeNull();
    expect(last.elapsedMs!).toBeLessThan(turnSpanMs);
  });

  it('屏幕上:run 0 的壳 → 已确认 → run 1 的壳,而不是「已确认 + 全部回答」黏成一段', () => {
    const folded = foldStrategyTaskTurns(RELOAD).find((m) => m.role === 'assistant')!;
    const { container } = render(
      <I18nProvider initial="zh-CN">
        <AssistantMessage message={folded} streaming={false} nextUserContent={ANSWERS} />
      </I18nProvider>,
    );
    const flow = container.querySelector<HTMLElement>('.assistant-flow')!;
    for (const shell of flow.querySelectorAll<HTMLDetailsElement>(':scope > details')) {
      const summary = shell.querySelector<HTMLElement>(':scope > summary');
      if (summary) fireEvent.click(summary);
    }
    const order = [...flow.children]
      .map((el) => {
        if (el.tagName === 'DETAILS') {
          const text = el.textContent ?? '';
          if (text.includes('视觉签名我已经锁定')) return 'shell:run0';
          if (text.includes('index.html')) return 'shell:run2';
          return 'shell:run1';
        }
        if (el.querySelector('[data-testid="question-form-summary"]')) return 'answered+prose';
        if (el.classList.contains('prose-block')) return `prose:${runTag(el.textContent ?? '')}`;
        return null;
      })
      .filter((tag): tag is string => tag !== null);

    // 「已确认」那一块只能带 run 0 自己那句「推荐答案」,不能把 run 1 / run 2 的回答也吞进来
    const answeredBlock = [...flow.querySelectorAll('.prose-block')]
      .find((el) => el.querySelector('[data-testid="question-form-summary"]'))!;
    expect(runTag(answeredBlock.textContent ?? '')).toBe('run0');

    expect(order).toEqual([
      'shell:run0',
      'answered+prose',
      'shell:run1',
      'prose:run1',
      'shell:run2',
      'prose:run2',
    ]);
  });
});
