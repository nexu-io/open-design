// @vitest-environment jsdom

/**
 * The bottom-left rocket is the real updater's ready indicator.
 *
 * #6156 shipped a rocket button that was pure theatre: it lived on its own
 * localStorage state machine, drew an eased fake progress ring, and never
 * touched the updater. This suite pins the rocket to the updater's own
 * `shouldShowControl` gate (installer downloaded + never opened) and to the
 * real open-installer → quit handoff, and asserts the simulated-progress
 * affordances are gone.
 */

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
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

function downloadedStatus(
  overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {},
): OpenDesignHostUpdaterStatusSnapshot {
  return {
    ...idleStatus(),
    availableVersion: '1.2.3-beta.4',
    downloadPath: '/tmp/open-design-updater/Open Design Beta.dmg',
    state: 'downloaded',
    ...overrides,
  };
}

function renderIndicator() {
  return render(
    <I18nProvider>
      <UpdaterPopup />
    </I18nProvider>,
  );
}

describe('updater rocket indicator', () => {
  let restoreHost: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restoreHost?.();
    restoreHost = null;
  });

  it('renders nothing while the updater has no installed-and-unopened installer', async () => {
    for (const status of [
      idleStatus(),
      { ...idleStatus(), state: 'not-available' as const },
      // Mid-download: the indicator is a "ready" affordance, so it must stay
      // away until the installer has actually landed.
      downloadedStatus({ progress: { receivedBytes: 50, totalBytes: 100 }, state: 'downloading' }),
      // Installer already handed off — the rocket has spent its purpose.
      downloadedStatus({
        installResult: {
          dryRun: true,
          openedAt: '2026-07-28T00:00:00.000Z',
          path: '/tmp/open-design-updater/Open Design Beta.dmg',
        },
      }),
    ]) {
      restoreHost = installMockOpenDesignHost({
        host: { updater: { status: vi.fn(async () => status) } },
      });

      const view = renderIndicator();
      await act(async () => {
        await Promise.resolve();
      });

      expect(screen.queryByTestId('updater-rocket-glyph')).toBeNull();
      expect(screen.queryByTestId('entry-nav-updater')).toBeNull();
      view.unmount();
      restoreHost?.();
      restoreHost = null;
    }
  });

  it('renders the rocket once an installer is downloaded and unopened', async () => {
    restoreHost = installMockOpenDesignHost({
      host: { updater: { status: vi.fn(async () => downloadedStatus()) } },
    });

    renderIndicator();

    const button = await screen.findByTestId('entry-nav-updater');
    expect(screen.getByTestId('updater-rocket-glyph')).toBeTruthy();
    // Analytics/e2e contract: still the same indicator button.
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('data-tooltip')).toBe('Install update');
    // The simulated-download affordances of the placeholder are gone: the
    // indicator only ever appears when the download has already finished, so a
    // progress ring and a percent face could never say anything true.
    expect(screen.queryByTestId('update-reminder-progress')).toBeNull();
    expect(screen.queryByText(/%$/)).toBeNull();
  });

  it('drives the real open-installer then quit handoff from the rocket', async () => {
    let status = downloadedStatus();
    const install = vi.fn(async () => {
      status = downloadedStatus({
        installResult: {
          dryRun: true,
          openedAt: '2026-07-28T00:00:00.000Z',
          path: '/tmp/open-design-updater/Open Design Beta.dmg',
        },
      });
      return status;
    });
    const quit = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({
      host: { updater: { install, quit, status: vi.fn(async () => status) } },
    });

    renderIndicator();

    fireEvent.click(await screen.findByTestId('updater-rocket-glyph'));
    fireEvent.click(await screen.findByTestId('updater-install-button'));

    await waitFor(() => expect(install).toHaveBeenCalledWith({ payload: { source: 'updater-prompt' } }));
    await waitFor(() => expect(quit).toHaveBeenCalledWith({ payload: { source: 'updater-prompt' } }));
  });
});
