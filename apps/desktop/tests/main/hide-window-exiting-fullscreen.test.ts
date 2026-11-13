// Issue #1215 — clicking the macOS red X while the preview is in fullscreen
// presentation mode hides the window but leaves the OS Space stuck as a
// black screen. The close handler is allowed to call window.hide(), but it
// must first arrange for the window to leave fullscreen so the Space tears
// down with the window.
//
// This spec exercises the contract through hideWindowExitingFullscreen with
// a structural mock — the bug shape is pure logic (sequence of calls), so
// no real Electron window is required.

import { describe, expect, test, vi } from 'vitest';

import {
  attachNonDarwinMainWindowCloseShutdown,
  closeWithActiveRunsPrompt,
  hideWindowExitingFullscreen,
  type MainWindowCloseSurface,
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

describe('attachNonDarwinMainWindowCloseShutdown', () => {
  function createMockCloseWindow(options: { vetoRetry?: boolean } = {}): {
    emitClosed: () => void;
    emitClose: () => { prevented: boolean };
    closeCalls: () => number;
    window: MainWindowCloseSurface;
  } {
    let closedListener: (() => void) | null = null;
    let closeListener: ((event: { preventDefault: () => void }) => void) | null = null;
    let closeCalls = 0;
    let destroyed = false;
    const emitClose = () => {
      const result = { prevented: false };
      closeListener?.({ preventDefault: () => { result.prevented = true; } });
      return result;
    };
    return {
      emitClosed: () => { destroyed = true; closedListener?.(); },
      emitClose,
      closeCalls: () => closeCalls,
      window: {
        on: ((event: 'close' | 'closed', listener: (...args: never[]) => void) => {
          if (event === 'closed') closedListener = listener as () => void;
          if (event === 'close') closeListener = listener as (event: { preventDefault: () => void }) => void;
          return undefined;
        }) as MainWindowCloseSurface['on'],
        isDestroyed: () => destroyed,
        close: () => {
          closeCalls += 1;
          if (destroyed) throw new Error('Object has been destroyed');
          // Electron emits `close` again for a programmatic close.
          if (!emitClose().prevented && !options.vetoRetry) {
            destroyed = true;
            closedListener?.();
          }
        },
      },
    };
  }

  test('requests application shutdown when the main window is closed', () => {
    const { emitClosed, window } = createMockCloseWindow();
    const requestQuit = vi.fn();

    attachNonDarwinMainWindowCloseShutdown(window, {
      isStopped: () => false,
      requestQuit,
    });
    emitClosed();

    expect(requestQuit).toHaveBeenCalledTimes(1);
  });

  test('ignores close events triggered by the explicit shutdown path', () => {
    const { emitClosed, window } = createMockCloseWindow();
    const requestQuit = vi.fn();

    attachNonDarwinMainWindowCloseShutdown(window, {
      isStopped: () => true,
      requestQuit,
    });
    emitClosed();

    expect(requestQuit).not.toHaveBeenCalled();
  });

  // Windows: closing the main window quit the app and interrupted running
  // tasks without warning (OPEND-4390): 101 of 121 interrupted runs with a
  // bundle on 10/23-10/26 were Windows.
  test('keeps the window open when the user chooses to keep active tasks running', async () => {
    const { emitClose, closeCalls, window } = createMockCloseWindow();
    const requestQuit = vi.fn();
    const confirm = vi.fn(async () => false);

    attachNonDarwinMainWindowCloseShutdown(window, {
      isStopped: () => false,
      requestQuit,
      confirmCloseWithActiveRuns: confirm,
    });
    expect(emitClose().prevented).toBe(true);
    await vi.waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(closeCalls()).toBe(0);
    expect(requestQuit).not.toHaveBeenCalled();
  });

  test('closes and quits once the user confirms, or when nothing is running', async () => {
    const { emitClose, closeCalls, window } = createMockCloseWindow();
    const requestQuit = vi.fn();

    attachNonDarwinMainWindowCloseShutdown(window, {
      isStopped: () => false,
      requestQuit,
      confirmCloseWithActiveRuns: async () => true,
    });
    expect(emitClose().prevented).toBe(true);
    await vi.waitFor(() => expect(requestQuit).toHaveBeenCalledTimes(1));
    expect(closeCalls()).toBe(1);
  });

  test('checks again after the renderer vetoes the immediate close retry', async () => {
    const { emitClose, closeCalls, window } = createMockCloseWindow({ vetoRetry: true });
    const requestQuit = vi.fn();
    const confirm = vi.fn().mockResolvedValueOnce(true).mockResolvedValue(false);
    attachNonDarwinMainWindowCloseShutdown(window, {
      isStopped: () => false,
      requestQuit,
      confirmCloseWithActiveRuns: confirm,
    });

    expect(emitClose().prevented).toBe(true);
    await vi.waitFor(() => expect(closeCalls()).toBe(1));
    expect(emitClose().prevented).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(requestQuit).not.toHaveBeenCalled();
  });

  test.each(['stopped', 'destroyed'] as const)(
    'does not retry a pending confirmation after the window is %s',
    async (state) => {
      const { emitClose, emitClosed, closeCalls, window } = createMockCloseWindow();
      let stopped = false;
      let answer!: (proceed: boolean) => void;
      const pending = new Promise<boolean>((resolve) => { answer = resolve; });
      const requestQuit = vi.fn();
      attachNonDarwinMainWindowCloseShutdown(window, {
        isStopped: () => stopped,
        requestQuit,
        confirmCloseWithActiveRuns: () => pending,
      });

      expect(emitClose().prevented).toBe(true);
      if (state === 'stopped') stopped = true;
      else emitClosed();
      requestQuit.mockClear();
      answer(true);
      // Drain the confirmation's catch/then continuation deterministically.
      await pending;
      await Promise.resolve();
      expect(closeCalls()).toBe(0);
      expect(requestQuit).not.toHaveBeenCalled();
    },
  );

  test('does not ask again while a prompt is already open', async () => {
    const { emitClose, window } = createMockCloseWindow();
    let answer: (proceed: boolean) => void = () => {};
    const confirm = vi.fn(() => new Promise<boolean>((resolve) => { answer = resolve; }));

    attachNonDarwinMainWindowCloseShutdown(window, {
      isStopped: () => false,
      requestQuit: vi.fn(),
      confirmCloseWithActiveRuns: confirm,
    });
    emitClose();
    emitClose();
    expect(confirm).toHaveBeenCalledTimes(1);
    answer(false);
  });
});

describe('closeWithActiveRunsPrompt', () => {
  test('names the running tasks in Chinese and English', () => {
    expect(closeWithActiveRunsPrompt(2, 'zh-CN')).toMatchObject({ buttons: ['继续运行', '仍然退出'] });
    expect(closeWithActiveRunsPrompt(2, 'zh-CN').message).toContain('2');
    expect(closeWithActiveRunsPrompt(1, 'en-US')).toMatchObject({ buttons: ['Keep running', 'Quit anyway'] });
    expect(closeWithActiveRunsPrompt(1, 'en-US').message).toContain('1 task');
  });
});

