// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useResetOnFullscreenExit } from '../../src/hooks/useResetOnFullscreenExit';

describe('useResetOnFullscreenExit', () => {
  let originalDescriptor: PropertyDescriptor | undefined;

  beforeEach(() => {
    // Save and stub document.fullscreenElement so each test can drive
    // the "are we still in fullscreen?" check the hook reads from the
    // event handler.
    originalDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'fullscreenElement');
  });

  afterEach(() => {
    if (originalDescriptor) {
      Object.defineProperty(Document.prototype, 'fullscreenElement', originalDescriptor);
    } else {
      // jsdom defaults to undefined for the property; restore that.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (Document.prototype as any).fullscreenElement;
    }
  });

  function setFullscreenElement(value: Element | null) {
    Object.defineProperty(Document.prototype, 'fullscreenElement', {
      configurable: true,
      get: () => value,
    });
  }

  it('calls reset when fullscreenchange fires with no fullscreen element (exit path)', () => {
    setFullscreenElement(null);
    const reset = vi.fn();
    renderHook(() => useResetOnFullscreenExit(reset));

    // Sanity: subscribed but not yet fired.
    expect(reset).not.toHaveBeenCalled();

    document.dispatchEvent(new Event('fullscreenchange'));
    expect(reset).toHaveBeenCalledTimes(1);
  });

  it('does NOT call reset when fullscreenchange fires with a fullscreen element (enter path)', () => {
    // Entering fullscreen also fires `fullscreenchange`. The hook
    // only triggers on the exit transition — otherwise it would
    // immediately reset the React present-mode state the very
    // moment the user enters fullscreen.
    const fakeElement = document.createElement('div');
    setFullscreenElement(fakeElement);
    const reset = vi.fn();
    renderHook(() => useResetOnFullscreenExit(reset));

    document.dispatchEvent(new Event('fullscreenchange'));
    expect(reset).not.toHaveBeenCalled();
  });

  it('removes the listener on unmount so reset is not called after the consumer is gone', () => {
    setFullscreenElement(null);
    const reset = vi.fn();
    const { unmount } = renderHook(() => useResetOnFullscreenExit(reset));
    unmount();
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(reset).not.toHaveBeenCalled();
  });

  it('does not throw and is a no-op when document is undefined (SSR-safe)', () => {
    // The hook checks `typeof document === 'undefined'` up-front so
    // consumers that get rendered in an SSR context (or any future
    // jsdom-less environment) do not crash on the event-listener
    // call. We can't truly remove `document` mid-test, but we can
    // assert the hook mounts without throwing and never invokes
    // reset before an event fires.
    setFullscreenElement(null);
    const reset = vi.fn();
    expect(() => renderHook(() => useResetOnFullscreenExit(reset))).not.toThrow();
    expect(reset).not.toHaveBeenCalled();
  });

  it('re-subscribes when reset identity changes (so consumers can switch handlers)', () => {
    setFullscreenElement(null);
    const firstReset = vi.fn();
    const secondReset = vi.fn();
    const { rerender } = renderHook(({ fn }) => useResetOnFullscreenExit(fn), {
      initialProps: { fn: firstReset },
    });

    document.dispatchEvent(new Event('fullscreenchange'));
    expect(firstReset).toHaveBeenCalledTimes(1);

    rerender({ fn: secondReset });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(firstReset).toHaveBeenCalledTimes(1);
    expect(secondReset).toHaveBeenCalledTimes(1);
  });
});
