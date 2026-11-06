// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState, type SetStateAction } from 'react';

import { PrivacySection } from '../../src/components/PrivacySection';
import { I18nProvider } from '../../src/i18n';
import type { AppConfig } from '../../src/types';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: null,
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  agentModels: {},
  agentCliEnv: {},
};

function Harness({
  initial,
  onConfig,
}: {
  initial: AppConfig;
  onConfig?: (config: AppConfig) => void;
}) {
  const [cfg, setCfg] = useState(initial);
  function setObservedCfg(next: SetStateAction<AppConfig>): void {
    setCfg((current) => {
      const resolved = typeof next === 'function' ? next(current) : next;
      onConfig?.(resolved);
      return resolved;
    });
  }
  return (
    <I18nProvider initial="en">
      <PrivacySection cfg={cfg} setCfg={setObservedCfg} />
    </I18nProvider>
  );
}

describe('PrivacySection', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('regenerates an installation id when telemetry is re-enabled after opt-out', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'inst-new') });

    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: null,
          privacyDecisionAt: 1778244000000,
          telemetry: { metrics: false, content: false, artifactManifest: false },
        }}
      />,
    );

    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('opted out');

    fireEvent.click(screen.getByRole('button', { name: /Anonymous metrics/ }));

    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('inst-new');
  });

  // The consent card asks the question; the toggles are the answer. Once a
  // decision exists only the toggles render — showing both put two competing
  // controls for one setting on screen (#5517 renders one or the other).
  it('shows only the telemetry toggles, on, once sharing has been accepted', () => {
    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: 'inst-existing',
          privacyDecisionAt: 1778244000000,
          telemetry: { metrics: true, content: true },
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.queryByRole('button', { name: "Don't share" })).toBeNull();
    expect(screen.queryByText(/Sharing usage data helps us understand/i)).toBeNull();
    expect(screen.getByRole('button', { name: /Anonymous metrics/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Conversation and tool content/ }).getAttribute('aria-pressed'))
      .toBe('true');
  });

  it('asks with the consent card while no decision has been made', () => {
    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: null,
          privacyDecisionAt: undefined,
          telemetry: { metrics: false, content: false },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Share' })).toBeTruthy();
    expect(screen.getByRole('button', { name: "Don't share" })).toBeTruthy();
    expect(screen.getByText(/Sharing usage data helps us understand/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Anonymous metrics/ })).toBeNull();
  });

  it('preserves an existing installation id when the settings share choice is clicked', () => {
    const randomUUID = vi.fn(() => 'inst-new');
    vi.stubGlobal('crypto', { randomUUID });

    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: 'inst-existing',
          telemetry: { metrics: true, content: true },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe(
      'inst-existing',
    );
    expect(randomUUID).not.toHaveBeenCalled();
  });

  it('preserves the artifact manifest preference when the settings share choice is clicked', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'inst-new') });
    let persisted: AppConfig | undefined;

    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: null,
          telemetry: { metrics: false, content: false, artifactManifest: true },
        }}
        onConfig={(config) => {
          persisted = config;
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(persisted?.telemetry).toEqual({
      metrics: true,
      content: true,
      artifactManifest: true,
    });
  });

  it('shows only the telemetry toggles, off, once sharing has been declined', () => {
    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: null,
          privacyDecisionAt: 1778244000000,
          telemetry: { metrics: false, content: false },
        }}
      />,
    );

    expect(screen.queryByRole('button', { name: "Don't share" })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.getByRole('button', { name: /Anonymous metrics/ }).getAttribute('aria-pressed'))
      .toBe('false');
    expect(screen.getByRole('button', { name: /Conversation and tool content/ }).getAttribute('aria-pressed'))
      .toBe('false');
    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('opted out');
  });

  it('turns both settings toggles off when the settings decline choice is clicked', () => {
    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: 'inst-existing',
          telemetry: { metrics: true, content: true },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: "Don't share" }));

    // Answering swaps the card out for the toggles it just set.
    expect(screen.queryByRole('button', { name: "Don't share" })).toBeNull();
    expect(screen.getByRole('button', { name: /Anonymous metrics/ }).getAttribute('aria-pressed'))
      .toBe('false');
    expect(screen.getByRole('button', { name: /Conversation and tool content/ }).getAttribute('aria-pressed'))
      .toBe('false');
    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('opted out');
  });

  it('preserves the artifact manifest preference when the settings decline choice is clicked', () => {
    let persisted: AppConfig | undefined;

    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: 'inst-existing',
          telemetry: { metrics: true, content: true, artifactManifest: true },
        }}
        onConfig={(config) => {
          persisted = config;
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: "Don't share" }));

    expect(persisted).toEqual(
      expect.objectContaining({
        installationId: null,
        telemetry: {
          metrics: false,
          content: false,
          artifactManifest: true,
        },
      }),
    );
  });

  it('turns both settings toggles on when the settings share choice is clicked', () => {
    vi.stubGlobal('crypto', { randomUUID: vi.fn(() => 'inst-new') });

    render(
      <Harness
        initial={{
          ...baseConfig,
          installationId: null,
          telemetry: { metrics: false, content: false },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    // Answering swaps the card out for the toggles it just set.
    expect(screen.queryByRole('button', { name: 'Share' })).toBeNull();
    expect(screen.getByRole('button', { name: /Anonymous metrics/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Conversation and tool content/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('inst-new');
  });
});
