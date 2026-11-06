// @vitest-environment node
/**
 * 红测:done 标记**不能被正文伪造**。
 *
 * 背景(2026-08-26 核实):
 *  · `<done/>` 在产品的提示词里**根本没教过** —— 全仓库只有设计模拟器里有。
 *    所以任何一次匹配,按定义都是内容里碰巧出现的,不是 agent 在报信号。
 *  · 判据是 `/<done\s*\/?>/i`,大小写不敏感、零上下文防护。
 *  · 隐式 done(`<artifact` / `<question-form`)同理 —— agent 只要在正文里
 *    **提到**这个标签名,后面的正文就被整段甩到壳外。
 *
 * 仓库里已经有 `computeSkipRanges`(跳过围栏代码块与行内代码),产物剥离器一直在用。
 */
import { describe, expect, it } from 'vitest';
import type { PersistedAgentEvent } from '@open-design/contracts';
import { buildTurnBlocks } from '../../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell } from '../../../src/runtime/chat/contract';

const todos = (id: string, items: Array<[string, string]>): PersistedAgentEvent[] => ([
  { kind: 'tool_use', id, name: 'TodoWrite', input: { todos: items.map(([c, s]) => ({ content: c, status: s })) } },
]);

/** 有清单时正文进「当前 todo」;done 一到就跳出 todo。用它判断标记有没有被当成信号 */
function textLandedOutsideTodo(text: string): boolean {
  const blocks = buildTurnBlocks({
    events: [
      ...todos('p1', [['做第一件事', 'in_progress']]),
      { kind: 'text', text },
    ],
    runStatus: 'running',
  });
  return blocks.some((b) => b.kind === 'prose');
}

describe('done 标记不能被正文伪造', () => {
  it('围栏代码块里的 `<done/>` 不算信号', () => {
    expect(textLandedOutsideTodo('这样写:\n```html\n<done/>\n```\n继续。')).toBe(false);
  });

  it('行内代码里的 `<done/>` 不算信号', () => {
    expect(textLandedOutsideTodo('这个标记写作 `<done/>`,别手打。')).toBe(false);
  });

  it('围栏代码块里的 `<artifact>` 不算隐式 done', () => {
    expect(textLandedOutsideTodo('例子:\n```html\n<artifact type="html">x</artifact>\n```\n就这样。')).toBe(false);
  });

  it('行内代码里的 `<question-form>` 不算隐式 done', () => {
    expect(textLandedOutsideTodo('用 `<question-form>` 来发问。')).toBe(false);
  });

  it('真的在正文里裸写时仍然认(不改变既有行为)', () => {
    expect(textLandedOutsideTodo('<done/>这是结论。')).toBe(true);
  });

  it('真的产物块仍然算隐式 done', () => {
    expect(textLandedOutsideTodo('<artifact type="html">…')).toBe(true);
  });
});
