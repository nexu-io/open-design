// Composition root for the memory slice: binds a concrete transport adapter to
// the slice's port. This is the ONE feature file allowed to import `providers/`
// — everything else in the slice depends on the port, so swapping the adapter
// (or a fake in tests) touches only this file.
import {
  patchMemoryConfig,
  fetchMemoryList,
  fetchMemoryTree,
  fetchMemoryEntry,
  saveMemoryEntry,
  deleteMemoryEntry,
  saveMemoryIndex,
  fetchExtractions,
  deleteExtraction,
  clearExtractionHistory,
  fetchMemoryConnectors,
  suggestConnectorMemories,
  readPendingConnectorAuthIds,
  writePendingConnectorAuthIds,
  notifyConnectorsChanged,
} from '../../providers/memory';
import { connectConnector, fetchConnectorStatuses } from '../../providers/registry';
import type {
  MemoryConfigPort,
  MemoryConnectorsPort,
  MemoryEntriesPort,
  MemoryExtractionsPort,
} from './ports';

/** Default binding: the real `/api/memory/config` transport. */
export const memoryConfigPort: MemoryConfigPort = {
  patchConfig: patchMemoryConfig,
};

/** Default binding: the real `/api/memory` entries/index transport. */
export const memoryEntriesPort: MemoryEntriesPort = {
  fetchMemoryList,
  fetchMemoryTree,
  fetchMemoryEntry,
  saveMemoryEntry,
  deleteMemoryEntry,
  saveMemoryIndex,
};

/** Default binding: the real `/api/memory/extractions` transport. */
export const memoryExtractionsPort: MemoryExtractionsPort = {
  fetchExtractions,
  deleteExtraction,
  clearExtractionHistory,
};

/**
 * Default binding for the connectors cluster: connector list/status/suggest +
 * entry-save transport, plus the OAuth side-effect bridges. `connectConnector`
 * and `fetchConnectorStatuses` come from the shared registry provider; the rest
 * from the memory provider barrel (which re-homes `notifyConnectorsChanged` and
 * the OAuth subscriptions so this root binds one transport/side-effect surface).
 */
export const memoryConnectorsPort: MemoryConnectorsPort = {
  fetchMemoryConnectors,
  fetchConnectorStatuses,
  connectConnector,
  suggestConnectorMemories,
  saveMemoryEntry,
  readPendingConnectorAuthIds,
  writePendingConnectorAuthIds,
  notifyConnectorsChanged,
};
