import { existsSync } from 'node:fs';
import path from 'node:path';

// Per-kind glue for sharing. Kind-specific knowledge (where a resource lives on
// disk, where a pulled team copy should land) is isolated here; the orchestrator
// and the neutral SDK stay kind-agnostic. Adapters only READ the existing
// managers' on-disk layout — they never mutate the managers or their storage.
//
// All three kinds share the same shape: a resource is a directory under a
// per-kind root (design systems: USER_DESIGN_SYSTEMS_DIR/<id>; skills:
// USER_SKILLS_DIR/<id>; plugins: RUNTIME_DATA_DIR/plugins/<id>), and a pulled
// team copy lands read-only under a distinct team-shared namespace. Ids are
// validated + resolved within their root so a hostile id cannot escape it.

export interface AdapterPaths {
  USER_DESIGN_SYSTEMS_DIR: string;
  USER_SKILLS_DIR: string;
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

function validatePathSegment(id: string, label: string): string {
  if (!/^[a-zA-Z0-9._-]+$/.test(id) || id === '.' || id === '..') {
    throw new ResourceAdapterError(400, 'invalid_resource_id', `invalid ${label}`);
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

function createDirAdapter(
  kind: string,
  sourceRoot: string,
  teamCopyRoot: string,
): ResourceKindAdapter {
  const source = path.resolve(sourceRoot);
  const teamCopy = path.resolve(teamCopyRoot);
  return {
    kind,
    resolveSourceDir(localId) {
      const dir = resolveWithinRoot(
        source,
        validatePathSegment(localId, `local ${kind} id`),
      );
      return existsSync(dir) ? dir : null;
    },
    teamCopyDir(hubResourceId) {
      return resolveWithinRoot(
        teamCopy,
        validatePathSegment(hubResourceId, 'hub resource id'),
      );
    },
  };
}

export function createAdapterRegistry(
  paths: AdapterPaths,
): Map<string, ResourceKindAdapter> {
  const teamShared = path.join(paths.RUNTIME_DATA_DIR, 'team-shared');
  const adapters: ResourceKindAdapter[] = [
    createDirAdapter(
      'design_system',
      paths.USER_DESIGN_SYSTEMS_DIR,
      path.join(teamShared, 'design-systems'),
    ),
    createDirAdapter(
      'skill',
      paths.USER_SKILLS_DIR,
      path.join(teamShared, 'skills'),
    ),
    createDirAdapter(
      'plugin',
      path.join(paths.RUNTIME_DATA_DIR, 'plugins'),
      path.join(teamShared, 'plugins'),
    ),
  ];
  const registry = new Map<string, ResourceKindAdapter>();
  for (const adapter of adapters) registry.set(adapter.kind, adapter);
  return registry;
}
