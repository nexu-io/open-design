// OPEND-4390 — on Windows, closing the main window must not quit Open Design
// and interrupt running tasks. Like chat apps that live in the notification
// area, every close hides the window behind a tray icon; the icon is the way
// back (click / "Open") and the way out ("Quit", which still asks before
// interrupting tasks).

import { describe, expect, test, vi } from 'vitest';

import {
  attachWindowsCloseToTray,
  backgroundTrayLabels,
  createBackgroundTray,
  type BackgroundTraySurface,
  type BackgroundTrayMenuItem,
} from '../../src/main/close-to-tray.js';

describe('attachWindowsCloseToTray', () => {
  function setup(stopped: () => boolean) {
    let listener: ((event: { preventDefault: () => void }) => void) | null = null;
    const hideToTray = vi.fn();
    attachWindowsCloseToTray(
      { on: (_event, next) => { listener = next; } },
      { isStopped: stopped, hideToTray },
    );
    const emitClose = () => {
      const result = { prevented: false };
      listener?.({ preventDefault: () => { result.prevented = true; } });
      return result;
    };
    return { emitClose, hideToTray };
  }

  test('every close hides to the tray instead of quitting', () => {
    const { emitClose, hideToTray } = setup(() => false);

    expect(emitClose().prevented).toBe(true);
    expect(emitClose().prevented).toBe(true);
    expect(hideToTray).toHaveBeenCalledTimes(2);
  });

  test('lets the app shutdown path close the window', () => {
    const { emitClose, hideToTray } = setup(() => true);

    expect(emitClose().prevented).toBe(false);
    expect(hideToTray).not.toHaveBeenCalled();
  });
});

describe('backgroundTrayLabels', () => {
  test('follows the OS locale in Chinese and English', () => {
    const zh = backgroundTrayLabels('Open Design', 'zh-CN');
    expect(zh.open).toBe('打开 Open Design');
    expect(zh.quit).toBe('退出');
    expect(zh.balloonTitle).toBe('Open Design 仍在后台运行');
    expect(zh.balloonContent).toContain('退出');

    const en = backgroundTrayLabels('Open Design Beta', 'en-US');
    expect(en.open).toBe('Open Open Design Beta');
    expect(en.quit).toBe('Quit');
    expect(en.balloonTitle).toBe('Open Design Beta is still running');
    expect(en.balloonContent).toContain('Quit');
  });
});

describe('createBackgroundTray', () => {
  function setup(options: { confirmQuit?: () => Promise<boolean> } = {}) {
    const trays: Array<{
      menu: BackgroundTrayMenuItem[] | null;
      tooltip: string | null;
      balloons: number;
      destroyed: boolean;
      clickListener: (() => void) | null;
    }> = [];
    const createTray = vi.fn((): BackgroundTraySurface => {
      const record = {
        menu: null as BackgroundTrayMenuItem[] | null,
        tooltip: null as string | null,
        balloons: 0,
        destroyed: false,
        clickListener: null as (() => void) | null,
      };
      trays.push(record);
      return {
        setToolTip: (text) => { record.tooltip = text; },
        setContextMenu: (items) => { record.menu = items; },
        onClick: (listener) => { record.clickListener = listener; },
        displayBalloon: () => { record.balloons += 1; },
        destroy: () => { record.destroyed = true; },
        isDestroyed: () => record.destroyed,
      };
    });
    const window = { hide: vi.fn(), show: vi.fn() };
    const requestQuit = vi.fn();
    const tray = createBackgroundTray({
      createTray,
      window,
      productName: 'Open Design',
      locale: () => 'zh-CN',
      confirmQuit: options.confirmQuit ?? (async () => true),
      requestQuit,
    });
    return { tray, trays, window, requestQuit };
  }

  test('install shows one icon with Open and Quit, before any close', () => {
    const { tray, trays } = setup();

    tray.install();
    tray.install();

    expect(trays).toHaveLength(1);
    expect(trays[0]!.tooltip).toBe('Open Design');
    expect(trays[0]!.menu?.map((item) => item.label)).toEqual(['打开 Open Design', '退出']);
  });

  test('hiding keeps the same icon and explains the background state once', () => {
    const { tray, trays, window } = setup();

    tray.install();
    tray.hideToTray();
    tray.hideToTray();

    expect(window.hide).toHaveBeenCalledTimes(2);
    expect(trays).toHaveLength(1);
    expect(trays[0]!.balloons).toBe(1);
  });

  test('the icon stays after the window comes back, and click or Open restores it', () => {
    const { tray, trays, window } = setup();

    tray.hideToTray();
    trays[0]!.clickListener?.();
    trays[0]!.menu?.[0]!.click();

    expect(window.show).toHaveBeenCalledTimes(2);
    expect(trays[0]!.destroyed).toBe(false);
  });

  test('Quit asks first and keeps running when the user backs out', async () => {
    const confirmQuit = vi.fn(async () => false);
    const { tray, trays, requestQuit } = setup({ confirmQuit });

    tray.install();
    trays[0]!.menu?.[1]!.click();
    trays[0]!.menu?.[1]!.click();
    await vi.waitFor(() => expect(confirmQuit).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(requestQuit).not.toHaveBeenCalled();
    expect(trays[0]!.destroyed).toBe(false);
  });

  test('Quit shuts the app down once confirmed', async () => {
    const { tray, trays, requestQuit } = setup();

    tray.install();
    trays[0]!.menu?.[1]!.click();

    await vi.waitFor(() => expect(requestQuit).toHaveBeenCalledTimes(1));
  });

  test('dispose removes the icon and a late install does not bring it back', () => {
    const { tray, trays } = setup();

    tray.install();
    tray.dispose();
    tray.install();

    expect(trays).toHaveLength(1);
    expect(trays[0]!.destroyed).toBe(true);
  });
});
