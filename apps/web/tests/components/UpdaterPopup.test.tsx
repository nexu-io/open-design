// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenDesignHostUpdaterStatusListener, OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { UpdaterPopup } from '../../src/components/UpdaterPopup';

function idleStatus(): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'arm64',
    capabilities: {
      canApplyInPlace: false,
      canDownload: true,
      canOpenInstaller: true,
      requiresManualInstall: true,
    },
    channel: 'beta',
    currentVersion: '1.2.3-beta.3',
    enabled: true,
    mode: 'package-launcher',
    platform: 'darwin',
    state: 'idle',
    supported: true,
  };
}

function downloadedStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
  return {
    ...idleStatus(),
    availableVersion: '1.2.3-beta.4',
    downloadPath: '/tmp/open-design-updater/Open Design Beta.dmg',
    state: 'downloaded',
    ...overrides,
  };
}

describe('UpdaterPopup', () => {
  let restoreHost: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restoreHost?.();
    restoreHost = null;
  });

  it('waits for host status and opens the installer from the popup', async () => {
    let status = downloadedStatus();
    const install = vi.fn(async () => {
      status = downloadedStatus({
        installResult: {
          dryRun: true,
          openedAt: '2026-05-19T00:00:00.000Z',
          path: status.downloadPath ?? '/tmp/open-design-updater/Open Design Beta.dmg',
        },
      });
      return status;
    });
    const quit = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          quit,
          status: vi.fn(async () => status),
        },
      },
    });

    render(<UpdaterPopup />);

    expect(await screen.findByRole('dialog', { name: 'Update ready' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('updater-install-button'));
    expect(await screen.findByRole('dialog', { name: 'Installer opened' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('updater-quit-button'));
    expect(install).toHaveBeenCalledWith({ payload: { source: 'updater-popup' } });
    expect(quit).toHaveBeenCalledWith({ payload: { source: 'updater-popup' } });
  });

  it('reacts to updater subscription events without polling-only behavior', async () => {
    const listeners = new Set<OpenDesignHostUpdaterStatusListener>();
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => idleStatus()),
          subscribe: vi.fn((listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
          }),
        },
      },
    });

    render(<UpdaterPopup />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.queryByTestId('updater-popup')).toBeNull();

    act(() => {
      for (const listener of listeners) listener(downloadedStatus());
    });
    expect(await screen.findByRole('dialog', { name: 'Update ready' })).toBeTruthy();
    expect(screen.getByTestId('entry-nav-updater')).toBeTruthy();
  });

  it('shows disabled left-rail progress while an update is downloading', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus({
            progress: {
              receivedBytes: 50,
              totalBytes: 100,
            },
            state: 'downloading',
          })),
        },
      },
    });

    render(<UpdaterPopup />);

    const trigger = await screen.findByTestId('entry-nav-updater');
    expect(trigger.getAttribute('aria-disabled')).toBe('true');
    expect(screen.queryByTestId('updater-popup')).toBeNull();
    expect(screen.getByRole('progressbar', { name: 'Downloading update 50%' }).getAttribute('aria-valuenow')).toBe('50');
  });

  it('keeps the popup open when opening the installer returns an updater error state', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          install: vi.fn(async () => downloadedStatus({
            error: {
              code: 'open-installer-failed',
              message: 'fixture open failed',
            },
            state: 'error',
          })),
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup />);
    expect(await screen.findByRole('dialog', { name: 'Update ready' })).toBeTruthy();
    fireEvent.click(screen.getByTestId('updater-install-button'));
    expect(await screen.findByRole('dialog', { name: 'Update failed' })).toBeTruthy();
    expect(screen.getByText('fixture open failed')).toBeTruthy();
  });

  it('renders status errors as failed updates instead of a disabled ready action', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus({
            downloadPath: undefined,
            error: {
              code: 'update-store-invalid-shape',
              message: 'update store contains unexpected root entries',
            },
            state: 'error',
          })),
        },
      },
    });

    render(<UpdaterPopup />);

    const trigger = await screen.findByTestId('entry-nav-updater');
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog', { name: 'Update failed' })).toBeTruthy();
    expect(screen.getByText('update store contains unexpected root entries')).toBeTruthy();
    expect(screen.queryByTestId('updater-install-button')).toBeNull();
  });
});
