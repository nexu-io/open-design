/** @module export/cli
 * `od export` CLI request layer: pure helpers that shape the CLI's HTTP request body,
 * its result envelope, and the deck-vs-page mode resolution. No daemon-internal imports.
 */
export type { ExportCliRequestOptions, ExportCliDeckModeOptions } from './request.js';
export {
  resolveExportCliDeckMode,
  buildExportCliRequestBody,
  buildExportCliResultEnvelope,
} from './request.js';
