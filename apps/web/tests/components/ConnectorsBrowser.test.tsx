// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail } from '@open-design/contracts';

import { ConnectorsBrowser } from '../../src/components/ConnectorsBrowser';
import {
  cancelConnectorAuthorization,
  connectConnector,
  fetchConnectorDetail,
  fetchConnectorDiscovery,
  fetchConnectors,
  fetchConnectorStatuses,
} from '../../src/providers/registry';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    cancelConnectorAuthorization: vi.fn(),
    connectConnector: vi.fn(),
    disconnectConnector: vi.fn(),
    fetchConnectorDetail: vi.fn(),
    fetchConnectorDiscovery: vi.fn(),
    fetchConnectors: vi.fn(),
    fetchConnectorStatuses: vi.fn(),
  };
});

const configuredComposioConnector: ConnectorDetail = {
  id: 'github',
  name: 'GitHub',
  provider: 'Composio',
  category: 'Code',
  status: 'connected',
  auth: { provider: 'composio', configured: true },
  tools: [],
};

function makeTool(name: string): ConnectorDetail['tools'][number] {
  return {
    name,
    title: name.replace(/_/g, ' '),
    safety: { sideEffect: 'read', approval: 'auto', reason: 'Reads data.' },
    refreshEligible: true,
  };
}

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
    vi.mocked(cancelConnectorAuthorization).mockReset();
    vi.mocked(connectConnector).mockReset();
    vi.mocked(fetchConnectors).mockReset();
    vi.mocked(fetchConnectorDetail).mockReset();
    vi.mocked(fetchConnectorDiscovery).mockReset();
    vi.mocked(fetchConnectorStatuses).mockReset();
    vi.mocked(cancelConnectorAuthorization).mockResolvedValue(null);
    vi.mocked(connectConnector).mockResolvedValue({ connector: null });
    vi.mocked(fetchConnectorDetail).mockResolvedValue(null);
    window.sessionStorage.clear();
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
    const zeroToolConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      toolCount: 0,
    };
    vi.mocked(fetchConnectors).mockResolvedValue([zeroToolConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([zeroToolConnector]);
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

  it('hydrates partial static tool previews when the advertised tool count is larger', async () => {
    const partialPreviewConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      id: 'notion',
      name: 'Notion',
      status: 'available',
      toolCount: 48,
      tools: [makeTool('search_pages'), makeTool('create_page')],
    };
    vi.mocked(fetchConnectors).mockResolvedValue([partialPreviewConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([partialPreviewConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(fetchConnectorDetail).mockResolvedValue({
      ...partialPreviewConnector,
      tools: [makeTool('search_pages'), makeTool('create_page'), makeTool('update_page')],
      toolsNextCursor: 'next-page',
      toolsHasMore: true,
    });

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('Notion');
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion details' }));

    await waitFor(() => {
      expect(fetchConnectorDetail).toHaveBeenCalledWith('notion', {
        hydrateTools: true,
        toolsLimit: 50,
      });
    });
    await screen.findByText('update page');
    expect(screen.getByRole('button', { name: 'Load more tools' })).toBeTruthy();
  });

  it('hydrates empty tool previews when the advertised tool count is unknown', async () => {
    const unknownCountConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      id: 'bitbucket',
      name: 'Bitbucket',
      status: 'available',
      tools: [],
    };
    vi.mocked(fetchConnectors).mockResolvedValue([unknownCountConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([unknownCountConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(fetchConnectorDetail).mockResolvedValue({
      ...unknownCountConnector,
      tools: [makeTool('list_repositories')],
    });

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('Bitbucket');
    fireEvent.click(screen.getByRole('button', { name: 'Open Bitbucket details' }));

    await waitFor(() => {
      expect(fetchConnectorDetail).toHaveBeenCalledWith('bitbucket', {
        hydrateTools: true,
        toolsLimit: 50,
      });
    });
    await screen.findByText('list repositories');
  });

  it('does not fetch drawer tool previews before the Composio key is configured', async () => {
    const previewConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      id: 'notion',
      name: 'Notion',
      status: 'available',
      toolCount: 48,
      tools: [],
    };
    vi.mocked(fetchConnectors).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});

    render(<ConnectorsBrowser composioConfigured={false} />);

    await screen.findByText('Notion');
    expect(screen.getByTestId('connector-grid-wrap').className).toContain('is-masked');
    expect(screen.queryByTestId('connector-drawer')).toBeNull();
    expect(fetchConnectorDetail).not.toHaveBeenCalled();
  });

  it('does not keep loading after failed tool preview fetches', async () => {
    const previewConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      id: 'notion',
      name: 'Notion',
      status: 'available',
      toolCount: 48,
      tools: [],
    };
    vi.mocked(fetchConnectors).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(fetchConnectorDetail).mockResolvedValue(null);

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('Notion');
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion details' }));

    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(1));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(fetchConnectorDetail).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Loading tools…')).toBeNull();
    expect(screen.getByText('Tool details are unavailable, but this connector reports 48 tools.')).toBeTruthy();
  });

  it('keeps static preview tools visible when preview hydration fails', async () => {
    const previewConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      id: 'notion',
      name: 'Notion',
      status: 'available',
      toolCount: 48,
      tools: [makeTool('search_pages'), makeTool('create_page')],
    };
    vi.mocked(fetchConnectors).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(fetchConnectorDetail).mockResolvedValue(null);

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('Notion');
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion details' }));

    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(1));
    await screen.findByText('search pages');
    expect(screen.getByText('create page')).toBeTruthy();
    expect(screen.queryByText('Loading tools…')).toBeNull();
  });

  it('retries failed drawer preview hydration when the catalog refresh key changes', async () => {
    const previewConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      id: 'notion',
      name: 'Notion',
      status: 'available',
      toolCount: 48,
      tools: [],
    };
    vi.mocked(fetchConnectors).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(fetchConnectorDetail).mockResolvedValue(null);

    const { rerender } = render(
      <ConnectorsBrowser composioConfigured catalogRefreshKey="initial" />,
    );

    await screen.findByText('Notion');
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion details' }));
    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(1));

    rerender(<ConnectorsBrowser composioConfigured catalogRefreshKey="refetched" />);

    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(2));
  });

  it('retries failed drawer preview hydration when the drawer is reopened', async () => {
    const previewConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      id: 'notion',
      name: 'Notion',
      status: 'available',
      toolCount: 48,
      tools: [],
    };
    vi.mocked(fetchConnectors).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([previewConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(fetchConnectorDetail).mockResolvedValue(null);

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('Notion');
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion details' }));
    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('connector-drawer')).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion details' }));

    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(2));
  });

  it('cancels pending authorization through the daemon before clearing the local state', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(connectConnector).mockResolvedValue({
      connector: availableConnector,
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://example.com/oauth',
        expiresAt: '2099-05-08T10:00:00.000Z',
      },
    });
    vi.mocked(cancelConnectorAuthorization).mockResolvedValue(availableConnector);

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('button', { name: 'Cancel' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(cancelConnectorAuthorization).toHaveBeenCalledWith('github'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy());
  });

  it('keeps pending authorization visible when daemon cancellation fails', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(connectConnector).mockResolvedValue({
      connector: availableConnector,
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://example.com/oauth',
        expiresAt: '2099-05-08T10:00:00.000Z',
      },
    });
    vi.mocked(cancelConnectorAuthorization).mockResolvedValue(null);

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('button', { name: 'Cancel' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(cancelConnectorAuthorization).toHaveBeenCalledWith('github'));
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toContain("Couldn't cancel authorization. Try again.");
    expect(
      JSON.parse(window.sessionStorage.getItem('od-connectors-authorization-pending') ?? '{}'),
    ).toHaveProperty('github');
  });

  it('surfaces a connect error inline on the connector card', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(connectConnector).mockResolvedValue({
      connector: null,
      error: 'Composio provider is not configured',
    });

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(connectConnector).toHaveBeenCalledWith('github'));
    await waitFor(() => expect(
      screen.getByRole('alert').textContent,
    ).toContain('Composio provider is not configured'));
  });

  it('clears the inline connect error when the user retries and succeeds', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(connectConnector)
      .mockResolvedValueOnce({ connector: null, error: 'Composio provider is not configured' })
      .mockResolvedValueOnce({
        connector: availableConnector,
        auth: {
          kind: 'redirect_required',
          redirectUrl: 'https://example.com/oauth',
          expiresAt: '2026-05-08T10:00:00.000Z',
        },
      });

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(
      screen.getByRole('alert').textContent,
    ).toContain('Composio provider is not configured'));

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(connectConnector).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('does not mark failed OAuth launches as pending authorization', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(connectConnector).mockResolvedValue({
      connector: availableConnector,
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://example.com/oauth',
        expiresAt: '2026-05-08T10:00:00.000Z',
      },
      error: 'Popup blocked. Allow popups for Open Design and try again.',
    });

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(connectConnector).toHaveBeenCalledWith('github'));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Connect' })).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Cancel' })).toBeNull();
    expect(
      JSON.parse(window.sessionStorage.getItem('od-connectors-authorization-pending') ?? '{}'),
    ).not.toHaveProperty('github');
  });
});
