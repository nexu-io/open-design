// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';

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

function Harness({ initial }: { initial: AppConfig }) {
  const [cfg, setCfg] = useState(initial);
  return (
    <I18nProvider initial="en">
      <PrivacySection cfg={cfg} setCfg={setCfg} />
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

  it('discloses that safety and crash diagnostics continue after usage opt-out', () => {
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

    expect(screen.getByText('Safety and crash diagnostics')).toBeTruthy();
    expect(screen.getByText(/sent even when usage telemetry is off/i)).toBeTruthy();
  });

  it('keeps safety diagnostics separate from the pre-decision usage telemetry choices', () => {
    render(<Harness initial={baseConfig} />);

    const shareButton = screen.getByRole('button', { name: 'Share usage data' });
    const safetyHeading = screen.getByRole('heading', {
      name: 'Safety and crash diagnostics',
    });

    expect(screen.getByText('Anonymous metrics')).toBeTruthy();
    expect(screen.getByText('Conversation and tool content')).toBeTruthy();
    expect(screen.getByText('You can change these any time in Settings → Privacy.')).toBeTruthy();
    expect(
      Boolean(shareButton.compareDocumentPosition(safetyHeading) & Node.DOCUMENT_POSITION_FOLLOWING),
    ).toBe(true);
    expect(screen.getByText(/sent even when usage telemetry is off/i)).toBeTruthy();
  });
});
