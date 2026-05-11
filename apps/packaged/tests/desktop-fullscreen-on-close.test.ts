/**
 * Regression coverage for the macOS-only fullscreen-exit-before-hide
 * path used by the BrowserWindow close handler in
 * `apps/desktop/src/main/runtime.ts`. Hiding the window mid-
 * fullscreen-transition leaves the macOS Space painted as a solid
 * black surface (the bug in #1215). The helper waits for the
 * `leave-full-screen` event before resolving so the caller can hide()
 * cleanly.
 *
 * @see https://github.com/nexu-io/open-design/issues/1215
 */

import { vi } from 'vitest';

vi.mock('electron', () => ({
  BrowserWindow: class {},
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  shell: { openExternal: vi.fn() },
  app: { whenReady: vi.fn() },
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { exitFullscreenBeforeHide } from '@open-design/desktop/main';

type Listener = (...args: unknown[]) => void;

/**
 * Minimal Electron BrowserWindow stand-in. Mirrors only the surface
 * the helper actually uses: `isDestroyed`, `isFullScreen`,
 * `setFullScreen`, `once`, `removeListener`. Driven by the test so
 * we can assert the call order + event-driven resolution without
 * spinning up a real window.
 */
class FakeWindow {
  destroyed = false;
  fullscreen: boolean;
  readonly setFullScreenCalls: boolean[] = [];
  private listeners = new Map<string, Listener[]>();

  constructor(initial: { fullscreen: boolean; destroyed?: boolean } = { fullscreen: false }) {
    this.fullscreen = initial.fullscreen;
    this.destroyed = initial.destroyed ?? false;
  }

  isDestroyed(): boolean {
    return this.destroyed;
  }

  isFullScreen(): boolean {
    return this.fullscreen;
  }

  setFullScreen(value: boolean): void {
    this.setFullScreenCalls.push(value);
    // Don't flip `fullscreen` synchronously — the real Electron call
    // kicks off an animated transition, and our event-driven helper
    // expects the `leave-full-screen` event to be the resolution
    // signal, not the synchronous return.
  }

  once(eventName: string, fn: Listener): void {
    const list = this.listeners.get(eventName) ?? [];
    list.push(fn);
    this.listeners.set(eventName, list);
  }

  removeListener(eventName: string, fn: Listener): void {
    const list = this.listeners.get(eventName);
    if (!list) return;
    const next = list.filter((l) => l !== fn);
    if (next.length === 0) this.listeners.delete(eventName);
    else this.listeners.set(eventName, next);
  }

  /** Test helper: simulate Electron firing `leave-full-screen`. */
  emit(eventName: string): void {
    const list = this.listeners.get(eventName);
    if (!list) return;
    for (const fn of [...list]) fn();
  }
}

describe('exitFullscreenBeforeHide', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves immediately when the window is not fullscreen, without touching setFullScreen', async () => {
    // The close handler unconditionally calls this helper before
    // hiding, so the no-op path matters: a non-fullscreen window
    // must not pay an event-wait cost.
    const win = new FakeWindow({ fullscreen: false });
    await exitFullscreenBeforeHide(win as never);
    expect(win.setFullScreenCalls).toEqual([]);
  });

  it('resolves immediately on a destroyed window without touching setFullScreen', async () => {
    // Defensive: if `window.isDestroyed()` is true the close listener
    // has already been beaten to the punch (e.g. forced quit). The
    // helper must not throw or call into Electron methods that would
    // throw on a destroyed window.
    const win = new FakeWindow({ fullscreen: true, destroyed: true });
    await exitFullscreenBeforeHide(win as never);
    expect(win.setFullScreenCalls).toEqual([]);
  });

  it('calls setFullScreen(false) and waits for the leave-full-screen event before resolving', async () => {
    // The canonical #1215 path: window is in macOS native fullscreen,
    // close fires, helper requests fullscreen exit, then waits for
    // the animated transition to complete (Electron emits
    // `leave-full-screen` at the end of the animation). The caller
    // hides the window only after the promise resolves.
    const win = new FakeWindow({ fullscreen: true });
    let resolved = false;
    const done = exitFullscreenBeforeHide(win as never).then(() => {
      resolved = true;
    });

    // setFullScreen(false) called synchronously — Electron's
    // transition kicks off immediately even though the event fires
    // later.
    expect(win.setFullScreenCalls).toEqual([false]);

    // Before the event fires, the promise is still pending.
    await Promise.resolve();
    expect(resolved).toBe(false);

    // Simulating Electron's `leave-full-screen` resolves the helper.
    win.emit('leave-full-screen');
    await done;
    expect(resolved).toBe(true);
  });

  it('settles on a 2-second safety timeout if leave-full-screen never fires', async () => {
    // Belt-and-braces: if some macOS edge case swallows the event
    // we cannot leave the close path stranded forever. The 2s
    // timeout matches what a reasonable user would tolerate
    // between clicking close and seeing the window disappear.
    const win = new FakeWindow({ fullscreen: true });
    let resolved = false;
    const done = exitFullscreenBeforeHide(win as never).then(() => {
      resolved = true;
    });
    expect(win.setFullScreenCalls).toEqual([false]);

    // Advance fake timers past the safety window without firing
    // the Electron event.
    await vi.advanceTimersByTimeAsync(2000);
    await done;
    expect(resolved).toBe(true);
  });

  it('removes the leave-full-screen listener after it fires (no double-resolve)', async () => {
    // If the helper left its listener attached, a later
    // `leave-full-screen` event (e.g. user enters and exits
    // fullscreen again later in the same window's lifetime) would
    // double-resolve the original promise. Resolution is a one-shot
    // contract — verify the listener is removed.
    const win = new FakeWindow({ fullscreen: true });
    const done = exitFullscreenBeforeHide(win as never);
    win.emit('leave-full-screen');
    await done;

    // After resolution, no listener should remain attached. Emitting
    // again must not throw or settle anything new.
    expect(() => win.emit('leave-full-screen')).not.toThrow();
  });
});
