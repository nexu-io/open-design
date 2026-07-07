import { existsSync } from 'node:fs';
import path from 'node:path';

// Per-kind glue for sharing. Kind-specific knowledge (where a resource lives on
// disk, where a pulled team copy should land) is isolated here; the orchestrator
// and the neutral SDK stay kind-agnostic. Adapters only READ the existing
// managers' on-disk layout — they never mutate the managers or their storage.

export interface AdapterPaths {
  USER_DESIGN_SYSTEMS_DIR: string;
  RUNTIME_DATA_DIR: string;
}

export interface ResourceKindAdapter {
  kind: string;
  /** Directory to pack when sharing a locally-owned resource; null if absent. */
  resolveSourceDir(localId: string): string | null;
  /** Where a pulled team copy lands (read-only, distinct namespace). */
  teamCopyDir(hubResourceId: string): string;
}

export function createDesignSystemAdapter(
  paths: AdapterPaths,
): ResourceKindAdapter {
  return {
    kind: 'design_system',
    resolveSourceDir(localId) {
      const dir = path.join(paths.USER_DESIGN_SYSTEMS_DIR, localId);
      return existsSync(dir) ? dir : null;
    },
    // Team copies land under a distinct, read-only namespace so they never
    // collide with the user's own editable design systems.
    teamCopyDir(hubResourceId) {
      return path.join(
        paths.RUNTIME_DATA_DIR,
        'team-shared',
        'design-systems',
        hubResourceId,
      );
    },
  };
}

export function createAdapterRegistry(
  paths: AdapterPaths,
): Map<string, ResourceKindAdapter> {
  const registry = new Map<string, ResourceKindAdapter>();
  // MVP: design systems only. Plugin/skill adapters plug in here next, with no
  // change to the orchestrator, store, routes, or SDK.
  const designSystem = createDesignSystemAdapter(paths);
  registry.set(designSystem.kind, designSystem);
  return registry;
}
