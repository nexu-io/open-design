// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenDesignHostUpdaterStatusListener, OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { UpdaterPopup } from '../../src/components/UpdaterPopup';
import { I18nProvider } from '../../src/i18n';

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

function payloadDownloadedStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
  return downloadedStatus({
    artifact: {
      name: 'open-design-1.2.3-beta.4-mac-arm64-payload.zip',
      platformKey: 'mac',
      size: 1024,
      type: 'payload',
      url: 'https://example.test/payload.zip',
    },
    capabilities: {
      canApplyInPlace: true,
      canDownload: true,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    downloadPath: '/tmp/open-design-updater/open-design-1.2.3-beta.4-mac-arm64-payload.zip',
    ...overrides,
  });
}

describe('UpdaterPopup', () => {
  let restoreHost: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restoreHost?.();
    restoreHost = null;
  });

  it('stays hidden for non-installable updater states', async () => {
    for (const status of [
      idleStatus(),
      { ...idleStatus(), state: 'not-available' as const },
      downloadedStatus({
        progress: {
          receivedBytes: 50,
          totalBytes: 100,
        },
        state: 'downloading',
      }),
      downloadedStatus({
        downloadPath: undefined,
        error: {
          code: 'update-store-invalid-shape',
          message: 'update store contains unexpected root entries',
        },
        state: 'error',
      }),
    ]) {
      restoreHost = installMockOpenDesignHost({
        host: {
          updater: {
            status: vi.fn(async () => status),
          },
        },
      });

      const view = render(<UpdaterPopup />);
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByTestId('entry-nav-updater')).toBeNull();
      expect(screen.queryByTestId('updater-popup')).toBeNull();
      view.unmount();
      restoreHost?.();
      restoreHost = null;
    }
  });

  it('shows only the ready indicator until the user opens the install prompt', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup />);

    const button = await screen.findByTestId('entry-nav-updater');
    expect(button.getAttribute('data-tooltip')).toBe('Install update');
    expect(screen.queryByTestId('updater-popup')).toBeNull();

    fireEvent.click(button);

    const dialog = await screen.findByRole('dialog', { name: 'Update ready' });
    expect(dialog).toBeTruthy();
    expect(dialog.className).toBe('updater-popup is-ready');
    expect(screen.getByText('Open Design 1.2.3-beta.4 is ready. Open Design will close and open the installer.')).toBeTruthy();
    expect(screen.getByTestId('updater-silent-update-checkbox')).toBeChecked();
    expect(screen.getByTestId('updater-install-button').textContent).toBe('Install update');
    expect(screen.queryByRole('button', { name: 'Collapse' })).toBeNull();
  });

  it('uses localized ready prompt copy from the app i18n provider', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(
      <I18nProvider initial="zh-CN">
        <UpdaterPopup />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));

    expect(await screen.findByRole('dialog', { name: '更新已就绪' })).toBeTruthy();
    expect(screen.getByTestId('updater-install-button').textContent).toBe('安装更新');
    expect(screen.getByText('Open Design 1.2.3-beta.4 已就绪。Open Design 会关闭并打开安装器。')).toBeTruthy();
  });

  it('uses install-and-restart copy for payload updates', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => payloadDownloadedStatus()),
        },
      },
    });

    render(
      <I18nProvider initial="zh-CN">
        <UpdaterPopup />
      </I18nProvider>,
    );

    const button = await screen.findByTestId('entry-nav-updater');
    expect(button.getAttribute('data-tooltip')).toBe('安装并重启');
    fireEvent.click(button);

    expect(await screen.findByRole('dialog', { name: '更新已就绪' })).toBeTruthy();
    expect(screen.getByTestId('updater-install-button').textContent).toBe('安装并重启');
    expect(screen.getByText('Open Design 1.2.3-beta.4 已就绪。Open Design 会关闭并自动重启。')).toBeTruthy();
  });

  it('seeds the default silent-update preference only after a successful daemon GET', async () => {
    const persistSilentUpdates = vi.fn(async () => undefined);
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    const view = render(
      <UpdaterPopup onAllowSilentUpdatesChange={persistSilentUpdates} />,
    );

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    expect((screen.getByTestId('updater-silent-update-checkbox') as HTMLInputElement).checked).toBe(true);
    // Before a successful GET, undefined must not be treated as "no preference".
    expect(persistSilentUpdates).not.toHaveBeenCalled();

    view.rerender(
      <UpdaterPopup
        silentUpdatePreferenceReady
        onAllowSilentUpdatesChange={persistSilentUpdates}
      />,
    );
    await waitFor(() => expect(persistSilentUpdates).toHaveBeenCalledWith(true));
  });

  it('does not seed when daemon GET failed (ready=false) even if bootstrap finished', async () => {
    const persistSilentUpdates = vi.fn(async () => undefined);
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(
      <UpdaterPopup
        // Bootstrap completed but GET returned null — must not seed over a
        // daemon-backed opt-out we never successfully read.
        silentUpdatePreferenceReady={false}
        onAllowSilentUpdatesChange={persistSilentUpdates}
      />,
    );

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(persistSilentUpdates).not.toHaveBeenCalled();
  });

  it('does not seed true over a daemon opt-out that was temporarily undefined during hydration', async () => {
    const persistSilentUpdates = vi.fn(async () => undefined);
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    const view = render(
      <UpdaterPopup onAllowSilentUpdatesChange={persistSilentUpdates} />,
    );
    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    expect(persistSilentUpdates).not.toHaveBeenCalled();

    // Daemon hydrate lands with an explicit opt-out after the prompt opened.
    view.rerender(
      <UpdaterPopup
        allowSilentUpdates={false}
        silentUpdatePreferenceReady
        onAllowSilentUpdatesChange={persistSilentUpdates}
      />,
    );

    await waitFor(() => {
      expect((screen.getByTestId('updater-silent-update-checkbox') as HTMLInputElement).checked).toBe(false);
    });
    expect(persistSilentUpdates).not.toHaveBeenCalled();
  });

  it('re-enables the checkbox after seed when the parent re-renders with the saved true', async () => {
    let resolveSave: (() => void) | null = null;
    const persistSilentUpdates = vi.fn(
      () => new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    const view = render(
      <UpdaterPopup
        silentUpdatePreferenceReady
        onAllowSilentUpdatesChange={persistSilentUpdates}
      />,
    );

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    await waitFor(() => expect(persistSilentUpdates).toHaveBeenCalledWith(true));
    const checkbox = screen.getByTestId('updater-silent-update-checkbox') as HTMLInputElement;
    expect(checkbox.disabled).toBe(true);

    // Real parent shape: config updates mid-flight when the write is accepted.
    view.rerender(
      <UpdaterPopup
        allowSilentUpdates={true}
        silentUpdatePreferenceReady
        onAllowSilentUpdatesChange={persistSilentUpdates}
      />,
    );

    await act(async () => {
      resolveSave?.();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect((screen.getByTestId('updater-silent-update-checkbox') as HTMLInputElement).disabled).toBe(false);
    });
    expect(screen.queryByTestId('updater-silent-update-error')).toBeNull();
  });

  it('persists silent-update toggles immediately and reverts when the non-optimistic save fails', async () => {
    // Parent-shaped: only mutate app config after the daemon write succeeds.
    let appConfig: { allowSilentUpdates?: boolean } = { allowSilentUpdates: false };
    const persistSilentUpdates = vi.fn(async (value: boolean) => {
      await Promise.reject(new Error('daemon offline'));
      appConfig = { allowSilentUpdates: value };
    });
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(
      <UpdaterPopup
        allowSilentUpdates={appConfig.allowSilentUpdates}
        silentUpdatePreferenceReady
        onAllowSilentUpdatesChange={persistSilentUpdates}
      />,
    );

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    const checkbox = screen.getByTestId('updater-silent-update-checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    expect(persistSilentUpdates).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(checkbox);
    });
    await waitFor(() => expect(persistSilentUpdates).toHaveBeenCalledWith(true));
    await waitFor(() => {
      expect((screen.getByTestId('updater-silent-update-checkbox') as HTMLInputElement).checked).toBe(false);
    });
    expect(screen.getByTestId('updater-silent-update-error')).toBeTruthy();
    // App-wide config must not keep the rejected value.
    expect(appConfig.allowSilentUpdates).toBe(false);
  });

  it('renders an explicit disabled silent update preference as unchecked', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup allowSilentUpdates={false} silentUpdatePreferenceReady />);

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    expect((screen.getByTestId('updater-silent-update-checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('dismisses the confirmation prompt before installation starts', async () => {
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup />);

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    expect(await screen.findByRole('dialog', { name: 'Update ready' })).toBeTruthy();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('updater-popup')).toBeNull();

    fireEvent.click(screen.getByTestId('entry-nav-updater'));
    fireEvent.click(screen.getByRole('button', { name: 'Later' }));
    expect(screen.queryByTestId('updater-popup')).toBeNull();
  });

  it('keeps the prompt in handoff loading after opening the installer', async () => {
    let status = downloadedStatus();
    let resolveInstall: (status: OpenDesignHostUpdaterStatusSnapshot) => void = () => undefined;
    const install = vi.fn(() => new Promise<OpenDesignHostUpdaterStatusSnapshot>((resolve) => {
      resolveInstall = resolve;
    }));
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

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    fireEvent.click(screen.getByTestId('updater-install-button'));
    fireEvent.click(screen.getByTestId('updater-install-button'));

    expect(install).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Opening installer...' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Later' }).getAttribute('disabled')).not.toBeNull();

    await act(async () => {
      status = downloadedStatus({
        installResult: {
          dryRun: true,
          openedAt: '2026-05-19T00:00:00.000Z',
          path: '/tmp/open-design-updater/Open Design Beta.dmg',
        },
      });
      resolveInstall(status);
      await Promise.resolve();
    });

    await waitFor(() => expect(install).toHaveBeenCalledWith({ payload: { source: 'updater-prompt' } }));
    await waitFor(() => expect(quit).toHaveBeenCalledWith({ payload: { source: 'updater-prompt' } }));
    expect(screen.getByTestId('entry-nav-updater')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Update ready' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Opening installer...' }).getAttribute('disabled')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Later' }).getAttribute('disabled')).not.toBeNull();
  });

  it('recovers the handoff prompt if the app has not closed after the watchdog', async () => {
    const install = vi.fn(async () => downloadedStatus({
      installResult: {
        dryRun: true,
        openedAt: '2026-05-19T00:00:00.000Z',
        path: '/tmp/open-design-updater/Open Design Beta.dmg',
      },
    }));
    const quit = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          quit,
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup />);

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    vi.useFakeTimers();
    try {
      fireEvent.click(screen.getByTestId('updater-install-button'));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByRole('button', { name: 'Opening installer...' }).getAttribute('disabled')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(10_000);
      });

      expect(screen.getByRole('dialog', { name: 'Update ready' })).toBeTruthy();
      expect(screen.getByTestId('updater-install-button').textContent).toBe('Install update');
      expect(screen.getByTestId('updater-install-button').getAttribute('disabled')).toBeNull();
      fireEvent.click(screen.getByTestId('updater-install-button'));

      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(install).toHaveBeenCalledTimes(2);
      expect(quit).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps install failures internal and leaves the ready prompt usable', async () => {
    const install = vi.fn(async () => downloadedStatus({
      error: {
        code: 'open-installer-failed',
        message: 'fixture open failed',
      },
      state: 'error',
    }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          install,
          status: vi.fn(async () => downloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup />);

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    fireEvent.click(screen.getByTestId('updater-install-button'));

    await waitFor(() => expect(install).toHaveBeenCalledWith({ payload: { source: 'updater-prompt' } }));
    expect(screen.queryByText('fixture open failed')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Update failed' })).toBeNull();
    expect(await screen.findByRole('dialog', { name: 'Update ready' })).toBeTruthy();
    expect(screen.getByTestId('updater-install-button').getAttribute('disabled')).toBeNull();
  });

  it('reacts to updater subscription events by showing the ready indicator only', async () => {
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
    expect(screen.queryByTestId('entry-nav-updater')).toBeNull();

    act(() => {
      for (const listener of listeners) listener(downloadedStatus());
    });

    expect(await screen.findByTestId('entry-nav-updater')).toBeTruthy();
    expect(screen.queryByTestId('updater-popup')).toBeNull();
  });
});
