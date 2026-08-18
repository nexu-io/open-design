import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import {
  checkForUpdaterUpdate,
  deriveUpdaterModel,
  downloadUpdaterUpdate,
  openUpdaterInstaller,
  quitAfterUpdaterInstallerOpen,
  readUpdaterStatus,
  restartSafetyFromUpdaterStatus,
  subscribeToUpdaterOpenDialog,
  syncUpdaterMenuLabels,
} from '../../src/lib/updater';

function downloadedStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
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

function payloadDownloadedStatus(overrides: Partial<OpenDesignHostUpdaterStatusSnapshot> = {}): OpenDesignHostUpdaterStatusSnapshot {
  return downloadedStatus({
    artifact: {
      name: 'open-design-1.2.3-beta.4-mac-arm64-payload.zip',
      platformKey: 'mac',
      type: 'payload',
      url: 'https://fixture.test/open-design-1.2.3-beta.4-mac-arm64-payload.zip',
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

describe('web updater model', () => {
  let restoreHost: (() => void) | null = null;

  afterEach(() => {
    restoreHost?.();
    restoreHost = null;
  });

  it('treats missing host capabilities as the web environment', () => {
    const model = deriveUpdaterModel(null, { hostAvailable: false });
    expect(model.environment).toBe('web');
    expect(model.shouldPrompt).toBe(false);
    expect(model.shouldShowControl).toBe(false);
    expect(model.canOpenInstaller).toBe(false);
  });

  it('derives a desktop prompt only after a compatible installer is downloaded', () => {
    const model = deriveUpdaterModel(downloadedStatus(), { hostAvailable: true });
    expect(model.environment).toBe('desktop');
    expect(model.shouldPrompt).toBe(true);
    expect(model.hasDownloadedInstaller).toBe(true);
    expect(model.canOpenInstaller).toBe(true);
    expect(model.shouldShowControl).toBe(true);
    expect(model.promptKey).toContain('1.2.3-beta.4');
  });

  it('exposes the reinstall requirement from the host snapshot', () => {
    const model = deriveUpdaterModel(
      downloadedStatus({
        reinstall: {
          installedVersion: '1.0.0-beta.9',
          minVersion: '1.2.0-beta.1',
          reason: 'outer-below-min',
          url: 'https://example.com/reinstall-help',
        },
      }),
      { hostAvailable: true },
    );
    expect(model.reinstall).toEqual({
      installedVersion: '1.0.0-beta.9',
      minVersion: '1.2.0-beta.1',
      reason: 'outer-below-min',
      url: 'https://example.com/reinstall-help',
    });
    expect(model.updateKind).toBe('installer');
    expect(model.shouldPrompt).toBe(true);
  });

  it('defaults reinstall to null when the snapshot carries none', () => {
    expect(deriveUpdaterModel(downloadedStatus(), { hostAvailable: true }).reinstall).toBeNull();
    expect(deriveUpdaterModel(null, { hostAvailable: false }).reinstall).toBeNull();
  });

  it('derives a desktop prompt for payload updates without manual installer capability', () => {
    const model = deriveUpdaterModel(payloadDownloadedStatus(), { hostAvailable: true });
    expect(model.environment).toBe('desktop');
    expect(model.updateKind).toBe('payload');
    expect(model.canApplyInPlace).toBe(true);
    expect(model.canOpenInstaller).toBe(false);
    expect(model.requiresManualInstall).toBe(false);
    expect(model.shouldPrompt).toBe(true);
    expect(model.shouldShowControl).toBe(true);
  });

  it('keeps downloading progress internal without showing the updater control', () => {
    const model = deriveUpdaterModel(
      downloadedStatus({
        progress: {
          receivedBytes: 25,
          totalBytes: 100,
        },
        state: 'downloading',
      }),
      { hostAvailable: true },
    );
    expect(model.busy).toBe(true);
    expect(model.shouldShowControl).toBe(false);
    expect(model.downloadProgress).toEqual({
      percent: 25,
      receivedBytes: 25,
      totalBytes: 100,
    });
  });

  it('keeps current-version package launchers hidden from the updater UI', () => {
    const model = deriveUpdaterModel(
      downloadedStatus({
        availableVersion: undefined,
        downloadPath: undefined,
        state: 'not-available',
      }),
      { hostAvailable: true },
    );

    expect(model.environment).toBe('desktop');
    expect(model.shouldShowControl).toBe(false);
    expect(model.shouldPrompt).toBe(false);
    expect(model.upToDate).toBe(true);
    expect(model.hasDownloadedInstaller).toBe(false);
  });

  it('keeps the downloaded installer visible without surfacing newer incoming progress', () => {
    const model = deriveUpdaterModel(
      downloadedStatus({
        incoming: {
          arch: 'arm64',
          artifact: {
            name: 'Open Design Beta 1.2.3-beta.5.dmg',
            platformKey: 'macAppleSilicon',
            type: 'dmg',
            url: 'https://fixture.test/Open Design Beta 1.2.3-beta.5.dmg',
          },
          channel: 'beta',
          key: '1.2.3-beta.5-mac-arm64',
          progress: {
            receivedBytes: 64,
            totalBytes: 256,
          },
          startedAt: '2026-05-19T00:00:00.000Z',
          version: '1.2.3-beta.5',
        },
        state: 'downloaded',
      }),
      { hostAvailable: true },
    );

    expect(model.busy).toBe(false);
    expect(model.hasDownloadedInstaller).toBe(true);
    expect(model.shouldPrompt).toBe(true);
    expect(model.downloadProgress).toBeNull();
  });

  it('does not keep prompting after the installer has been opened', () => {
    const model = deriveUpdaterModel(
      downloadedStatus({
        installResult: {
          dryRun: true,
          openedAt: '2026-05-19T00:00:00.000Z',
          path: '/tmp/open-design-updater/Open Design Beta.dmg',
        },
      }),
      { hostAvailable: true },
    );
    expect(model.installerOpened).toBe(true);
    expect(model.canQuitAfterInstallerOpen).toBe(true);
    expect(model.shouldPrompt).toBe(false);
  });

  it('routes status, check, download, install, and quit requests through host helpers with flexible payloads', async () => {
    const status = downloadedStatus();
    const statusFn = vi.fn(async () => status);
    const check = vi.fn(async () => downloadedStatus({
      availableVersion: undefined,
      downloadPath: undefined,
      state: 'not-available',
    }));
    const download = vi.fn(async () => status);
    const install = vi.fn(async () => downloadedStatus({
      installResult: {
        dryRun: true,
        openedAt: '2026-05-19T00:00:00.000Z',
        path: status.downloadPath ?? '/tmp/open-design-updater/Open Design Beta.dmg',
      },
    }));
    const quit = vi.fn(async () => ({ ok: true as const }));
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          check,
          download,
          install,
          quit,
          status: statusFn,
        },
      },
    });

    await expect(readUpdaterStatus({ payload: { source: 'test-status' } })).resolves.toMatchObject({
      ok: true,
      model: { shouldPrompt: true },
    });
    await expect(checkForUpdaterUpdate({ payload: { source: 'test-check' } })).resolves.toMatchObject({
      ok: true,
      model: { upToDate: true },
    });
    await expect(downloadUpdaterUpdate({ payload: { source: 'test-download' } })).resolves.toMatchObject({
      ok: true,
      model: { shouldPrompt: true },
    });
    await expect(openUpdaterInstaller({ payload: { source: 'test-popup' } })).resolves.toMatchObject({
      ok: true,
      model: { installerOpened: true, shouldPrompt: false },
    });
    await expect(quitAfterUpdaterInstallerOpen({ payload: { source: 'test-quit' } })).resolves.toEqual({
      ok: true,
    });

    expect(statusFn).toHaveBeenCalledWith({ payload: { source: 'test-status' } });
    expect(check).toHaveBeenCalledWith({ payload: { source: 'test-check' } });
    expect(download).toHaveBeenCalledWith({ payload: { source: 'test-download' } });
    expect(install).toHaveBeenCalledWith({ payload: { source: 'test-popup' } });
    expect(quit).toHaveBeenCalledWith({ payload: { source: 'test-quit' } });
  });

  it('routes native menu label sync and open-dialog subscriptions through the host', async () => {
    const setMenuLabels = vi.fn(async () => ({ ok: true as const }));
    let openDialog: ((request: { source: string }) => void) | null = null;
    const subscribeOpenDialog = vi.fn((listener: (request: { source: string }) => void) => {
      openDialog = listener;
      return vi.fn();
    });
    restoreHost = installMockOpenDesignHost({
      host: { updater: { setMenuLabels, subscribeOpenDialog } },
    });

    const listener = vi.fn();
    subscribeToUpdaterOpenDialog(listener);
    expect(openDialog).not.toBeNull();
    (openDialog as unknown as (request: { source: string }) => void)({ source: 'mac-app-menu' });
    expect(listener).toHaveBeenCalledWith({ source: 'mac-app-menu' });

    const labels = {
      check: 'Check for Updates…',
      checking: 'Checking for Updates…',
      downloading: 'Downloading Update…',
      install: 'Install Update…',
      installing: 'Installing Update…',
      restart: 'Restart to Update Open Design…',
    };
    await expect(syncUpdaterMenuLabels(labels)).resolves.toEqual({ ok: true });
    expect(setMenuLabels).toHaveBeenCalledWith(labels);
  });

  it('treats blocked and unknown active-run preflights as explicit restart risks', () => {
    expect(restartSafetyFromUpdaterStatus(downloadedStatus({
      error: {
        code: 'active-runs-blocked',
        details: { activeRunCount: 2 },
        message: 'tasks are active',
      },
    }))).toEqual({ activeRunCount: 2, state: 'blocked' });
    expect(restartSafetyFromUpdaterStatus(downloadedStatus({
      error: {
        code: 'active-runs-unknown',
        details: { activeRunCount: null },
        message: 'could not check tasks',
      },
    }))).toEqual({ activeRunCount: null, state: 'unknown' });
    expect(restartSafetyFromUpdaterStatus(downloadedStatus())).toBeNull();
  });
});
