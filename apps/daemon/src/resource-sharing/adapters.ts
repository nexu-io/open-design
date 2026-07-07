import { existsSync } from 'node:fs';
import path from 'node:path';

// Per-kind glue for sharing. Kind-specific knowledge (where a resource lives on
// disk, where a pulled team copy should land) is isolated here; the orchestrator
// and the neutral SDK stay kind-agnostic. Adapters only READ the existing
// managers' on-disk layout — they never mutate the managers or their storage.
//
// All three kinds expose a source directory to pack and a team-copy directory
// for pulled resources. Source lookup mirrors each owning subsystem: design
// systems are user-owned, skills can resolve from any daemon skill root, and
// plugins resolve through the installed-plugin registry record.

export interface AdapterPaths {
  USER_DESIGN_SYSTEMS_DIR: string;
  SKILL_ROOTS: string[];
  RUNTIME_DATA_DIR: string;
}

export interface AdapterSources {
  resolveSkillSourceDir?: (localId: string) => string | null | Promise<string | null>;
  resolvePluginSourceDir?: (localId: string) => string | null;
}

export interface ResourceKindAdapter {
  kind: string;
  /** Directory to pack when sharing a locally-owned resource; null if absent. */
  resolveSourceDir(localId: string): Promise<string | null>;
  /** Where a pulled team copy lands (read-only, distinct namespace). */
  teamCopyDir(hubResourceId: string): Promise<string>;
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

function isWithinRoot(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function createDirAdapter(
  kind: string,
  sourceRoot: string,
  teamCopyRoot: string,
  sourceSegmentFromLocalId: (localId: string) => string = (localId) =>
    validatePathSegment(localId, `local ${kind} id`),
): ResourceKindAdapter {
  const source = path.resolve(sourceRoot);
  const teamCopy = path.resolve(teamCopyRoot);
  return {
    kind,
    async resolveSourceDir(localId) {
      const dir = resolveWithinRoot(source, sourceSegmentFromLocalId(localId));
      return existsSync(dir) ? dir : null;
    },
    async teamCopyDir(hubResourceId) {
      return resolveWithinRoot(
        teamCopy,
        validatePathSegment(hubResourceId, 'hub resource id'),
      );
    },
  };
}

function designSystemSourceSegment(localId: string): string {
  const userPrefix = 'user:';
  const dirId = localId.startsWith(userPrefix)
    ? localId.slice(userPrefix.length)
    : localId;
  return validatePathSegment(dirId, 'local design_system id');
}

function createSkillAdapter(
  resolveSkillSourceDir: (localId: string) => string | null | Promise<string | null>,
  sourceRoots: string[],
  teamCopyRoot: string,
): ResourceKindAdapter {
  const sources = sourceRoots.map((root) => path.resolve(root));
  const teamCopy = path.resolve(teamCopyRoot);
  return {
    kind: 'skill',
    async resolveSourceDir(localId) {
      const dir = await resolveSkillSourceDir(localId);
      if (!dir) return null;
      const resolved = path.resolve(dir);
      if (!sources.some((source) => isWithinRoot(source, resolved))) {
        throw new ResourceAdapterError(
          400,
          'invalid_resource_id',
          'skill source resolves outside its namespace',
        );
      }
      return existsSync(resolved) ? resolved : null;
    },
    async teamCopyDir(hubResourceId) {
      return resolveWithinRoot(
        teamCopy,
        validatePathSegment(hubResourceId, 'hub resource id'),
      );
    },
  };
}

function createRegistryBackedPluginAdapter(
  resolvePluginSourceDir: (localId: string) => string | null,
  teamCopyRoot: string,
): ResourceKindAdapter {
  const teamCopy = path.resolve(teamCopyRoot);
  return {
    kind: 'plugin',
    async resolveSourceDir(localId) {
      const pluginId = validatePathSegment(localId, 'local plugin id');
      const dir = resolvePluginSourceDir(pluginId);
      return dir && existsSync(dir) ? dir : null;
    },
    async teamCopyDir(hubResourceId) {
      return resolveWithinRoot(
        teamCopy,
        validatePathSegment(hubResourceId, 'hub resource id'),
      );
    },
  };
}

export function createAdapterRegistry(
  paths: AdapterPaths,
  sources: AdapterSources = {},
): Map<string, ResourceKindAdapter> {
  const teamShared = path.join(paths.RUNTIME_DATA_DIR, 'team-shared');
  const resolveSkillSourceDir =
    sources.resolveSkillSourceDir ??
    ((localId: string) => {
      if (!/^[a-zA-Z0-9._-]+$/.test(localId) || localId === '.' || localId === '..') {
        return null;
      }
      for (const root of paths.SKILL_ROOTS) {
        const dir = resolveWithinRoot(path.resolve(root), localId);
        if (existsSync(dir)) return dir;
      }
      return null;
    });
  const resolvePluginSourceDir =
    sources.resolvePluginSourceDir ??
    ((localId: string) => path.join(paths.RUNTIME_DATA_DIR, 'plugins', localId));
  const adapters: ResourceKindAdapter[] = [
    createDirAdapter(
      'design_system',
      paths.USER_DESIGN_SYSTEMS_DIR,
      path.join(teamShared, 'design-systems'),
      designSystemSourceSegment,
    ),
    createSkillAdapter(
      resolveSkillSourceDir,
      paths.SKILL_ROOTS,
      path.join(teamShared, 'skills'),
    ),
    createRegistryBackedPluginAdapter(
      resolvePluginSourceDir,
      path.join(teamShared, 'plugins'),
    ),
  ];
  const registry = new Map<string, ResourceKindAdapter>();
  for (const adapter of adapters) registry.set(adapter.kind, adapter);
  return registry;
}
