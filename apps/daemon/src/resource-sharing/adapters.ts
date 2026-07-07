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

export class ResourceAdapterError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message?: string,
  ) {
    super(message ?? code);
    this.name = 'ResourceAdapterError';
  }
}

export function createDesignSystemAdapter(
  paths: AdapterPaths,
): ResourceKindAdapter {
  const userDesignSystemsRoot = path.resolve(paths.USER_DESIGN_SYSTEMS_DIR);
  const teamDesignSystemsRoot = path.resolve(
    paths.RUNTIME_DATA_DIR,
    'team-shared',
    'design-systems',
  );

  return {
    kind: 'design_system',
    resolveSourceDir(localId) {
      const dirId = validatePathSegment(localId, 'local design-system id');
      const dir = resolveWithinRoot(userDesignSystemsRoot, dirId);
      return existsSync(dir) ? dir : null;
    },
    // Team copies land under a distinct, read-only namespace so they never
    // collide with the user's own editable design systems.
    teamCopyDir(hubResourceId) {
      const dirId = validatePathSegment(hubResourceId, 'hub resource id');
      return resolveWithinRoot(teamDesignSystemsRoot, dirId);
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

function validatePathSegment(id: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id) || id === '.' || id === '..') {
    throw new ResourceAdapterError(
      400,
      'invalid_resource_id',
      `invalid ${label}`,
    );
  }
  return id;
}

function resolveWithinRoot(root: string, segment: string): string {
  const target = path.resolve(root, segment);
  const relative = path.relative(root, target);
  if (relative === '' || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new ResourceAdapterError(
      400,
      'invalid_resource_id',
      'resource id resolves outside its namespace',
    );
  }
  return target;
}
