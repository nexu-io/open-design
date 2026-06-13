// Barrel for the GenUI module — see ./registry.ts for the high-level
// orchestration entry points and ./store.ts for the SQLite writer. Tests
// import from the barrel; production code may import directly when only
// the store or events helpers are needed.

export * from './events.js';
export * from './registry.js';
// Both registry and store export `respondSurface`; the registry version
// is the public-facing one (it emits the response event), while the
// store version is the SQLite writer used internally. Callers should
// reach the store version via the explicit `genuiStore` namespace.
export {
  findPendingByRunAndSurfaceId,
  getSurface,
  listSurfacesForProject,
  listSurfacesForRun,
  markTimeout,
  prefillSurface,
  requestSurface,
  revokeSurface,
} from './store.js';
export {
  respondSurface as respondSurfaceRow,
} from './store.js';
export type {
  SurfaceKind,
  SurfaceRespondedBy,
  SurfaceRow,
  SurfaceStatus,
  SurfaceTier,
} from './store.js';
