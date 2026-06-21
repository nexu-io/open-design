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
});
