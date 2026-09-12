// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ChatPane } from '../../../src/components/chat/upstream/ChatPane';
import { I18nProvider } from '../../../src/i18n';

vi.mock('../../../src/components/chat/upstream/ChatComposer', () => ({
  ChatComposer: forwardRef(() => <div />),
}));

beforeEach(() => {
  // Keep unrelated initial scroll/animation frames out of this interaction test.
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const queued = [{ id: 'q1', prompt: '第一条待发送消息' }, { id: 'q2', prompt: '第二条待发送消息' }];
function chat(items = queued, conversationId = 'one') {
  return <I18nProvider initial="zh-CN"><ChatPane
    messages={[]} streaming={false} error={null} queuedItems={items}
    projectId="p1" projectFiles={[]} activeConversationId={conversationId}
    onEnsureProject={async () => 'p1'} onSend={vi.fn()} onStop={vi.fn()}
    conversations={[]} onSelectConversation={vi.fn()} onDeleteConversation={vi.fn()}
    onReorderQueuedSends={vi.fn()}
  /></I18nProvider>;
}

function scrollAwayFromBottom() {
  const log = screen.getByTestId('chat-log');
  Object.defineProperties(log, {
    scrollHeight: { configurable: true, value: 1000 },
    clientHeight: { configurable: true, value: 400 },
    scrollTop: { configurable: true, writable: true, value: 600 },
  });
  fireEvent.wheel(log, { deltaY: -100 });
  log.scrollTop = 200;
  fireEvent.scroll(log);
}

function leaveQueue() {
  const event = new Event('pointermove');
  Object.defineProperties(event, {
    clientX: { value: -1 }, clientY: { value: -1 }, pointerType: { value: 'mouse' },
  });
  fireEvent(document, event);
}

it('hides the jump button during queue hover and focus, then restores its existing scroll state', () => {
  render(chat());
  scrollAwayFromBottom();
  const jump = screen.getByTestId('chat-jump-btn');
  const queue = screen.getByTestId('chat-queued-send-strip');
  expect(jump).toHaveAttribute('aria-hidden', 'false');
  fireEvent.pointerEnter(queue, { pointerType: 'mouse' });
  expect(jump).toHaveAttribute('aria-hidden', 'true');
  expect(jump).toHaveAttribute('tabindex', '-1');
  fireEvent.focus(queue);
  leaveQueue();
  expect(jump).toHaveAttribute('aria-hidden', 'true');
  fireEvent.blur(queue, { relatedTarget: document.body });
  expect(jump).toHaveAttribute('aria-hidden', 'false');
  expect(jump).toHaveAttribute('tabindex', '0');
  expect(screen.getByTestId('chat-log').scrollTop).toBe(200);
});

it('releases the jump button when the expanded queue empties or its conversation changes', () => {
  const { rerender } = render(chat());
  scrollAwayFromBottom();
  fireEvent.pointerEnter(screen.getByTestId('chat-queued-send-strip'), { pointerType: 'mouse' });
  expect(screen.getByTestId('chat-jump-btn')).toHaveAttribute('aria-hidden', 'true');
  rerender(chat([]));
  expect(screen.getByTestId('chat-jump-btn')).toHaveAttribute('aria-hidden', 'false');
  rerender(chat());
  fireEvent.pointerEnter(screen.getByTestId('chat-queued-send-strip'), { pointerType: 'mouse' });
  rerender(chat(queued, 'two'));
  scrollAwayFromBottom();
  expect(screen.getByTestId('chat-jump-btn')).toHaveAttribute('aria-hidden', 'false');
});
