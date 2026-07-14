// Feature-local hook for the memory-connectors cluster: the connector
// list/status catalogue, per-connector OAuth connect flow, the mid-authorization
// status poll, selection, and the scan → suggest → save loop that turns
// connected-app content into memory entries.
//
// WHY ONE HOOK (design rationale, kept here so a future reader doesn't
// re-litigate it): the tempting split is "auth vs. list", but that is a bad
// seam. `refreshConnectorStatuses` writes the list domain (`connectors`,
// `connectorStatuses`) AND the auth domain (`pendingConnectorAuthIds`,
// `connectorConnectErrors`) in one pass, and the selection-reconcile effect
// keys off `connected` status — the exact thing the auth flow transitions. So
// auth↔list is bidirectional coupling over shared mutable state. Splitting there
// would thread setters across the boundary in both directions (routed through
// the orchestrator, since no hook may import another), i.e. relocate state
// across a seam and pay indirection for it — which is the "state relocation"
// disease this refactor exists to cure. Testability doesn't force the split
// either: the single hook already takes an injected port + coordination, so it
// unit-tests with a fake. If this ever earns a split, cut out SCAN/SUGGEST/SAVE
// (it only *reads* `selectedConnectedConnectorIds` and coordinates outward to
// `reload`/`reloadExtractions` — a clean, one-directional seam), not auth.
//
// WHERE THE EFFECTS LIVE (and why): a hook effect that opens an EXTERNAL,
// ACCUMULATING subscription (setInterval / addEventListener / EventSource) is a
// hazard if the hook is ever instantiated by more than one component — you get
// two pollers, two listeners, and silent double-fires. So those do NOT live
// here. The two OAuth subscriptions (the mid-auth status poll + the popup
// callback message) are owned by the orchestrator, which is structurally a
// single instance; it drives this hook's exposed `refreshConnectorStatuses`
// through the provider bridges (`subscribeConnectorStatusPolling` /
// `subscribeConnectorCallback`, whose `window` reach lives in providers/). This
// hook keeps only INTERNAL-STATE effects (a ref sync, a selection reconcile, a
// pending-auth persist) — those can't accumulate or surprise, no matter how many
// instances exist. Same reasoning that put the SSE stream in the shell, applied
// consistently. (Today the hook is single-consumer per the slice's feature-local
// rule, so this is defence-in-depth, not a live bug.)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  ConnectorDetail,
  MemoryEntry,
  MemoryExtractionRecord,
  MemorySuggestion,
} from '@open-design/contracts';
import { memoryConnectorsPort } from '../dependencies';
import type { MemoryConnectorsPort } from '../ports';
import { createAsyncCommitGuard } from '../async-commit-guard';
import type { ConnectorMemoryAttempt, ConnectorStatusMap } from '../types';
import {
  MEMORY_CONNECTOR_APP_IDS,
  MEMORY_CONNECTOR_APP_LABELS,
} from '../constants';
import {
  applyMemoryConnectorStatus,
  applyMemoryConnectorStatuses,
  connectorStatusesChanged,
  connectorWithPendingAuthorization,
  memoryEntryIdForConnectorSuggestion,
  upsertMemoryConnector,
} from '../rules';
import {
  describeConnectorReadIssue,
  describeExtractionFailure,
} from '../formatters';

/** Runtime coordination the connectors hook receives from the orchestrator: the
 *  entries reload (saving a suggestion mutates the memory list), the extraction
 *  reload (a connector scan surfaces failures in the extraction history), and
 *  the chat context the daemon uses to pick a model for the scan. */
export interface MemoryConnectorsCoordination {
  reload: () => Promise<void>;
  reloadExtractions: () => Promise<MemoryExtractionRecord[]>;
  chatAgentId: string | null;
  chatModel: string | null;
}

