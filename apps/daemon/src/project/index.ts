/** @module project
 * Main public API for the project module.
 * Re-exports the project files registry, ignored-directory policy, project-root resolution, storage locations, file watchers, and the file-version store from domain subdirectories.
 */
export {
  IGNORED_PROJECT_DIR_NAMES,
  isIgnoredProjectDirName,
} from './core/index.js';

export {
  resolveProjectRoot,
  resolveProjectRootFromNestedModule,
} from './core/index.js';

export {
  RUN_ARTIFACT_RECONCILE_MTIME_GRACE_MS,
  SandboxImportedProjectError,
  assertSandboxProjectRootAvailable,
  buildBatchArchive,
  buildProjectArchive,
  createProjectFolder,
  decodeMultipartFilename,
  deleteProjectFile,
  deleteProjectFolder,
  detectEntryFile,
  ensureProject,
  ensureProjectSubdir,
  isReservedProjectFilePath,
  isRunTouchedProjectFile,
  isSafeId,
  kindFor,
  listFiles,
  listProjectFolders,
  mimeFor,
  parseByteRange,
  projectDir,
  projectFileRenameTestHooks,
  projectFileWriteTestHooks,
  readProjectFile,
  reconcileHtmlArtifactManifest,
  removeProjectDir,
  renameProjectFile,
  resolveProjectDir,
  resolveProjectFilePath,
  sanitizeName,
  sanitizePath,
  searchProjectFiles,
  validateProjectPath,
  writeProjectFile,
} from './core/index.js';

export type {
  ProjectLocation,
  ProjectManifest,
} from './locations/index.js';
export {
  BUILT_IN_PROJECT_LOCATION_ID,
  PROJECT_MANIFEST_RELATIVE_PATH,
  allProjectLocations,
  builtInProjectLocation,
  canonicalLocationChildDir,
  createLocationProjectDir,
  ensureProjectLocation,
  locationProjectDir,
  manifestPath,
  readProjectManifest,
  scanProjectLocation,
  writeProjectManifest,
} from './locations/index.js';

export type {
  ProjectWatchCallback,
  ProjectWatchEvent,
  ProjectWatchKind,
  ProjectWatcherOptions,
} from './watchers/index.js';
export {
  DEFAULT_AWAIT_WRITE_FINISH,
  _activeWatcherCount,
  _internalWatcherForTests,
  _resetForTests,
  makeIgnored,
  subscribe,
} from './watchers/index.js';

export type { ProjectFileVersionLockContext } from './versions/index.js';
export {
  createProjectFileVersion,
  ensureCurrentProjectFileVersion,
  getProjectFileVersionRootStats,
  isProjectFileVersionPath,
  listProjectFileVersions,
  markProjectFileVersionStoreDeleted,
  readProjectFileVersion,
  renameProjectFileVersionStore,
  withProjectFileVersionLock,
} from './versions/index.js';
