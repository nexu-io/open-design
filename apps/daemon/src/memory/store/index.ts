/** @module store/index
 * Barrel for the filesystem-backed markdown memory store: config switches, the
 * `MEMORY.md` index, per-fact CRUD, the tree projection, prompt-body composition,
 * active-rule listing, and the heuristic chat extractor. Emits on `core`'s change bus
 * after every write. May import `core/` and `extractions/`; nothing imports its private
 * files directly.
 */

export {
  memoryDir,
  deriveMemoryId,
  readMemoryConfig,
  writeMemoryConfig,
  maskMemoryExtractionConfig,
  readMemoryIndex,
  writeMemoryIndex,
  listMemoryEntries,
  buildMemoryTree,
  readMemoryEntry,
  updateMemoryTreeNode,
  upsertMemoryEntry,
  deleteMemoryEntry,
  composeMemoryBody,
  listActiveRuleEntries,
  extractFromMessage,
} from './store.js';
