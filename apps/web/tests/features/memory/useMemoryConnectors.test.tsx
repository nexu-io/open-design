// @vitest-environment jsdom
//
// Unit tests for the connectors cluster hook. The port-injection paradigm pays
// off here: we drive the whole OAuth + scan/suggest/save flow through a
// hand-written fake port and fake coordination — no fetch mocking, no module
// mocks, no DOM. The two accumulating OAuth subscriptions (poll + message
// listener) deliberately live in the orchestrator, so they are out of scope
// here; this pins the state machine the hook actually owns.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type {
  ConnectorDetail,
  ConnectorMemorySuggestionResponse,
  MemoryExtractionRecord,
  MemorySuggestion,
} from '@open-design/contracts';

import {
  useMemoryConnectors,
  type MemoryConnectorsCoordination,
} from '../../../src/features/memory/hooks/useMemoryConnectors.hooks';
import type { MemoryConnectorsPort } from '../../../src/features/memory/ports';
import type {
  ConnectorConnectResult,
  ConnectorStatusMap,
} from '../../../src/features/memory/types';

function connector(id: string, over: Partial<ConnectorDetail> = {}): ConnectorDetail {
  return {
    id,
    name: id,
    provider: 'composio',
    category: 'Memory source',
    status: 'available',
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

function makePort(over: Partial<MemoryConnectorsPort> = {}): MemoryConnectorsPort {
  return {
    fetchMemoryConnectors: vi.fn(async () => [] as ConnectorDetail[]),
    fetchConnectorStatuses: vi.fn(async () => ({}) as ConnectorStatusMap),
    connectConnector: vi.fn(async () => ({ connector: null }) as ConnectorConnectResult),
    suggestConnectorMemories: vi.fn(async () => null),
    saveMemoryEntry: vi.fn(async () => null),
    readPendingConnectorAuthIds: () => new Set<string>(),
    writePendingConnectorAuthIds: vi.fn(),
    notifyConnectorsChanged: vi.fn(),
    ...over,
  };
}

function makeCoord(over: Partial<MemoryConnectorsCoordination> = {}): MemoryConnectorsCoordination {
  return {
    reload: vi.fn(async () => {}),
    reloadExtractions: vi.fn(async () => [] as MemoryExtractionRecord[]),
    chatAgentId: null,
    chatModel: null,
    ...over,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useMemoryConnectors — catalogue + selection', () => {
  it('always surfaces the six memory-connector apps and marks connected ones', async () => {
    const port = makePort({
      fetchMemoryConnectors: vi.fn(async () => [connector('notion')]),
      fetchConnectorStatuses: vi.fn(async () => ({ notion: { status: 'connected' } }) as ConnectorStatusMap),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    expect(result.current.memoryConnectors).toHaveLength(6);

    await act(async () => {
      await result.current.reloadConnectors();
    });

    expect(result.current.connectorsLoading).toBe(false);
    expect(result.current.connectedMemoryConnectors.map((c) => c.id)).toEqual(['notion']);
    expect(result.current.connectedCount).toBe(1);
  });

  it('preserves the last catalogue and surfaces a load error when discovery fails', async () => {
    const fetchMemoryConnectors = vi
      .fn<MemoryConnectorsPort['fetchMemoryConnectors']>()
      .mockResolvedValueOnce([connector('notion')])
      .mockRejectedValueOnce(new Error('discovery offline'));
    const port = makePort({ fetchMemoryConnectors });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.reloadConnectors();
    });
    await act(async () => {
      await result.current.reloadConnectors();
    });

    expect(result.current.memoryConnectors.find((item) => item.id === 'notion')?.name).toBe('notion');
    expect(result.current.connectorLoadError).toMatch(/couldn't be loaded/);
  });

  it('keeps only connected apps in selectedConnectedConnectorIds and labels the scan', async () => {
    const port = makePort({
      fetchConnectorStatuses: vi.fn(async () => ({ notion: { status: 'connected' } }) as ConnectorStatusMap),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.reloadConnectors();
    });

    expect(result.current.connectorScanLabel).toBe('Select apps to scan');

    // Selecting a connected app counts; selecting a disconnected one is filtered.
    act(() => result.current.toggleConnectorSelection('notion'));
    act(() => result.current.toggleConnectorSelection('figma'));

    expect(result.current.selectedConnectedConnectorIds).toEqual(['notion']);
    expect(result.current.connectorScanLabel).toBe('Scan selected apps');
  });
});

describe('useMemoryConnectors — OAuth connect + refresh', () => {
  it('marks a connector pending when auth requires completion, then persists it', async () => {
    const port = makePort({
      connectConnector: vi.fn(async () => ({
        connector: connector('notion'),
        auth: { kind: 'redirect_required' },
      })),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });

    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(true);
    // The connecting spinner is cleared in the finally block.
    expect(result.current.connectingConnectorIds.has('notion')).toBe(false);
    // Pending set is mirrored to storage through the port.
    expect(port.writePendingConnectorAuthIds).toHaveBeenCalledWith(
      expect.objectContaining({}),
    );
    const lastPersist = (port.writePendingConnectorAuthIds as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as Set<string>;
    expect([...lastPersist]).toContain('notion');
  });

  it('records a connect error and does not mark the connector pending', async () => {
    const port = makePort({
      connectConnector: vi.fn(async () => ({ connector: connector('figma'), error: 'nope' })),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('figma');
    });

    expect(result.current.connectorConnectErrors.figma).toBe('nope');
    expect(result.current.pendingConnectorAuthIds.has('figma')).toBe(false);
  });

  it('records a connect error when connectConnector itself throws, instead of an unhandled rejection', async () => {
    const port = makePort({
      connectConnector: vi.fn(async () => {
        throw new Error('network unreachable');
      }),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await expect(act(async () => {
      await result.current.onConnectMemoryConnector('figma');
    })).resolves.toBeUndefined();

    expect(result.current.connectorConnectErrors.figma).toBe('network unreachable');
    expect(result.current.pendingConnectorAuthIds.has('figma')).toBe(false);
    expect(result.current.connectingConnectorIds.has('figma')).toBe(false);
  });

  it('stringifies a non-Error thrown from connectConnector', async () => {
    const port = makePort({
      connectConnector: vi.fn(async () => {
        throw 'plain string failure';
      }),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('figma');
    });

    expect(result.current.connectorConnectErrors.figma).toBe('plain string failure');
  });

  it('clears a stale pending-auth id when a retry throws instead of resolving', async () => {
    const outcome: { current: 'pending' | 'throw' } = { current: 'pending' };
    const port = makePort({
      connectConnector: vi.fn(async () => {
        if (outcome.current === 'throw') throw new Error('network unreachable');
        return { connector: connector('figma'), auth: { kind: 'pending' } };
      }),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    // First attempt leaves the connector pending mid-authorization.
    await act(async () => {
      await result.current.onConnectMemoryConnector('figma');
    });
    expect(result.current.pendingConnectorAuthIds.has('figma')).toBe(true);

    // A retry that throws must clear the now-stale pending id, not just skip
    // touching it.
    outcome.current = 'throw';
    await act(async () => {
      await result.current.onConnectMemoryConnector('figma');
    });
    expect(result.current.connectorConnectErrors.figma).toBe('network unreachable');
    expect(result.current.pendingConnectorAuthIds.has('figma')).toBe(false);
  });

  it('keeps a successful connect intact when its status refresh rejects', async () => {
    const port = makePort({
      connectConnector: vi.fn(async () => ({
        connector: connector('notion', { status: 'connected' }),
      })),
      fetchConnectorStatuses: vi.fn(async () => {
        throw new Error('status service unavailable');
      }),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await expect(act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    })).resolves.toBeUndefined();

    expect(result.current.memoryConnectors.find((item) => item.id === 'notion')?.status).toBe('connected');
    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(false);
    expect(result.current.connectingConnectorIds.has('notion')).toBe(false);
    expect(result.current.connectorLoadError).toMatch(/couldn't be loaded/);
  });

  it('ignores a re-entrant connect call for the same connector while one is already in flight', async () => {
    let resolveConnect!: (value: { connector: ConnectorDetail }) => void;
    const connectConnector = vi.fn(
      () => new Promise<{ connector: ConnectorDetail }>((resolve) => { resolveConnect = resolve; }),
    );
    const port = makePort({ connectConnector });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    let first: Promise<void>;
    act(() => {
      first = result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.connectingConnectorIds.has('notion')).toBe(true);

    // A second call for the SAME connector while the first is still in
    // flight must be a no-op — it must not fire a second connect request.
    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(connectConnector).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect({ connector: connector('notion', { status: 'connected' }) });
      await first!;
    });
    expect(result.current.connectingConnectorIds.has('notion')).toBe(false);
  });

  it('ignores a re-entrant connect call fired in the SAME batch, before the first render commits', async () => {
    // Two synchronous calls inside one `act()` never let React's
    // `connectingConnectorIds` state update land between them — a guard that
    // only reads that state would let both through. The guard must use a
    // synchronously-updated ref instead.
    let resolveConnect!: (value: { connector: ConnectorDetail }) => void;
    const connectConnector = vi.fn(
      () => new Promise<{ connector: ConnectorDetail }>((resolve) => { resolveConnect = resolve; }),
    );
    const port = makePort({ connectConnector });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.onConnectMemoryConnector('notion');
      second = result.current.onConnectMemoryConnector('notion');
    });
    expect(connectConnector).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveConnect({ connector: connector('notion', { status: 'connected' }) });
      await Promise.all([first, second]);
    });
    expect(connectConnector).toHaveBeenCalledTimes(1);
    expect(result.current.connectingConnectorIds.has('notion')).toBe(false);
  });

  it('refreshConnectorStatuses clears a resolved pending auth and notifies on change', async () => {
    const statuses: { current: ConnectorStatusMap } = { current: {} };
    const port = makePort({
      connectConnector: vi.fn(async () => ({
        connector: connector('notion'),
        auth: { kind: 'pending' },
      })),
      fetchConnectorStatuses: vi.fn(async () => statuses.current),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(true);

    // The popup completes: statuses now report notion connected.
    statuses.current = { notion: { status: 'connected' } };
    await act(async () => {
      await result.current.refreshConnectorStatuses();
    });

    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(false);
    expect(port.notifyConnectorsChanged).toHaveBeenCalled();
  });

  it('keeps the newer callback refresh when an older pending-auth poll resolves last', async () => {
    const poll = deferred<ConnectorStatusMap>();
    const callback = deferred<ConnectorStatusMap>();
    const port = makePort({
      fetchConnectorStatuses: vi.fn()
        .mockReturnValueOnce(poll.promise)
        .mockReturnValueOnce(callback.promise),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    let pollRefresh!: Promise<void>;
    let callbackRefresh!: Promise<void>;
    act(() => {
      pollRefresh = result.current.refreshConnectorStatuses();
      callbackRefresh = result.current.refreshConnectorStatuses();
    });

    await act(async () => {
      callback.resolve({ notion: { status: 'connected' } });
      await callbackRefresh;
    });
    expect(result.current.connectorStatuses.notion?.status).toBe('connected');

    await act(async () => {
      poll.resolve({ notion: { status: 'available' } });
      await pollRefresh;
    });
    expect(result.current.connectorStatuses.notion?.status).toBe('connected');
  });
});

describe('useMemoryConnectors — catalogue/status ordering races', () => {
  it('reload discovery commits merged with a newer status that landed mid-flight (nettee scenario)', async () => {
    const reloadStatus = deferred<ConnectorStatusMap>();
    const refreshStatus = deferred<ConnectorStatusMap>();
    const discovery = deferred<ConnectorDetail[]>();
    const port = makePort({
      fetchConnectorStatuses: vi
        .fn<MemoryConnectorsPort['fetchConnectorStatuses']>()
        .mockReturnValueOnce(reloadStatus.promise)
        .mockReturnValueOnce(refreshStatus.promise),
      fetchMemoryConnectors: vi.fn(() => discovery.promise),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    // reload starts -> refresh starts -> refresh resolves -> reload discovery resolves
    let reloadPromise!: Promise<void>;
    act(() => {
      reloadPromise = result.current.reloadConnectors();
    });
    let refreshPromise!: Promise<void>;
    act(() => {
      refreshPromise = result.current.refreshConnectorStatuses();
    });

    await act(async () => {
      reloadStatus.resolve({});
      // Let reload's own (older) status commit land before refresh's.
      await Promise.resolve();
      await Promise.resolve();
    });

    await act(async () => {
      refreshStatus.resolve({ notion: { status: 'connected' } });
      await refreshPromise;
    });
    expect(result.current.connectorStatuses.notion?.status).toBe('connected');

    await act(async () => {
      discovery.resolve([connector('notion')]);
      await reloadPromise;
    });

    // The discovery response must still commit (not be silently discarded by
    // the newer status-only refresh), and it must merge against the LATEST
    // status ('connected'), not the stale snapshot reload captured at start.
    expect(result.current.connectorsLoading).toBe(false);
    expect(result.current.connectorLoadError).toBeNull();
    expect(result.current.memoryConnectors.find((c) => c.id === 'notion')?.status).toBe('connected');
  });

  it('a newer reload wins over an older one still fetching discovery', async () => {
    const discoveryA = deferred<ConnectorDetail[]>();
    const discoveryB = deferred<ConnectorDetail[]>();
    const port = makePort({
      fetchConnectorStatuses: vi.fn(async () => ({}) as ConnectorStatusMap),
      fetchMemoryConnectors: vi
        .fn<MemoryConnectorsPort['fetchMemoryConnectors']>()
        .mockReturnValueOnce(discoveryA.promise)
        .mockReturnValueOnce(discoveryB.promise),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    let reloadA!: Promise<void>;
    let reloadB!: Promise<void>;
    await act(async () => {
      reloadA = result.current.reloadConnectors();
      await Promise.resolve();
      reloadB = result.current.reloadConnectors();
      await Promise.resolve();
    });

    await act(async () => {
      discoveryB.resolve([connector('notion', { name: 'from-B' })]);
      await reloadB;
    });
    expect(result.current.connectorsLoading).toBe(false);

    // A's (older, slower) discovery resolving last must not overwrite B's
    // (newer, already-committed) catalogue, and must not re-flip loading.
    await act(async () => {
      discoveryA.resolve([connector('notion', { name: 'from-A' })]);
      await reloadA;
    });

    expect(result.current.memoryConnectors.find((c) => c.id === 'notion')?.name).toBe('from-B');
    expect(result.current.connectorsLoading).toBe(false);
  });

  it("a connect upsert survives an in-flight reload's stale discovery response", async () => {
    const discovery = deferred<ConnectorDetail[]>();
    const port = makePort({
      fetchConnectorStatuses: vi.fn(async () => ({}) as ConnectorStatusMap),
      fetchMemoryConnectors: vi.fn(() => discovery.promise),
      connectConnector: vi.fn(async () => ({
        connector: connector('notion', { status: 'connected' }),
      })),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    act(() => {
      void result.current.reloadConnectors();
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.memoryConnectors.find((c) => c.id === 'notion')?.status).toBe('connected');

    // The reload's discovery response is stale relative to the connect that
    // already landed — it must not overwrite the just-connected state.
    await act(async () => {
      discovery.resolve([connector('notion', { status: 'available' })]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.memoryConnectors.find((c) => c.id === 'notion')?.status).toBe('connected');
  });
});

describe('useMemoryConnectors — scan / suggest / save', () => {
  async function connectAndSelect(port: MemoryConnectorsPort, coord: MemoryConnectorsCoordination) {
    const hook = renderHook(() => useMemoryConnectors(port, coord));
    await act(async () => {
      await hook.result.current.reloadConnectors();
    });
    act(() => hook.result.current.toggleConnectorSelection('notion'));
    return hook;
  }

  const connectedStatuses = vi.fn(async () => ({ notion: { status: 'connected' } }) as ConnectorStatusMap);

  it('surfaces suggestions and pre-selects them all on a successful scan', async () => {
    const response: ConnectorMemorySuggestionResponse = {
      suggestions: [suggestion('s1'), suggestion('s2')],
      attemptedLLM: true,
      connectors: [
        { connectorId: 'notion', connectorName: 'Notion', status: 'succeeded', summary: '' },
      ],
      contextBytes: 42,
    };
    const coord = makeCoord();
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => response),
    });
    const { result } = await connectAndSelect(port, coord);

    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });

    expect(coord.reloadExtractions).toHaveBeenCalled();
    expect(result.current.connectorSuggestions.map((s) => s.id)).toEqual(['s1', 's2']);
    expect([...result.current.selectedSuggestionIds]).toEqual(['s1', 's2']);
    expect(result.current.connectorContextBytes).toBe(42);
    expect(result.current.connectorError).toBeNull();
  });

  it('reports an error when the scan cannot read the connected apps', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => null),
    });
    const { result } = await connectAndSelect(port, makeCoord());

    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });

    expect(result.current.connectorError).toMatch(/Could not read connected apps/);
    expect(result.current.connectorSuggestions).toEqual([]);
  });

  it('saves selected suggestions, reloads the list, and drops the saved rows', async () => {
    const response: ConnectorMemorySuggestionResponse = {
      suggestions: [suggestion('s1'), suggestion('s2')],
      attemptedLLM: true,
      connectors: [{ connectorId: 'notion', connectorName: 'Notion', status: 'succeeded', summary: '' }],
      contextBytes: 0,
    };
    const coord = makeCoord();
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => response),
      saveMemoryEntry: vi.fn(async (draft) => ({
        id: draft.id ?? 'generated',
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        updatedAt: 0,
      })),
    });
    const { result } = await connectAndSelect(port, coord);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });

    await act(async () => {
      await result.current.onSaveConnectorSuggestions();
    });

    expect(port.saveMemoryEntry).toHaveBeenCalledTimes(2);
    expect(coord.reload).toHaveBeenCalled();
    expect(result.current.connectorSuggestions).toEqual([]);
    expect(result.current.connectorStatus).toMatch(/Saved 2 memories/);
  });

  function scanResponse(over: Partial<ConnectorMemorySuggestionResponse> = {}): ConnectorMemorySuggestionResponse {
    return {
      suggestions: [suggestion('s1'), suggestion('s2')],
      attemptedLLM: true,
      connectors: [{ connectorId: 'notion', connectorName: 'Notion', status: 'succeeded', summary: '' }],
      contextBytes: 0,
      ...over,
    };
  }

  it('surfaces a friendly failure when a connector extraction failed during the scan', async () => {
    const coord = makeCoord({
      reloadExtractions: vi.fn(async () => [
        {
          id: 'x',
          startedAt: Date.now(),
          phase: 'failed',
          kind: 'connector',
          error: 'quota exceeded',
          userMessagePreview: '',
        } as MemoryExtractionRecord,
      ]),
    });
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => scanResponse()),
    });
    const { result } = await connectAndSelect(port, coord);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });

    // The failed extraction wins over the suggestions: an error is shown and no
    // suggestion rows surface.
    expect(result.current.connectorError).toBeTruthy();
    expect(result.current.connectorSuggestions).toEqual([]);
  });

  it('reports a read issue when the scan found nothing and never reached the LLM', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () =>
        scanResponse({ suggestions: [], attemptedLLM: false }),
      ),
    });
    const { result } = await connectAndSelect(port, makeCoord());
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorError).toBeTruthy();
  });

  it('reports a benign "no new suggestions" status when the LLM ran but found nothing', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () =>
        scanResponse({ suggestions: [], attemptedLLM: true }),
      ),
    });
    const { result } = await connectAndSelect(port, makeCoord());
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorError).toBeNull();
    expect(result.current.connectorStatus).toMatch(/no new memory suggestions/);
  });

  it('captures a thrown error from the scan', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => {
        throw new Error('boom');
      }),
    });
    const { result } = await connectAndSelect(port, makeCoord());
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorError).toBe('boom');
  });

  it('discards suggestions and resets the scan result state', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => scanResponse()),
    });
    const { result } = await connectAndSelect(port, makeCoord());
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorSuggestions).toHaveLength(2);

    act(() => result.current.onDiscardConnectorSuggestions());
    expect(result.current.connectorSuggestions).toEqual([]);
    expect(result.current.selectedSuggestionIds.size).toBe(0);
    expect(result.current.connectorStatus).toBeNull();
  });

  it('reports a partial save when only some suggestions persist', async () => {
    const coord = makeCoord();
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => scanResponse()),
      // s1 saves, s2 fails (null) → partial save error + s2 stays selected.
      saveMemoryEntry: vi.fn(async (draft) =>
        draft.id?.includes('s1')
          ? { id: draft.id, name: draft.name, description: draft.description, type: draft.type, body: draft.body, updatedAt: 0 }
          : null,
      ),
    });
    const { result } = await connectAndSelect(port, coord);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    await act(async () => {
      await result.current.onSaveConnectorSuggestions();
    });

    expect(result.current.connectorError).toMatch(/Saved 1 of 2/);
    // The unsaved suggestion remains for a retry.
    expect(result.current.connectorSuggestions.map((s) => s.id)).toEqual(['s2']);
  });

  it('surfaces a thrown reload() failure after a successful save, instead of an unhandled rejection', async () => {
    const coord = makeCoord({ reload: vi.fn(async () => { throw new Error('reload failed'); }) });
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => scanResponse({ suggestions: [suggestion('s1')] })),
      saveMemoryEntry: vi.fn(async (draft) => ({
        id: draft.id ?? 'generated',
        name: draft.name,
        description: draft.description,
        type: draft.type,
        body: draft.body,
        updatedAt: 0,
      })),
    });
    const { result } = await connectAndSelect(port, coord);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });

    await expect(act(async () => {
      await result.current.onSaveConnectorSuggestions();
    })).resolves.toBeUndefined();

    // The save itself succeeded (savedSuggestionIds is non-empty), so the
    // suggestion is still pruned locally even though the FOLLOW-UP reload
    // threw — the reload failure is reported, not silently dropped or left
    // as an unhandled rejection.
    expect(result.current.connectorSuggestions).toEqual([]);
    expect(result.current.connectorError).toBe('reload failed');
  });

  it('captures a thrown error while saving suggestions', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => scanResponse()),
      saveMemoryEntry: vi.fn(async () => {
        throw new Error('save failed');
      }),
    });
    const { result } = await connectAndSelect(port, makeCoord());
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    await act(async () => {
      await result.current.onSaveConnectorSuggestions();
    });
    expect(result.current.connectorError).toBe('save failed');
  });

  it('reconciles saves completed before a later suggestion save throws', async () => {
    const coord = makeCoord();
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => scanResponse()),
      saveMemoryEntry: vi.fn(async (draft) => {
        if (draft.id?.includes('s1')) {
          return {
            id: draft.id,
            name: draft.name,
            description: draft.description,
            type: draft.type,
            body: draft.body,
            updatedAt: 0,
          };
        }
        throw new Error('second save failed');
      }),
    });
    const { result } = await connectAndSelect(port, coord);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });

    await act(async () => {
      await result.current.onSaveConnectorSuggestions();
    });

    expect(coord.reload).toHaveBeenCalledTimes(1);
    expect(result.current.connectorSuggestions.map((item) => item.id)).toEqual(['s2']);
    expect([...result.current.selectedSuggestionIds]).toEqual(['s2']);
    expect(result.current.connectorStatus).toMatch(/Saved 1 memory/);
    expect(result.current.connectorError).toBe('second save failed');
  });

  it('connects immediately (no auth step) and notifies, clearing the spinner', async () => {
    const port = makePort({
      connectConnector: vi.fn(async () => ({
        connector: connector('notion', { status: 'connected' }),
      })),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(port.notifyConnectorsChanged).toHaveBeenCalled();
    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(false);
    expect(result.current.connectingConnectorIds.has('notion')).toBe(false);
  });

  it('pre-selects and reports singular counts for a one-suggestion, one-app scan', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => scanResponse({ suggestions: [suggestion('only')] })),
    });
    const { result } = await connectAndSelect(port, makeCoord());
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorStatus).toMatch(/1 suggested memory from 1 app\./);
  });

  it('captures a non-Error throw from the scan by stringifying it', async () => {
    const port = makePort({
      fetchConnectorStatuses: connectedStatuses,
      suggestConnectorMemories: vi.fn(async () => {
        throw 'plain string';
      }),
    });
    const { result } = await connectAndSelect(port, makeCoord());
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorError).toBe('plain string');
  });
});

