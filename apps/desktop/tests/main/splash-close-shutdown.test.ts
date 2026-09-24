// The splash carries macOS traffic lights, so a user can close it while the
// main window is still hidden behind it. That close is a cancelled launch: the
// app must quit rather than keep booting windowless and pop the main window up
// later. The runtime's own splash closes (reveal, teardown) must not quit.

import { describe, expect, test, vi } from 'vitest';

import { attachSplashCloseShutdown, type SplashCloseSurface } from '../../src/main/runtime.js';

function createMockSplash(): { emitClosed: () => void; splash: SplashCloseSurface } {
  let closedListener: (() => void) | null = null;
  return {
    emitClosed: () => closedListener?.(),
    splash: {
      once: (event, listener) => {
        if (event === 'closed') closedListener = listener;
        return undefined;
      },
    },
  };
}

describe('attachSplashCloseShutdown', () => {
  test('quits when the user closes the splash before the main window is revealed', () => {
    const { emitClosed, splash } = createMockSplash();
    const requestQuit = vi.fn();

    attachSplashCloseShutdown(splash, { isRevealed: () => false, isStopped: () => false, requestQuit });
    emitClosed();

    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  test('does not quit when the splash closes as part of the reveal hand-off', () => {
    const { emitClosed, splash } = createMockSplash();
    const requestQuit = vi.fn();

    attachSplashCloseShutdown(splash, { isRevealed: () => true, isStopped: () => false, requestQuit });
    emitClosed();

    expect(requestQuit).not.toHaveBeenCalled();
  });

  test('does not quit when the splash closes during runtime teardown', () => {
    const { emitClosed, splash } = createMockSplash();
    const requestQuit = vi.fn();

    attachSplashCloseShutdown(splash, { isRevealed: () => false, isStopped: () => true, requestQuit });
    emitClosed();

    expect(requestQuit).not.toHaveBeenCalled();
  });
});
