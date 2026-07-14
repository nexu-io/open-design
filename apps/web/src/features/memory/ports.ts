// The memory slice's dependency on transport, expressed as an interface it owns.
// The slice depends on this port, never on `providers/` directly; a provider is
// bound to it in `dependencies.ts`. Tests supply a hand-written fake — no global
// `fetch` mocking, no module-path mocks.
import type {
  ConnectorDetail,
  ConnectorMemorySuggestionResponse,
  MemoryEntry,
  MemoryExtractionRecord,
  MemoryListResponse,
  MemoryTreeNode,
  UpdateMemoryConfigRequest,
} from '@open-design/contracts';
import type {
  ConnectorConnectResult,
  ConnectorStatusMap,
  DraftEntry,
} from './types';

/** Transport the memory config cluster needs. */
export interface MemoryConfigPort {
  /**
   * PATCH a subset of the memory config. Resolves `true` on success, `false`
   * otherwise (callers roll optimistic toggles back on `false`).
   */
  patchConfig(patch: UpdateMemoryConfigRequest): Promise<boolean>;
}

/** Transport the memory entries/index cluster needs. */
export interface MemoryEntriesPort {
  fetchMemoryList(): Promise<MemoryListResponse>;
  fetchMemoryTree(): Promise<MemoryTreeNode[]>;
  /** Resolves `null` only for a genuine not-found; rejects on other failures. */
  fetchMemoryEntry(id: string): Promise<MemoryEntry | null>;
  saveMemoryEntry(draft: DraftEntry): Promise<MemoryEntry | null>;
  deleteMemoryEntry(id: string): Promise<boolean>;
  saveMemoryIndex(index: string): Promise<boolean>;
}

/** Transport the extraction-history cluster needs. */
export interface MemoryExtractionsPort {
  fetchExtractions(): Promise<MemoryExtractionRecord[]>;
  deleteExtraction(id: string): Promise<boolean>;
  clearExtractionHistory(): Promise<boolean>;
}

/**
 * Everything the memory-connectors cluster needs from the outside world: the
 * connector list/status/suggest transport, the entry-save transport (saving a
 * suggestion is just a memory write), and the non-subscription OAuth
 * side-effects (cross-tab notify + pending-auth persistence). The two OAuth
 * *subscriptions* (poll + popup-callback) are NOT here: they open accumulating
 * browser subscriptions, so the orchestrator (a single instance) owns them via
 * the provider bridges and drives the hook's `refreshConnectorStatuses`.
 */
export interface MemoryConnectorsPort {
  fetchMemoryConnectors(): Promise<ConnectorDetail[]>;
  fetchConnectorStatuses(): Promise<ConnectorStatusMap>;
  connectConnector(connectorId: string): Promise<ConnectorConnectResult>;
  suggestConnectorMemories(
    connectorIds: string[],
    context: { chatAgentId?: string | null; chatModel?: string | null },
  ): Promise<ConnectorMemorySuggestionResponse | null>;
  saveMemoryEntry(draft: DraftEntry): Promise<MemoryEntry | null>;
  /** Read the connectors mid-authorization, persisted across reloads. */
  readPendingConnectorAuthIds(): Set<string>;
  /** Persist the connectors mid-authorization so a reload resumes polling. */
  writePendingConnectorAuthIds(ids: Set<string>): void;
  /** Broadcast a cross-tab "connectors changed" notification. */
  notifyConnectorsChanged(): void;
}
