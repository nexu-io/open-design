// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueuedSendStack } from '../../../src/components/chat/QueuedSendStack';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });
function view(items: Array<{ id: string; prompt: string }>) {
  return <QueuedSendStack items={items.map(item => ({ id: item.id, content: item.prompt }))} label="待发送消息" dragging={false} onDragLeave={() => {}} />;
}

it('shows five measured cards and a half-card cue, and opens at the start of the scrollable queue', () => {
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
});

it('fits the available space on short windows and restores the five-and-a-half-card limit on resize', () => {
  let bottom = 180;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ top: 0, bottom }) as DOMRect);
  render(view(Array.from({ length: 8 }, (_, index) => ({ id: `item-${index}`, prompt: `消息 ${index}` }))));
  const stack = screen.getByRole('region');
  fireEvent.focus(stack);
  expect(stack.style.getPropertyValue('--chat-queue-viewport-height')).toBe('176px');
  const viewport = stack.firstElementChild as HTMLElement;
  viewport.scrollTop = 70;
  bottom = 1000;
  fireEvent.resize(window);
  expect(stack.style.getPropertyValue('--chat-queue-viewport-height')).toBe('218px');
  expect(viewport.scrollTop).toBe(70);
});
