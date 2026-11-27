import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachDisplayRefresh } from '../../src/main/display-refresh.js';

function fixture(platform = 'darwin', rendererScale?: () => number | Promise<number>) {
  const screen = Object.assign(new EventEmitter(), {
    getDisplayMatching: vi.fn(() => ({ scaleFactor: 2 })),
    getAllDisplays: () => [{}, {}],
  });
  const powerMonitor = new EventEmitter();
  let bounds = { x: 100, y: 200, width: 1280, height: 900 };
  const window = Object.assign(new EventEmitter(), {
    webContents: new EventEmitter(),
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    getBounds: () => ({ ...bounds }),
    setBounds: vi.fn((next: typeof bounds) => { bounds = { ...next }; }),
    setVibrancy: vi.fn(),
    invalidateShadow: vi.fn(),
    isFocused: vi.fn(() => true),
    hide: vi.fn(),
    show: vi.fn(),
    showInactive: vi.fn(),
  });
  const notify = vi.fn();
  const observeScale = vi.fn();
  const dispose = attachDisplayRefresh({ platform, screen, powerMonitor,
    getWindows: () => [window], notify, observeScale, setTimeout, clearTimeout,
    ...(rendererScale ? { readRendererScale: async () => rendererScale(), now: () => Date.now() } : {}) });
  const nativeResize = (next: typeof bounds) => { bounds = { ...next }; };
  return { screen, powerMonitor, window, notify, observeScale, dispose, nativeResize };
}

