// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';
import type { ConnectorDetail } from '@open-design/contracts';

import { CONNECTORS_CHANGED_EVENT } from '../../src/components/connectors-events';
import { EntryView } from '../../src/components/EntryView';
import {
  fetchConnectorDiscovery,
  fetchConnectors,
  fetchConnectorStatuses,
} from '../../src/providers/registry';

vi.mock('../../src/components/EntryShell', () => ({
  EntryShell: ({ connectors }: { connectors: ConnectorDetail[] }) => (
    <div data-testid="entry-connectors">
      {connectors.map((connector) => (
        <span key={connector.id}>{connector.name}:{connector.status}</span>
      ))}
    </div>
  ),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchConnectorDiscovery: vi.fn(),
    fetchConnectors: vi.fn(),
    fetchConnectorStatuses: vi.fn(),
  };
});

const githubConnector: ConnectorDetail = {
  id: 'github',
  name: 'GitHub',
  provider: 'Composio',
  category: 'Developer',
  status: 'available',
  auth: { provider: 'composio', configured: true },
  tools: [],
};

const gmailConnector: ConnectorDetail = {
  id: 'gmail',
  name: 'Gmail',
  provider: 'Composio',
  category: 'Email',
  status: 'available',
  auth: { provider: 'composio', configured: true },
  tools: [],
};

function renderEntryView(overrides: Partial<ComponentProps<typeof EntryView>> = {}) {
  return render(
    <EntryView
      skills={[]}
      designTemplates={[]}
      designSystems={[]}
      projects={[]}
      templates={[]}
      onDeleteTemplate={vi.fn()}
      promptTemplates={[]}
      defaultDesignSystemId={null}
      agents={[]}
      config={{
        mode: 'daemon',
        apiKey: '',
        apiProtocol: 'openai',
        apiVersion: '',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        agentId: 'codex',
        skillId: null,
        designSystemId: null,
        onboardingCompleted: true,
        composio: { apiKey: '', apiKeyConfigured: true, apiKeyTail: '1234' },
        mediaProviders: {},
        agentModels: {},
        agentCliEnv: {},
      }}
      daemonLive
      onModeChange={vi.fn()}
      onAgentChange={vi.fn()}
      onAgentModelChange={vi.fn()}
      onApiProtocolChange={vi.fn()}
      onApiModelChange={vi.fn()}
      onConfigPersist={vi.fn()}
      onRefreshAgents={vi.fn()}
      onThemeChange={vi.fn()}
      onCreateProject={vi.fn()}
      onCreatePluginShareProject={vi.fn()}
      onImportClaudeDesign={vi.fn()}
      onOpenProject={vi.fn()}
      onOpenLiveArtifact={vi.fn()}
      onDeleteProject={vi.fn()}
      onRenameProject={vi.fn()}
      onChangeDefaultDesignSystem={vi.fn()}
      onPersistComposioKey={vi.fn()}
      onOpenSettings={vi.fn()}
      onCompleteOnboarding={vi.fn()}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  vi.mocked(fetchConnectors).mockReset();
  vi.mocked(fetchConnectorDiscovery).mockReset();
  vi.mocked(fetchConnectorStatuses).mockReset();
});

describe('EntryView connector refresh', () => {
  it('inserts newly discovered connected connectors after a connector change event', async () => {
    vi.mocked(fetchConnectors)
      .mockResolvedValueOnce([githubConnector])
      .mockResolvedValueOnce([githubConnector]);
    vi.mocked(fetchConnectorDiscovery)
      .mockResolvedValueOnce([gmailConnector]);
    vi.mocked(fetchConnectorStatuses)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ gmail: { status: 'connected', accountLabel: 'inbox@example.com' } });

    renderEntryView();

    await waitFor(() => expect(screen.getByTestId('entry-connectors').textContent).toContain('GitHub:available'));
    expect(screen.getByTestId('entry-connectors').textContent).not.toContain('Gmail');

    window.dispatchEvent(new Event(CONNECTORS_CHANGED_EVENT));
    window.dispatchEvent(new Event(CONNECTORS_CHANGED_EVENT));

    await waitFor(() => {
      expect(screen.getByTestId('entry-connectors').textContent).toContain('Gmail:connected');
    });
    expect(fetchConnectorDiscovery).toHaveBeenCalledWith({ refresh: true });
    expect(fetchConnectorDiscovery).toHaveBeenCalledTimes(1);
  });
});
