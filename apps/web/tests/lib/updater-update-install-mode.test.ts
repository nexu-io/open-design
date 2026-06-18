// Tests for updateInstallMode feature — lib/updater layer — #4467 (PR1).
//
// Spec: deriveUpdaterModel exposes requiresManualInstall on UpdaterModel.
// The existing updater.test.ts already asserts requiresManualInstall: false
// on the payload path. This file adds the symmetric assertion for
// requiresManualInstall: true and verifies the field propagates faithfully
// from status.capabilities into the model in both directions.
//
// These tests target EXISTING behavior (requiresManualInstall is already
// in UpdaterModel) so they should PASS as-is. However the test for the
// SettingsDialog toggle (below) requires a new exported helper from
// SettingsDialog that does not exist yet.

import { describe, expect, it } from 'vitest';

import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';

import { deriveUpdaterModel } from '../../src/lib/updater';

function downloadedStatusWithManualInstall(
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

describe('web updater model — requiresManualInstall propagation', () => {
  it('exposes requiresManualInstall: true when the capability flag is set', () => {
    const model = deriveUpdaterModel(downloadedStatusWithManualInstall(), { hostAvailable: true });
    expect(model.requiresManualInstall).toBe(true);
  });

  it('exposes requiresManualInstall: false when the capability flag is clear', () => {
    const model = deriveUpdaterModel(
      downloadedStatusWithManualInstall({
        artifact: {
          name: 'open-design-1.2.3-beta.4-mac-arm64-payload.zip',
          platformKey: 'mac',
          type: 'payload',
          url: 'https://fixture.test/payload.zip',
        },
        capabilities: {
          canApplyInPlace: true,
          canDownload: true,
          canOpenInstaller: false,
          requiresManualInstall: false,
        },
        downloadPath: '/tmp/open-design-updater/payload.zip',
      }),
      { hostAvailable: true },
    );
    expect(model.requiresManualInstall).toBe(false);
  });

  it('exposes requiresManualInstall: false when status is null', () => {
    const model = deriveUpdaterModel(null, { hostAvailable: false });
    expect(model.requiresManualInstall).toBe(false);
  });
});