describe('macOS display refresh', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('debounces display and wake bursts, restores exact bounds, and reports once', () => {
    const f = fixture();
    const original = f.window.getBounds();
    f.screen.emit('display-added');
    vi.advanceTimersByTime(300);
    f.powerMonitor.emit('resume');
    f.screen.emit('display-metrics-changed', {}, {}, ['scaleFactor']);
    vi.advanceTimersByTime(499);
    expect(f.window.setBounds).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.window.getBounds()).toEqual({ ...original, width: original.width + 1 });
    expect(f.notify).not.toHaveBeenCalled();
    vi.advanceTimersByTime(16);
    expect(f.window.getBounds()).toEqual(original);
    expect(f.window.setBounds).toHaveBeenCalledTimes(2);
    expect(f.window.setVibrancy.mock.calls).toEqual([[null], ['under-window']]);
    expect(f.window.invalidateShadow).toHaveBeenCalledOnce();
    expect(f.notify).toHaveBeenCalledWith(f.window, {
      reasons: ['display-added', 'resume', 'display-metrics-changed'], scaleFactor: 2, displayCount: 2,
    });
    f.dispose();
  });

  it.each(['display-removed', 'unlock-screen'])('refreshes on %s', (event) => {
    const f = fixture();
    (event === 'unlock-screen' ? f.powerMonitor : f.screen).emit(event);
    vi.advanceTimersByTime(516);
    expect(f.notify).toHaveBeenCalledOnce();
    f.dispose();
  });

  it('ignores metrics changes that do not change scale', () => {
    const f = fixture();
    f.screen.emit('display-metrics-changed', {}, {}, ['bounds', 'workArea', 'rotation']);
    vi.advanceTimersByTime(1000);
    expect(f.window.setBounds).not.toHaveBeenCalled();
    f.dispose();
  });

  it.each(['linux', 'win32'])('does nothing on %s', (platform) => {
    const f = fixture(platform);
    f.screen.emit('display-added');
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(1000);
    expect(f.window.setVibrancy).not.toHaveBeenCalled();
    expect(f.screen.listenerCount('display-added')).toBe(0);
    f.dispose();
  });

  it.each(['isDestroyed', 'isVisible', 'isMinimized', 'isFullScreen'] as const)('skips ineligible windows: %s', (property) => {
    const f = fixture();
    f.window[property].mockReturnValue(property !== 'isVisible');
    f.powerMonitor.emit('resume');
    expect(() => vi.advanceTimersByTime(516)).not.toThrow();
    expect(f.window.setVibrancy).not.toHaveBeenCalled();
    f.dispose();
  });

  it('keeps a native maximize that lands between the width pulse and restore', () => {
    const f = fixture();
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(500);
    const maximized = { x: 0, y: 33, width: 1512, height: 847 };
    f.nativeResize(maximized);
    f.window.isMaximized.mockReturnValue(true);
    f.window.emit('maximize');
    vi.advanceTimersByTime(16);
    expect(f.window.setBounds).toHaveBeenCalledOnce();
    expect(f.window.getBounds()).toEqual(maximized);
    expect(f.window.setVibrancy).toHaveBeenLastCalledWith('under-window');
    expect(f.window.invalidateShadow).toHaveBeenCalledOnce();
    expect(f.notify).toHaveBeenCalledOnce();
    f.dispose();
  });

  it.each(['isFullScreen', 'none'] as const)('keeps bounds changed by the system during the pulse: %s', (state) => {
    const f = fixture();
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(500);
    const next = { x: 10, y: 20, width: 900, height: 600 };
    f.nativeResize(next);
    if (state !== 'none') f.window[state].mockReturnValue(true);
    vi.advanceTimersByTime(16);
    expect(f.window.setBounds).toHaveBeenCalledOnce();
    expect(f.window.getBounds()).toEqual(next);
    expect(f.window.setVibrancy).toHaveBeenLastCalledWith('under-window');
    f.dispose();
  });

  it('tolerates destruction during the frame interval', () => {
    const f = fixture();
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(500);
    f.window.isDestroyed.mockReturnValue(true);
    f.window.emit('closed');
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect(f.notify).not.toHaveBeenCalled();
    f.dispose();
  });

  it('defers a refresh requested during a resize until it ends', () => {
    const f = fixture();
    f.window.emit('will-resize');
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(516);
    expect(f.window.setBounds).not.toHaveBeenCalled();
    f.window.emit('resized');
    vi.advanceTimersByTime(16);
    expect(f.notify).toHaveBeenCalledOnce();
    expect(f.notify.mock.calls[0]![1].reasons).toEqual(['resume']);
    f.dispose();
  });

  it('refreshes after a drag across displays settles', () => {
    const f = fixture();
    f.window.emit('will-move');
    f.window.emit('moved');
    f.screen.emit('display-metrics-changed', {}, {}, ['scaleFactor']);
    vi.advanceTimersByTime(400);
    f.window.emit('moved');
    vi.advanceTimersByTime(499);
    expect(f.window.setBounds).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(f.window.setBounds).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(16);
    expect(f.notify.mock.calls[0]![1].reasons).toEqual(['display-metrics-changed']);
    f.dispose();
  });

  it('keeps macOS moved events busy throughout a continuous drag', () => {
    const f = fixture();
    f.window.emit('will-move');
    f.window.emit('moved');
    f.screen.emit('display-metrics-changed', {}, {}, ['scaleFactor']);
    vi.advanceTimersByTime(300);
    f.window.emit('will-move');
    f.window.emit('moved');
    vi.advanceTimersByTime(216);
    expect(f.window.setBounds).not.toHaveBeenCalled();
    expect(f.notify).not.toHaveBeenCalled();
    f.dispose();
  });

  it('clears busy when a gesture starts without any move or resize', () => {
    const f = fixture();
    f.window.emit('will-move');
    vi.advanceTimersByTime(1000);
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(516);
    expect(f.notify).toHaveBeenCalledOnce();
    f.dispose();
  });

  it('restores before a new gesture applies user bounds and cancels the frame', () => {
    const f = fixture();
    const original = f.window.getBounds();
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(500);
    f.window.emit('will-resize');
    expect(f.window.getBounds()).toEqual(original);
    const userBounds = { ...original, width: 1400 };
    f.window.setBounds(userBounds);
    vi.advanceTimersByTime(100);
    expect(f.window.getBounds()).toEqual(userBounds);
    expect(f.notify).not.toHaveBeenCalled();
    f.dispose();
  });

  it('preserves maximized state by refreshing material without a bounds pulse', () => {
    const f = fixture();
    f.window.isMaximized.mockReturnValue(true);
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(516);
    expect(f.window.setBounds).not.toHaveBeenCalled();
    expect(f.notify).toHaveBeenCalledOnce();
    f.dispose();
  });

  it('removes listeners and restores an in-flight pulse on disposal', () => {
    const f = fixture();
    const original = f.window.getBounds();
    f.powerMonitor.emit('resume');
    vi.advanceTimersByTime(500);
    f.dispose();
    expect(f.window.getBounds()).toEqual(original);
    expect(f.screen.listenerCount('display-added')).toBe(0);
    expect(f.powerMonitor.listenerCount('resume')).toBe(0);
    expect(f.window.listenerCount('will-resize')).toBe(0);
    f.screen.emit('display-added');
    vi.advanceTimersByTime(1000);
    expect(f.notify).not.toHaveBeenCalled();
  });

  describe('scale guard', () => {
    const reasonsOf = (f: ReturnType<typeof fixture>) => f.notify.mock.calls.map((call) => call[1].reasons);

    it('checks the first visible window without a focus or display event', async () => {
      const readScale = vi.fn(() => 1);
      const f = fixture('darwin', readScale);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(1000 + 16);
      expect(readScale).toHaveBeenCalledOnce();
      expect(reasonsOf(f)).toEqual([['scale-recheck']]);
      f.dispose();
    });

    it('replays a focus check deferred by a gesture', async () => {
      const readScale = vi.fn(() => 1);
      const f = fixture('darwin', readScale);
      f.window.emit('focus');
      await vi.advanceTimersByTimeAsync(900);
      f.window.emit('will-resize');
      await vi.advanceTimersByTimeAsync(100);
      expect(readScale).not.toHaveBeenCalled();
      f.window.emit('resized');
      await vi.advanceTimersByTimeAsync(1000 + 16);
      expect(readScale).toHaveBeenCalledOnce();
      expect(reasonsOf(f)).toEqual([['scale-recheck']]);
      f.dispose();
    });

    it('replays a pending scale check when the window is shown after being hidden', async () => {
      const readScale = vi.fn(() => 1);
      const f = fixture('darwin', readScale);
      f.window.emit('focus');
      f.window.isVisible.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(1000);
      expect(readScale).not.toHaveBeenCalled();
      f.window.isVisible.mockReturnValue(true);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(1000 + 16);
      expect(readScale).toHaveBeenCalledOnce();
      f.dispose();
    });

    it('samples the renderer again after re-show even without a new focus event', async () => {
      const readScale = vi.fn(() => 1);
      const f = fixture('darwin', readScale);
      f.window.isFocused.mockReturnValue(false);
      f.window.emit('focus');
      await vi.advanceTimersByTimeAsync(1000 + 16 + 1000);
      expect(f.window.showInactive).toHaveBeenCalledOnce();
      readScale.mockReturnValue(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(readScale).toHaveBeenCalledTimes(3);
      expect(f.observeScale.mock.calls.map(([entry]) => entry)).toEqual([
        { reason: 'focus', phase: 'initial', nativeScale: 2, rendererScale: 1, outcome: 'refresh' },
        { reason: 'focus', phase: 'after-refresh', nativeScale: 2, rendererScale: 1, outcome: 'reshow' },
        { reason: 'focus', phase: 'after-reshow', nativeScale: 2, rendererScale: 2, outcome: 'ok' },
      ]);
      expect(f.window.hide).toHaveBeenCalledOnce();
      f.dispose();
    });

    it('records a persistent mismatch after one re-show without starting another recovery', async () => {
      const f = fixture('darwin', () => 1);
      f.window.show.mockImplementation(() => {
        f.window.emit('show');
        f.window.emit('focus');
      });
      f.window.webContents.emit('did-finish-load');
      await vi.advanceTimersByTimeAsync(6000);
      expect(f.observeScale).toHaveBeenLastCalledWith({
        reason: 'renderer-load',
        phase: 'after-reshow',
        nativeScale: 2,
        rendererScale: 1,
        outcome: 'still-low',
      });
      expect(f.window.hide).toHaveBeenCalledOnce();
      expect(f.window.setBounds).toHaveBeenCalledTimes(2);
      expect(vi.getTimerCount()).toBe(0);
      f.dispose();
    });

    it('retries an unavailable renderer sample once and records when no sample was available', async () => {
      const readScale = vi.fn(() => { throw new Error('renderer unavailable'); });
      const f = fixture('darwin', readScale);
      f.window.webContents.emit('did-finish-load');
      await vi.advanceTimersByTimeAsync(2000);
      expect(readScale).toHaveBeenCalledTimes(2);
      expect(f.observeScale).toHaveBeenCalledExactlyOnceWith({
        reason: 'renderer-load',
        phase: 'initial',
        nativeScale: 2,
        rendererScale: null,
        outcome: 'unavailable',
      });
      expect(f.window.setBounds).not.toHaveBeenCalled();
      f.dispose();
    });

    it('ignores a pre-minimize renderer result and checks the restored window', async () => {
      const old = Promise.withResolvers<number>();
      const readScale = vi.fn((): number | Promise<number> => 1).mockReturnValueOnce(old.promise);
      const f = fixture('darwin', readScale);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(1000);
      f.window.isMinimized.mockReturnValue(true);
      f.window.emit('minimize');
      f.window.isMinimized.mockReturnValue(false);
      f.window.emit('restore');
      old.resolve(2);
      await vi.advanceTimersByTimeAsync(1000 + 16);
      expect(readScale).toHaveBeenCalledTimes(2);
      expect(f.observeScale).toHaveBeenCalledExactlyOnceWith({
        reason: 'show', phase: 'initial', nativeScale: 2, rendererScale: 1, outcome: 'refresh',
      });
      f.dispose();
    });

    it('ends a recovery check after two renderer reads miss their deadline', async () => {
      const stalled = Promise.withResolvers<number>();
      const readScale = vi.fn((): number | Promise<number> => stalled.promise).mockReturnValueOnce(1);
      const f = fixture('darwin', readScale);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(16 + 5000);
      expect(readScale).toHaveBeenCalledTimes(3);
      expect(f.observeScale).toHaveBeenLastCalledWith({
        reason: 'show', phase: 'after-refresh', nativeScale: 2, rendererScale: null, outcome: 'unavailable',
      });
      stalled.resolve(1);
      await vi.advanceTimersByTimeAsync(2000);
      expect(f.window.hide).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
      f.dispose();
    });

    it('finishes an interrupted refresh before it can escalate to re-show', async () => {
      const f = fixture('darwin', () => 1);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(1000);
      f.window.emit('will-resize');
      f.window.emit('resized');
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.window.invalidateShadow).toHaveBeenCalledOnce();
      expect(f.window.hide).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(16);
      expect(f.window.hide).toHaveBeenCalledOnce();
      f.dispose();
    });

    it('coalesces a display refresh during a scale recovery pulse without changing the baseline width', async () => {
      const f = fixture('darwin', () => 1);
      const bounds = f.window.getBounds();
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(505);
      f.powerMonitor.emit('resume');
      await vi.advanceTimersByTimeAsync(500);
      expect(f.window.getBounds().width).toBe(bounds.width + 1);
      await vi.advanceTimersByTimeAsync(32);
      expect(f.window.getBounds()).toEqual(bounds);
      expect(reasonsOf(f)).toEqual([['scale-recheck'], ['resume']]);
      f.dispose();
    });

    it('rejects a renderer read that started before a wake refresh', async () => {
      const old = Promise.withResolvers<number>();
      const readScale = vi.fn((): number | Promise<number> => 1).mockReturnValueOnce(old.promise);
      const f = fixture('darwin', readScale);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(505);
      f.powerMonitor.emit('resume');
      await vi.advanceTimersByTimeAsync(516);
      old.resolve(2);
      await vi.advanceTimersByTimeAsync(1000);
      expect(readScale).toHaveBeenCalledTimes(2);
      expect(f.observeScale).toHaveBeenCalledExactlyOnceWith({
        reason: 'show', phase: 'initial', nativeScale: 2, rendererScale: 1, outcome: 'refresh',
      });
      f.dispose();
    });

    it('drops an interrupted scale correction when a new renderer becomes ready', async () => {
      const readScale = vi.fn(() => 2).mockReturnValueOnce(1);
      const f = fixture('darwin', readScale);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(1000);
      f.window.emit('will-resize');
      f.window.webContents.emit('did-finish-load');
      f.window.emit('resized');
      await vi.advanceTimersByTimeAsync(2000);
      expect(f.window.invalidateShadow).not.toHaveBeenCalled();
      expect(f.observeScale).toHaveBeenLastCalledWith({
        reason: 'renderer-load', phase: 'initial', nativeScale: 2, rendererScale: 2, outcome: 'ok',
      });
      f.dispose();
    });

    it('waits for an attached macOS sheet to close before re-showing the window', async () => {
      const f = fixture('darwin', () => 1);
      f.window.emit('show');
      await vi.advanceTimersByTimeAsync(1000 + 16);
      f.window.emit('sheet-begin');
      await vi.advanceTimersByTimeAsync(3000);
      expect(f.window.hide).not.toHaveBeenCalled();
      f.window.emit('sheet-end');
      await vi.advanceTimersByTimeAsync(1000);
      expect(f.window.hide).toHaveBeenCalledOnce();
      f.dispose();
    });

    it('leaves a window alone when the renderer draws at the display scale', async () => {
      const f = fixture('darwin', () => 2);
      f.powerMonitor.emit('resume');
      await vi.advanceTimersByTimeAsync(516 + 5000);
      expect(reasonsOf(f)).toEqual([['resume']]);
      expect(f.window.hide).not.toHaveBeenCalled();
      f.dispose();
    });

    it('refreshes once more when the renderer is still below the display scale, then stops once it recovers', async () => {
      let scale = 1;
      const f = fixture('darwin', () => scale);
      f.screen.emit('display-added');
      await vi.advanceTimersByTimeAsync(516 + 1000);
      scale = 2;
      await vi.advanceTimersByTimeAsync(16 + 5000);
      expect(reasonsOf(f)).toEqual([['display-added'], ['scale-recheck']]);
      expect(f.window.hide).not.toHaveBeenCalled();
      f.dispose();
    });

    it('re-shows a window the second refresh did not bring back, keeping it unfocused if it was', async () => {
      const f = fixture('darwin', () => 1);
      f.window.isFocused.mockReturnValue(false);
      f.screen.emit('display-added');
      await vi.advanceTimersByTimeAsync(516 + 1000 + 16 + 1000);
      expect(f.window.hide).toHaveBeenCalledOnce();
      expect(f.window.showInactive).toHaveBeenCalledOnce();
      expect(f.window.show).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1000);
      expect(reasonsOf(f)).toEqual([['display-added'], ['scale-recheck'], ['scale-reshow']]);
      f.dispose();
    });

    it('does not re-show the same window again within ten minutes', async () => {
      const f = fixture('darwin', () => 1);
      f.screen.emit('display-added');
      await vi.advanceTimersByTimeAsync(516 + 1000 + 16 + 1000 + 1000);
      f.screen.emit('display-removed');
      await vi.advanceTimersByTimeAsync(516 + 1000 + 16 + 1000 + 1000);
      expect(f.window.hide).toHaveBeenCalledOnce();
      f.dispose();
    });

    it('ignores a renderer drawing above the display scale', async () => {
      const f = fixture('darwin', () => 2);
      f.screen.getDisplayMatching.mockReturnValue({ scaleFactor: 1 });
      f.screen.emit('display-removed');
      await vi.advanceTimersByTimeAsync(516 + 5000);
      expect(reasonsOf(f)).toEqual([['display-removed']]);
      f.dispose();
    });

    it('checks on focus without a display event, at most once a minute', async () => {
      const f = fixture('darwin', () => 1);
      f.window.emit('focus');
      await vi.advanceTimersByTimeAsync(1000 + 16);
      expect(reasonsOf(f)).toEqual([['scale-recheck']]);
      f.notify.mockClear();
      f.window.emit('focus');
      await vi.advanceTimersByTimeAsync(30_000);
      expect(f.window.setBounds).toHaveBeenCalledTimes(2);
      f.dispose();
    });

    it('never moves a fullscreen window and cancels pending checks on disposal', async () => {
      const f = fixture('darwin', () => 1);
      f.window.isFullScreen.mockReturnValue(true);
      f.window.emit('focus');
      await vi.advanceTimersByTimeAsync(5000);
      expect(f.window.setBounds).not.toHaveBeenCalled();
      f.window.isFullScreen.mockReturnValue(false);
      f.screen.emit('display-added');
      await vi.advanceTimersByTimeAsync(516);
      f.dispose();
      await vi.advanceTimersByTimeAsync(5000);
      expect(f.window.hide).not.toHaveBeenCalled();
      expect(vi.getTimerCount()).toBe(0);
    });
  });
});
