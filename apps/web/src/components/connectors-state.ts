import type { ConnectorDetail, ConnectorStatusResponse } from '@open-design/contracts';
import {
  fetchConnectorDiscovery,
  fetchConnectors,
  fetchConnectorStatuses,
} from '../providers/registry';

export type ConnectorAuthSnapshot = Pick<ConnectorDetail, 'status'> &
  Partial<Pick<ConnectorDetail, 'accountLabel' | 'lastError'>>;

export function connectorAuthSnapshotChanged(
  current: ConnectorAuthSnapshot | null | undefined,
  next: ConnectorAuthSnapshot | null | undefined,
): boolean {
  if (current == null && next == null) return false;
  if (current == null || next == null) return true;
  return (
    next.status !== current.status ||
    next.accountLabel !== current.accountLabel ||
    next.lastError !== current.lastError
  );
}

export function hasConnectorStatusChanges(
  current: ConnectorDetail[],
  statuses: ConnectorStatusResponse['statuses'],
): boolean {
  return current.some((connector) => connectorAuthSnapshotChanged(connector, statuses[connector.id]));
}

export function mergeConnectorCatalog(
  current: ConnectorDetail[],
  incoming: ConnectorDetail[],
): ConnectorDetail[] {
  if (current.length === 0) return incoming;
  const incomingById = new Map(incoming.map((connector) => [connector.id, connector]));
  const merged = current.map((connector) => {
    const next = incomingById.get(connector.id);
    return next ? { ...connector, ...next } : connector;
  });
  const currentIds = new Set(current.map((connector) => connector.id));
  for (const connector of incoming) {
    if (!currentIds.has(connector.id)) merged.push(connector);
  }
  return merged;
}

export function applyConnectorStatuses(
  current: ConnectorDetail[],
  statuses: ConnectorStatusResponse['statuses'],
): ConnectorDetail[] {
  if (!Object.keys(statuses).length) return current;
  return current.map((connector) => {
    const next = statuses[connector.id];
    if (!next) return connector;
    const { accountLabel: _accountLabel, lastError: _lastError, ...base } = connector;
    return {
      ...base,
      status: next.status,
      ...(next.accountLabel === undefined ? {} : { accountLabel: next.accountLabel }),
      ...(next.lastError === undefined ? {} : { lastError: next.lastError }),
    };
  });
}

export async function fetchConnectorCatalogSnapshot(options: {
  refreshDiscovery?: boolean;
} = {}): Promise<ConnectorDetail[]> {
  const [catalog, discovery, statuses] = await Promise.all([
    fetchConnectors(),
    options.refreshDiscovery ? fetchConnectorDiscovery({ refresh: true }) : Promise.resolve([]),
    fetchConnectorStatuses(),
  ]);
  return applyConnectorStatuses(mergeConnectorCatalog(catalog, discovery), statuses);
}
