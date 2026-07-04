/** @module export/routes
 * HTTP surface for import/export: registers the project import, project export, and
 * finalize Express routes, plus the diagnostics-bundle download handler.
 * Reaches renderers/ (the one declared cross-subdir edge) for deck rendering; imports core/ freely.
 */
export type {
  RegisterImportRoutesDeps,
  RegisterProjectExportRoutesDeps,
  RegisterFinalizeRoutesDeps,
} from './import-export.js';
export {
  registerImportRoutes,
  registerProjectExportRoutes,
  registerFinalizeRoutes,
} from './import-export.js';
export type { DiagnosticsHandlerOptions } from './diagnostics.js';
export { STANDALONE_LAUNCH_WARNING, createDiagnosticsExportHandler } from './diagnostics.js';
