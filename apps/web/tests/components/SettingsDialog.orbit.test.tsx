// @vitest-environment jsdom

import { StrictMode } from 'react';
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

const orbitTemplates = [
  {
    id: 'orbit-general',
    name: 'General digest',
    description: 'General summary',
    triggers: [],
    mode: 'template' as const,
    scenario: 'orbit',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'General prompt',
    aggregatesExamples: false,
  },
  {
    id: 'orbit-editorial',
    name: 'Editorial digest',
    description: 'Editorial summary',
    triggers: [],
    mode: 'template' as const,
    scenario: 'orbit',
    previewType: 'html',
    designSystemRequired: false,
    defaultFor: [],
    upstream: null,
    hasBody: true,
    examplePrompt: 'Editorial prompt',
    aggregatesExamples: false,
  },
];

describe('SettingsDialog Orbit connector gate refresh', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
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

  it('enables Run it now after connector load in StrictMode', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        return new Response(JSON.stringify({
          running: false,
          nextRunAt: null,
          lastRun: null,
          lastRunsByTemplate: {},
        }), { status: 200 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    render(
      <StrictMode>
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
        />
      </StrictMode>,
    );

    await waitFor(() => {
      expect(screen.queryByTestId('orbit-config-gate')).toBeNull();
      expect(screen.getByRole('button', { name: 'Run it now' }).hasAttribute('disabled')).toBe(false);
    });
  });

  it('updates the Last run panel when the selected Orbit template changes', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchSkills).mockResolvedValue(orbitTemplates);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        return new Response(JSON.stringify({
          running: false,
          nextRunAt: null,
          lastRun: {
            completedAt: '2026-05-06T10:00:00.000Z',
            trigger: 'manual',
            templateSkillId: 'orbit-general',
            connectorsChecked: 5,
            connectorsSucceeded: 3,
            connectorsSkipped: 2,
            connectorsFailed: 0,
            markdown: 'General latest summary',
          },
          lastRunsByTemplate: {
            'orbit-general': {
              completedAt: '2026-05-06T10:00:00.000Z',
              trigger: 'manual',
              templateSkillId: 'orbit-general',
              connectorsChecked: 5,
              connectorsSucceeded: 3,
              connectorsSkipped: 2,
              connectorsFailed: 0,
              markdown: 'General latest summary',
            },
            'orbit-editorial': {
              completedAt: '2026-05-06T09:00:00.000Z',
              trigger: 'scheduled',
              templateSkillId: 'orbit-editorial',
              connectorsChecked: 7,
              connectorsSucceeded: 2,
              connectorsSkipped: 4,
              connectorsFailed: 1,
              markdown: 'Editorial summary',
            },
          },
        }), { status: 200 });
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
      expect(screen.getByText('General latest summary')).toBeTruthy();
    });
    expect(screen.getByText('5')).toBeTruthy();
    expect(screen.queryByText('Editorial summary')).toBeNull();

    fireEvent.change(screen.getByLabelText('Orbit prompt template'), {
      target: { value: 'orbit-editorial' },
    });

    await waitFor(() => {
      expect(screen.getByText('Editorial summary')).toBeTruthy();
    });
    expect(screen.queryByText('General latest summary')).toBeNull();
    expect(screen.getByText('7')).toBeTruthy();
  });

  it('preserves legacy unscoped Last run only for the initially selected template', async () => {
    vi.useFakeTimers();
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchSkills).mockResolvedValue(orbitTemplates);
    let statusRequestCount = 0;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        statusRequestCount += 1;
        return new Response(JSON.stringify({
          running: true,
          nextRunAt: null,
          lastRun: {
            completedAt: '2026-05-06T10:00:00.000Z',
            trigger: 'manual',
            connectorsChecked: 5,
            connectorsSucceeded: 3,
            connectorsSkipped: 2,
            connectorsFailed: 0,
            markdown: 'Legacy unscoped summary',
          },
          lastRunsByTemplate: {},
        }), { status: 200 });
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

    await vi.runOnlyPendingTimersAsync();
    expect(screen.getByText('Legacy unscoped summary')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Orbit prompt template'), {
      target: { value: 'orbit-editorial' },
    });

    await vi.runOnlyPendingTimersAsync();
    expect(screen.queryByText('Legacy unscoped summary')).toBeNull();

    await vi.advanceTimersByTimeAsync(3000);
    expect(statusRequestCount).toBeGreaterThan(1);
    expect(screen.queryByText('Legacy unscoped summary')).toBeNull();
  });
});
