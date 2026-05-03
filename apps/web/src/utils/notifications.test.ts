import { afterEach, describe, expect, it, vi } from 'vitest';
import { showCompletionNotification } from './notifications';

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
});
