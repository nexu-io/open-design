// @vitest-environment jsdom
//
// Real-DOM behavior for the automation modal's Escape key, body-scroll lock,
// timer, and confirm-dialog bridges. The SSR (no-window) fallbacks live in
// providers-dom-bridge-ssr.test.ts.
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmDialog,
  lockBodyScroll,
  scheduleTimeout,
  subscribeEscapeKey,
} from '../../../src/providers/routines/dom-bridge';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  document.body.style.overflow = '';
});

describe('subscribeEscapeKey', () => {
  it('invokes the callback only on Escape, and unsubscribes cleanly', () => {
    const onEscape = vi.fn();
    const unsubscribe = subscribeEscapeKey(onEscape);

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(onEscape).not.toHaveBeenCalled();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEscape).toHaveBeenCalledTimes(1);

    unsubscribe();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEscape).toHaveBeenCalledTimes(1);
  });
});

describe('lockBodyScroll', () => {
  it('sets overflow hidden and restores the previous value on unlock', () => {
    document.body.style.overflow = 'auto';
    const unlock = lockBodyScroll();
    expect(document.body.style.overflow).toBe('hidden');
    unlock();
    expect(document.body.style.overflow).toBe('auto');
  });
});

describe('scheduleTimeout', () => {
  it('runs the callback after the delay and cancels on unmount', () => {
    vi.useFakeTimers();
    const fn = vi.fn();
    const cancel = scheduleTimeout(fn, 1000);
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);

    const fn2 = vi.fn();
    const cancel2 = scheduleTimeout(fn2, 1000);
    cancel2();
    vi.advanceTimersByTime(1000);
    expect(fn2).not.toHaveBeenCalled();
    cancel();
  });
});

describe('confirmDialog', () => {
  it('delegates to window.confirm and returns its result', () => {
    const spy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    expect(confirmDialog('Delete?')).toBe(true);
    expect(spy).toHaveBeenCalledWith('Delete?');

    spy.mockReturnValue(false);
    expect(confirmDialog('Delete?')).toBe(false);
  });
});
