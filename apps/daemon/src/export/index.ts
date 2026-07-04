/** @module export
 * Public API for the export domain: project import/export + finalize HTTP routes, the
 * diagnostics-bundle download handler, artifact renderers (deck / pdf / transcript), the
 * `od export` CLI request helpers, and the foundational export route-path primitive.
 *
 * Re-exports only from the subdirectory barrels (core/, cli/, renderers/, routes/) with
 * explicit named exports — this file is the sole entry point external daemon code may import,
 * and the enumerated list below is the reviewable public surface (guard rule 7).
 */

// Foundation kernel.
export { exportRoutePath } from './core/index.js';

// `od export` CLI request helpers.
export type { ExportCliRequestOptions, ExportCliDeckModeOptions } from './cli/index.js';
export {
  resolveExportCliDeckMode,
  buildExportCliRequestBody,
  buildExportCliResultEnvelope,
} from './cli/index.js';

// Artifact renderers (deck / pdf / transcript).
export type {
  BuildDeckRenderInputOptions,
  DeckRenderRequest,
  SlideImage,
  BuildDesktopPdfExportInputOptions,
  BuildDesktopArtifactExportInputOptions,
  TranscriptExportOptions,
  TranscriptExportResult,
} from './renderers/index.js';
export {
  buildDeckRenderInput,
  readSlideFiles,
  decodeSlideDataUrls,
  buildScreenshotPptx,
  buildScreenshotPdf,
  buildDesktopPdfExportInput,
  buildDesktopArtifactExportInput,
  TranscriptExportLockedError,
  exportProjectTranscript,
} from './renderers/index.js';

// HTTP route + handler surface.
export type {
  RegisterImportRoutesDeps,
  RegisterProjectExportRoutesDeps,
  RegisterFinalizeRoutesDeps,
  DiagnosticsHandlerOptions,
} from './routes/index.js';
export {
  registerImportRoutes,
  registerProjectExportRoutes,
  registerFinalizeRoutes,
  STANDALONE_LAUNCH_WARNING,
  createDiagnosticsExportHandler,
} from './routes/index.js';
