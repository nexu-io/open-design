// OPEND-4390 — on Windows, closing the main window while tasks are running
// must not quit Open Design. The window hides to a notification-area icon
// so the tasks keep running; the icon is the way back (click / "Open") and
// the way out ("Quit", which still asks before interrupting tasks). The icon
// only exists while the window is hidden, and disappears once it is shown.

import { describe, expect, test, vi } from 'vitest';

import {
  backgroundTrayLabels,
  createBackgroundTray,
  nonDarwinCloseAction,
  type BackgroundTraySurface,
  type BackgroundTrayMenuItem,
} from '../../src/main/close-to-tray.js';

describe('nonDarwinCloseAction', () => {
  test('Windows hides to the tray only while tasks are running', () => {
    expect(nonDarwinCloseAction('win32', { state: 'blocked', activeRunCount: 2 })).toBe('hide-to-tray');
    expect(nonDarwinCloseAction('win32', { state: 'clear', activeRunCount: 0 })).toBe('close');
    // Unknown (daemon unreachable) must not trap the user in a hidden app.
    expect(nonDarwinCloseAction('win32', { state: 'unknown', activeRunCount: null })).toBe('close');
  });

  test('Linux keeps the confirmation dialog, since tray support varies by desktop', () => {
    expect(nonDarwinCloseAction('linux', { state: 'blocked', activeRunCount: 1 })).toBe('confirm');
    expect(nonDarwinCloseAction('linux', { state: 'clear', activeRunCount: 0 })).toBe('close');
    expect(nonDarwinCloseAction('linux', { state: 'unknown', activeRunCount: null })).toBe('close');
  });
});

describe('backgroundTrayLabels', () => {
  test('follows the OS locale in Chinese and English', () => {
    const zh = backgroundTrayLabels('Open Design', 2, 'zh-CN');
    expect(zh.open).toBe('打开 Open Design');
    expect(zh.quit).toBe('退出');
    expect(zh.balloonTitle).toBe('Open Design 仍在后台运行');
    expect(zh.balloonContent).toContain('2 个任务');

    const en = backgroundTrayLabels('Open Design Beta', 1, 'en-US');
    expect(en.open).toBe('Open Open Design Beta');
    expect(en.quit).toBe('Quit');
    expect(en.balloonTitle).toBe('Open Design Beta is still running');
    expect(en.balloonContent).toContain('1 task keeps');
  });
});

describe('createBackgroundTray', () => {
  function setup(options: { confirmQuit?: () => Promise<boolean> } = {}) {
    const trays: Array<{
      surface: BackgroundTraySurface;
      menu: BackgroundTrayMenuItem[] | null;
      tooltip: string | null;
      balloons: number;
      destroyed: boolean;
      clickListener: (() => void) | null;
    }> = [];
    const createTray = vi.fn(() => {
      const record = {
        menu: null as BackgroundTrayMenuItem[] | null,
        tooltip: null as string | null,
        balloons: 0,
        destroyed: false,
        clickListener: null as (() => void) | null,
        surface: null as unknown as BackgroundTraySurface,
      };
      record.surface = {
        setToolTip: (text) => { record.tooltip = text; },
        setContextMenu: (items) => { record.menu = items; },
        onClick: (listener) => { record.clickListener = listener; },
        displayBalloon: () => { record.balloons += 1; },
        destroy: () => { record.destroyed = true; },
        isDestroyed: () => record.destroyed,
      };
      trays.push(record);
      return record.surface;
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
    return { tray, trays, createTray, window, requestQuit };
  }

  test('hiding puts the window away and shows a tray icon with Open and Quit', () => {
    const { tray, trays, window } = setup();

    tray.hideToTray(2);

    expect(window.hide).toHaveBeenCalledTimes(1);
    expect(trays).toHaveLength(1);
    expect(trays[0]!.tooltip).toBe('Open Design');
    expect(trays[0]!.menu?.map((item) => item.label)).toEqual(['打开 Open Design', '退出']);
  });

  test('explains the background state once per session, not on every hide', () => {
    const { tray, trays } = setup();

    tray.hideToTray(1);
    tray.windowShown();
    tray.hideToTray(1);

    expect(trays).toHaveLength(2);
    expect(trays[0]!.balloons + trays[1]!.balloons).toBe(1);
  });

  test('clicking the icon or Open restores the window and removes the icon', () => {
    const { tray, trays, window } = setup();

    tray.hideToTray(1);
    trays[0]!.clickListener?.();
    expect(window.show).toHaveBeenCalledTimes(1);
    // Showing the window fires its `show` event, which the runtime routes here.
    tray.windowShown();
    expect(trays[0]!.destroyed).toBe(true);

    tray.hideToTray(1);
    trays[1]!.menu?.[0]!.click();
    expect(window.show).toHaveBeenCalledTimes(2);
  });

  test('keeps a single icon when hidden repeatedly', () => {
    const { tray, trays } = setup();

    tray.hideToTray(1);
    tray.hideToTray(1);

    expect(trays).toHaveLength(1);
  });

  test('Quit asks first and keeps running when the user backs out', async () => {
    const confirmQuit = vi.fn(async () => false);
    const { tray, trays, requestQuit } = setup({ confirmQuit });

    tray.hideToTray(1);
    trays[0]!.menu?.[1]!.click();
    await vi.waitFor(() => expect(confirmQuit).toHaveBeenCalledTimes(1));
    await Promise.resolve();

    expect(requestQuit).not.toHaveBeenCalled();
    expect(trays[0]!.destroyed).toBe(false);
  });

  test('Quit shuts the app down once confirmed', async () => {
    const { tray, trays, requestQuit } = setup();

    tray.hideToTray(1);
    trays[0]!.menu?.[1]!.click();

    await vi.waitFor(() => expect(requestQuit).toHaveBeenCalledTimes(1));
  });

  test('dispose removes the icon so it does not outlive the app', () => {
    const { tray, trays } = setup();

    tray.hideToTray(1);
    tray.dispose();

    expect(trays[0]!.destroyed).toBe(true);
  });
});
