// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail } from '@open-design/contracts';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import { fetchConnectors, fetchSkills } from '../../src/providers/registry';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchConnectors: vi.fn(),
    fetchSkills: vi.fn(),
  };
});

const originalFetch = globalThis.fetch;

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
  composio: { apiKeyConfigured: true },
  orbit: {
    enabled: false,
    time: '09:00',
    templateSkillId: 'orbit-general',
  },
};

const connectedConnector: ConnectorDetail = {
  id: 'github',
  name: 'GitHub',
  provider: 'Composio',
  category: 'Code',
  status: 'connected',
  auth: { provider: 'composio', configured: true },
  tools: [],
  allowedToolNames: [],
  curatedToolNames: [],
};

describe('SettingsDialog Orbit connector gate refresh', () => {
  afterEach(() => {
    cleanup();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.mocked(fetchConnectors).mockReset();
    vi.mocked(fetchSkills).mockReset();
  });

  it('rechecks connected connectors when the window regains focus', async () => {
    vi.mocked(fetchConnectors)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([connectedConnector]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        return new Response(null, { status: 404 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(
      <SettingsDialog
        initial={baseConfig}
        agents={[]}
        daemonLive
        appVersionInfo={null}
        initialSection="orbit"
        onPersist={vi.fn()}
        onPersistComposioKey={vi.fn()}
        onClose={vi.fn()}
        onRefreshAgents={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByTestId('orbit-config-gate')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Run it now' }).hasAttribute('disabled')).toBe(true);

    fireEvent.focus(window);

    await waitFor(() => {
      expect(screen.queryByTestId('orbit-config-gate')).toBeNull();
      expect(screen.getByRole('button', { name: 'Run it now' }).hasAttribute('disabled')).toBe(false);
    });
  });
});
