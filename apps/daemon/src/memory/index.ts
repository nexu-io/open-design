/** @module memory/index
 * Public API for the memory domain: the filesystem-backed markdown fact store, its
 * change bus, the extraction-attempt and self-verify telemetry buffers, the small-model
 * LLM extractor, rule-proposal distillation, and connector-sourced memory. This barrel is
 * the only entry point external (runtime) code may import; it re-exports named symbols
 * from the subdirectory barrels and never from a private file. Keep the export list
 * explicit — it is the reviewable public surface (50 names).
 */

// core — change bus + change-event vocabulary (the cycle-breaking foundation)
export { memoryEvents } from './core/index.js';
export type { MemoryChangeKind, MemoryChangeEvent } from './core/index.js';

// store — filesystem markdown store: config, index, entries, tree, compose, extract
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
} from './store/index.js';

// extractions — in-memory ring buffer of recent extraction attempts
export {
  startExtraction,
  markProvider,
  markSkipped,
  recordSkip,
  recordHeuristic,
  markProposed,
  markSuccess,
  markFailed,
  listExtractions,
  removeExtraction,
  clearExtractions,
  __resetExtractionsForTests,
} from './extractions/index.js';

// verify — POST self-verify enforcement + verdict ring buffer
export type { ActiveRuleForVerify, EnforceVerifyInput } from './verify/index.js';
export {
  enforceVerify,
  recordVerify,
  listVerifications,
  removeVerification,
  clearVerifications,
  __resetVerificationsForTests,
} from './verify/index.js';

// llm — small-model suggestion / distillation / extraction
export {
  suggestWithLLM,
  distillAnnotationsToMemory,
  extractWithLLM,
} from './llm/index.js';

// rules — annotation → rule-proposal distillation
export type { DistillResult } from './rules/index.js';
export { parseRuleBody, distillRulesFromAnnotations } from './rules/index.js';

// connectors — connector-sourced memory extraction / suggestion
export type {
  ExtractMemoryFromConnectorsOptions,
  ExtractMemoryFromConnectorsResult,
  SuggestMemoryFromConnectorsResult,
} from './connectors/index.js';
export {
  suggestMemoryFromConnectors,
  extractMemoryFromConnectors,
} from './connectors/index.js';
