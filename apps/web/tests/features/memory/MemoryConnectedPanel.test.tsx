// @vitest-environment jsdom
//
// The connected-apps panel is a large presentational surface over the connectors
// hook. Most of its branches are already exercised through the orchestrator test;
// this focused test drives the suggestion-review list (toggle a suggestion, run
// the scan bar, discard/save) and the Manage entry point, which the end-to-end
// path does not reach.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type {
  ConnectorDetail,
  MemoryExtractionRecord,
  MemorySuggestion,
} from '@open-design/contracts';
import type { ConnectorMemoryAttempt } from '../../../src/features/memory/types';

import { MemoryConnectedPanel } from '../../../src/features/memory/components/MemoryConnectedPanel';
import { I18nProvider } from '../../../src/i18n';

function connectedConnector(id: string, over: Partial<ConnectorDetail> = {}): ConnectorDetail {
  return {
    id,
    name: id,
    provider: 'composio',
    category: 'Memory source',
    status: 'connected',
    tools: [],
    ...over,
  };
}

function suggestion(id: string, over: Partial<MemorySuggestion> = {}): MemorySuggestion {
  return {
    id,
    name: `name-${id}`,
    description: `desc-${id}`,
    type: 'project',
    body: `body-${id}`,
    ...over,
  };
}

function renderPanel(props: Partial<Parameters<typeof MemoryConnectedPanel>[0]> = {}) {
  const cbs = {
    onOpenConnectors: vi.fn(),
    toggleConnectorSelection: vi.fn(),
    onConnectMemoryConnector: vi.fn(),
    toggleConnectorSuggestion: vi.fn(),
    onSuggestConnectorMemory: vi.fn(),
    onSaveConnectorSuggestions: vi.fn(),
    onDiscardConnectorSuggestions: vi.fn(),
    onOpenPreview: vi.fn(),
    onDeleteExtraction: vi.fn(),
  };
  const utils = render(
    <I18nProvider initial="en">
      <MemoryConnectedPanel
        enabled
        connectorStatuses={{}}
        connectorsLoading={false}
        connectedCount={0}
        selectedConnectorIds={new Set()}
        selectedConnectedConnectorIds={[]}
        connectingConnectorIds={new Set()}
        pendingConnectorAuthIds={new Set()}
        connectorConnectErrors={{}}
        connectorIdsWithDetails={new Set()}
        connectorExtracting={false}
        connectorSaving={false}
        connectorScanLabel="Scan selected apps"
        connectorSuggestions={[suggestion('s1')]}
        selectedSuggestionIds={new Set()}
        selectedConnectorSuggestions={[]}
        connectorStatus={null}
        connectorError={null}
        connectorLoadError={null}
        connectorAttempts={[]}
        connectorContextBytes={0}
        connectorExtractions={[]}
        memoryConnectors={[]}
        nowClock={0}
        {...cbs}
        {...props}
      />
    </I18nProvider>,
  );
  return { ...utils, ...cbs };
}

afterEach(cleanup);

