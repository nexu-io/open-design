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

function steppedQuestionFormMessages(): ChatMessage[] {
  const formContent = [
    '<question-form id="stepped" title="Quick check">',
    JSON.stringify({
      questions: [
        { id: 'a', label: 'What are we building?', type: 'text', required: true },
        { id: 'b', label: 'Anything else?', type: 'textarea' },
      ],
    }),
    '</question-form>',
  ].join('\n');
  return [
    {
      id: 'assistant-stepped',
      role: 'assistant',
      content: formContent,
      createdAt: 1_700_000_000_000,
      startedAt: 1_700_000_000_000,
      endedAt: 1_700_000_003_000,
      runStatus: 'succeeded',
    },
  ];
}

function chatPaneEl(
  messages: ChatMessage[],
  options: { interactiveQuestionForm?: boolean } = {},
) {
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
      onSubmitQuestionForm={options.interactiveQuestionForm ? () => {} : undefined}
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

    // 按钮**一直挂着**(退场动画要它在),所以「露没露出来」只能看 aria-hidden;
    // 那个 -active 类和 aria-hidden 出自同一个布尔量,再断言一遍是零覆盖。
    const btn = screen.getByTestId('chat-jump-btn');
    expect(btn.getAttribute('aria-hidden')).toBe('true');
    expect(btn.getAttribute('tabindex')).toBe('-1');
  });

  it('still shows when aligning the form to the top leaves a lot of content below', async () => {
    /*
     * 门槛跟着视口高度走了(`runtime/chat/jump-to-latest.ts`):用户 2026-08-27 说
     * 「这个总是有事没事就出现…只有在很上面时才出现不行吗」,原来写死的 120px
     * 半屏不到就弹。
     *
     * 这一条原来的夹具是「表单顶到头之后**还剩 200px**」—— 在 400px 高的面板里
     * 那正是他嫌太急的那一档,现在按设计不出。把夹具抬到真正「很上面」的量级,
     * 这一条守的仍是同一件事:表单顶到头之后底下**确实还有一大截**时,要有入口。
     */
    geom = { scrollHeight: 1600, clientHeight: 400, scrollTop: 400 };
    render(chatPaneEl(questionFormMessages()));
    await flushFrames();

    const btn = screen.getByTestId('chat-jump-btn');
    expect(btn.getAttribute('aria-hidden')).toBe('false');
    expect(btn.getAttribute('tabindex')).toBe('0');
  });

  it('keeps the first visible message at the same viewport coordinate after Next relayout', async () => {
    geom = { scrollHeight: 2000, clientHeight: 400, scrollTop: 0 };
    const { container } = render(chatPaneEl(steppedQuestionFormMessages(), {
      interactiveQuestionForm: true,
    }));
    await flushFrames();

    const log = screen.getByTestId('chat-log');
    log.getBoundingClientRect = () => ({
      top: 100,
      bottom: 500,
      left: 0,
      right: 300,
      width: 300,
      height: 400,
      x: 0,
      y: 100,
      toJSON: () => ({}),
    }) as DOMRect;
    const message = container.querySelector<HTMLElement>(
      '[data-assistant-message-id="assistant-stepped"]',
    );
    if (!message) throw new Error('expected assistant message root');
    message.getBoundingClientRect = () => {
      const top = 980 - geom.scrollTop;
      return {
        top,
        bottom: top + 600,
        left: 0,
        right: 300,
        width: 300,
        height: 600,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    };
    const footer = container.querySelector<HTMLElement>('.question-form-foot');
    if (!footer) throw new Error('expected stepped question footer');
    footer.getBoundingClientRect = () => {
      const contentTop = screen.queryByText('2/2') ? 1_380 : 1_200;
      const top = contentTop - geom.scrollTop;
      return {
        top,
        bottom: top + 36,
        left: 0,
        right: 300,
        width: 300,
        height: 36,
        x: 0,
        y: top,
        toJSON: () => ({}),
      } as DOMRect;
    };

    // Ignore frames left by initial form landing; this assertion starts from
    // an explicit reading position inside the already-settled transcript.
    rafCallbacks = [];
    geom.scrollTop = 900;
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'A dashboard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next step' }));
    expect(screen.getByText('2/2')).toBeTruthy();

    // Model a browser/layout correction that kept the replaced footer fixed.
    // The ChatPane frame must undo it in favor of the first visible message.
    geom.scrollTop = 1080;
    await flushFrames();
    expect(geom.scrollTop).toBe(900);
    expect(message.getBoundingClientRect().top).toBe(80);
  });
});
