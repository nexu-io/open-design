import { describe, expect, it } from 'vitest';

import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';

/**
 * 红测(W17,2026-09-02):**执行记录壳内**的文字也要剥评审剧场语法。
 *
 * web 侧本来是有这道兜底的 —— `stripCritiqueGrammar` 挂在 `AssistantMessage` 的
 * `ProseBlock` 上,专门收拾"已经落了库、daemon 那道来不及"的旧对话。
 *
 * 但聊天面板重构之后,**过程叙述从壳外搬进了壳内**(thinking、done 之前的叙述都进了
 * `ExecutionShell`),而兜底还留在壳外那条路上。壳内两个渲染组件
 * (`primitives/SayText.tsx` 和 `chat/ThinkingMarkdown.tsx`)都是拿原文直接渲染,
 * 中间没有任何剥离 —— 等于兜底盖住的是重构之后几乎没内容的那一半。
 *
 * 更要命的是壳内两个组件都把文本交给 React 渲染(自动转义),标记会**原样显示**。
 * 所以"用户能看见原样标签"这件事本身,就说明泄漏在壳内。
 * (2026-09-03 起 `SayText` 也走 markdown 了 —— 但 `renderMarkdown` 同样不碰
 *  `dangerouslySetInnerHTML`,未知标签照旧当文本显示,这道兜底一点没变得多余。)
 *
 * 修在 `buildTurnBlocks` 的入口而不是两个组件里:壳内壳外的文字**同源**
 * (`AssistantMessage` 的结论段也是 `buildTurnBlocks` 算出来的),一处收口两条 lane
 * 都盖住,以后再多一个渲染组件也不会漏。
 */

/** 逐字取自用户现场 */
const LEAK = [
  '<ROUND index="1">',
  '<PANELIST role="Designer">',
  'PROSE_A 这句人话必须留着。',
  '</PANELIST>',
  '<ROUND_END decision="revise" composite="8.3" openMustFix="3"/>',
  'PROSE_B 收尾也必须留着。',
].join('\n');

/** 标签名写死,不从实现里 import —— 复用等于拿实现当判据 */
const GRAMMAR_RE = /<\/?(?:CRITIQUE_RUN|ROUND|ROUND_END|PANELIST|SHIP|MUST_FIX|RESOLVED)(?=[\s/>])/u;

/** 把整棵块树里所有字符串摊平,不放过任何一个渲染得到的角落 */
function allText(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) for (const v of value) allText(v, out);
  else if (value && typeof value === 'object') {
    for (const v of Object.values(value as Record<string, unknown>)) allText(v, out);
  }
  return out;
}

function textOf(blocks: unknown): string {
  return allText(blocks).join('\n');
}

describe('执行记录壳内的剧场语法兜底', () => {
  it('thinking 事件:标记不许留,标记之间的人话要留', () => {
    const blocks = buildTurnBlocks({
      events: [{ kind: 'thinking', text: LEAK }],
      runStatus: 'succeeded',
    });
    const text = textOf(blocks);
    expect(text).not.toMatch(GRAMMAR_RE);
    expect(text).toContain('PROSE_A 这句人话必须留着。');
    expect(text).toContain('PROSE_B 收尾也必须留着。');
  });

  it('text 事件(壳内叙述 / 壳外结论同源):同样不许留', () => {
    const blocks = buildTurnBlocks({
      events: [{ kind: 'text', text: LEAK }],
      runStatus: 'succeeded',
    });
    const text = textOf(blocks);
    expect(text).not.toMatch(GRAMMAR_RE);
    expect(text).toContain('PROSE_A 这句人话必须留着。');
  });

  it('被切成多条事件时,拼起来照样不许留', () => {
    // 落库的是一条条 delta,重开会话时按顺序回放 —— 剥离不能依赖"一次拿到整段"
    const blocks = buildTurnBlocks({
      events: LEAK.split('\n').map((line) => ({ kind: 'thinking', text: `${line}\n` })),
      runStatus: 'succeeded',
    });
    const text = textOf(blocks);
    expect(text).not.toMatch(GRAMMAR_RE);
    expect(text).toContain('PROSE_A 这句人话必须留着。');
  });

  /*
   * 正面对照 —— 防的是"凡是尖括号一律删掉"这种糊弄式修法。
   * 没有这一条,把剥离换成 `/<[^>]*>/g` 也能让上面几条变绿。
   */
  it('长得像但不是的东西不动它', () => {
    const innocent = '这是 <PANELISTS> 和 <ROUNDABOUT>,还有 <div>,以及 5 < 7。';
    const blocks = buildTurnBlocks({
      events: [{ kind: 'thinking', text: innocent }],
      runStatus: 'succeeded',
    });
    expect(textOf(blocks)).toContain(innocent);
  });

  it('没有剧场语法时,事件数组原样传下去(不做无谓的拷贝)', () => {
    const events = [{ kind: 'text' as const, text: '普通的一段话。' }];
    const blocks = buildTurnBlocks({ events, runStatus: 'succeeded' });
    expect(textOf(blocks)).toContain('普通的一段话。');
    // 入参不许被就地改写 —— 调用方还拿着同一个数组
    expect(events[0]?.text).toBe('普通的一段话。');
  });
});
