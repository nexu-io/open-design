import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { attachDisplayRefresh } from '../../src/main/display-refresh.js';

function fixture(platform = 'darwin') {
  const screen = Object.assign(new EventEmitter(), {
    getDisplayMatching: vi.fn(() => ({ scaleFactor: 2 })),
    getAllDisplays: () => [{}, {}],
  });
  const powerMonitor = new EventEmitter();
  let bounds = { x: 100, y: 200, width: 1280, height: 900 };
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false),
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    isFullScreen: vi.fn(() => false),
    isMaximized: vi.fn(() => false),
    getBounds: () => ({ ...bounds }),
    setBounds: vi.fn((next: typeof bounds) => { bounds = { ...next }; }),
    setVibrancy: vi.fn(),
    invalidateShadow: vi.fn(),
  });
  const notify = vi.fn();
  const dispose = attachDisplayRefresh({ platform, screen, powerMonitor,
    getWindows: () => [window], notify, setTimeout, clearTimeout });
  const nativeResize = (next: typeof bounds) => { bounds = { ...next }; };
  return { screen, powerMonitor, window, notify, dispose, nativeResize };
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
});
