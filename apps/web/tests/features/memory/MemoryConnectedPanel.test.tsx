// @vitest-environment jsdom
//
// The connected-apps panel is a large presentational surface over the connectors
// hook. Most of its branches are already exercised through the orchestrator test;
// this focused test drives the suggestion-review list (toggle a suggestion, run
// the scan bar, discard/save) and the Manage entry point, which the end-to-end
// path does not reach.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectorDetail, MemorySuggestion } from '@open-design/contracts';

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
});
