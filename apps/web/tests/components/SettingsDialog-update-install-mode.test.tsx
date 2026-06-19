// @vitest-environment jsdom

// Tests for the Update install mode toggle in SettingsDialog — #4467 (PR1).
//
// Spec: SettingsDialog renders an "Update install mode" Automatic/Manual toggle
// in the Advanced/Updates area, visible ONLY when payload-capable.
// Payload-capability is determined from the host updater status (canApplyInPlace
// on a payload-capable runtime OR capability flag from the host).
//
// These tests are RED until the implementation lands.

import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { OpenDesignHostUpdaterStatusSnapshot } from '@open-design/host';
import { installMockOpenDesignHost } from '@open-design/host/testing';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import type { SettingsSection } from '../../src/components/SettingsDialog';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchConnectors: vi.fn(async () => []),
    fetchDesignTemplates: vi.fn(async () => []),
    fetchSkills: vi.fn(async () => []),
  };
});

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: vi.fn(),
    setConsent: () => undefined,
    setIdentity: () => undefined,
    setConfigureGlobals: () => undefined,
    anonymousId: 'test-anonymous',
    sessionId: 'test-session',
    newRequestId: () => 'test-request',
  }),
  useAppVersion: () => null,
}));

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: 'claude',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
};

// A status snapshot from a payload-capable runtime where canApplyInPlace: true.
function payloadCapableStatus(): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'x64',
    artifact: {
      name: 'open-design-1.2.3-beta.4-win-x64-payload.7z',
      platformKey: 'win',
      type: 'payload',
      url: 'https://fixture.test/payload.7z',
    },
    availableVersion: '1.2.3-beta.4',
    capabilities: {
      canApplyInPlace: true,
      canDownload: true,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    channel: 'beta',
    currentVersion: '1.2.3-beta.3',
    downloadPath: '/tmp/open-design-updater/payload.7z',
    enabled: true,
    mode: 'package-launcher',
    platform: 'win32',
    state: 'downloaded',
    supported: true,
  };
}

// A status snapshot from a payload-capable runtime that is IDLE with no
// artifact yet selected. canApplyInPlace will be false (no artifact to apply),
// but the toggle must still appear because the runtime itself is payload-capable.
// This is the key case for Blocker B: the toggle must be visible on the
// preference screen even before any update check is run.
function idlePayloadCapableStatus(): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'x64',
    availableVersion: undefined,
    capabilities: {
      canApplyInPlace: false,
      canDownload: false,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    channel: 'beta',
    currentVersion: '1.2.3-beta.3',
    enabled: true,
    mode: 'package-launcher',
    platform: 'win32',
    state: 'idle',
    supported: true,
  };
}

// A payload-CAPABLE runtime (package-launcher + supported) where the currently
// selected artifact happens to be an installer/DMG (requiresManualInstall: true,
// canApplyInPlace: false). Visibility must NOT depend on the selected artifact —
// this is a payload-capable platform, so the toggle must still appear. (If the
// gate keyed on canApplyInPlace/artifact state, this case would wrongly hide it.)
function payloadCapableInstallerPendingStatus(): OpenDesignHostUpdaterStatusSnapshot {
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
  };
}

// A genuinely NOT-payload-capable runtime: not a package-launcher. The in-app
// payload path only exists for supported package-launcher runtimes, so the
// preference is meaningless here and the toggle must be absent — regardless of
// any artifact/capability state.
function nonPayloadCapableStatus(): OpenDesignHostUpdaterStatusSnapshot {
  return {
    arch: 'x64',
    availableVersion: '1.2.3-beta.4',
    capabilities: {
      canApplyInPlace: false,
      canDownload: false,
      canOpenInstaller: false,
      requiresManualInstall: false,
    },
    channel: 'beta',
    currentVersion: '1.2.3-beta.3',
    enabled: true,
    mode: 'js-incremental',
    platform: 'win32',
    state: 'available',
    supported: false,
  };
}

function renderSettingsWithSection(section: SettingsSection, updaterStatus?: OpenDesignHostUpdaterStatusSnapshot) {
  return render(
    <SettingsDialog
      initial={baseConfig}
      agents={[]}
      daemonLive
      appVersionInfo={null}
      initialSection={section}
      onPersist={vi.fn()}
      onPersistComposioKey={vi.fn()}
      onClose={vi.fn()}
      onRefreshAgents={vi.fn()}
    />,
  );
}

describe('SettingsDialog update-install-mode toggle', () => {
  let restoreHost: (() => void) | null = null;

  afterEach(() => {
    cleanup();
    restoreHost?.();
    restoreHost = null;
  });

  it("shows the update-install-mode toggle when the runtime is payload-capable", async () => {
    // The implementation must read the updater status from the host and
    // show the toggle when canApplyInPlace is true (payload-capable runtime).
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => payloadCapableStatus()),
        },
      },
    });

    renderSettingsWithSection('about');

    await act(async () => {
      await Promise.resolve();
    });

    // The toggle must be present when the runtime supports payload updates.
    // data-testid='update-install-mode-toggle' is the implementation contract.
    expect(screen.getByTestId('update-install-mode-toggle')).toBeTruthy();
  });

  it("shows the update-install-mode toggle when the runtime is payload-capable but idle with no artifact", async () => {
    // Blocker B key case: runtime is package-launcher + supported + idle,
    // but no artifact has been selected yet so canApplyInPlace is false.
    // The toggle must still appear — the preference controls future update
    // behaviour on the platform, not the current download state.
    // Under the existing canApplyInPlace gate this test fails because the
    // toggle is hidden whenever canApplyInPlace is false.
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => idlePayloadCapableStatus()),
        },
      },
    });

    renderSettingsWithSection('about');

    await act(async () => {
      await Promise.resolve();
    });

    // The toggle must be visible on a payload-capable platform even when
    // no update artifact is currently downloaded or available.
    expect(screen.getByTestId('update-install-mode-toggle')).toBeTruthy();
  });

  it("shows the update-install-mode toggle on a payload-capable runtime even when the pending artifact is an installer", async () => {
    // Artifact-independence: a supported package-launcher runtime is
    // payload-capable even if the currently selected/downloaded artifact is an
    // installer/DMG (canApplyInPlace: false, requiresManualInstall: true). The
    // toggle must remain visible so the user can switch back to automatic.
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => payloadCapableInstallerPendingStatus()),
        },
      },
    });

    renderSettingsWithSection('about');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.getByTestId('update-install-mode-toggle')).toBeTruthy();
  });

  it("hides the update-install-mode toggle when the runtime is NOT payload-capable", async () => {
    // Not a supported package-launcher (no in-app payload path) — toggle absent.
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => nonPayloadCapableStatus()),
        },
      },
    });

    renderSettingsWithSection('about');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('update-install-mode-toggle')).toBeNull();
  });

  it("hides the update-install-mode toggle when no updater host is available (dev/from-source)", async () => {
    // No host = dev environment — toggle must be absent.
    // (No installMockOpenDesignHost call — host is unavailable.)

    renderSettingsWithSection('about');

    await act(async () => {
      await Promise.resolve();
    });

    expect(screen.queryByTestId('update-install-mode-toggle')).toBeNull();
  });
});
