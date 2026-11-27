// @vitest-environment jsdom

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

import { Profiler } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatPane } from '../../src/components/ChatPane';
import type { ChatMessage } from '../../src/types';

type Geom = { scrollHeight: number; clientHeight: number; scrollTop: number };
let geom: Geom;
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
  geom = { scrollHeight: 1200, clientHeight: 400, scrollTop: 800 };

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
  for (const key of ['scrollTop', 'scrollHeight', 'clientHeight'] as const) {
    const original = savedDescriptors[key];
    if (original) {
      Object.defineProperty(HTMLElement.prototype, key, original);
    } else {
      delete (HTMLElement.prototype as unknown as Record<string, unknown>)[key];
    }
  }
});

function streamingMessages(chunk: number): ChatMessage[] {
  return [
    {
      id: 'user-1',
      role: 'user',
      content: 'build a landing page',
      createdAt: 1_700_000_000_000,
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      content: `Streaming chunk ${chunk}...`,
      createdAt: 1_700_000_000_500,
      startedAt: 1_700_000_000_500,
      runStatus: 'running',
    },
  ];
}

function pane(chunk: number, onRender: () => void) {
  return (
    <Profiler id="chat-pane" onRender={onRender}>
      <ChatPane
        messages={streamingMessages(chunk)}
        streaming
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        conversations={[]}
        activeConversationId="conv-1"
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
      />
    </Profiler>
  );
}

describe('ChatPane streaming follow state update depth (#9250)', () => {
  it('does not schedule a redundant passive-effect render when syncFollowState sees unchanged jump-pill visibility on a dirty fiber', () => {
    const onRender = vi.fn();
    const { rerender } = render(pane(0, onRender));
    const log = screen.getByTestId('chat-log');

    // Step 1: scroll away from the bottom so the jump-to-latest pill appears.
    act(() => {
      geom.scrollTop = 100;
      fireEvent.scroll(log);
    });
    expect(screen.getByRole('button', { name: /jump to latest|回到最新/i })).toBeTruthy();

    // Step 2: in the same act, scroll back to the bottom (putting a lane on
    // ChatPane's fiber via scrolledFromBottom: true -> false) AND deliver a
    // streaming chunk (running the auto-scroll passive effect that calls
    // syncFollowState while alternate.lanes !== NoLanes).
    //
    // Without the ref guard, syncFollowState dispatches
    // setScrolledFromBottom(prev => prev === next ? prev : next), React 18's
    // eager bailout cannot run on a non-idle fiber, and React schedules an
    // extra passive-effect commit pass (setting didScheduleUpdateDuringPassiveEffects,
    // which trips "Maximum update depth exceeded" after 50 streaming chunks).
    onRender.mockClear();
    act(() => {
      geom.scrollTop = maxTop();
      fireEvent.scroll(log);
      geom.scrollHeight += 40;
      rerender(pane(1, onRender));
    });

    expect(screen.queryByRole('button', { name: /jump to latest|回到最新/i })).toBeNull();
    expect(onRender).toHaveBeenCalledTimes(1);
  });

  it('preserves jump-to-latest visibility toggling when scrolling away and returning', () => {
    const onRender = vi.fn();
    render(pane(0, onRender));
    const log = screen.getByTestId('chat-log');

    expect(screen.queryByRole('button', { name: /jump to latest|回到最新/i })).toBeNull();

    act(() => {
      geom.scrollTop = 100;
      fireEvent.scroll(log);
    });
    expect(screen.getByRole('button', { name: /jump to latest|回到最新/i })).toBeTruthy();

    act(() => {
      geom.scrollTop = maxTop();
      fireEvent.scroll(log);
    });
    expect(screen.queryByRole('button', { name: /jump to latest|回到最新/i })).toBeNull();
  });
});
