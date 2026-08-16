// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import { I18nProvider } from '../../src/i18n';
import { DEFAULT_CONFIG } from '../../src/state/config';
import type { AgentInfo } from '../../src/types';

const analyticsMocks = vi.hoisted(() => ({
  track: vi.fn(),
}));

vi.mock('../../src/analytics/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/analytics/provider')>();
  return {
    ...actual,
    useAnalytics: () => ({
      newRequestId: vi.fn(() => 'request-1'),
      setConfigureGlobals: vi.fn(),
      setConsent: vi.fn(),
      setIdentity: vi.fn(),
      track: analyticsMocks.track,
    }),
    useAppVersion: () => null,
  };
});

const AGENTS: AgentInfo[] = [
  { id: 'codex', name: 'Codex', bin: 'codex', available: true },
];

const THEME_CONTROL_LABELS = ['Light', 'Dark', 'System'];

const originalResizeObserver = globalThis.ResizeObserver;

class ResizeObserverMock {
  observe() {}
  disconnect() {}
  unobserve() {}
}

afterEach(() => {
  cleanup();
  globalThis.ResizeObserver = originalResizeObserver;
  analyticsMocks.track.mockReset();
});

beforeEach(() => {
  globalThis.ResizeObserver = ResizeObserverMock as typeof ResizeObserver;
  analyticsMocks.track.mockReset();
});

describe('Settings → General Theme Selection', () => {
  function renderGeneralSettings() {
    return render(
      <I18nProvider initial="en">
        <SettingsDialog
          presentation="page"
          initial={{ ...DEFAULT_CONFIG }}
          agents={AGENTS}
          daemonLive
          appVersionInfo={null}
          initialSection="general"
          onPersist={vi.fn()}
          onPersistComposioKey={vi.fn()}
          onClose={vi.fn()}
          onRefreshAgents={vi.fn()}
        />
      </I18nProvider>,
    );
  }

  it('renders theme selection group', () => {
    renderGeneralSettings();
    expect(screen.getByRole('group', { name: 'Appearance' })).toBeTruthy();
  });

  it('renders Light, Dark, System theme buttons', () => {
    renderGeneralSettings();

    for (const label of THEME_CONTROL_LABELS) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('keeps neighbouring General settings intact', () => {
    renderGeneralSettings();

    expect(screen.getByRole('combobox', { name: 'Language' })).toBeTruthy();
  });
});