export interface MemoryConnectorsController {
  connectorStatuses: ConnectorStatusMap;
  connectorsLoading: boolean;
  selectedConnectorIds: Set<string>;
  connectorExtracting: boolean;
  connectorSaving: boolean;
  connectorSuggestions: MemorySuggestion[];
  selectedSuggestionIds: Set<string>;
  connectorAttempts: ConnectorMemoryAttempt[];
  connectorContextBytes: number;
  connectorStatus: string | null;
  connectorError: string | null;
  /** Non-null when the connector catalogue could not be refreshed. */
  connectorLoadError: string | null;
  connectingConnectorIds: Set<string>;
  pendingConnectorAuthIds: Set<string>;
  connectorConnectErrors: Record<string, string>;
  memoryConnectors: ConnectorDetail[];
  connectorIdsWithDetails: Set<string>;
  connectedMemoryConnectors: ConnectorDetail[];
  selectedConnectedConnectorIds: string[];
  connectedCount: number;
  connectorScanLabel: string;
  selectedConnectorSuggestions: MemorySuggestion[];
  reloadConnectors: () => Promise<void>;
  /** Re-fetch connector statuses and reconcile pending-auth/error state. The
   *  orchestrator drives this from the OAuth poll + popup-callback subscriptions
   *  (which it owns, being a single instance). */
  refreshConnectorStatuses: () => Promise<void>;
  toggleConnectorSelection: (connectorId: string) => void;
  onConnectMemoryConnector: (connectorId: string) => Promise<void>;
  toggleConnectorSuggestion: (suggestionId: string) => void;
  onSuggestConnectorMemory: () => Promise<void>;
  onDiscardConnectorSuggestions: () => void;
  onSaveConnectorSuggestions: () => Promise<void>;
}

