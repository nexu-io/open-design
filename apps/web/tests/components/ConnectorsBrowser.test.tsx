// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
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
  openExternalUrl,
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
    openExternalUrl: vi.fn(),
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
    vi.mocked(openExternalUrl).mockReset();
    vi.mocked(cancelConnectorAuthorization).mockResolvedValue(null);
    vi.mocked(connectConnector).mockResolvedValue({ connector: null });
    vi.mocked(fetchConnectorDetail).mockResolvedValue(null);
    vi.mocked(openExternalUrl).mockResolvedValue(true);
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

  it('retries failed drawer preview hydration when reopened from a panel alert', async () => {
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
    vi.mocked(connectConnector).mockResolvedValue({
      connector: null,
      error: 'Composio provider is not configured',
    });

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('Notion');
    fireEvent.click(screen.getByRole('button', { name: 'Open Notion details' }));
    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByTestId('connector-drawer')).toBeNull());

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(connectConnector).toHaveBeenCalledWith('notion'));
    const alert = await screen.findByRole('status');
    expect(alert.textContent).toContain('Notion: Composio provider is not configured');
    const alertRow = alert.closest('.connector-panel-alert');
    expect(alertRow).not.toBeNull();

    fireEvent.click(within(alertRow as HTMLElement).getByRole('button', { name: 'Open Notion details' }));

    await waitFor(() => expect(fetchConnectorDetail).toHaveBeenCalledTimes(2));
    expect(fetchConnectorDetail).toHaveBeenNthCalledWith(2, 'notion', {
      hydrateTools: true,
      toolsLimit: 50,
    });
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
    const authorizationButton = screen.getByRole('button', { name: 'Continue in browser' });
    fireEvent.click(authorizationButton);
    await waitFor(() => expect(openExternalUrl).toHaveBeenCalledWith(
      'https://example.com/oauth',
    ));

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
    const status = screen.getByRole('status');
    expect(status.textContent).toContain("Couldn't cancel authorization. Try again.");
    expect(status.closest('.connector-grid')).toBeNull();
    expect(status.closest('.connector-card')).toBeNull();
    const alertRow = status.closest('.connector-panel-alert');
    expect(alertRow).not.toBeNull();
    fireEvent.click(within(alertRow as HTMLElement).getByRole('button', { name: 'Open GitHub details' }));
    const drawer = await screen.findByTestId('connector-drawer');
    expect(within(drawer).getByRole('alert').textContent).toContain("Couldn't cancel authorization. Try again.");
    expect(document.querySelector('.connector-panel-alert')).toBeNull();
    expect(
      JSON.parse(window.sessionStorage.getItem('od-connectors-authorization-pending') ?? '{}'),
    ).toHaveProperty('github');
  });

  it('clears failed authorization cancel alerts after status refresh connects', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses)
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ github: { status: 'connected' } });
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
    expect(screen.getByRole('status').textContent).toContain("Couldn't cancel authorization. Try again.");

    fireEvent.focus(window);

    await waitFor(() => expect(fetchConnectorStatuses).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(document.querySelector('.connector-panel-alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('does not show a failed authorization cancel alert when refresh already reports connected', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({ github: { status: 'connected' } });
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
    await waitFor(() => expect(fetchConnectorStatuses).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
    expect(document.querySelector('.connector-panel-alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Disconnect' })).toBeTruthy();
  });

  it('surfaces a connect error above the connector grid', async () => {
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
    const alert = await screen.findByRole('status');
    expect(alert.textContent).toContain('GitHub: Composio provider is not configured');
    expect(alert.textContent).toContain('GitHub');
    expect(alert.textContent).toContain('Composio provider is not configured');
    expect(alert.closest('.connector-grid')).toBeNull();
    expect(alert.closest('.connector-card')).toBeNull();
    const alertRow = alert.closest('.connector-panel-alert');
    expect(alertRow).not.toBeNull();
    fireEvent.click(within(alertRow as HTMLElement).getByRole('button', { name: 'Open GitHub details' }));
    const drawer = await screen.findByTestId('connector-drawer');
    expect(within(drawer).getByText('Composio provider is not configured')).toBeTruthy();
    expect(document.querySelector('.connector-panel-alert')).toBeNull();
  });

  it('preserves full long connect errors in the panel alert title and drawer', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      name: 'GitHub Enterprise Connector With A Very Long Display Name',
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    const longError = [
      'OAuth failed because provider returned invalid_request.',
      'Raw response:',
      'https://example.com/callback?error_description=this-is-a-very-long-provider-token-that-should-not-stretch-the-card-grid',
    ].join(' ');
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({});
    vi.mocked(connectConnector).mockResolvedValue({
      connector: null,
      error: longError,
    });

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub Enterprise Connector With A Very Long Display Name');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));

    await waitFor(() => expect(connectConnector).toHaveBeenCalledWith('github'));
    const alert = await screen.findByRole('status');
    expect(alert.textContent).toContain(longError);
    expect(alert.closest('.connector-grid')).toBeNull();
    expect(alert.closest('.connector-card')).toBeNull();
    expect(alert.querySelector('strong')?.getAttribute('title')).toBe(
      'GitHub Enterprise Connector With A Very Long Display Name',
    );
    const message = alert.querySelector('span[title]');
    expect(message?.getAttribute('title')).toBe(longError);
    const alertRow = alert.closest('.connector-panel-alert');
    expect(alertRow).not.toBeNull();
    fireEvent.click(within(alertRow as HTMLElement).getByRole('button', {
      name: 'Open GitHub Enterprise Connector With A Very Long Display Name details',
    }));
    const drawer = await screen.findByTestId('connector-drawer');
    expect(within(drawer).getByText(longError)).toBeTruthy();
    expect(document.querySelector('.connector-panel-alert')).toBeNull();
  });

  it('clears the panel connect error when the user retries and succeeds', async () => {
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
      screen.getByRole('status').textContent,
    ).toContain('Composio provider is not configured'));

    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await waitFor(() => expect(connectConnector).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('status')).toBeNull());
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

  it('does not auto-cancel pending authorization on focus while the daemon authorization window is still valid', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({
      github: { status: 'available' },
    });
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

    fireEvent(window, new Event('focus'));

    await waitFor(() => expect(fetchConnectorStatuses).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelConnectorAuthorization).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeTruthy();
    expect(
      JSON.parse(window.sessionStorage.getItem('od-connectors-authorization-pending') ?? '{}'),
    ).toHaveProperty('github');
  });

  it('auto-cancels stuck pending authorization on focus once the daemon authorization window has expired', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const startMs = new Date('2026-05-17T10:00:00.000Z').getTime();
    vi.setSystemTime(startMs);

    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({
      github: { status: 'available' },
    });
    vi.mocked(connectConnector).mockResolvedValue({
      connector: availableConnector,
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://example.com/oauth',
        expiresAt: new Date(startMs + 5 * 60 * 1000).toISOString(),
      },
    });
    vi.mocked(cancelConnectorAuthorization).mockResolvedValue(availableConnector);

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('button', { name: 'Cancel' });

    vi.setSystemTime(startMs + 10 * 60 * 1000);

    fireEvent(window, new Event('focus'));

    await waitFor(() => expect(cancelConnectorAuthorization).toHaveBeenCalledWith('github'));
    await screen.findByRole('button', { name: 'Connect' });
    expect(
      JSON.parse(window.sessionStorage.getItem('od-connectors-authorization-pending') ?? '{}'),
    ).not.toHaveProperty('github');

    vi.useRealTimers();
  });

  it('marks the auto-cancel as failed when the daemon /authorization/cancel returns null after the authorization expires', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const startMs = new Date('2026-05-17T10:00:00.000Z').getTime();
    vi.setSystemTime(startMs);

    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({
      github: { status: 'available' },
    });
    vi.mocked(connectConnector).mockResolvedValue({
      connector: availableConnector,
      auth: {
        kind: 'redirect_required',
        redirectUrl: 'https://example.com/oauth',
        expiresAt: new Date(startMs + 5 * 60 * 1000).toISOString(),
      },
    });
    vi.mocked(cancelConnectorAuthorization).mockResolvedValue(null);

    render(<ConnectorsBrowser composioConfigured />);

    await screen.findByText('GitHub');
    fireEvent.click(screen.getByRole('button', { name: 'Connect' }));
    await screen.findByRole('button', { name: 'Cancel' });

    vi.setSystemTime(startMs + 10 * 60 * 1000);

    fireEvent(window, new Event('focus'));

    await waitFor(() => expect(cancelConnectorAuthorization).toHaveBeenCalledWith('github'));
    expect(await screen.findAllByText("Couldn't cancel authorization. Try again.")).toHaveLength(2);

    vi.useRealTimers();
  });

  it('does not auto-cancel pending authorization on focus when the daemon already reports the connector as connected', async () => {
    const availableConnector: ConnectorDetail = {
      ...configuredComposioConnector,
      status: 'available',
      auth: { provider: 'composio', configured: true },
    };
    vi.mocked(fetchConnectors).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorDiscovery).mockResolvedValue([availableConnector]);
    vi.mocked(fetchConnectorStatuses).mockResolvedValue({
      github: { status: 'connected' },
    });
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

    fireEvent(window, new Event('focus'));

    await waitFor(() => expect(fetchConnectorStatuses).toHaveBeenCalled());
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(cancelConnectorAuthorization).not.toHaveBeenCalled();
  });
});