describe('useMemoryConnectors — selection + suggestion toggles + guards', () => {
  const connectedStatuses = vi.fn(async () => ({ notion: { status: 'connected' } }) as ConnectorStatusMap);

  it('toggles a suggestion id on and off', () => {
    const { result } = renderHook(() => useMemoryConnectors(makePort(), makeCoord()));
    act(() => result.current.toggleConnectorSuggestion('s1'));
    expect(result.current.selectedSuggestionIds.has('s1')).toBe(true);
    act(() => result.current.toggleConnectorSuggestion('s1'));
    expect(result.current.selectedSuggestionIds.has('s1')).toBe(false);
  });

  it('deselects a connector on a second toggle', async () => {
    const port = makePort({ fetchConnectorStatuses: connectedStatuses });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.reloadConnectors();
    });
    act(() => result.current.toggleConnectorSelection('notion'));
    expect(result.current.selectedConnectorIds.has('notion')).toBe(true);
    act(() => result.current.toggleConnectorSelection('notion'));
    expect(result.current.selectedConnectorIds.has('notion')).toBe(false);
  });

  it('prunes a selected app when it drops out of the connected set', async () => {
    const statuses: { current: ConnectorStatusMap } = { current: { notion: { status: 'connected' } } };
    const port = makePort({ fetchConnectorStatuses: vi.fn(async () => statuses.current) });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.reloadConnectors();
    });
    act(() => result.current.toggleConnectorSelection('notion'));
    expect(result.current.selectedConnectedConnectorIds).toEqual(['notion']);

    // Notion disconnects; the reconcile effect prunes it from the selection.
    statuses.current = { notion: { status: 'available' } };
    await act(async () => {
      await result.current.reloadConnectors();
    });
    expect(result.current.selectedConnectorIds.has('notion')).toBe(false);
  });

  it('onSuggestConnectorMemory and onSaveConnectorSuggestions no-op with nothing selected', async () => {
    const port = makePort();
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(port.suggestConnectorMemories).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.onSaveConnectorSuggestions();
    });
    expect(port.saveMemoryEntry).not.toHaveBeenCalled();
  });

  it('clears the pending auth id when a retry surfaces a connect error', async () => {
    const outcome: { current: Awaited<ReturnType<MemoryConnectorsPort['connectConnector']>> } = {
      current: { connector: connector('notion'), auth: { kind: 'pending' } },
    };
    const port = makePort({ connectConnector: vi.fn(async () => outcome.current) });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(true);

    // A retry now fails: the error is recorded and the pending id is cleared.
    outcome.current = { connector: connector('notion'), error: 'denied' };
    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.connectorConnectErrors.notion).toBe('denied');
    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(false);
  });

  it('clears a recorded connect error once the connector reports connected', async () => {
    const statuses: { current: ConnectorStatusMap } = { current: {} };
    const port = makePort({
      connectConnector: vi.fn(async () => ({ connector: connector('notion'), error: 'temporary' })),
      fetchConnectorStatuses: vi.fn(async () => statuses.current),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.connectorConnectErrors.notion).toBe('temporary');

    statuses.current = { notion: { status: 'connected' } };
    await act(async () => {
      await result.current.refreshConnectorStatuses();
    });
    expect(result.current.connectorConnectErrors.notion).toBeUndefined();
  });

  it('clears a stale connect error at the start of the next connect attempt', async () => {
    const outcome: { current: Awaited<ReturnType<MemoryConnectorsPort['connectConnector']>> } = {
      current: { connector: connector('notion'), error: 'first try failed' },
    };
    const port = makePort({ connectConnector: vi.fn(async () => outcome.current) });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.connectorConnectErrors.notion).toBe('first try failed');

    // The retry succeeds: the stale error is dropped as the flow begins.
    outcome.current = { connector: connector('notion', { status: 'connected' }) };
    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.connectorConnectErrors.notion).toBeUndefined();
  });

  it('clears a pending auth id when a later connect resolves without an auth step', async () => {
    const outcome: { current: Awaited<ReturnType<MemoryConnectorsPort['connectConnector']>> } = {
      current: { connector: connector('notion'), auth: { kind: 'pending' } },
    };
    const port = makePort({ connectConnector: vi.fn(async () => outcome.current) });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));

    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(true);

    outcome.current = { connector: connector('notion', { status: 'connected' }) };
    await act(async () => {
      await result.current.onConnectMemoryConnector('notion');
    });
    expect(result.current.pendingConnectorAuthIds.has('notion')).toBe(false);
  });

  it('builds a catalogue entry from status alone when the app is missing from the fetched list', async () => {
    const port = makePort({
      fetchMemoryConnectors: vi.fn(async () => [] as ConnectorDetail[]),
      // A status entry with no `status` field exercises the `?? "available"` fallback.
      fetchConnectorStatuses: vi.fn(async () => ({ notion: {} }) as unknown as ConnectorStatusMap),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.reloadConnectors();
    });
    const notion = result.current.memoryConnectors.find((c) => c.id === 'notion');
    expect(notion?.status).toBe('available');
  });

  it("uses the live status's own status when the app is missing from the fetched catalogue", async () => {
    const port = makePort({
      fetchMemoryConnectors: vi.fn(async () => [] as ConnectorDetail[]),
      // Unlike the fallback case above, the status entry HAS a real status —
      // the synthetic catalogue entry must use it, not default to "available".
      fetchConnectorStatuses: vi.fn(async () => ({ notion: { status: 'connected' } }) as ConnectorStatusMap),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.reloadConnectors();
    });
    const notion = result.current.memoryConnectors.find((c) => c.id === 'notion');
    expect(notion?.status).toBe('connected');
  });

  it('carries accountLabel and lastError onto a synthetic catalogue entry when the app is missing from the fetched list', async () => {
    const port = makePort({
      fetchMemoryConnectors: vi.fn(async () => [] as ConnectorDetail[]),
      fetchConnectorStatuses: vi.fn(async () => ({
        notion: { status: 'error', accountLabel: 'me@example.com', lastError: 'token expired' },
      }) as ConnectorStatusMap),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.reloadConnectors();
    });
    const notion = result.current.memoryConnectors.find((c) => c.id === 'notion');
    expect(notion?.accountLabel).toBe('me@example.com');
    expect(notion?.lastError).toBe('token expired');
  });

  it('reports "Scanning apps" as the scan label while a scan is in flight', async () => {
    const scan = deferred<ConnectorMemorySuggestionResponse>();
    const port = makePort({
      fetchConnectorStatuses: vi.fn(async () => ({ notion: { status: 'connected' } }) as ConnectorStatusMap),
      suggestConnectorMemories: vi.fn(() => scan.promise),
    });
    const { result } = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await result.current.reloadConnectors();
    });
    act(() => result.current.toggleConnectorSelection('notion'));
    expect(result.current.connectorScanLabel).toBe('Scan selected apps');

    let suggest!: Promise<void>;
    act(() => {
      suggest = result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorScanLabel).toBe('Scanning apps');

    await act(async () => {
      scan.resolve({ suggestions: [], attemptedLLM: true, connectors: [], contextBytes: 0 });
      await suggest;
    });
    expect(result.current.connectorScanLabel).toBe('Scan selected apps');
  });
});

