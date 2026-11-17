// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { StrictMode, act } from 'react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AnchoredMenuShell } from '../../../src/components/chat/AnchoredMenuShell';

function box(left: number, top: number, width: number, height: number): DOMRect {
  return new DOMRect(left, top, width, height);
}
let restoreRect: typeof HTMLElement.prototype.getBoundingClientRect;
let resize: () => void;
let observers: { observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }[];
beforeEach(() => {
  observers = [];
  restoreRect = HTMLElement.prototype.getBoundingClientRect;
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 850 });
  vi.stubGlobal('ResizeObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback: () => void) { resize = callback; observers.push(this); }
  });
});
afterEach(() => {
  cleanup();
  document.querySelectorAll('[data-artifact-anchor]').forEach((anchor) => anchor.remove());
  HTMLElement.prototype.getBoundingClientRect = restoreRect;
  vi.unstubAllGlobals();
});

function mount() {
  let rect = box(1130, 52, 70, 30);
  const anchor = document.createElement('button');
  anchor.setAttribute('data-artifact-anchor', 'moving');
  anchor.getBoundingClientRect = vi.fn(() => rect);
  document.body.appendChild(anchor);
  // Model the existing right:0 and below/above CSS using the actual rendered wrapper.
  HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.getAttribute('role') !== 'menu') return restoreRect.call(this);
    const host = this.parentElement as HTMLElement;
    const left = Number.parseFloat(host.style.left) || 0;
    const top = Number.parseFloat(host.style.top) || 0;
    const width = Number.parseFloat(host.style.width) || 0;
    const height = Number.parseFloat(host.style.height) || 0;
    return box(left + width - 320, this.dataset.placement === 'above' ? top - 246 : top + height + 6, 320, 240);
  };
  const hidden = vi.fn();
  const shell = (content: string, anchorId = 'moving') => <StrictMode><AnchoredMenuShell anchorId={anchorId} className="" wrapperClassName="" testId="moving-menu" onAnchorHidden={hidden}>{content}</AnchoredMenuShell></StrictMode>;
  const view = render(shell('share'));
  const menu = screen.getByTestId('moving-menu');
  return { menu, anchor, hidden, move: (next: DOMRect) => { rect = next; }, rerender: () => view.rerender(shell('export')), switchAnchor: (id: string) => view.rerender(shell('share', id)), unmount: view.unmount };
}

it('tracks shrinking and repeated resizing even when shift and placement stay unchanged', () => {
  const { menu, move } = mount();
  for (const width of [1080, 1000, 900, 1280]) {
    move(box(width - 150, 52, 70, 30));
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    act(() => { window.dispatchEvent(new Event('resize')); });
    expect(menu.getBoundingClientRect().right).toBe(width - 80);
    expect(menu.getBoundingClientRect().right).toBeLessThanOrEqual(width - 8);
  }
});

it('tracks scroll movement on both axes without accumulating a stale correction', () => {
  const { menu, move } = mount();
  for (const top of [152, 252, 52]) {
    move(box(650, top, 70, 30));
    act(() => { window.dispatchEvent(new Event('scroll')); });
    expect(menu.getBoundingClientRect().top).toBe(top + 36);
    expect(menu.getBoundingClientRect().right).toBe(720);
  }
});

it('tracks anchor size and split-layout changes through ResizeObserver with stable boundary avoidance', () => {
  const { menu, move } = mount();
  move(box(100, 152, 120, 50));
  act(() => { resize(); });
  expect(menu.getBoundingClientRect().left).toBe(8);
  expect(menu.getBoundingClientRect().top).toBe(208);
  const rect = menu.getBoundingClientRect();
  for (let i = 0; i < 10; i++) act(() => { resize(); });
  expect(menu.getBoundingClientRect()).toEqual(rect);
  move(box(600, 152, 160, 50));
  act(() => { resize(); });
  expect(menu.getBoundingClientRect().right).toBe(760);
});

it('hides and notifies when the moving anchor is clipped or detached', () => {
  const { menu, anchor, move, hidden } = mount();
  move(box(1130, -100, 70, 30));
  act(() => { window.dispatchEvent(new Event('scroll')); });
  expect(menu.style.visibility).toBe('hidden');
  expect(hidden).toHaveBeenCalledTimes(1);
  move(box(1130, 52, 70, 30));
  act(() => { window.dispatchEvent(new Event('scroll')); });
  expect(menu.style.visibility).toBe('');
  anchor.remove();
  act(() => { window.dispatchEvent(new Event('resize')); });
  expect(screen.queryByTestId('moving-menu')).toBeNull();
  expect(hidden).toHaveBeenCalledTimes(2);
});

it('renders coordinates from the avoidance snapshot, not a fresh render-time rectangle', () => {
  const { menu, anchor, move, rerender } = mount();
  const measured = vi.mocked(anchor.getBoundingClientRect).mock.calls.length;
  move(box(100, 152, 120, 50));
  rerender();
  expect(anchor.getBoundingClientRect).toHaveBeenCalledTimes(measured);
  expect(menu.getBoundingClientRect().right).toBe(1200);
  act(() => { resize(); });
  expect(menu.getBoundingClientRect().left).toBe(8);
  expect(menu.getBoundingClientRect().top).toBe(208);
});

function secondAnchor() {
  let rect = box(400, 300, 70, 30);
  const anchor = document.createElement('button');
  anchor.setAttribute('data-artifact-anchor', 'second');
  anchor.getBoundingClientRect = () => rect;
  document.body.appendChild(anchor);
  return { anchor, move: (next: DOMRect) => { rect = next; } };
}

it('remeasures a valid anchor switch while the menu stays mounted and open', () => {
  const { menu, switchAnchor } = mount();
  const second = secondAnchor();
  switchAnchor('second');
  expect(screen.getByTestId('moving-menu')).toBe(menu);
  expect(menu.getBoundingClientRect().right).toBe(470);
  expect(menu.getBoundingClientRect().top).toBe(336);
  second.move(box(500, 200, 120, 50));
  act(() => { resize(); });
  expect(menu.getBoundingClientRect().right).toBe(620);
  expect(menu.getBoundingClientRect().top).toBe(256);
  second.move(box(450, 250, 120, 50));
  act(() => { window.dispatchEvent(new Event('scroll')); });
  expect(menu.getBoundingClientRect().right).toBe(570);
  expect(menu.getBoundingClientRect().top).toBe(306);
  switchAnchor('moving');
  expect(menu.getBoundingClientRect().right).toBe(1200);
  expect(menu.getBoundingClientRect().top).toBe(88);
});

it('disconnects the old observer and observes the new anchor, cleaning up on unmount', () => {
  const { menu, anchor, switchAnchor, unmount } = mount();
  const second = secondAnchor();
  const oldObserver = observers.at(-1)!;
  expect(oldObserver.observe).toHaveBeenCalledWith(anchor);
  expect(oldObserver.disconnect).not.toHaveBeenCalled();
  switchAnchor('second');
  expect(oldObserver.disconnect).toHaveBeenCalledTimes(1);
  const nextObserver = observers.at(-1)!;
  expect(nextObserver).not.toBe(oldObserver);
  expect(nextObserver.observe).toHaveBeenCalledWith(second.anchor);
  expect(nextObserver.observe).toHaveBeenCalledWith(menu);
  expect(nextObserver.observe).not.toHaveBeenCalledWith(anchor);
  unmount();
  expect(nextObserver.disconnect).toHaveBeenCalledTimes(1);
});
