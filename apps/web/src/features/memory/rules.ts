// Pure rules for the memory slice: UI toggle intent -> wire patch, plus the
// connector list state-transforms. No React, no transport, no side effects, so
// they test against `contracts` with zero doubles.
import type {
  ConnectorDetail,
  MemoryExtractionRecord,
  MemorySuggestion,
  MemoryType,
  UpdateMemoryConfigRequest,
} from '@open-design/contracts';
import type { ConnectorStatusMap } from './types';

/**
 * The per-hook config flags the hooks panel toggles individually. This union
 * mirrors the hook keys owned by the UI; it is a convenience type (duplication
 * is intentional per the slice conventions — only wire DTOs and transport
 * adapters are shared for correctness).
 */
export type MemoryConfigFlagKey =
  | 'chatExtractionEnabled'
  | 'profileEnabled'
  | 'rewriteEnabled'
  | 'verifyEnabled';

/** Patch body for flipping the master memory switch. */
export function enabledPatch(enabled: boolean): UpdateMemoryConfigRequest {
  return { enabled };
}

/**
 * Patch body for flipping a single per-hook flag. The daemon merges any subset,
 * so sending just the one key leaves the others untouched.
 */
export function singleFlagPatch(
  flag: MemoryConfigFlagKey,
  value: boolean,
): UpdateMemoryConfigRequest {
  return { [flag]: value };
}

/**
 * The extraction rows that belong in the unified saved-memory list. Two
 * invariants: connector-kind records are shown only in the Connected tab's scan
 * history (never the main list), and extractions surface only under the `all`
 * filter — the per-type filter pills are entry-only. The orchestrator owns the
 * `useMemo` around this (it spans the entries + extractions clusters); this is
 * just the pure predicate so the rule is testable without React.
 */
export function visibleExtractionsFor(
  extractions: MemoryExtractionRecord[],
  filter: 'all' | MemoryType,
): MemoryExtractionRecord[] {
  return filter === 'all'
    ? extractions.filter((record) => record.kind !== 'connector')
    : [];
}

/** Only alphanumeric-underscore suggestion ids are safe to reuse as entry ids. */
export function memoryEntryIdForConnectorSuggestion(suggestion: MemorySuggestion): string | undefined {
  return /^[a-z0-9_]+$/.test(suggestion.id) ? suggestion.id : undefined;
}

/** Merge an incoming connector detail over an existing one, keeping non-empty
 *  tool metadata when the update omits it. */
export function mergeMemoryConnector(current: ConnectorDetail, next: ConnectorDetail): ConnectorDetail {
  return {
    ...current,
    ...next,
    tools: next.tools.length > 0 ? next.tools : current.tools,
    toolCount: next.toolCount ?? current.toolCount,
    toolsNextCursor: next.toolsNextCursor ?? current.toolsNextCursor,
    toolsHasMore: next.toolsHasMore ?? current.toolsHasMore,
  };
}

/** Insert or merge a connector into the list by id; a null update is a no-op. */
export function upsertMemoryConnector(
  current: ConnectorDetail[],
  next: ConnectorDetail | null,
): ConnectorDetail[] {
  if (!next) return current;
  let found = false;
  const merged = current.map((connector) => {
    if (connector.id !== next.id) return connector;
    found = true;
    return mergeMemoryConnector(connector, next);
  });
  return found ? merged : [...merged, next];
}

/** Apply a live status onto a connector, dropping stale account/error fields. */
export function applyMemoryConnectorStatus(
  connector: ConnectorDetail,
  status: ConnectorStatusMap[string],
): ConnectorDetail {
  const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
  return { ...base, ...status };
}

/** Apply a status map across a connector list; empty map is a no-op. */
export function applyMemoryConnectorStatuses(
  current: ConnectorDetail[],
  statuses: ConnectorStatusMap,
): ConnectorDetail[] {
  if (Object.keys(statuses).length === 0) return current;
  return current.map((connector) => {
    const status = statuses[connector.id];
    if (!status) return connector;
    return applyMemoryConnectorStatus(connector, status);
  });
}

/** Mark a connector as awaiting OAuth completion (available unless disabled). */
export function connectorWithPendingAuthorization(connector: ConnectorDetail): ConnectorDetail {
  const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
  return {
    ...base,
    status: base.status === 'disabled' ? 'disabled' : 'available',
  };
}

/** The auth-relevant fields we compare to decide if a status meaningfully moved. */
type ConnectorAuthSnapshot = Pick<ConnectorDetail, 'status'> &
  Partial<Pick<ConnectorDetail, 'accountLabel' | 'lastError'>>;

function connectorAuthSnapshotChanged(
  current: ConnectorAuthSnapshot,
  next: ConnectorAuthSnapshot | undefined,
): boolean {
  // `current` is always a real connector (the caller maps over the list), so the
  // only absence to guard is a status the server hasn't reported yet.
  if (next == null) return true;
  return (
    next.status !== current.status
    || next.accountLabel !== current.accountLabel
    || next.lastError !== current.lastError
  );
}

/**
 * True if any connector's live status differs from what we already hold. Drives
 * the decision to broadcast a cross-tab `connectors-changed` notification so we
 * don't spam it on every idle poll. Slice-local twin of the shared
 * `hasConnectorStatusChanges` (convenience duplication — only wire DTOs and
 * transport adapters are shared for correctness; see the slice conventions).
 */
export function connectorStatusesChanged(
  current: ConnectorDetail[],
  statuses: ConnectorStatusMap,
): boolean {
  return current.some((connector) =>
    connectorAuthSnapshotChanged(connector, statuses[connector.id]),
  );
}
