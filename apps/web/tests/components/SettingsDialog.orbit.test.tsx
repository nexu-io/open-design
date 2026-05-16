// @vitest-environment jsdom

import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail } from '@open-design/contracts';

import { SettingsDialog } from '../../src/components/SettingsDialog';
import { fetchConnectors, fetchDesignTemplates, fetchSkills } from '../../src/providers/registry';
import type { AppConfig } from '../../src/types';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchConnectors: vi.fn(),
    fetchDesignTemplates: vi.fn(),
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

const clipboardDescriptor = Object.getOwnPropertyDescriptor(window.navigator, 'clipboard');

function renderOrbitSettings(
  initial: Partial<AppConfig> = {},
  options: {
    composioApiKeyConfigured?: boolean;
    onPersist?: ReturnType<typeof vi.fn>;
    onClose?: ReturnType<typeof vi.fn>;
  } = {},
) {
  const onPersist = options.onPersist ?? vi.fn();
  const onClose = options.onClose ?? vi.fn();

  render(
    <SettingsDialog
      initial={{
        ...baseConfig,
        ...initial,
        composio: {
          apiKeyConfigured: options.composioApiKeyConfigured ?? true,
          ...(initial.composio ?? {}),
        },
      }}
      agents={[]}
      daemonLive
      appVersionInfo={null}
      initialSection="orbit"
      onPersist={onPersist}
      onPersistComposioKey={vi.fn()}
      onClose={onClose}
      onRefreshAgents={vi.fn()}
    />,
  );

  return { onPersist, onClose };
}
describe('SettingsDialog Orbit connector gate refresh', () => {
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    globalThis.fetch = originalFetch;
    if (clipboardDescriptor) {
      Object.defineProperty(window.navigator, 'clipboard', clipboardDescriptor);
    } else {
      Reflect.deleteProperty(window.navigator, 'clipboard');
    }
    vi.restoreAllMocks();
    vi.mocked(fetchConnectors).mockReset();
    vi.mocked(fetchDesignTemplates).mockReset();
    vi.mocked(fetchSkills).mockReset();
  });

  it('rechecks connected connectors when the window regains focus', async () => {
    vi.mocked(fetchConnectors)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
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
    vi.mocked(fetchDesignTemplates).mockResolvedValue([]);
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

  it('locks Orbit controls until a connector is connected and routes the gate CTA to Connectors', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        return new Response(null, { status: 404 });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    renderOrbitSettings({}, { composioApiKeyConfigured: false });

    await waitFor(() => {
      expect(screen.getByTestId('orbit-config-gate')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Run it now' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('switch', { name: /Off/i }).hasAttribute('disabled')).toBe(true);
    expect((screen.getByLabelText('Daily Orbit run time') as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText('Orbit prompt template') as HTMLSelectElement).disabled).toBe(true);

    fireEvent.click(screen.getByTestId('orbit-config-gate-action'));

    await waitFor(() => {
      expect(screen.getAllByRole('heading', { name: 'Connectors' }).length).toBeGreaterThan(0);
      expect(screen.getByPlaceholderText('Paste Composio API key')).toBeTruthy();
    });
  });

  it('autosaves Orbit schedule and prompt template edits after connectors are available', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        return new Response(
          JSON.stringify({
            running: false,
            nextRunAt: null,
            lastRun: null,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    const { onPersist } = renderOrbitSettings({
      orbit: {
        enabled: false,
        time: '08:00',
        templateSkillId: 'orbit-general',
      },
    });

    await waitFor(() => {
      expect(screen.queryByTestId('orbit-config-gate')).toBeNull();
      expect(screen.getByRole('button', { name: 'Run it now' }).hasAttribute('disabled')).toBe(false);
    });

    fireEvent.click(screen.getByRole('switch', { name: /Off/i }));
    fireEvent.change(screen.getByLabelText('Daily Orbit run time'), {
      target: { value: '01:30' },
    });
    fireEvent.change(screen.getByLabelText('Orbit prompt template'), {
      target: { value: 'orbit-editorial' },
    });

    await waitFor(() => {
      expect(onPersist).toHaveBeenCalledWith(
        expect.objectContaining({
          orbit: {
            enabled: true,
            time: '01:30',
            templateSkillId: 'orbit-editorial',
          },
        }),
        expect.any(Object),
      );
    });
  });

  it('updates the Last run panel when the selected Orbit template changes', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
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
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
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

  it('renders the latest Orbit run receipt and supports copying its markdown', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        return new Response(
          JSON.stringify({
            running: false,
            nextRunAt: '2026-05-09T01:00:00.000Z',
            lastRun: {
              completedAt: new Date().toISOString(),
              trigger: 'manual',
              connectorsChecked: 3,
              connectorsSucceeded: 2,
              connectorsSkipped: 1,
              connectorsFailed: 0,
              artifactId: 'artifact-1',
              artifactProjectId: 'project-1',
              markdown: '## Daily Orbit\n- GitHub shipped',
            },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      }
      throw new Error(`Unexpected fetch: ${url}`);
    }) as typeof fetch;

    renderOrbitSettings({
      orbit: {
        enabled: true,
        time: '01:00',
        templateSkillId: 'orbit-general',
      },
    });

    await waitFor(() => {
      expect(screen.getByText('Last run')).toBeTruthy();
      expect(screen.getByText('Checked')).toBeTruthy();
      expect(screen.getByText('3')).toBeTruthy();
      expect(screen.getByText('Daily Orbit activity summary')).toBeTruthy();
      expect(screen.getByRole('link', { name: /Open artifact/i }).getAttribute('href')).toBe(
        '/api/live-artifacts/artifact-1/preview?projectId=project-1',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: /Copy/i }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('## Daily Orbit\n- GitHub shipped');
      expect(screen.getByText('Copied')).toBeTruthy();
    });
  });

  it('renders the Open artifact link only when Orbit last run includes a live artifact target', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
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
            artifactId: 'artifact-123',
            artifactProjectId: 'project-456',
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
              artifactId: 'artifact-123',
              artifactProjectId: 'project-456',
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
    });
    globalThis.fetch = fetchMock as typeof fetch;

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
      expect(screen.getByRole('link', { name: 'Open artifact' })).toBeTruthy();
    });
    expect(
      screen.getByRole('link', { name: 'Open artifact' }).getAttribute('href'),
    ).toBe('/api/live-artifacts/artifact-123/preview?projectId=project-456');

    fireEvent.change(screen.getByLabelText('Orbit prompt template'), {
      target: { value: 'orbit-editorial' },
    });

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Open artifact' })).toBeNull();
    });
  });

  it('renders the live artifact link as a new-tab external link', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
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
            artifactId: 'artifact-123',
            artifactProjectId: 'project-456',
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
              artifactId: 'artifact-123',
              artifactProjectId: 'project-456',
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

    const openArtifactLink = await screen.findByRole('link', { name: 'Open artifact' });
    expect(openArtifactLink.getAttribute('target')).toBe('_blank');
    expect(openArtifactLink.getAttribute('rel')).toContain('noreferrer');
  });

  it('keeps the markdown copy action but hides Open artifact for legacy last runs without a live artifact target', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
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
            markdown: 'Legacy markdown summary',
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
              markdown: 'Legacy markdown summary',
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
      expect(screen.getByText('Legacy markdown summary')).toBeTruthy();
    });
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Open artifact' })).toBeNull();
  });

  it('falls back from the live artifact strip to the legacy markdown strip when switching templates', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
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
            artifactId: 'artifact-123',
            artifactProjectId: 'project-456',
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
              artifactId: 'artifact-123',
              artifactProjectId: 'project-456',
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

    await screen.findByRole('link', { name: 'Open artifact' });
    expect(screen.getByText('General latest summary')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Orbit prompt template'), {
      target: { value: 'orbit-editorial' },
    });

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: 'Open artifact' })).toBeNull();
    });
    expect(screen.getByText('Editorial summary')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
  });

  it('restores the live artifact strip when switching back from a legacy markdown template', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([connectedConnector]);
    vi.mocked(fetchDesignTemplates).mockResolvedValue(orbitTemplates);
    vi.mocked(fetchSkills).mockResolvedValue([]);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === 'string' ? input : input.toString();
      if (url === '/api/orbit/status') {
        return new Response(JSON.stringify({
          running: false,
          nextRunAt: null,
          lastRun: {
            completedAt: '2026-05-06T09:00:00.000Z',
            trigger: 'scheduled',
            templateSkillId: 'orbit-editorial',
            connectorsChecked: 7,
            connectorsSucceeded: 2,
            connectorsSkipped: 4,
            connectorsFailed: 1,
            markdown: 'Editorial summary',
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
              artifactId: 'artifact-123',
              artifactProjectId: 'project-456',
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
        initial={{
          ...baseConfig,
          orbit: {
            enabled: baseConfig.orbit?.enabled ?? false,
            time: baseConfig.orbit?.time ?? '09:00',
            templateSkillId: 'orbit-editorial',
          },
        }}
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
      expect(screen.queryByRole('link', { name: 'Open artifact' })).toBeNull();
    });
    expect(screen.getByText('Editorial summary')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Orbit prompt template'), {
      target: { value: 'orbit-general' },
    });

    const openArtifactLink = await screen.findByRole('link', { name: 'Open artifact' });
    expect(openArtifactLink.getAttribute('href')).toBe(
      '/api/live-artifacts/artifact-123/preview?projectId=project-456',
    );
    expect(screen.getByText('General latest summary')).toBeTruthy();
  });
});
