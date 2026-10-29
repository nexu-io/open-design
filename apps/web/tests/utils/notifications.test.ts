import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignHost } from '@open-design/host/testing';
import { showCompletionNotification } from '../../src/utils/notifications';

type NotificationOptionsWithRenotify = NotificationOptions & { renotify?: boolean };

class MockNotification {
  static permission: NotificationPermission = 'granted';
  static instances: MockNotification[] = [];

  onclose: (() => void) | null = null;
  onclick: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    public title: string,
    public options?: NotificationOptionsWithRenotify,
  ) {
    MockNotification.instances.push(this);
  }

  close(): void {
    // Fire synchronously so tests can observe cleanup without browser events.
    this.onclose?.();
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  MockNotification.permission = 'granted';
  MockNotification.instances = [];
});

describe('showCompletionNotification', () => {
  it('creates a renotifying desktop notification when permission is granted', async () => {
    vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);

    const result = await showCompletionNotification({
      status: 'succeeded',
      title: 'Task completed',
      body: 'Done',
    });

    expect(result).toBe('shown');
    expect(MockNotification.instances).toHaveLength(1);
    expect(MockNotification.instances[0]!.title).toBe('Task completed');
    expect(MockNotification.instances[0]!.options).toMatchObject({
      body: 'Done',
      tag: 'od-task-succeeded',
      renotify: true,
    });
  });

  it('uses the service worker notification API when available', async () => {
    const showNotification = vi.fn().mockResolvedValue(undefined);
    const registration = { showNotification };
    const register = vi.fn().mockResolvedValue(registration);
    vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);
    vi.stubGlobal('navigator', {
      serviceWorker: {
        register,
        ready: Promise.resolve(registration),
      },
    });

    const result = await showCompletionNotification({
      status: 'succeeded',
      title: 'Task completed',
      body: 'Done',
    });

    expect(result).toBe('shown');
    expect(register).toHaveBeenCalledWith('/od-notifications-sw.js');
    expect(showNotification).toHaveBeenCalledWith(
      'Task completed',
      expect.objectContaining({
        body: 'Done',
        tag: 'od-task-succeeded',
        renotify: true,
      }),
    );
    expect(MockNotification.instances).toHaveLength(0);
  });

  it('does not create a notification when permission is not granted', async () => {
    MockNotification.permission = 'denied';
    vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);

    const result = await showCompletionNotification({
      status: 'failed',
      title: 'Task failed',
      body: 'Error',
    });

    expect(result).toBe('permission-denied');
    expect(MockNotification.instances).toHaveLength(0);
  });

  /**
   * P0-24 N11, measured on macOS (Electron 41): a service-worker notification
   * resolves but never reaches Notification Center, while a constructor
   * notification does and its click brings the window back.
   */
  describe('in the desktop client', () => {
    it('skips the service worker and shows a constructor notification', async () => {
      const uninstall = installMockOpenDesignHost({ host: { window: { show: vi.fn() } } });
      const register = vi.fn();
      vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);
      vi.stubGlobal('navigator', { serviceWorker: { register, ready: new Promise(() => {}) } });
      try {
        const result = await showCompletionNotification({ status: 'succeeded', title: 'Project', body: 'New reply' });
        expect(result).toBe('shown');
        expect(register).not.toHaveBeenCalled();
        expect(MockNotification.instances).toHaveLength(1);
      } finally {
        uninstall();
      }
    });

    it('brings the window back through the host on click, not window.focus()', async () => {
      const show = vi.fn();
      const uninstall = installMockOpenDesignHost({ host: { window: { show } } });
      const focus = vi.fn();
      vi.stubGlobal('window', { focus, location: { href: 'http://127.0.0.1/' } });
      const onClick = vi.fn();
      vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);
      try {
        await showCompletionNotification({ status: 'failed', title: 'Project', body: 'Run failed', onClick });
        MockNotification.instances[0]!.onclick?.();
        expect(show).toHaveBeenCalledTimes(1);
        expect(focus).not.toHaveBeenCalled();
        expect(onClick).toHaveBeenCalledTimes(1);
      } finally {
        uninstall();
      }
    });

    it('falls back to window.focus() on a desktop host without window control', async () => {
      const uninstall = installMockOpenDesignHost();
      const focus = vi.fn();
      vi.stubGlobal('window', { focus, location: { href: 'http://127.0.0.1/' } });
      vi.stubGlobal('Notification', MockNotification as unknown as typeof Notification);
      try {
        await showCompletionNotification({ status: 'succeeded', title: 'Project', body: 'New reply' });
        MockNotification.instances[0]!.onclick?.();
        expect(focus).toHaveBeenCalledTimes(1);
      } finally {
        uninstall();
      }
    });
  });
});
