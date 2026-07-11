// @vitest-environment jsdom
//
// Browser-side chat-panel-resize bridges: the split-width watcher
// (ResizeObserver, with a window-resize fallback), the computed-style RTL
// check, and the rAF-throttled pointer-drag subscription. These are the
// DOM-touching pieces the slice reaches only through the injected port.
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getSplitIsRtl,
  subscribeChatPanelPointerDrag,
  subscribeSplitResize,
} from '../../../src/providers/project-view/chat-panel-resize-dom';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function dispatchPointer(type: string, clientX: number): void {
  window.dispatchEvent(new PointerEvent(type, { clientX }));
}

describe('subscribeSplitResize', () => {
  it('calls back immediately with the current width, and again on resize', () => {
    const split = document.createElement('div');
    Object.defineProperty(split, 'clientWidth', { value: 600, configurable: true });
    document.body.appendChild(split);
    const onResize = vi.fn();
    let observeCallback: (() => void) | undefined;
    const observeSpy = vi.fn();
    const disconnectSpy = vi.fn();
    const OriginalResizeObserver = window.ResizeObserver;
    // jsdom has no real ResizeObserver; stub one so the primary path is covered.
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      constructor(cb: () => void) {
        observeCallback = cb;
      }
      observe = observeSpy;
      disconnect = disconnectSpy;
    };

    const unsubscribe = subscribeSplitResize(split, onResize);
    expect(onResize).toHaveBeenCalledWith(600);
    expect(observeSpy).toHaveBeenCalledWith(split);

    Object.defineProperty(split, 'clientWidth', { value: 500, configurable: true });
    observeCallback?.();
    expect(onResize).toHaveBeenCalledWith(500);

    unsubscribe();
    expect(disconnectSpy).toHaveBeenCalled();
    window.ResizeObserver = OriginalResizeObserver;
  });

  it('falls back to a window resize listener when ResizeObserver is unavailable', () => {
    const split = document.createElement('div');
    Object.defineProperty(split, 'clientWidth', { value: 400, configurable: true });
    const onResize = vi.fn();
    const OriginalResizeObserver = window.ResizeObserver;
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = undefined;

    const unsubscribe = subscribeSplitResize(split, onResize);
    expect(onResize).toHaveBeenCalledWith(400);

    Object.defineProperty(split, 'clientWidth', { value: 350, configurable: true });
    window.dispatchEvent(new Event('resize'));
    expect(onResize).toHaveBeenCalledWith(350);

    onResize.mockClear();
    unsubscribe();
    window.dispatchEvent(new Event('resize'));
    expect(onResize).not.toHaveBeenCalled();

    window.ResizeObserver = OriginalResizeObserver;
  });
});

describe('getSplitIsRtl', () => {
  it('reads the computed direction, and reads false for a null element', () => {
    const split = document.createElement('div');
    document.body.appendChild(split);
    expect(getSplitIsRtl(split)).toBe(false);
    vi.spyOn(window, 'getComputedStyle').mockReturnValue({ direction: 'rtl' } as CSSStyleDeclaration);
    expect(getSplitIsRtl(split)).toBe(true);
    expect(getSplitIsRtl(null)).toBe(false);
  });
});

describe('subscribeChatPanelPointerDrag', () => {
  // vi.useFakeTimers() fakes requestAnimationFrame/cancelAnimationFrame as a
  // matched pair — mocking one manually (e.g. via setTimeout) desyncs the
  // handle bookkeeping the other uses to clear it.
  it('throttles pointermove to one onMove per animation frame', () => {
    vi.useFakeTimers();
    const onMove = vi.fn();
    subscribeChatPanelPointerDrag({ onMove, onEnd: vi.fn(), onCancel: vi.fn() });

    dispatchPointer('pointermove', 10);
    dispatchPointer('pointermove', 20);
    dispatchPointer('pointermove', 30);
    expect(onMove).not.toHaveBeenCalled();

    vi.advanceTimersByTime(20);
    expect(onMove).toHaveBeenCalledTimes(1);
    expect(onMove).toHaveBeenCalledWith(30);
  });

  it('flushes a pending move before onEnd, and tears down listeners after', () => {
    vi.useFakeTimers();
    const onMove = vi.fn();
    const onEnd = vi.fn();
    const unsubscribe = subscribeChatPanelPointerDrag({ onMove, onEnd, onCancel: vi.fn() });

    dispatchPointer('pointermove', 42);
    dispatchPointer('pointerup', 42);
    expect(onMove).toHaveBeenCalledWith(42);
    expect(onEnd).toHaveBeenCalledTimes(1);

    unsubscribe();
    onMove.mockClear();
    dispatchPointer('pointermove', 99);
    expect(onMove).not.toHaveBeenCalled();
  });

  it('flushes a pending move before onCancel, on both pointercancel and window blur', () => {
    vi.useFakeTimers();
    const onMove = vi.fn();
    const onCancel = vi.fn();
    subscribeChatPanelPointerDrag({ onMove, onEnd: vi.fn(), onCancel });

    dispatchPointer('pointermove', 7);
    dispatchPointer('pointercancel', 7);
    expect(onMove).toHaveBeenCalledWith(7);
    expect(onCancel).toHaveBeenCalledTimes(1);

    onMove.mockClear();
    onCancel.mockClear();
    dispatchPointer('pointermove', 8);
    window.dispatchEvent(new Event('blur'));
    expect(onMove).toHaveBeenCalledWith(8);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe cancels a still-pending animation frame', () => {
    vi.useFakeTimers();
    const onMove = vi.fn();
    const unsubscribe = subscribeChatPanelPointerDrag({ onMove, onEnd: vi.fn(), onCancel: vi.fn() });
    dispatchPointer('pointermove', 1);
    unsubscribe();
    // The frame was cancelled, not fired — advancing the clock proves it.
    vi.advanceTimersByTime(20);
    expect(onMove).not.toHaveBeenCalled();
  });
});
