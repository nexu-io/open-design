/** @module llm/index
 * Barrel for the small-model memory extractor: LLM-backed suggestion, distillation of
 * chat annotations into memories, and structured extraction of facts from a turn. Reads
 * and writes through the `store/` barrel and records attempts in `extractions/`. May
 * import `core/`, `store/`, and `extractions/`.
 */

export {
  suggestWithLLM,
  distillAnnotationsToMemory,
  extractWithLLM,
} from './llm.js';
