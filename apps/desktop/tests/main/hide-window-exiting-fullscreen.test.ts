// Issue #1215 — clicking the macOS red X while the preview is in fullscreen
// presentation mode hides the window but leaves the OS Space stuck as a
// black screen. The close handler is allowed to call window.hide(), but it
// must first arrange for the window to leave fullscreen so the Space tears
// down with the window.
//
// This spec exercises the contract through hideWindowExitingFullscreen with
// a structural mock — the bug shape is pure logic (sequence of calls), so
// no real Electron window is required.

import { describe, expect, test } from 'vitest';

import {
  hideWindowExitingFullscreen,
  type WindowFullscreenSurface,
} from '../../src/main/runtime.js';

type MockCalls = string[];

function createMockWindow(initial: {
  fullScreen?: boolean;
  simpleFullScreen?: boolean;
  enteringFullscreen?: boolean;
}): {
  window: WindowFullscreenSurface;
  calls: MockCalls;
  emitEnterFullscreen: () => void;
  emitLeaveFullscreen: () => void;
} {
  const calls: MockCalls = [];
  let enterListener: (() => void) | null = null;
  let leaveListener: (() => void) | null = null;
  let fullScreen = initial.fullScreen ?? false;
  let simpleFullScreen = initial.simpleFullScreen ?? false;
  const enteringFullscreen = initial.enteringFullscreen ?? false;
  const window: WindowFullscreenSurface = {
    hide: () => calls.push('hide'),
    isFullScreen: () => fullScreen,
    isSimpleFullScreen: () => simpleFullScreen,
    isEnteringFullscreen: () => enteringFullscreen,
    setFullScreen: (flag) => {
      calls.push(`setFullScreen(${flag})`);
      fullScreen = flag;
    },
    setSimpleFullScreen: (flag) => {
      calls.push(`setSimpleFullScreen(${flag})`);
      simpleFullScreen = flag;
    },
    once: (event, listener) => {
      calls.push(`once(${event})`);
      if (event === 'enter-full-screen') enterListener = listener;
      if (event === 'leave-full-screen') leaveListener = listener;
      return undefined;
    },
  };
  return {
    calls,
    emitEnterFullscreen: () => {
      const fn = enterListener;
      enterListener = null;
      // Real Electron flips isFullScreen() to true around the same moment
      // 'enter-full-screen' fires, so model that here too.
      fullScreen = true;
      fn?.();
    },
    emitLeaveFullscreen: () => {
      const fn = leaveListener;
      leaveListener = null;
      fn?.();
    },
    window,
  };
}

describe('hideWindowExitingFullscreen', () => {
  test('hides directly when the window is not in fullscreen', () => {
    const { window, calls } = createMockWindow({});
    hideWindowExitingFullscreen(window);
    expect(calls).toEqual(['hide']);
  });

  test('exits native fullscreen first, defers hide until leave-full-screen fires', () => {
    const { window, calls, emitLeaveFullscreen } = createMockWindow({ fullScreen: true });
    hideWindowExitingFullscreen(window);

    // Before the OS confirms the Space has torn down, the window must NOT
    // be hidden — hiding mid-transition is what leaves the black Space.
    expect(calls).toEqual(['once(leave-full-screen)', 'setFullScreen(false)']);

    emitLeaveFullscreen();
    expect(calls).toEqual([
      'once(leave-full-screen)',
      'setFullScreen(false)',
      'hide',
    ]);
  });

  test('exits simpleFullScreen first, defers hide until leave-full-screen fires', () => {
    const { window, calls, emitLeaveFullscreen } = createMockWindow({ simpleFullScreen: true });
    hideWindowExitingFullscreen(window);

    expect(calls).toEqual(['once(leave-full-screen)', 'setSimpleFullScreen(false)']);

    emitLeaveFullscreen();
    expect(calls).toEqual([
      'once(leave-full-screen)',
      'setSimpleFullScreen(false)',
      'hide',
    ]);
  });

  // The macOS Space transition between requestFullscreen() and the
  // 'enter-full-screen' event is asynchronous; isFullScreen() can still
  // read false during that window. If we hide unconditionally in that gap
  // the OS strands the still-transitioning Space as a black screen — the
  // exact symptom #1215 reported. Wait for the enter to settle before
  // pivoting to the exit-then-hide path.
  test('waits out a fullscreen-enter transition before exiting and hiding', () => {
    const { window, calls, emitEnterFullscreen, emitLeaveFullscreen } = createMockWindow({
      enteringFullscreen: true,
    });
    hideWindowExitingFullscreen(window);

    // While the Space is still flipping in, only an enter-listener is
    // registered — no hide, no setFullScreen.
    expect(calls).toEqual(['once(enter-full-screen)']);

    emitEnterFullscreen();
    expect(calls).toEqual([
      'once(enter-full-screen)',
      'once(leave-full-screen)',
      'setFullScreen(false)',
    ]);

    emitLeaveFullscreen();
    expect(calls).toEqual([
      'once(enter-full-screen)',
      'once(leave-full-screen)',
      'setFullScreen(false)',
      'hide',
    ]);
  });
});
