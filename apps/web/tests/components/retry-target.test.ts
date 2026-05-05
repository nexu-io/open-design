import { describe, expect, it } from 'vitest';
import { resolveRetryTarget } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

function user(id: string, content: string): ChatMessage {
  return { id, role: 'user', content };
}

function assistant(id: string, runStatus?: ChatMessage['runStatus']): ChatMessage {
  return { id, role: 'assistant', content: '', runStatus };
}

describe('resolveRetryTarget — issue #475', () => {
  it('returns the preceding user turn and history-before-it for a failed assistant', () => {
    const messages = [
      user('u1', 'first prompt'),
      assistant('a1'),
      user('u2', 'second prompt'),
      assistant('a2', 'failed'),
    ];

    const target = resolveRetryTarget(messages, 'a2');

    expect(target).not.toBeNull();
    expect(target!.userMsg.id).toBe('u2');
    expect(target!.userMsg.content).toBe('second prompt');
    expect(target!.priorMessages.map((m) => m.id)).toEqual(['u1', 'a1']);
  });

  it('does not duplicate the user message when reconstructing the next history', () => {
    const messages = [
      user('u1', 'one prompt'),
      assistant('a1', 'failed'),
    ];

    const target = resolveRetryTarget(messages, 'a1');
    expect(target).not.toBeNull();
    const nextHistory = [...target!.priorMessages, target!.userMsg];

    const userTurns = nextHistory.filter((m) => m.role === 'user');
    expect(userTurns).toHaveLength(1);
    expect(userTurns[0]!.content).toBe('one prompt');
  });

  it('returns null when the failed assistant id is not found', () => {
    const messages = [user('u1', 'x'), assistant('a1', 'failed')];
    expect(resolveRetryTarget(messages, 'missing')).toBeNull();
  });

  it('returns null when the failed assistant has no preceding user turn', () => {
    const messages = [assistant('a1', 'failed')];
    expect(resolveRetryTarget(messages, 'a1')).toBeNull();
  });

  it('returns null when the message before the failed assistant is not a user turn', () => {
    const messages = [
      user('u1', 'x'),
      assistant('a1'),
      assistant('a2', 'failed'),
    ];
    expect(resolveRetryTarget(messages, 'a2')).toBeNull();
  });

  it('preserves attachments on the reused user turn so retry can replay them', () => {
    const messages: ChatMessage[] = [
      {
        id: 'u1',
        role: 'user',
        content: 'render this',
        attachments: [{ path: '/p/img.png', name: 'img.png', kind: 'image' }],
      },
      assistant('a1', 'failed'),
    ];

    const target = resolveRetryTarget(messages, 'a1');
    expect(target).not.toBeNull();
    expect(target!.userMsg.attachments).toEqual([
      { path: '/p/img.png', name: 'img.png', kind: 'image' },
    ]);
    // Mirrors the daemon-stream call site: `(userMsg.attachments ?? []).map(...)`
    // must not throw whether attachments is present, undefined, or empty.
    const paths = (target!.userMsg.attachments ?? []).map((a) => a.path);
    expect(paths).toEqual(['/p/img.png']);
  });

  it('tolerates a reused user turn with no attachments without throwing', () => {
    const messages = [user('u1', 'plain'), assistant('a1', 'failed')];
    const target = resolveRetryTarget(messages, 'a1');
    expect(target).not.toBeNull();
    expect(target!.userMsg.attachments).toBeUndefined();
    expect(() => (target!.userMsg.attachments ?? []).map((a) => a.path)).not.toThrow();
  });
});
