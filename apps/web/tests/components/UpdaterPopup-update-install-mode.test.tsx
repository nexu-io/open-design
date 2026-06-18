// @vitest-environment jsdom

// Tests for the manual-install-required copy branch in UpdaterPopup — #4467 (PR1).
//
// Spec: UpdaterPopup renders a distinct copy branch when requiresManualInstall is true.
// A new i18n key is added and all 18 locales updated.
//
// The test verifies that:
// 1. When requiresManualInstall: true, the popup body text uses the manual-install
//    copy (not the payload copy and not the standard installer copy).
// 2. The entry-nav tooltip text reflects the manual-install state.
//
// These tests are RED until the implementation lands (new i18n keys missing).

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { UpdaterPopup } from '../../src/components/UpdaterPopup';
import { I18nProvider } from '../../src/i18n';

// Status representing a downloaded DMG/installer where the updater requires
// the user to apply the update by running the installer manually rather than
// an in-place payload swap. This is the REAL capability combo that
// capabilitiesFor (apps/desktop/src/main/updater.ts) emits for a packaged
// DMG/installer artifact: requiresManualInstall AND canOpenInstaller are both
// true (they are coupled at the source), canApplyInPlace is false. The earlier
// fixture used canOpenInstaller:false, an impossible combo that masked the
// dead-branch bug in isManualInstallCase.
function manualInstallDownloadedStatus(
  overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {},
): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'arm64',
    artifact: {
      name: 'Open Design Beta.dmg',
      platformKey: 'macAppleSilicon',
      type: 'dmg',
      url: 'https://fixture.test/Open Design Beta.dmg',
    },
    availableVersion: '1.2.3-beta.4',
    capabilities: {
      canApplyInPlace: false,
      canDownload: true,
      canOpenInstaller: true,
      requiresManualInstall: true,
    },
    channel: 'beta',
    currentVersion: '1.2.3-beta.3',
    downloadPath: '/tmp/open-design-updater/Open Design Beta.dmg',
    enabled: true,
    mode: 'package-launcher',
    platform: 'darwin',
    state: 'downloaded',
    supported: true,
    ...overrides,
  };
}

describe('UpdaterPopup manual-install-required copy branch', () => {
  let restoreHost: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restoreHost?.();
    restoreHost = null;
  });

  it('shows the manual-install-required copy when requiresManualInstall: true', async () => {
    // With the real combo (requiresManualInstall: true), isManualInstallCase
    // must be true, so the popup renders the manual-install copy
    // (updater.manualInstallReadyVersion + updater.manualInstallAction), NOT
    // the payload "restart automatically" copy and NOT the generic
    // open-installer copy. This is the red gate for the dead-branch bug: under
    // the buggy `requiresManualInstall && !canOpenInstaller` condition the
    // standard branch fires and these assertions fail.
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => manualInstallDownloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup />);

    const button = await screen.findByTestId('entry-nav-updater');
    fireEvent.click(button);

    // The dialog must open
    const dialog = await screen.findByRole('dialog', { name: 'Update ready' });
    expect(dialog).toBeTruthy();

    // The body copy must be the manual-install copy for this version.
    expect(
      screen.getByText('Open Design 1.2.3-beta.4 is ready. Open the downloaded installer to apply it.'),
    ).toBeTruthy();

    // It must NOT be the payload "restart automatically" copy.
    expect(screen.queryByText(/restart automatically/i)).toBeNull();

    // The install action button must use the manual-install action label.
    expect(screen.getByTestId('updater-install-button').textContent).toBe('Open installer');
  });

  it('renders localized manual-install copy in zh-CN', async () => {
    // The zh-CN manual-install action string (updater.manualInstallAction)
    // must render on the install button — distinct from the payload action
    // ('安装并重启') and the generic open-installer action ('安装更新').
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => manualInstallDownloadedStatus()),
        },
      },
    });

    render(
      <I18nProvider initial="zh-CN">
        <UpdaterPopup />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('entry-nav-updater'));

    // The zh-CN dialog must open
    expect(await screen.findByRole('dialog', { name: '更新已就绪' })).toBeTruthy();

    // The install button must use the zh-CN manual-install action label,
    // not the payload ('安装并重启') or generic open-installer ('安装更新') copy.
    expect(screen.getByTestId('updater-install-button').textContent).toBe('打开安装程序');
  });

  it('shows the entry-nav indicator for manual-install-required updates', async () => {
    // The ready indicator must appear for requiresManualInstall updates
    // (shouldShowControl must be true when canOpenInstaller: false but
    // requiresManualInstall: true and state is downloaded).
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => manualInstallDownloadedStatus()),
        },
      },
    });

    render(<UpdaterPopup />);
    await act(async () => {
      await Promise.resolve();
    });

    // The entry-nav indicator must appear for the manual-install case.
    // With the real combo (canOpenInstaller: true) canInstallUpdate is true,
    // so shouldShowControl is true independent of the dead-branch fix — this
    // guards against a regression that would hide the indicator.
    expect(await screen.findByTestId('entry-nav-updater')).toBeTruthy();
  });
});
