// @vitest-environment jsdom

// Polyfill scrollTo for jsdom (not available in jsdom's HTMLElement).
if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function (
    options?: ScrollToOptions | number,
    _y?: number,
  ) {
    if (typeof options === 'object' && options !== null) {
      if (options.top !== undefined) this.scrollTop = options.top;
      if (options.left !== undefined) this.scrollLeft = options.left;
    }
  };
}

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

/**
 * The always-true guard in `syncFollowState`.
 *
 * ```ts
 * if (el.scrollTop !== el.scrollHeight) writeLogScrollTop(el, el.scrollHeight)
 * ```
 *
 * `scrollTop` tops out at `scrollHeight - clientHeight`. It can never equal
 * `scrollHeight`, so that comparison is true on every single call and the
 * follow path wrote `scrollTop` every frame of every streaming turn — even
 * sitting motionless at the bottom with nothing to correct.
 *
 * Functionally it was harmless, which is why it survived. What it was NOT
 * harmless to is the investigation running alongside it: telling "our own code
 * is putting the scroll position back" apart from "the compositor will not
 * move" is done by reading the `scrollTop` write trace
 * (`observability/chat-scroll-write-trace.ts`), and a follow loop that writes
 * unconditionally fills that trace with writes that changed nothing. Every
 * capture then shows a busy writer, whether or not anything was wrong.
 *
 * jsdom performs no layout, so geometry is installed by hand — and the setter
 * CLAMPS, exactly as a real scroller does, because the clamp is the whole
 * reason the original comparison could never hold.
 */

type Geom = { scrollHeight: number; clientHeight: number; scrollTop: number };
let geom: Geom;
/** Every value the component asked `scrollTop` to become, pre-clamp. */
let writes: number[];
let rafCallbacks: FrameRequestCallback[];
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight',
  PropertyDescriptor | undefined
>;

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

function maxTop(): number {
  return Math.max(0, geom.scrollHeight - geom.clientHeight);
}

beforeEach(() => {
  geom = { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 };
  writes = [];
  rafCallbacks = [];

  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });

  savedDescriptors = {
    scrollTop: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollTop'),
    scrollHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight'),
    clientHeight: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight'),
  };
  Object.defineProperty(HTMLElement.prototype, 'scrollTop', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.scrollTop : 0;
    },
    set(this: HTMLElement, v: number) {
      if (!isChatLog(this)) return;
      writes.push(v);
      // The browser clamps; so does this. `scrollTop = scrollHeight` lands on
      // `scrollHeight - clientHeight`, never on `scrollHeight`.
      geom.scrollTop = Math.min(Math.max(0, v), maxTop());
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.scrollHeight : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return isChatLog(this) ? geom.clientHeight : 0;
    },
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  rafCallbacks = [];
  for (const key of ['scrollTop', 'scrollHeight', 'clientHeight'] as const) {
    const original = savedDescriptors[key];
    if (original) {
      Object.defineProperty(HTMLElement.prototype, key, original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  }
});

async function flushFrames(): Promise<void> {
  await act(async () => {
    const callbacks = rafCallbacks.splice(0);
    callbacks.forEach((callback) => callback(performance.now()));
    await Promise.resolve();
  });
}

function messages(): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'make the deck',
      createdAt: 1_700_000_000_000,
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: 'On it.',
      createdAt: 1_700_000_000_500,
      startedAt: 1_700_000_000_500,
      endedAt: 1_700_000_003_000,
      runStatus: 'succeeded',
    },
  ];
}

function chatPaneEl() {
  return (
    <ChatPane
      messages={messages()}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={() => {}}
      onStop={() => {}}
      conversations={[]}
      activeConversationId={null}
      onSelectConversation={() => {}}
      onDeleteConversation={() => {}}
    />
  );
}

/** Mount, let the initial bottom-pin land, and start counting from zero. */
async function mountPinnedToBottom(): Promise<HTMLElement> {
  render(chatPaneEl());
  await flushFrames();
  await flushFrames();
  const log = screen.getByTestId('chat-log');
  expect(geom.scrollTop).toBe(maxTop());
  writes.length = 0;
  return log;
}

describe('ChatPane follow — the bottom-pin write', () => {
  it('writes nothing while following a log that is already at the bottom', async () => {
    const log = await mountPinnedToBottom();

    // Ten rounds of the follow path being asked to re-check itself, with
    // nothing having moved. A scroller sitting on its own ceiling needs no
    // correction, so the correct number of DOM writes is zero.
    for (let i = 0; i < 10; i += 1) fireEvent.scroll(log);

    expect(writes).toEqual([]);
    expect(geom.scrollTop).toBe(600);
  });

  it('still pins to the bottom when the content grew underneath it', async () => {
    const log = await mountPinnedToBottom();

    // The streaming case the guard actually exists for: the reply got 400px
    // taller, so the bottom moved away and following means going after it.
    geom.scrollHeight = 1400;
    fireEvent.scroll(log);

    expect(writes.length).toBeGreaterThan(0);
    expect(geom.scrollTop).toBe(1000);

    // …and once it has caught up, it stops writing again.
    writes.length = 0;
    fireEvent.scroll(log);
    expect(writes).toEqual([]);
  });
});
