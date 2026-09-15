import { describe, expect, it } from 'vitest';
import type { ChatConversationCompaction } from '@open-design/contracts';
import type { ChatMessage } from '../../src/types';
import { buildChatRenderItems } from '../../src/components/ChatPane';

function message(id: string, role: ChatMessage['role'], content = 'body'): ChatMessage {
  return { id, role, content };
}

function checkpoint(cutAtMessageId: string): ChatConversationCompaction {
  return {
    conversationId: 'conv-1',
    cutAtMessageId,
    summaryText: 'summary',
    ledger: [],
  };
}

function kinds(items: ReturnType<typeof buildChatRenderItems>): string[] {
  return items.map((item) => item.kind);
}

describe('buildChatRenderItems compaction boundary (#5991)', () => {
  it('renders plain message items when there is no checkpoint', () => {
    const items = buildChatRenderItems(
      [message('u1', 'user'), message('a1', 'assistant')],
      null,
    );
    expect(kinds(items)).toEqual(['message', 'message']);
    expect(items[0]).toMatchObject({ kind: 'message', messageIndex: 0 });
    expect(items[1]).toMatchObject({ kind: 'message', messageIndex: 1 });
  });

  it('inserts the boundary right after the cut message', () => {
    const items = buildChatRenderItems(
      [message('u1', 'user'), message('a1', 'assistant'), message('u2', 'user'), message('a2', 'assistant')],
      checkpoint('a1'),
    );
    expect(kinds(items)).toEqual([
      'message',
      'message',
      'compactionBoundary',
      'message',
      'message',
    ]);
    const boundary = items[2];
    if (boundary?.kind !== 'compactionBoundary') {
      throw new Error('expected a compaction boundary at index 2');
    }
    expect(boundary.key).toContain('a1');
  });

  it('places the boundary at the tail when the cut is the last message', () => {
    const items = buildChatRenderItems(
      [message('u1', 'user'), message('a1', 'assistant')],
      checkpoint('a1'),
    );
    expect(kinds(items)).toEqual(['message', 'message', 'compactionBoundary']);
  });

  it('drops the boundary when cutAtMessageId is absent from the transcript', () => {
    const items = buildChatRenderItems(
      [message('u1', 'user'), message('a1', 'assistant')],
      checkpoint('deleted-message-id'),
    );
    expect(kinds(items)).toEqual(['message', 'message']);
  });

  it('keeps the boundary position when the cut message is a hidden form answer', () => {
    const items = buildChatRenderItems(
      [
        message('u1', 'user'),
        message('fa', 'user', '[form answers — q1]'),
        message('a1', 'assistant'),
      ],
      checkpoint('fa'),
    );
    // 被截断的那条表单答案本身不渲染,但边界必须留在它的位置上,
    // 不能跟着它一起消失。
    expect(kinds(items)).toEqual(['message', 'compactionBoundary', 'message']);
  });
});