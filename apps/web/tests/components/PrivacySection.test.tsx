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

  it('shows the share choice and telemetry toggles as on when sharing is enabled', () => {
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

    expect(screen.getByRole('button', { name: 'Share' }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: "Don't share" }).getAttribute('aria-pressed'))
      .toBe('false');
    expect(screen.getByRole('button', { name: /Anonymous metrics/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Conversation and tool content/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByText(/Sharing usage data helps us understand/i)).toBeTruthy();
  });

  it('preserves an existing installation id when the settings share choice is clicked', () => {
    const randomUUID = vi.fn(() => 'inst-new');
    vi.stubGlobal('crypto', { randomUUID });

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
          privacyDecisionAt: 1778244000000,
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

  it('shows the decline choice and telemetry toggles as off when sharing is disabled', () => {
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

    expect(screen.getByRole('button', { name: "Don't share" }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: 'Share' }).getAttribute('aria-pressed'))
      .toBe('false');
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
          privacyDecisionAt: 1778244000000,
          telemetry: { metrics: true, content: true },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: "Don't share" }));

    expect(screen.getByRole('button', { name: "Don't share" }).getAttribute('aria-pressed'))
      .toBe('true');
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
          privacyDecisionAt: 1778244000000,
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
          privacyDecisionAt: 1778244000000,
          telemetry: { metrics: false, content: false },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Share' }));

    expect(screen.getByRole('button', { name: 'Share' }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Anonymous metrics/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect(screen.getByRole('button', { name: /Conversation and tool content/ }).getAttribute('aria-pressed'))
      .toBe('true');
    expect((screen.getByLabelText('Anonymous ID') as HTMLInputElement).value).toBe('inst-new');
  });
});
