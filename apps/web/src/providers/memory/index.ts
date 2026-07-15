// Public barrel for the memory transport adapters. `/api/memory` is fetched
// from several components, so it is a real multi-adapter seam: this folder is
// its one transport home, and the barrel is the only entry other code imports.
export { patchMemoryConfig, patchMemoryExtractionConfig } from './config';
export {
  fetchMemoryList,
  fetchMemoryTree,
  fetchMemoryEntry,
  saveMemoryEntry,
  deleteMemoryEntry,
  saveMemoryIndex,
} from './entries';
export {
  fetchExtractions,
  deleteExtraction,
  clearExtractionHistory,
} from './extractions';
export {
  fetchMemoryConnectors,
  suggestConnectorMemories,
} from './connectors';
export {
  isTrustedConnectorCallbackOrigin,
  readPendingConnectorAuthIds,
  writePendingConnectorAuthIds,
  subscribeConnectorCallback,
  subscribeConnectorStatusPolling,
  notifyConnectorsChanged,
} from './connector-auth';
export {
  subscribeMemoryEvents,
  type MemoryEventHandlers,
} from './events';