describe('useMemoryConnectors — multi-app plurals + non-Error save throw', () => {
  const twoConnected = vi.fn(async () =>
    ({ notion: { status: 'connected' }, figma: { status: 'connected' } }) as ConnectorStatusMap,
  );
  function twoAppScan(over: Partial<ConnectorMemorySuggestionResponse> = {}): ConnectorMemorySuggestionResponse {
    return {
      suggestions: [suggestion('s1')],
      attemptedLLM: true,
      connectors: [
        { connectorId: 'notion', connectorName: 'Notion', status: 'succeeded', summary: '' },
        { connectorId: 'figma', connectorName: 'Figma', status: 'succeeded', summary: '' },
      ],
      contextBytes: 0,
      ...over,
    };
  }
  async function selectBoth(port: MemoryConnectorsPort) {
    const hook = renderHook(() => useMemoryConnectors(port, makeCoord()));
    await act(async () => {
      await hook.result.current.reloadConnectors();
    });
    act(() => hook.result.current.toggleConnectorSelection('notion'));
    act(() => hook.result.current.toggleConnectorSelection('figma'));
    return hook;
  }

  it('pluralizes the app count when several apps succeed with suggestions', async () => {
    const port = makePort({
      fetchConnectorStatuses: twoConnected,
      suggestConnectorMemories: vi.fn(async () => twoAppScan()),
    });
    const { result } = await selectBoth(port);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorStatus).toMatch(/from 2 apps\./);
  });

  it('pluralizes the app count on the no-new-suggestions path', async () => {
    const port = makePort({
      fetchConnectorStatuses: twoConnected,
      suggestConnectorMemories: vi.fn(async () => twoAppScan({ suggestions: [] })),
    });
    const { result } = await selectBoth(port);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    expect(result.current.connectorStatus).toMatch(/Checked 2 selected apps/);
  });

  it('stringifies a non-Error thrown while saving suggestions', async () => {
    const port = makePort({
      fetchConnectorStatuses: twoConnected,
      suggestConnectorMemories: vi.fn(async () => twoAppScan()),
      saveMemoryEntry: vi.fn(async () => {
        throw 'string failure';
      }),
    });
    const { result } = await selectBoth(port);
    await act(async () => {
      await result.current.onSuggestConnectorMemory();
    });
    await act(async () => {
      await result.current.onSaveConnectorSuggestions();
    });
    expect(result.current.connectorError).toBe('string failure');
  });
});
