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

// A status snapshot that is NOT payload-capable (standard installer, no payload).
function installerOnlyStatus(): OpenDesignHostUpdaterStatusSnapshot {
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

  it("hides the update-install-mode toggle when the runtime is NOT payload-capable", async () => {
    // Not payload-capable: canApplyInPlace: false. The toggle must be absent.
    restoreHost = installMockOpenDesignHost({
      host: {
        updater: {
          status: vi.fn(async () => installerOnlyStatus()),
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
