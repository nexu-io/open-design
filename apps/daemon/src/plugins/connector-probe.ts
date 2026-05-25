import type { ConnectorCatalogDefinition, ConnectorStatus } from '../connectors/catalog.js';
import type { ConnectorService } from '../connectors/service.js';
import type { ConnectorCatalogEntry, ConnectorGateStatus, ConnectorProbe } from './connector-gate.js';

function toGateStatus(status: ConnectorStatus): ConnectorGateStatus {
  if (status === 'connected') return 'connected';
  if (status === 'available') return 'pending';
  return 'unavailable';
}

function catalogEntryFor(
  service: ConnectorService,
  definition: ConnectorCatalogDefinition,
): ConnectorCatalogEntry {
  const status = service.getStatus(definition);
  return {
    id: definition.id,
    status: toGateStatus(status.status),
    ...(status.accountLabel === undefined ? {} : { accountLabel: status.accountLabel }),
    allowedToolNames: definition.allowedToolNames.slice(),
  };
}

export function buildConnectorProbe(service: ConnectorService): ConnectorProbe {
  const entries = new Map<string, ConnectorCatalogEntry>();
  for (const definition of service.listFastDefinitions()) {
    entries.set(definition.id, catalogEntryFor(service, definition));
  }
  return {
    get(connectorId: string) {
      return entries.get(connectorId);
    },
  };
}
