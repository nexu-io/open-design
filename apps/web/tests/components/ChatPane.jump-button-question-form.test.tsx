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

import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

// Per-test geometry for the chat-log scroll container. jsdom has no layout
// engine so we patch the prototype to route reads/writes through this
// object — same technique as chat-todo-autoscroll.test.tsx. Every element's
// `getBoundingClientRect()` is left at jsdom's default all-zero rect, which
// makes `distanceFromBottomAfterAligningTop`'s geometry math collapse to
// pure scrollTop/scrollHeight/clientHeight arithmetic — exactly what these
// two scenarios need to isolate.
type Geom = { scrollHeight: number; clientHeight: number; scrollTop: number };
let geom: Geom;
let rafCallbacks: FrameRequestCallback[];
let savedDescriptors: Record<
  'scrollTop' | 'scrollHeight' | 'clientHeight',
  PropertyDescriptor | undefined
>;

function isChatLog(el: HTMLElement): boolean {
  return typeof el?.classList?.contains === 'function' && el.classList.contains('chat-log');
}

beforeEach(() => {
  geom = { scrollHeight: 1000, clientHeight: 400, scrollTop: 1000 };
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
      if (isChatLog(this)) geom.scrollTop = v;
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

async function flushFrames() {
  await act(async () => {
    const callbacks = rafCallbacks.splice(0);
    callbacks.forEach((callback) => callback(performance.now()));
    await Promise.resolve();
  });
}

function questionFormMessages(): ChatMessage[] {
  const formContent = [
    '<question-form id="discovery" title="Quick check">',
    JSON.stringify({
      questions: [{ id: 'a', label: 'What are we building?', type: 'text' }],
    }),
    '</question-form>',
  ].join('\n');
  return [
    {
      id: 'assistant-1',
      role: 'assistant',
      content: formContent,
      createdAt: 1_700_000_000_000,
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_003_000,
      runStatus: 'succeeded',
    },
  ];
}

function chatPaneEl(messages: ChatMessage[]) {
  return (
    <ChatPane
      messages={messages}
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

describe('jump-to-latest button after landing on a question form (recvqajMdAnfmd)', () => {
  it('does not stay stuck visible when the form is already the true bottom of the log', async () => {
    // scrollTop already at the natural max (scrollHeight - clientHeight):
    // aligning the form's top with the log's top clamps to this same
    // position, so there is nothing left below the fold to jump to.
    geom = { scrollHeight: 1000, clientHeight: 400, scrollTop: 600 };
    render(chatPaneEl(questionFormMessages()));
    await flushFrames();

    const btn = document.querySelector('.chat-jump-btn');
    expect(btn).not.toBeNull();
    expect(btn!.className).not.toContain('chat-jump-btn-active');
    expect(btn!.getAttribute('aria-hidden')).toBe('true');
  });

  it('still shows when aligning the form to the top genuinely leaves content below the fold', async () => {
    // scrollTop well short of the natural max: 200px of real content remains
    // below the form once it is aligned to the top.
    geom = { scrollHeight: 1000, clientHeight: 400, scrollTop: 400 };
    render(chatPaneEl(questionFormMessages()));
    await flushFrames();

    const btn = document.querySelector('.chat-jump-btn');
    expect(btn).not.toBeNull();
    expect(btn!.className).toContain('chat-jump-btn-active');
    expect(btn!.getAttribute('aria-hidden')).toBe('false');
  });
});
