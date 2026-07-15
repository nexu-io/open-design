import { describe, expect, test } from 'vitest';

import {
  applyPackagedUpdateEnv,
  resolvePackagedUpdateScenario,
} from '@/vitest/packaged-update-scenario';

describe('packaged updater release scenario', () => {
  test('keeps the legacy local beta fixture when release metadata is absent', () => {
    expect(resolvePackagedUpdateScenario({})).toEqual({
      channel: 'beta',
      currentVersionOverride: '99.0.0-beta.0',
      expectedCurrentVersion: '99.0.0-beta.0',
      fixtureVersion: '99.0.0-beta.1',
    });
  });

  test('uses the embedded prerelease package version as current version for release smoke', () => {
    expect(resolvePackagedUpdateScenario({
      releaseChannel: 'prerelease',
      releaseVersion: '0.8.0-prerelease.4',
    })).toEqual({
      channel: 'prerelease',
      currentVersionOverride: null,
      expectedCurrentVersion: '0.8.0-prerelease.4',
      fixtureVersion: '0.8.0-prerelease.5',
    });
  });

  test('derives stable, prerelease, preview, beta, and betas next-version fixtures', () => {
    expect(resolvePackagedUpdateScenario({
      releaseChannel: 'stable',
      releaseVersion: '0.8.0',
    }).fixtureVersion).toBe('0.8.1');
    expect(resolvePackagedUpdateScenario({
      releaseChannel: 'prerelease',
      releaseVersion: '0.8.0-prerelease.2',
    }).fixtureVersion).toBe('0.8.0-prerelease.3');
    expect(resolvePackagedUpdateScenario({
      releaseChannel: 'preview',
      releaseVersion: '0.8.0-preview.2',
    }).fixtureVersion).toBe('0.8.0-preview.3');
    expect(resolvePackagedUpdateScenario({
      releaseChannel: 'beta',
      releaseVersion: '0.8.0-beta.2',
    }).fixtureVersion).toBe('0.8.0-beta.3');
    expect(resolvePackagedUpdateScenario({
      releaseChannel: 'betas',
      releaseVersion: '0.8.0-betas.2',
    }).fixtureVersion).toBe('0.8.0-betas.3');
  });

  test('does not override current version for release-channel smoke', () => {
    const env: NodeJS.ProcessEnv = {
      OD_UPDATE_CURRENT_VERSION: '99.0.0-beta.0',
    };

    applyPackagedUpdateEnv(
      env,
      resolvePackagedUpdateScenario({
        releaseChannel: 'prerelease',
        releaseVersion: '0.8.0-prerelease.4',
      }),
      'http://127.0.0.1:1234/prerelease/latest/metadata.json',
    );

    expect(env.OD_UPDATE_CURRENT_VERSION).toBeUndefined();
    expect(env.OD_UPDATE_METADATA_URL).toBe('http://127.0.0.1:1234/prerelease/latest/metadata.json');
    expect(env.OD_UPDATE_AUTO_CHECK).toBe('1');
    expect(env.OD_UPDATE_OPEN_DRY_RUN).toBe('1');
  });

  test('can disable open dry-run for full payload relaunch smoke', () => {
    const env: NodeJS.ProcessEnv = {};

    applyPackagedUpdateEnv(
      env,
      resolvePackagedUpdateScenario({
        releaseChannel: 'beta',
        releaseVersion: '0.8.0-beta.4',
      }),
      'http://127.0.0.1:1234/beta/latest/metadata.json',
      { openDryRun: false },
    );

    expect(env.OD_UPDATE_OPEN_DRY_RUN).toBe('0');
  });
});
