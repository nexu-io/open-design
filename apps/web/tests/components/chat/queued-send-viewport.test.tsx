// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueuedSendStack } from '../../../src/components/chat/QueuedSendStack';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function view(items: Array<{ id: string; prompt: string }>) {
  return <QueuedSendStack items={items.map(item => ({ id: item.id, content: item.prompt }))} label="待发送消息" dragging={false} onDragLeave={() => {}} />;
}

// Expanded limit = five complete measured cards (82px each: 80px content +
// 2px border) with their 4px gaps, plus half of the sixth as the scroll cue:
// 5 * (82 + 4) + 41 = 471. The column keeps every card: 8 * 86 - 4 = 684.
it('shows five measured cards and part of the sixth and opens at the start of the scrollable queue', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ top: 0, bottom: 1000 } as DOMRect);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.hasAttribute('data-queue-banner-content') ? 80 : 0;
  });
  const items = Array.from({ length: 8 }, (_, index) => ({ id: `queue-${index}`, prompt: `消息 ${index + 1}` }));
  const { rerender } = render(view(items.slice(0, 6)));
  const stack = screen.getByRole('region');
  const viewport = stack.firstElementChild as HTMLElement;
  expect(stack.style.getPropertyValue('--chat-queue-viewport-height')).toBe('471px');
  rerender(view(items));
  expect(stack.style.getPropertyValue('--chat-queue-viewport-height')).toBe('471px');
  expect(stack.style.getPropertyValue('--chat-queue-column-height')).toBe('684px');
  viewport.scrollTop = 100;
  fireEvent.pointerEnter(stack, { pointerType: 'mouse' });
  expect(viewport.scrollTop).toBe(0);
  expect(screen.getAllByTestId('queued-send-banner')).toHaveLength(8);
  viewport.scrollTop = 168;
  fireEvent.scroll(viewport);
  rerender(view([...items, { id: 'queue-9', prompt: '继续追加' }]));
  expect(viewport.scrollTop).toBe(168);
  expect(stack.style.getPropertyValue('--chat-queue-viewport-height')).toBe('471px');
}, 20_000);

// Unmeasured cards fall back to the 36px minimum: 5 * (36 + 4) + 18 = 218.
it('fits the available space on short windows and restores the five-and-a-half-card limit on resize', () => {
  let bottom = 200;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 0, bottom }) as DOMRect);
  render(view(Array.from({ length: 8 }, (_, index) => ({ id: `item-${index}`, prompt: `消息 ${index}` }))));
  const stack = screen.getByRole('region');
  fireEvent.focus(stack);
  expect(stack.style.getPropertyValue('--chat-queue-viewport-height')).toBe('196px');
  const viewport = stack.firstElementChild as HTMLElement;
  viewport.scrollTop = 70;
  bottom = 1000;
  fireEvent.resize(window);
  expect(stack.style.getPropertyValue('--chat-queue-viewport-height')).toBe('218px');
  expect(viewport.scrollTop).toBe(70);
}, 20_000);

// The host's floating "jump to latest" control yields while the stack is
// open over the transcript, and gets the slot back when the stack unmounts.
it('reports expansion and releases the host controls on unmount', () => {
  const onExpandedChange = vi.fn();
  const { unmount } = render(<QueuedSendStack items={[{ id: 'one', content: 'Queued prompt' }]}
    label="Pending" dragging={false} onDragLeave={() => {}} onExpandedChange={onExpandedChange} />);
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
  fireEvent.focus(screen.getByRole('region'));
  expect(onExpandedChange).toHaveBeenLastCalledWith(true);
  unmount();
  expect(onExpandedChange).toHaveBeenLastCalledWith(false);
});
