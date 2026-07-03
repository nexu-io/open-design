/** @module ingestion/index
 * Ingestion pipeline: turn external source packets and routine-run connector usage into
 * automation proposals. Reaches proposals/ and templates/ (declared edges); routine-run
 * evolution consumes routine types from core/.
 */

export {
  getAutomationSourcePacket,
  ingestAutomationSource,
  listAutomationSourcePackets,
} from './sources.js';
export {
  automationTemplateIdFromRoutinePrompt,
  ingestRoutineConnectorEvolution,
} from './routine-evolution.js';
