// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBufferedTextUpdates } from '../../src/components/ProjectView';
import { buildTurnBlocks } from '../../src/runtime/chat/build-turn-blocks';
import type { ExecutionShell, TurnBlock } from '../../src/runtime/chat/contract';
import type { ChatMessage } from '../../src/types';

/*
 * W102(2026-09-03)· **第二道丢失点,在 web 这一层**。
 *
 * daemon 那一头刚修好:`emitAgentEvent` 不再把「上游本来就是空串」的思考帧扔掉,
 * 真机实测同一条 prompt 从 0 帧变成 5 帧到达 SSE。
 *
 * 但那些帧到了客户端还要再过一道:
 *
 *     ProjectView.tsx  appendBufferedAgentDeltas(events, textDelta, thinkingDelta)
 *                      if (thinkingDelta) { …appendCoalescedAgentEvent… }
 *
 * claude 的每一条 `ev.text` 都是 `''`,攒起来还是 `''`,falsy —— 于是**一条
 * `{ kind: 'thinking' }` 都不会进 `message.events`**。而壳头的「思考中」
 * (`buildTurnBlocks` 的 `shell.thinking`)**只**认这种事件:`thinking_start`
 * 翻成 `{ kind: 'status', label: 'thinking' }`,而 status 在 `buildTurnBlocks`
 * 里只用来开壳,自身不落行、也不点亮「思考中」。
 *
 * 结论:只修 daemon,直播时那一格照样永远是 false —— 用户看到的还是几分钟空白。
 * 规格 W11 前半句(「`thinking_delta` 到达**哪怕 delta 为空**就进入思考中」)
 * 要求这条链路端到端成立,不是只成立到 daemon 出口为止。
 *
 * 这条测试驱动的是**真实的流式缓冲**(`createBufferedTextUpdates`,直播那条路
 * 逐字走它),不是构造好的 events 数组 —— 否则测的就不是这个缺陷。
 */

const shells = (blocks: TurnBlock[]): ExecutionShell[] =>
  blocks.filter((b): b is ExecutionShell => b.kind === 'shell');

describe('W102 · 空思考帧要一路走到 message.events(否则「思考中」永远不亮)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('claude 的一串空串思考帧过完流式缓冲后,壳头进入「思考中」', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = { events: [] } as unknown as ChatMessage;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
    });

    // 真机形态:`thinking_start` 之后一串 delta 全是空串
    buf.appendEvent({ kind: 'status', label: 'thinking' });
    for (let i = 0; i < 5; i += 1) buf.appendEvent({ kind: 'thinking', text: '' });
    buf.flush();
    buf.cancel();

    const blocks = buildTurnBlocks({ events: msg.events ?? [] });
    const shell = shells(blocks)[0];
    expect(shell).toBeDefined();
    // 这是用户看到的那一格。修复前:false(空帧一条都没进 events)。
    expect(shell?.thinking).toBe(true);
  });

  it('反向:空帧不许在思考区里堆出空段落', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = { events: [] } as unknown as ChatMessage;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
    });
    for (let i = 0; i < 5; i += 1) buf.appendEvent({ kind: 'thinking', text: '' });
    buf.flush();
    buf.cancel();

    const blocks = buildTurnBlocks({ events: msg.events ?? [] });
    const texts: string[] = [];
    for (const shell of shells(blocks)) {
      for (const seg of shell.items) {
        if (seg.kind === 'text') texts.push(seg.text);
      }
    }
    expect(texts).toEqual([]);
  });

  it('反向:非空思考内容照旧合并成一段,不被这条改动打散', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = { events: [] } as unknown as ChatMessage;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
    });
    buf.appendEvent({ kind: 'thinking', text: '先把' });
    buf.appendEvent({ kind: 'thinking', text: '目录看一遍。' });
    buf.flush();
    buf.cancel();

    const thinkingEvents = (msg.events ?? []).filter((e) => e.kind === 'thinking');
    expect(thinkingEvents).toHaveLength(1);
    expect(thinkingEvents[0]).toMatchObject({ kind: 'thinking', text: '先把目录看一遍。' });
  });
});
