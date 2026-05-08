// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail } from '@open-design/contracts';

import { ConnectorsBrowser } from '../../src/components/ConnectorsBrowser';
import {
  fetchConnectorDiscovery,
  fetchConnectors,
  fetchConnectorStatuses,
} from '../../src/providers/registry';

vi.mock('../../src/providers/registry', () => ({
  connectConnector: vi.fn(),
  disconnectConnector: vi.fn(),
  fetchConnectorDiscovery: vi.fn(),
  fetchConnectors: vi.fn(),
  fetchConnectorStatuses: vi.fn(),
}));

const configuredComposioConnector: ConnectorDetail = {
  id: 'github',
  name: 'GitHub',
  provider: 'Composio',
  category: 'Code',
  status: 'connected',
  auth: { provider: 'composio', configured: true },
  tools: [],
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('ConnectorsBrowser', () => {
  afterEach(() => {
    cleanup();
    vi.mocked(fetchConnectors).mockReset();
    vi.mocked(fetchConnectorDiscovery).mockReset();
    vi.mocked(fetchConnectorStatuses).mockReset();
  });

  it('masks the grid immediately when the Composio key is cleared locally', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([configuredComposioConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([configuredComposioConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});

    render(<ConnectorsBrowser composioConfigured={false} />);

    await waitFor(() => expect(screen.getByTestId('connector-gate')).toBeTruthy());
    expect(screen.getByTestId('connector-grid-wrap').className).toContain('is-masked');
  });

  it('keeps discovered tools when discovery resolves before the base catalog', async () => {
    const base = deferred<ConnectorDetail[]>();
    const discovery = deferred<ConnectorDetail[]>();
    vi.mocked(fetchConnectors).mockReturnValue(base.promise);
    vi.mocked(fetchConnectorDiscovery).mockReturnValue(discovery.promise);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});

    render(<ConnectorsBrowser composioConfigured />);

    discovery.resolve([
      {
        ...configuredComposioConnector,
        tools: [
          {
            name: 'list_issues',
            title: 'List issues',
            safety: { sideEffect: 'read', approval: 'auto', reason: 'Reads issues.' },
            refreshEligible: true,
          },
        ],
      },
    ]);

    base.resolve([configuredComposioConnector]);

    await screen.findByText('GitHub');
    await screen.findAllByText('1 tool');
    fireEvent.click(screen.getByRole('button', { name: 'Open GitHub details' }));
    await screen.findByText('List issues');

    await waitFor(() => expect(screen.getByText('List issues')).toBeTruthy());
    expect(screen.getAllByText('1 tool')).toHaveLength(2);
  });

  it('stops showing the drawer loading state after discovery completes with zero tools', async () => {
    vi.mocked(fetchConnectors).mockResolvedValue([configuredComposioConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([configuredComposioConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Open GitHub details' }));

    await waitFor(() => {
      expect(
        screen.getByText(
          'No tools available yet. Connect to discover what this integration exposes.',
        ),
      ).toBeTruthy();
      expect(screen.queryByText('Loading tools…')).toBeNull();
    });
  });

  it('prefers refreshed catalog statuses over stale cached connector state', async () => {
    vi.mocked(fetchConnectors)
      .mockResolvedValueOnce([configuredComposioConnector])
      .mockResolvedValueOnce([
        {
          ...configuredComposioConnector,
          status: 'available',
          auth: { provider: 'composio', configured: false },
        },
      ]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});

    const { rerender } = render(
      <ConnectorsBrowser composioConfigured catalogRefreshKey="initial" />,
    );

    await screen.findByRole('button', { name: 'Disconnect' });

    rerender(<ConnectorsBrowser composioConfigured catalogRefreshKey="refetched" />);

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy();
      expect(screen.queryByRole('button', { name: 'Disconnect' })).toBeNull();
    });
  });
});
