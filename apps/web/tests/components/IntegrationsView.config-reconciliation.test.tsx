// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { IntegrationsView } from '../../src/components/IntegrationsView';
import { I18nProvider } from '../../src/i18n';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/analytics/provider', () => ({
  useAnalytics: () => ({
    track: vi.fn(),
    setConsent: vi.fn(),
    setIdentity: vi.fn(),
    setConfigureGlobals: vi.fn(),
    anonymousId: 'test-anonymous',
    sessionId: 'test-session',
    newRequestId: () => 'test-request',
  }),
}));

const baseConfig: AppConfig = {
  mode: 'daemon',
  apiKey: '',
  apiProtocol: 'anthropic',
  apiVersion: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  apiProtocolConfigs: {},
  agentId: 'codex',
  skillId: null,
  designSystemId: null,
  onboardingCompleted: true,
  mediaProviders: {},
  composio: {
    apiKey: '',
    apiKeyConfigured: false,
    apiKeyTail: '',
  },
  agentModels: {},
  agentCliEnv: {},
};

describe('IntegrationsView config reconciliation', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/api/connectors')) {
        return new Response(JSON.stringify({ connectors: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      throw new Error(`Unexpected IntegrationsView request: ${url}`);
    }));
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('preserves a pending Composio secret across an unrelated parent config update', async () => {
    const onConfigPersist = vi.fn();
    const onPersistComposioKey = vi.fn().mockResolvedValue(undefined);
    const renderView = (config: AppConfig) => (
      <I18nProvider initial="en">
        <IntegrationsView
          config={config}
          initialTab="connectors"
          onConfigPersist={onConfigPersist}
          onPersistComposioKey={onPersistComposioKey}
        />
      </I18nProvider>
    );
    const view = render(renderView(baseConfig));
    const input = screen.getByPlaceholderText('Paste Composio API key') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'cmp_pending_secret' } });
    expect(input.value).toBe('cmp_pending_secret');

    view.rerender(renderView({
      ...baseConfig,
      model: 'claude-opus-4-1',
    }));

    await waitFor(() => {
      expect(input.value).toBe('cmp_pending_secret');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save key' }));

    await waitFor(() => {
      expect(onPersistComposioKey).toHaveBeenCalledWith(
        expect.objectContaining({ apiKey: 'cmp_pending_secret' }),
      );
    });
    expect(onConfigPersist).not.toHaveBeenCalled();
  });
});
