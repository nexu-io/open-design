import { describe, expect, it } from 'vitest';
import type { OpenDesignElectronUpdaterStatusSnapshot } from '@open-design/electron-contract';

import { deriveUpdaterModel, restartSafetyFromUpdaterStatus } from '../../src/lib/updater';

function status(
  shell: Partial<OpenDesignElectronUpdaterStatusSnapshot['lines']['shell']> = {},
  closure: Partial<OpenDesignElectronUpdaterStatusSnapshot['lines']['closure']> = {},
): OpenDesignElectronUpdaterStatusSnapshot {
  return {
    schemaVersion: 1,
    channel: 'betahyx',
    lines: {
      shell: { target: 'shell', revision: 1, state: 'idle', actions: ['check'], blockedBy: 0, currentVersion: 'betahyx-1.0.0', ...shell },
      closure: { target: 'closure', revision: 2, state: 'current', actions: ['check'], blockedBy: 0, currentVersion: 'betahyx-20260905.1', ...closure },
    },
  };
}

describe('dual-line Electron updater model', () => {
  it('keeps web unavailable without an Electron contract', () => {
    expect(deriveUpdaterModel(null, { hostAvailable: false })).toMatchObject({ environment: 'web', enabled: false, target: null });
  });

  it('selects a ready Shell update and preserves channel-scoped versions', () => {
    const model = deriveUpdaterModel(status({ state: 'ready', actions: ['apply', 'later'], candidateVersion: 'betahyx-1.1.0' }), { hostAvailable: true });
    expect(model).toMatchObject({ target: 'shell', updateKind: 'installer', availableVersion: 'betahyx-1.1.0', canOpenInstaller: true, shouldPrompt: true });
  });

  it('selects a ready Closure update independently of an idle Shell', () => {
    const model = deriveUpdaterModel(status({}, { state: 'ready', actions: ['apply', 'later'], candidateVersion: 'betahyx-20260905.2' }), { hostAvailable: true });
    expect(model).toMatchObject({ target: 'closure', updateKind: 'payload', canApplyInPlace: true, shouldShowControl: true });
  });

  it('projects Shell download progress without exposing artifact paths', () => {
    const model = deriveUpdaterModel(status({ state: 'downloading', actions: [], progress: { receivedBytes: 25, totalBytes: 100 } }), { hostAvailable: true });
    expect(model.downloadProgress).toEqual({ percent: 25, receivedBytes: 25, totalBytes: 100 });
  });

  it('projects finite lifecycle occupancy as restart safety', () => {
    const snapshot = status({}, { state: 'blocked', actions: ['apply', 'later'], blockedBy: 2, error: { code: 'active-runs-blocked', message: 'busy' } });
    expect(restartSafetyFromUpdaterStatus(snapshot)).toEqual({ activeRunCount: 2, state: 'blocked' });
  });
});
