// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, act } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { QueuedSendStrip } from '../../../src/components/ChatPane';
import { I18nProvider } from '../../../src/i18n';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });
const one = { id: 'one', prompt: '第一条消息' };
const two = { id: 'two', prompt: '第二条消息' };
const three = { id: 'three', prompt: '第三条消息' };
const four = { id: 'four', prompt: '第四条消息' };
const callbacks = () => ({ onEdit: vi.fn(), onRemove: vi.fn(), onSendNow: vi.fn(), onReorder: vi.fn() });
function view(items: Array<typeof one>, handlers = callbacks()) {
  return <I18nProvider initial="zh-CN"><QueuedSendStrip items={items} {...handlers} /></I18nProvider>;
}

it('places each new message in front without discarding older queued messages', () => {
  const { rerender } = render(view([]));
  expect(screen.queryByRole('region')).toBeNull();
  rerender(view([one]));
  expect(screen.getByRole('region').textContent).toContain(one.prompt);
  rerender(view([one, two, three, four]));
  const banners = screen.getAllByTestId('queued-send-banner');
  expect(banners).toHaveLength(4);
  expect(banners.map((banner) => banner.textContent)).toEqual(expect.arrayContaining([
    expect.stringContaining(one.prompt), expect.stringContaining(four.prompt),
  ]));
  expect(banners.find((banner) => banner.getAttribute('data-depth') === '0')?.textContent).toContain(four.prompt);
  expect(screen.getAllByRole('button', { name: '引导对话' })).toHaveLength(1);
  fireEvent.focus(screen.getByRole('region'));
  expect(screen.getAllByRole('button', { name: '引导对话' })).toHaveLength(4);
});

it('keeps the expanded stack open while the pointer crosses the space between banners', () => {
  render(view([one, two, three]));
  const stack = screen.getByRole('region');
  const viewport = stack.firstElementChild!;
  vi.spyOn(viewport, 'getBoundingClientRect').mockReturnValue({ left: 10, right: 310, top: 100, bottom: 280 } as DOMRect);
  fireEvent.pointerEnter(stack, { pointerType: 'mouse' });
  expect(stack.getAttribute('data-expanded')).toBe('true');
  const pointer = (x: number, y: number) => {
    const event = new Event('pointermove');
    Object.defineProperties(event, { clientX: { value: x }, clientY: { value: y }, pointerType: { value: 'mouse' } });
    fireEvent(document, event);
  };
  pointer(150, 216);
  expect(stack.getAttribute('data-expanded')).toBe('true');
  pointer(311, 216);
  expect(stack.getAttribute('data-expanded')).toBe('false');
});

it('preserves send, edit and remove callbacks for every expanded message', () => {
  const handlers = callbacks();
  render(view([one, two, three, four], handlers));
  fireEvent.focus(screen.getByRole('region'));
  const first = within(screen.getAllByTestId('chat-queued-send-row')[0]!);
  fireEvent.click(first.getByRole('button', { name: '引导对话' }));
  fireEvent.click(first.getByRole('button', { name: '编辑' }));
  fireEvent.click(first.getByRole('button', { name: '移除' }));
  expect(handlers.onSendNow).toHaveBeenCalledWith(one.id);
  expect(handlers.onEdit).toHaveBeenCalledWith(one);
  expect(handlers.onRemove).toHaveBeenCalledWith(one.id);
});

it('finishes an exit before removing its banner and handles rapid additions', () => {
  vi.useFakeTimers();
  const { rerender } = render(view([one, two]));
  rerender(view([one]));
  expect(screen.getByText(two.prompt).closest('[aria-hidden="true"]')).toBeTruthy();
  rerender(view([one, three]));
  rerender(view([one, three, four]));
  act(() => { vi.advanceTimersByTime(250); });
  expect(screen.queryByText(two.prompt)).toBeNull();
  expect(screen.getAllByTestId('queued-send-banner')).toHaveLength(3);
  rerender(view([]));
  act(() => { vi.advanceTimersByTime(250); });
  expect(screen.queryByRole('region')).toBeNull();
});

it('preserves queue reordering when dragging between expanded cards', () => {
  const handlers = callbacks();
  render(view([one, two, three], handlers));
  fireEvent.focus(screen.getByRole('region'));
  const rows = screen.getAllByTestId('chat-queued-send-row');
  const values = new Map<string, string>();
  const dataTransfer = { effectAllowed: '', dropEffect: '', setData: (key: string, value: string) => values.set(key, value), getData: (key: string) => values.get(key) ?? '' };
  fireEvent.dragStart(within(rows[0]!).getByRole('button', { name: '拖动调整顺序' }), { dataTransfer });
  fireEvent.dragOver(rows[2]!, { dataTransfer, clientY: 10 });
  fireEvent.drop(rows[2]!, { dataTransfer, clientY: 10 });
  expect(handlers.onReorder).toHaveBeenCalledWith(['two', 'three', 'one']);
});

// OPEND-3203: while a queued message is dragged over another, the insertion
// bar has to sit in the gap BETWEEN the cards. It used to be a pseudo-element
// on the row inside the card (`top: -2px` / `bottom: -2px`), which the row's
// own `overflow: hidden` clipped — all that showed was its soft halo leaking
// back inside the card near its bottom edge, so the drop target read as
// "somewhere inside the first card".
it('draws the drop indicator between cards, outside every card, while dragging over a row', () => {
  const handlers = callbacks();
  render(view([one, two, three], handlers));
  fireEvent.focus(screen.getByRole('region'));
  const rows = screen.getAllByTestId('chat-queued-send-row');
  const dataTransfer = { effectAllowed: '', setData: vi.fn(), getData: () => three.id, dropEffect: '' };
  fireEvent.dragStart(within(rows[2]!).getByRole('button', { name: '拖动调整顺序' }), { dataTransfer });
  // jsdom rects are all zero: clientY 5 lands in the lower half of row one.
  fireEvent.dragOver(rows[0]!, { dataTransfer, clientY: 5 });
  const indicator = screen.getByTestId('chat-queued-send-drop-indicator');
  expect(indicator.getAttribute('data-edge')).toBe('after');
  expect(indicator.closest('[data-testid="queued-send-banner"]')).toBeNull();
  expect(indicator.closest('[data-testid="chat-queued-send-row"]')).toBeNull();
  expect(screen.getByRole('region').contains(indicator)).toBe(true);
  // Leaving the stack takes the indicator with it.
  fireEvent.dragEnd(within(rows[2]!).getByRole('button', { name: '拖动调整顺序' }));
  expect(screen.queryByTestId('chat-queued-send-drop-indicator')).toBeNull();
});