export function useMemoryConnectors(
  port: MemoryConnectorsPort,
  coord: MemoryConnectorsCoordination,
): MemoryConnectorsController {
  const { reload, reloadExtractions, chatAgentId, chatModel } = coord;

  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [connectorStatuses, setConnectorStatuses] = useState<ConnectorStatusMap>({});
  const [connectorsLoading, setConnectorsLoading] = useState(true);
  const [selectedConnectorIds, setSelectedConnectorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [connectorExtracting, setConnectorExtracting] = useState(false);
  const [connectorSaving, setConnectorSaving] = useState(false);
  const [connectorSuggestions, setConnectorSuggestions] = useState<MemorySuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [connectorAttempts, setConnectorAttempts] = useState<ConnectorMemoryAttempt[]>([]);
  const [connectorContextBytes, setConnectorContextBytes] = useState(0);
  const [connectorStatus, setConnectorStatus] = useState<string | null>(null);
  const [connectorError, setConnectorError] = useState<string | null>(null);
  const [connectorLoadError, setConnectorLoadError] = useState<string | null>(null);
  const [connectingConnectorIds, setConnectingConnectorIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [pendingConnectorAuthIds, setPendingConnectorAuthIds] = useState<Set<string>>(
    port.readPendingConnectorAuthIds,
  );
  const [connectorConnectErrors, setConnectorConnectErrors] = useState<Record<string, string>>({});
  const connectorsRef = useRef(connectors);
  // The OAuth poll and popup callback can overlap. They both write the same
  // status domain, so only the newest refresh may commit its snapshot.
  const connectorStatusCommitGuardRef = useRef(createAsyncCommitGuard());
  const connectorReloadGuardRef = useRef(createAsyncCommitGuard());

  useEffect(() => {
    connectorsRef.current = connectors;
  }, [connectors]);

  // Persist which connectors are mid-authorization so a reload resumes polling
  // instead of stranding a half-finished OAuth handshake.
  useEffect(() => {
    port.writePendingConnectorAuthIds(pendingConnectorAuthIds);
  }, [pendingConnectorAuthIds, port]);

  const reloadConnectors = useCallback(async () => {
    const revision = connectorStatusCommitGuardRef.current.begin();
    const reloadRevision = connectorReloadGuardRef.current.begin();
    setConnectorsLoading(true);
    try {
      const statuses = await port.fetchConnectorStatuses();
      if (!connectorStatusCommitGuardRef.current.isCurrent(revision)) return;
      setConnectorStatuses(statuses);
      setConnectors((prev) => applyMemoryConnectorStatuses(prev, statuses));
      const next = await port.fetchMemoryConnectors();
      if (!connectorStatusCommitGuardRef.current.isCurrent(revision)) return;
      setConnectors(applyMemoryConnectorStatuses(next, statuses));
      setConnectorLoadError(null);
    } catch {
      // Discovery is required for the real catalogue. Keep prior details rather
      // than replacing them with synthetic empty rows, and make the outage
      // visible to the user.
      if (connectorStatusCommitGuardRef.current.isCurrent(revision)) {
        setConnectorLoadError("Connected apps couldn't be loaded. Try again shortly.");
      }
    } finally {
      if (connectorReloadGuardRef.current.isCurrent(reloadRevision)) {
        setConnectorsLoading(false);
      }
    }
  }, [port]);

  const memoryConnectors = useMemo(() => {
    const byId = new Map(connectors.map((connector) => [connector.id, connector]));
    return MEMORY_CONNECTOR_APP_IDS.map((id) => {
      const connector = byId.get(id);
      const status = connectorStatuses[id];
      if (connector) {
        return status ? applyMemoryConnectorStatus(connector, status) : connector;
      }
      return {
        id,
        name: MEMORY_CONNECTOR_APP_LABELS[id] ?? id,
        provider: 'composio',
        category: 'Memory source',
        status: status?.status ?? 'available' as const,
        ...(status?.accountLabel ? { accountLabel: status.accountLabel } : {}),
        ...(status?.lastError ? { lastError: status.lastError } : {}),
        tools: [],
      };
    });
  }, [connectorStatuses, connectors]);
  const connectorIdsWithDetails = useMemo(
    () => new Set(connectors.map((connector) => connector.id)),
    [connectors],
  );
  const connectedMemoryConnectors = useMemo(
    () => memoryConnectors.filter((connector) => connector.status === 'connected'),
    [memoryConnectors],
  );
  const selectedConnectedConnectorIds = useMemo(
    () =>
      [...selectedConnectorIds].filter((id) =>
        connectedMemoryConnectors.some((connector) => connector.id === id),
      ),
    [selectedConnectorIds, connectedMemoryConnectors],
  );
  const connectedCount = connectedMemoryConnectors.length;
  const connectorScanLabel = connectorExtracting
    ? 'Scanning apps'
    : selectedConnectedConnectorIds.length === 0
      ? 'Select apps to scan'
      : 'Scan selected apps';
  const selectedConnectorSuggestions = useMemo(
    () => connectorSuggestions.filter((suggestion) => selectedSuggestionIds.has(suggestion.id)),
    [connectorSuggestions, selectedSuggestionIds],
  );

  // Prune selection down to still-connected apps: disconnecting an app should
  // not leave it selected for a scan.
  useEffect(() => {
    setSelectedConnectorIds((prev) => {
      const connectedIds = connectedMemoryConnectors.map((connector) => connector.id);
      const connected = new Set(connectedIds);
      const next = new Set([...prev].filter((id) => connected.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [connectedMemoryConnectors]);

  const toggleConnectorSelection = useCallback((connectorId: string) => {
    setSelectedConnectorIds((prev) => {
      const next = new Set(prev);
      if (next.has(connectorId)) {
        next.delete(connectorId);
      } else {
        next.add(connectorId);
      }
      return next;
    });
  }, []);

  const refreshConnectorStatuses = useCallback(async () => {
    const revision = connectorStatusCommitGuardRef.current.begin();
    const statuses = await port.fetchConnectorStatuses();
    if (!connectorStatusCommitGuardRef.current.isCurrent(revision)) return;
    const statusChanged = connectorStatusesChanged(connectorsRef.current, statuses);
    setConnectorStatuses(statuses);
    setConnectors((prev) => applyMemoryConnectorStatuses(prev, statuses));
    setPendingConnectorAuthIds((prev) => {
      const next = new Set(prev);
      for (const connectorId of prev) {
        if (statuses[connectorId]?.status === 'connected') next.delete(connectorId);
      }
      return next.size === prev.size ? prev : next;
    });
    setConnectorConnectErrors((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [connectorId, status] of Object.entries(statuses)) {
        if (status.status === 'connected' && next[connectorId] !== undefined) {
          delete next[connectorId];
          changed = true;
        }
      }
      return changed ? next : prev;
    });
    if (statusChanged) port.notifyConnectorsChanged();
  }, [port]);

  // NOTE: the OAuth mid-auth status poll and popup-callback message listener are
  // deliberately NOT effects here — they open accumulating browser
  // subscriptions, so the orchestrator (a guaranteed single instance) owns them
  // and drives `refreshConnectorStatuses` below. See the file header.

  const onConnectMemoryConnector = useCallback(async (connectorId: string) => {
    if (connectingConnectorIds.has(connectorId)) return;
    setConnectingConnectorIds((prev) => new Set(prev).add(connectorId));
    setConnectorConnectErrors((prev) => {
      if (prev[connectorId] === undefined) return prev;
      const next = { ...prev };
      delete next[connectorId];
      return next;
    });
    try {
      const result = await port.connectConnector(connectorId);
      if (result.connector?.status === 'connected') port.notifyConnectorsChanged();
      const requiresAuthorizationCompletion =
        result.auth?.kind === 'redirect_required' || result.auth?.kind === 'pending';
      setConnectors((prev) =>
        upsertMemoryConnector(
          prev,
          requiresAuthorizationCompletion && result.connector
            ? connectorWithPendingAuthorization(result.connector)
            : result.connector,
        ),
      );
      if (result.error) {
        setConnectorConnectErrors((prev) => ({ ...prev, [connectorId]: result.error! }));
        setPendingConnectorAuthIds((prev) => {
          if (!prev.has(connectorId)) return prev;
          const next = new Set(prev);
          next.delete(connectorId);
          return next;
        });
        return;
      }
      if (result.auth?.kind === 'redirect_required' || result.auth?.kind === 'pending') {
        setPendingConnectorAuthIds((prev) => new Set(prev).add(connectorId));
      } else {
        setPendingConnectorAuthIds((prev) => {
          if (!prev.has(connectorId)) return prev;
          const next = new Set(prev);
          next.delete(connectorId);
          return next;
        });
      }
      await refreshConnectorStatuses();
    } finally {
      setConnectingConnectorIds((prev) => {
        if (!prev.has(connectorId)) return prev;
        const next = new Set(prev);
        next.delete(connectorId);
        return next;
      });
    }
  }, [connectingConnectorIds, refreshConnectorStatuses, port]);

  const toggleConnectorSuggestion = useCallback((suggestionId: string) => {
    setSelectedSuggestionIds((prev) => {
      const next = new Set(prev);
      if (next.has(suggestionId)) {
        next.delete(suggestionId);
      } else {
        next.add(suggestionId);
      }
      return next;
    });
  }, []);

  const onSuggestConnectorMemory = useCallback(async () => {
    if (selectedConnectedConnectorIds.length === 0) return;
    setConnectorExtracting(true);
    setConnectorSuggestions([]);
    setSelectedSuggestionIds(new Set());
    setConnectorAttempts([]);
    setConnectorContextBytes(0);
    setConnectorStatus(null);
    setConnectorError(null);
    const startedAt = Date.now();
    try {
      const result = await port.suggestConnectorMemories(selectedConnectedConnectorIds, {
        chatAgentId,
        chatModel,
      });
      if (!result) {
        setConnectorError('Could not read connected apps. Try again from the Connectors tab.');
        return;
      }
      const latestExtractions = await reloadExtractions();
      const latestFailure = latestExtractions.find(
        (record) =>
          record.kind === 'connector'
          && record.phase === 'failed'
          && record.startedAt >= startedAt - 5_000,
      );
      const friendlyFailure = latestFailure
        ? describeExtractionFailure(latestFailure)
        : null;
      setConnectorAttempts(result.connectors);
      setConnectorContextBytes(result.contextBytes);
      const succeeded = result.connectors.filter(
        (connector) => connector.status === 'succeeded',
      ).length;
      if (friendlyFailure) {
        setConnectorError([
          friendlyFailure.title,
          friendlyFailure.detail,
          friendlyFailure.action,
        ].filter(Boolean).join(' '));
      } else if (result.suggestions.length > 0) {
        setConnectorSuggestions(result.suggestions);
        setSelectedSuggestionIds(new Set(result.suggestions.map((suggestion) => suggestion.id)));
        setConnectorStatus(
          `Found ${result.suggestions.length} suggested memor${result.suggestions.length === 1 ? 'y' : 'ies'} from ${succeeded} app${succeeded === 1 ? '' : 's'}. Review before saving.`,
        );
      } else if (!result.attemptedLLM) {
        setConnectorError(
          describeConnectorReadIssue(result)
          ?? 'No memory suggestions found. OpenDesign could not read useful content from the selected app yet.',
        );
      } else {
        setConnectorStatus(
          `Checked ${succeeded} selected app${succeeded === 1 ? '' : 's'}, but found no new memory suggestions.`,
        );
      }
    } catch (err) {
      setConnectorError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectorExtracting(false);
    }
  }, [chatAgentId, chatModel, reloadExtractions, selectedConnectedConnectorIds, port]);

  const onDiscardConnectorSuggestions = useCallback(() => {
    setConnectorSuggestions([]);
    setSelectedSuggestionIds(new Set());
    setConnectorAttempts([]);
    setConnectorContextBytes(0);
    setConnectorStatus(null);
  }, []);

  const onSaveConnectorSuggestions = useCallback(async () => {
    if (selectedConnectorSuggestions.length === 0) return;
    setConnectorSaving(true);
    setConnectorError(null);
    try {
      const saved: MemoryEntry[] = [];
      const savedSuggestionIds = new Set<string>();
      for (const suggestion of selectedConnectorSuggestions) {
        const entry = await port.saveMemoryEntry({
          id: memoryEntryIdForConnectorSuggestion(suggestion),
          name: suggestion.name,
          description: suggestion.description,
          type: suggestion.type,
          body: suggestion.body,
        });
        if (entry) {
          saved.push(entry);
          savedSuggestionIds.add(suggestion.id);
        }
      }
      await reload();
      const savedEntriesById = new Map(saved.map((entry) => [entry.id, entry]));
      setConnectorSuggestions((prev) =>
        prev.filter((suggestion) => !savedSuggestionIds.has(suggestion.id)),
      );
      setSelectedSuggestionIds(
        new Set(
          selectedConnectorSuggestions
            .filter((suggestion) => !savedSuggestionIds.has(suggestion.id))
            .map((suggestion) => suggestion.id),
        ),
      );
      setConnectorStatus(
        `Saved ${savedEntriesById.size} memor${savedEntriesById.size === 1 ? 'y' : 'ies'} from connected apps.`,
      );
      if (savedEntriesById.size !== selectedConnectorSuggestions.length) {
        setConnectorError(
          `Saved ${savedEntriesById.size} of ${selectedConnectorSuggestions.length} selected memories. Please try the remaining items again.`,
        );
      }
    } catch (err) {
      setConnectorError(err instanceof Error ? err.message : String(err));
    } finally {
      setConnectorSaving(false);
    }
  }, [reload, selectedConnectorSuggestions, port]);

  return {
    connectorStatuses,
    connectorsLoading,
    selectedConnectorIds,
    connectorExtracting,
    connectorSaving,
    connectorSuggestions,
    selectedSuggestionIds,
    connectorAttempts,
    connectorContextBytes,
    connectorStatus,
    connectorError,
    connectorLoadError,
    connectingConnectorIds,
    pendingConnectorAuthIds,
    connectorConnectErrors,
    memoryConnectors,
    connectorIdsWithDetails,
    connectedMemoryConnectors,
    selectedConnectedConnectorIds,
    connectedCount,
    connectorScanLabel,
    selectedConnectorSuggestions,
    reloadConnectors,
    refreshConnectorStatuses,
    toggleConnectorSelection,
    onConnectMemoryConnector,
    toggleConnectorSuggestion,
    onSuggestConnectorMemory,
    onDiscardConnectorSuggestions,
    onSaveConnectorSuggestions,
  };
}

/**
 * Wirer: binds the real connectors transport + OAuth bridges and returns a hook
 * that still takes the orchestrator's runtime coordination. The default the
 * orchestrator injects; swap it via the component prop in tests.
 */
export function useWiredMemoryConnectors(
  coord: MemoryConnectorsCoordination,
): MemoryConnectorsController {
  return useMemoryConnectors(memoryConnectorsPort, coord);
}
