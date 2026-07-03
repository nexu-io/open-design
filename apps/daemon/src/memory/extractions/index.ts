/** @module extractions/index
 * Barrel for the in-memory ring buffer of recent memory-extraction attempts. Both the
 * heuristic (`store/`) and LLM (`llm/`) extractors write phase records here so the
 * settings panel can render a live "recent extractions" stream. Emits on `core`'s bus
 * under the `extraction` event name. May import `core/` only.
 */

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
} from './extractions.js';
