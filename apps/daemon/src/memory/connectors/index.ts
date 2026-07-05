/** @module connectors/index
 * Barrel for connector-sourced memory: extracts and suggests memories from external
 * connector data (calendar, contacts, etc.) by routing connector tool output through
 * the LLM extractor. May import the `llm/` barrel.
 */

export type {
  ExtractMemoryFromConnectorsOptions,
  ExtractMemoryFromConnectorsResult,
  SuggestMemoryFromConnectorsResult,
} from './connectors.js';
export {
  suggestMemoryFromConnectors,
  extractMemoryFromConnectors,
} from './connectors.js';
