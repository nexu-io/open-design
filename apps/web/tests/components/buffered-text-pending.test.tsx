// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBufferedTextUpdates } from '../../src/components/ProjectView';
import type { ChatMessage } from '../../src/types';

// Covers the mechanism the live-tool `seq` fix relies on: text appended via
// `appendTextEvent` is buffered and not committed to `message.events` until a
// flush. If a tool's first `input_json_delta` arrives in the same burst as the
// preamble (before the rAF/250ms flush), `events.length` undercounts the
// preamble by one — so the seq computation adds `hasPendingText() ? 1 : 0`.
describe('createBufferedTextUpdates pending text accounting', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reports buffered text until it is flushed into a single event', () => {
    // No-op the scheduled flush so only the explicit flush() commits.
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = { events: [] } as unknown as ChatMessage;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
      },
      persistSoon: () => {},
    });

    expect(buf.hasPendingText()).toBe(false);

    buf.appendTextEvent('intro preamble');
    // Buffered — not yet a committed event, so events.length still 0.
    expect(buf.hasPendingText()).toBe(true);
    expect(msg.events?.length ?? 0).toBe(0);

    buf.flush();
    // Committed as exactly one text event; nothing pending now.
    expect(buf.hasPendingText()).toBe(false);
    expect(msg.events?.length).toBe(1);
    expect(msg.events?.[0]).toMatchObject({ kind: 'text', text: 'intro preamble' });

    buf.cancel();
  });

  it('coalesces adjacent thinking deltas into one frame update', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = { events: [] } as unknown as ChatMessage;
    let updates = 0;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
        updates += 1;
      },
      persistSoon: () => {},
    });

    for (let index = 0; index < 1_500; index += 1) {
      buf.appendEvent({ kind: 'thinking', text: 'x' });
    }

    expect(msg.events).toEqual([]);
    buf.flush();
    expect(msg.events).toEqual([{ kind: 'thinking', text: 'x'.repeat(1_500) }]);
    expect(updates).toBe(1);
    buf.cancel();
  });

  it('drops an identical snapshot burst without losing a later state change', () => {
    vi.stubGlobal('requestAnimationFrame', () => 0);
    vi.stubGlobal('cancelAnimationFrame', () => {});

    let msg = { events: [] } as unknown as ChatMessage;
    let updates = 0;
    let persists = 0;
    const buf = createBufferedTextUpdates({
      updateMessage: (u) => {
        msg = u(msg);
        updates += 1;
      },
      persistSoon: () => {
        persists += 1;
      },
    });
    const pendingTodo = {
      kind: 'tool_use' as const,
      id: 'todo-1',
      name: 'TodoWrite',
      input: { todos: [{ content: 'Audit history', status: 'pending' }] },
    };
    const completedTodo = {
      ...pendingTodo,
      input: { todos: [{ content: 'Audit history', status: 'completed' }] },
    };

    for (let index = 0; index < 2_000; index += 1) {
      buf.appendEvent({
        ...pendingTodo,
        input: { todos: [{ content: 'Audit history', status: 'pending' }] },
      });
    }
    buf.appendTextEvent('<question-form>{"questions":[]}</question-form>');
    buf.flush();
    // Text is an event boundary. An equal snapshot after it is not a retry of
    // the earlier occurrence and must remain in the historical timeline.
    buf.appendEvent(pendingTodo);
    buf.appendEvent(completedTodo);
    const repeatedCommand = {
      kind: 'tool_use' as const,
      id: 'bash-1',
      name: 'Bash',
      input: { command: 'pwd' },
    };
    buf.appendEvent(repeatedCommand);
    buf.appendEvent({ ...repeatedCommand, input: { command: 'pwd' } });

    expect(msg.events).toEqual([
      pendingTodo,
      { kind: 'text', text: '<question-form>{"questions":[]}</question-form>' },
      pendingTodo,
      completedTodo,
      repeatedCommand,
      repeatedCommand,
    ]);
    expect(updates).toBe(6);
    expect(persists).toBe(6);
    buf.cancel();
  });
});