describe('MemoryConnectedPanel', () => {
  it('renders a suggestion row and toggles it on checkbox change', () => {
    const { toggleConnectorSuggestion } = renderPanel();
    expect(screen.getByText('name-s1')).toBeInTheDocument();
    const checkbox = screen.getByRole('checkbox');
    fireEvent.click(checkbox);
    expect(toggleConnectorSuggestion).toHaveBeenCalledWith('s1');
  });

  it('wires the Manage entry point when a handler is provided', () => {
    const { onOpenConnectors } = renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Manage' }));
    expect(onOpenConnectors).toHaveBeenCalled();
  });

  it('falls back to "Connected apps" as the suggestion source label', () => {
    renderPanel({ connectorSuggestions: [suggestion('s1', { source: undefined })] });
    expect(screen.getByText('Connected apps')).toBeInTheDocument();
  });

  it('omits the description line for a suggestion without one', () => {
    renderPanel({ connectorSuggestions: [suggestion('s1', { description: '' })] });
    expect(screen.getByText('name-s1')).toBeInTheDocument();
    expect(screen.queryByText('desc-s1')).toBeNull();
  });

  it('shows a connected connector hint from its account label, or the tool count as fallback', () => {
    renderPanel({
      connectedCount: 2,
      memoryConnectors: [
        connectedConnector('notion', { accountLabel: 'me@acme.com' }),
        connectedConnector('figma', { tools: [{ name: 't1' }, { name: 't2' }] as ConnectorDetail['tools'] }),
      ],
    });
    // Connected + accountLabel → the label; connected without a label → tool count.
    expect(screen.getByText('me@acme.com')).toBeInTheDocument();
    expect(screen.getByText('2 read tools')).toBeInTheDocument();
  });

  it('toggles a connected connector selection via its checkbox', () => {
    const { toggleConnectorSelection } = renderPanel({
      connectedCount: 1,
      memoryConnectors: [connectedConnector('notion')],
    });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Use notion for memory extraction' }));
    expect(toggleConnectorSelection).toHaveBeenCalledWith('notion');
  });

  it('renders a selected connected connector as checked and selected', () => {
    renderPanel({
      connectedCount: 1,
      selectedConnectorIds: new Set(['notion']),
      selectedConnectedConnectorIds: ['notion'],
      memoryConnectors: [connectedConnector('notion')],
    });

    expect(screen.getByRole('checkbox', { name: 'Use notion for memory extraction' })).toBeChecked();
    expect(screen.getByText('Selected')).toBeInTheDocument();
  });

  it('fires onConnectMemoryConnector for a not-yet-connected connector and stops the row click', () => {
    const { onConnectMemoryConnector, toggleConnectorSelection } = renderPanel({
      memoryConnectors: [connectedConnector('notion', { status: 'available' })],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Connect notion' }));
    expect(onConnectMemoryConnector).toHaveBeenCalledWith('notion');
    // The row-level checkbox toggle must not also fire from the same click.
    expect(toggleConnectorSelection).not.toHaveBeenCalled();
  });

  it('labels a connector in an error state as reconnectable', () => {
    renderPanel({
      memoryConnectors: [connectedConnector('notion', { status: 'error', lastError: 'token expired' })],
    });
    expect(screen.getByRole('button', { name: 'Reconnect notion' })).toBeInTheDocument();
    expect(screen.getByText('token expired')).toBeInTheDocument();
  });

  it('shows the checking-status hint while connectorsLoading and the status is unresolved', () => {
    renderPanel({
      connectorsLoading: true,
      memoryConnectors: [connectedConnector('notion', { status: 'available' })],
    });
    expect(screen.getByText('Checking connection status…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect notion' })).toBeDisabled();
  });

  it('shows the authorization-pending hint and disables the connect button', () => {
    renderPanel({
      memoryConnectors: [connectedConnector('notion', { status: 'available' })],
      pendingConnectorAuthIds: new Set(['notion']),
    });
    expect(screen.getByText('Finish authorization in your browser, then return here')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Connect notion' })).toBeDisabled();
  });

  it('shows a connecting connector as busy until its connection request settles', () => {
    renderPanel({
      memoryConnectors: [connectedConnector('notion', { status: 'available' })],
      connectingConnectorIds: new Set(['notion']),
    });
    const button = screen.getByRole('button', { name: 'Connect notion' });
    expect(button).toHaveTextContent('Connecting');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
  });

  it('falls back to the connect-error hint over the default prompt', () => {
    renderPanel({
      memoryConnectors: [connectedConnector('notion', { status: 'available' })],
      connectorConnectErrors: { notion: 'network offline' },
    });
    expect(screen.getByText('network offline')).toBeInTheDocument();
  });

  it('fires onSuggestConnectorMemory from the scan button once a connector is selected', () => {
    const { onSuggestConnectorMemory } = renderPanel({
      connectedCount: 1,
      selectedConnectedConnectorIds: ['notion'],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Scan selected apps' }));
    expect(onSuggestConnectorMemory).toHaveBeenCalled();
  });

  it('disables the scan button and shows its busy icon while a scan is running', () => {
    const { container } = renderPanel({
      connectedCount: 1,
      selectedConnectedConnectorIds: ['notion'],
      connectorExtracting: true,
    });
    expect(screen.getByRole('button', { name: 'Scan selected apps' })).toBeDisabled();
    expect(container.querySelector('.icon-spin')).toBeInTheDocument();
  });

  it('fires onSaveConnectorSuggestions and onDiscardConnectorSuggestions from their buttons', () => {
    const { onSaveConnectorSuggestions, onDiscardConnectorSuggestions } = renderPanel({
      selectedConnectorSuggestions: [suggestion('s1')],
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save selected' }));
    expect(onSaveConnectorSuggestions).toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(onDiscardConnectorSuggestions).toHaveBeenCalled();
  });

  it('renders selected suggestions and disables their actions while saving', () => {
    renderPanel({
      selectedSuggestionIds: new Set(['s1']),
      selectedConnectorSuggestions: [suggestion('s1')],
      connectorSaving: true,
    });

    expect(screen.getByRole('checkbox')).toBeChecked();
    expect(screen.getByRole('button', { name: 'Saving' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard' })).toBeDisabled();
  });

  it('does not render suggestion actions when no suggestions are available', () => {
    renderPanel({ connectorSuggestions: [] });
    expect(screen.queryByText('Suggested memories')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Discard' })).toBeNull();
  });

  it('shows the success status and error banners', () => {
    renderPanel({ connectorStatus: 'Saved 2 memories', connectorError: 'Scan failed' });
    expect(screen.getByRole('status')).toHaveTextContent('Saved 2 memories');
    expect(screen.getByRole('alert')).toHaveTextContent('Scan failed');
  });

  it('shows the connector-load-error banner', () => {
    renderPanel({ connectorLoadError: 'Could not load connectors' });
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load connectors');
  });

  it('renders last-scan diagnostics for succeeded, failed, and skipped attempts', () => {
    const attempts: ConnectorMemoryAttempt[] = [
      { connectorId: 'notion', connectorName: 'Notion', status: 'succeeded', toolTitle: 'Search', summary: 'read 3 pages' },
      { connectorId: 'figma', connectorName: 'Figma', status: 'failed', error: 'rate limited', summary: '' },
      { connectorId: 'slack', connectorName: 'Slack', status: 'skipped', summary: '' },
    ];
    renderPanel({ connectorAttempts: attempts, connectorContextBytes: 2048 });
    expect(screen.getByText('Read Notion')).toBeInTheDocument();
    expect(screen.getByText('Could not read Figma')).toBeInTheDocument();
    expect(screen.getByText('Skipped Slack')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB read')).toBeInTheDocument();
  });

  it('renders up to 4 recent scans while the summary badge shows the true count, and wires delete', () => {
    const record = (id: string): MemoryExtractionRecord => ({
      id,
      startedAt: 1_000,
      phase: 'success',
      userMessagePreview: `msg-${id}`,
      kind: 'connector',
    });
    const { onDeleteExtraction } = renderPanel({
      connectorExtractions: [record('a'), record('b'), record('c'), record('d'), record('e')],
    });

    // The summary badge reports the TRUE total (5) even though the visible
    // history is capped at 4 cards.
    expect(screen.getByText('5')).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
    expect(deleteButtons).toHaveLength(4);

    fireEvent.click(deleteButtons[0]!);
    expect(onDeleteExtraction).toHaveBeenCalledWith('a');
  });
});
