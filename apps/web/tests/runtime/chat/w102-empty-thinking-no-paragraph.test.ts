import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell, TurnBlock } from '../../../src/runtime/chat/contract';

/*
 * W102(2026-09-03)· 界面侧的**反向对照**。
 *
 * daemon 那一头刚被改成「上游本来就是空串的思考帧照发」(`emitAgentEvent` 的
 * `strippingConsumedTheWholeFrame`)。这条测试钉住的是**为什么这么改是安全的**:
 * ba3e64ea69 当初把空帧整条扔掉,理由是「免得思考区多出一格空的『Thoughts』」——
 * 而那件事界面侧本来就有**两道**兜着,任何一道单独在都够用:
 *
 *     build-turn-blocks.ts   thinking 分支:if (!text.trim() && !cont) continue;
 *     build-turn-blocks.ts   pushInside: if (!text.trim()) return;
 *
 * (变异验证过:只拆一道仍然全绿,两道都拆掉「不渲染段落」那条立刻红成 `['']`。)
 *
 * 规格 W11 的两半在这里各占一句:
 *   前半句 —— `thinking_delta` 到达(**哪怕 delta 为空**)就进入思考中;
 *   后半句 —— **空 delta 不渲染段落**。
 *
 * 少了这条钉子,以后有人把那行 `continue` 删掉,daemon 侧的修复就会当场变成
 * 「思考区里一串空段落」,而 daemon 的测试一条都不会红。
 */

const thinking = (t = ''): PersistedAgentEvent => ({ kind: 'thinking', text: t });
const textEvent = (t: string): PersistedAgentEvent => ({ kind: 'text', text: t });

const shells = (blocks: TurnBlock[]): ExecutionShell[] =>
  blocks.filter((b): b is ExecutionShell => b.kind === 'shell');

/** 壳里所有文字条目 —— 段落就是从这里长出来的 */
function shellTexts(blocks: TurnBlock[]): string[] {
  const out: string[] = [];
  for (const shell of shells(blocks)) {
    for (const seg of shell.items) {
      if (seg.kind === 'text') out.push(seg.text);
      else if (seg.kind === 'todo') {
        for (const item of seg.segment.items) {
          if (item.kind === 'text') out.push(item.text);
        }
      }
    }
  }
  return out;
}

describe('W102 · 空 delta 进入「思考中」但不渲染段落(W11 两半)', () => {
  it('W11 前半:一串空串思考帧 —— 壳头进入「思考中」', () => {
    // claude 的真实形态:一轮扩展思考 20 条帧,delta 全是 ''
    const events = Array.from({ length: 20 }, () => thinking(''));
    const blocks = buildTurnBlocks({ events });
    expect(nthShell(blocks).thinking).toBe(true);
  });

  it('W11 后半:空串一条段落都不产生 —— 思考区不许多出空的 Thoughts', () => {
    const events = Array.from({ length: 20 }, () => thinking(''));
    const blocks = buildTurnBlocks({ events });
    // 20 条空帧,0 段文字。这就是 ba3e64ea69 想要的效果,而它由界面兜着,
    // 不需要 daemon 把帧整条扔掉。
    expect(shellTexts(blocks)).toEqual([]);
  });

  it('反向:非空的思考内容照旧成段', () => {
    const blocks = buildTurnBlocks({
      events: [thinking(''), thinking('先把目录看一遍。'), thinking('')],
    });
    expect(shellTexts(blocks)).toEqual(['先把目录看一遍。']);
    expect(nthShell(blocks).thinking).toBe(true);
  });

  it('反向:开口说话之后就不再是「思考中」', () => {
    const blocks = buildTurnBlocks({
      events: [thinking(''), thinking(''), textEvent('先看一下目录。')],
    });
    expect(nthShell(blocks).thinking).toBe(false);
  });
});

function nthShell(blocks: TurnBlock[]): ExecutionShell {
  const shell = shells(blocks)[0];
  if (!shell) throw new Error('本轮没有执行壳 —— 断言写错了');
  return shell;
}
