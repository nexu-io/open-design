/** @module library/index
 * Public API for the OD Library domain: the global content-addressed asset
 * registry, its SQLite persistence, the idempotent registration/enrichment
 * layer, the reconcile sync that mirrors design systems and project
 * deliverables, browser-extension pairing tokens, and skill/design-system
 * install. This barrel is the only entry point external (runtime) code may
 * import; it re-exports named symbols from the subdirectory barrels and never
 * from a private file. Keep the export list explicit — it is the reviewable
 * public surface.
 */

// core — shared record types + pure media/path primitives (the foundation)
export type { LibraryAssetRecord, LibraryTokenRow } from './core/index.js';
export {
  libraryObjectsDir,
  libraryObjectPath,
  archivedDateFor,
  extForMime,
  detectMime,
  kindForMime,
  sniffImageDimensions,
} from './core/index.js';

// store — SQLite persistence: schema, asset/source/task/token CRUD
export type { InsertLibraryAssetInput, LibraryAssetPatch, AddLibrarySourceInput } from './store/index.js';
export {
  migrateLibrary,
  insertLibraryAsset,
  updateLibraryAsset,
  findLibraryAssetByHash,
  getLibraryAsset,
  findReferencedAssetByOrigin,
  hasDesignSystemSource,
  deleteLibraryAsset,
  listLibraryAssets,
  listLibraryAssetSources,
  addLibraryAssetSource,
  insertLibraryTask,
  getLibraryTask,
  updateLibraryTask,
  insertLibraryToken,
  findLibraryTokenByHash,
  touchLibraryToken,
  listLibraryTokens,
  listLibraryTokenOrigins,
} from './store/index.js';

// assets — idempotent registration, owned storage, sidecars, bytes resolution
export type {
  RegisterLibrarySource,
  RegisterLibraryAssetInput,
  RegisterLibraryAssetResult,
} from './assets/index.js';
export {
  resolveAssetFigmaSidecarPath,
  writeFigmaSidecar,
  resolveAssetElementSidecarPath,
  writeElementSidecar,
  registerLibraryAsset,
  resolveAssetBytesPath,
} from './assets/index.js';

// sync — reconcile design systems + project deliverables as referenced assets
export type { ReconcileLibraryPaths, ReconcileLibraryResult } from './sync/index.js';
export { reconcileLibrary } from './sync/index.js';

// tokens — browser-extension pairing + long-lived Library bearer tokens
export type { ConfirmPairingResult } from './tokens/index.js';
export {
  seedLibraryExtensionOrigins,
  libraryExtensionAllowedOrigins,
  isAllowedExtensionOrigin,
  startPairing,
  confirmPairing,
  validateLibraryToken,
  libraryConnectionStatus,
} from './tokens/index.js';

// install — install/uninstall user skills + design systems
export {
  GITHUB_URL_RE,
  SAFE_NAME_RE,
  sanitizeRepoName,
  installFromTarget,
  uninstallById,
} from './install/index.js';
