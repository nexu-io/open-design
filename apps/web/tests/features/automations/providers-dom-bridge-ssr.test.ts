// @vitest-environment node
//
// The automation modal's DOM bridges guard every browser touch point with
// `typeof window === 'undefined'` so they degrade safely under SSR / non-DOM
// runtimes. Those guards are unreachable under jsdom, so this companion suite
// runs in the `node` environment (no `window`) to exercise the SSR fallbacks
// for real — the DOM round-trips live in providers-dom-bridge.test.ts.
import { describe, expect, it, vi } from 'vitest';

import {
  confirmDialog,
  lockBodyScroll,
  scheduleTimeout,
  subscribeEscapeKey,
} from '../../../src/providers/routines/dom-bridge';

describe('dom-bridge SSR fallbacks (no window)', () => {
  it('has no window in this environment', () => {
    expect(typeof window).toBe('undefined');
  });

  it('subscribeEscapeKey returns an inert unsubscribe and never calls back', () => {
    const onEscape = vi.fn();
    expect(() => subscribeEscapeKey(onEscape)()).not.toThrow();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it('lockBodyScroll returns a no-op restore function', () => {
    const restore = lockBodyScroll();
    expect(() => restore()).not.toThrow();
  });

  it('scheduleTimeout returns a no-op cancel and never runs the callback', () => {
    const fn = vi.fn();
    const cancel = scheduleTimeout(fn, 1000);
    expect(() => cancel()).not.toThrow();
    expect(fn).not.toHaveBeenCalled();
  });

  it('confirmDialog returns false without a window to prompt', () => {
    expect(confirmDialog('Delete?')).toBe(false);
  });
});
