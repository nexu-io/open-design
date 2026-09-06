import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  type Stats,
} from 'node:fs';
import path from 'node:path';
import {
  AppliedStrategyBindingV2Schema,
  OD_NEXT_STRATEGY_ID,
  type AppliedStrategyBindingV2,
  type InstalledPluginRecord,
  type StrategyTaskTypeV2,
} from '@open-design/contracts';
import {
  buildStrategyPackageIdentity,
  normalizeStrategyAssetPath,
} from '@open-design/plugin-runtime';
import { inspectBundledStrategyProvenanceV2 } from './strategy-provenance.js';

export type SelectableStrategyTaskTypeV2 = Exclude<StrategyTaskTypeV2, 'generic'>;

export class StrategyPackageIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyPackageIdentityError';
  }
}

export class StrategyPackageAssetPathError extends StrategyPackageIdentityError {
  constructor(message: string) {
    super(message);
    this.name = 'StrategyPackageAssetPathError';
  }
}

export interface BundledStrategyPromptAssetsV2 {
  binding: AppliedStrategyBindingV2;
  coreStrategy: string;
  generalOrchestration: string;
  taskSkill: string;
  /**
   * The selected profile's declared non-prompt resources (device shells and
   * the like), decoded from the same verified roster as the prompt text.
   */
  taskResources: ReadonlyArray<{ path: string; text: string }>;
}

/**
 * Daemon-owned I/O edge for the internal OD Next strategy. The manifest
 * supplies declared assets and this owner explicitly adds the mandatory package
 * manifest and SKILL.md; the function never scans directories.
 */
export function createBundledStrategyBindingV2(input: {
  plugin: InstalledPluginRecord;
  taskType: SelectableStrategyTaskTypeV2;
  discoveryCatalogRevision?: string;
}): Extract<AppliedStrategyBindingV2, { selectedTaskProfile: object }>;
export function createBundledStrategyBindingV2(input: {
  plugin: InstalledPluginRecord;
  taskType: StrategyTaskTypeV2;
  discoveryCatalogRevision?: string;
}): AppliedStrategyBindingV2;
export function createBundledStrategyBindingV2(input: {
  plugin: InstalledPluginRecord;
  taskType: StrategyTaskTypeV2;
  discoveryCatalogRevision?: string;
}): AppliedStrategyBindingV2 {
  return readBundledStrategyPackageV2(input).binding;
}

/**
 * Re-read the exact explicit roster and require it to match the persisted
 * apply-time binding before returning prompt text. Content drift therefore
 * fails closed instead of pairing an old snapshot identity with new files.
 */
export function loadBundledStrategyPromptAssetsV2(input: {
  plugin: InstalledPluginRecord;
  binding: AppliedStrategyBindingV2;
}): BundledStrategyPromptAssetsV2 {
  const loaded = readBundledStrategyPackageV2({
    plugin: input.plugin,
    taskType: input.binding.selectionMode === 'agent-discovery'
      ? 'generic'
      : input.binding.selectedTaskProfile.taskType,
    ...(input.binding.discoveryCatalogRevision
      ? { discoveryCatalogRevision: input.binding.discoveryCatalogRevision }
      : {}),
  });
  if (JSON.stringify(loaded.binding) !== JSON.stringify(input.binding)) {
    throw new StrategyPackageIdentityError(
      'Bundled strategy prompt content no longer matches the applied snapshot identity.',
    );
  }
  const decode = (assetPath: string): string => {
    const normalized = normalizeStrategyAssetPath(assetPath);
    const bytes = loaded.assets.get(normalized);
    if (!bytes) {
      throw new StrategyPackageIdentityError(
        `Bundled strategy prompt asset is missing from the verified roster: ${normalized}`,
      );
    }
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new StrategyPackageIdentityError(
        `Bundled strategy prompt asset is not valid UTF-8: ${normalized}`,
      );
    }
  };
  return {
    binding: loaded.binding,
    coreStrategy: decode(loaded.corePath),
    generalOrchestration: decode(loaded.orchestrationPath),
    taskSkill: loaded.selectedProfilePath ? decode(loaded.selectedProfilePath) : '',
    taskResources: loaded.selectedResourcePaths.map((resourcePath) => ({
      path: resourcePath,
      text: decode(resourcePath),
    })),
  };
}

function readBundledStrategyPackageV2(input: {
  plugin: InstalledPluginRecord;
  taskType: StrategyTaskTypeV2;
  discoveryCatalogRevision?: string;
}): {
  binding: AppliedStrategyBindingV2;
  assets: Map<string, Uint8Array>;
  corePath: string;
  orchestrationPath: string;
  selectedProfilePath: string | null;
  selectedResourcePaths: string[];
} {
  const provenance = inspectBundledStrategyProvenanceV2(input.plugin);
  if (provenance.kind === 'none') {
    throw new StrategyPackageIdentityError('Plugin is not an internal bundled strategy.');
  }
  if (provenance.kind === 'invalid') {
    const message = provenance.errors.join('; ');
    if (/path|relative|traverse/i.test(message)) {
      throw new StrategyPackageAssetPathError(message);
    }
    throw new StrategyPackageIdentityError(message);
  }
  if (input.plugin.id !== OD_NEXT_STRATEGY_ID) {
    throw new StrategyPackageIdentityError('Bundled strategy id does not match its installed identity.');
  }

  const declaration = provenance.declaration;
  const selectedProfile = declaration.assets.taskProfiles.find(
    (profile) => profile.taskType === input.taskType,
  );
  if (!selectedProfile && input.taskType !== 'generic') {
    throw new StrategyPackageIdentityError(
      `Bundled strategy does not declare task profile ${input.taskType}.`,
    );
  }

  let root: string;
  try {
    root = realpathSync(input.plugin.fsPath);
  } catch {
    throw new StrategyPackageIdentityError('Bundled strategy root is unavailable.');
  }
  // The selected profile's resources join the roster with the profile that
  // declares them; other profiles' resources stay out so the package hash for
  // one task type does not move when another task type's shell changes.
  const profiles = selectedProfile ? [selectedProfile] : declaration.assets.taskProfiles;
  const selectedResources = profiles.flatMap((profile) => profile.resources ?? []);
  const declaredPaths = [
    './open-design.json',
    './SKILL.md',
    declaration.assets.core.path,
    declaration.assets.orchestration.path,
    ...profiles.map((profile) => profile.path),
    declaration.assets.taskProfileMapping.path,
    ...selectedResources.map((resource) => resource.path),
    ...(input.discoveryCatalogRevision ? ['./agent-discovery/SKILL.md'] : []),
  ];
  const assets = new Map<string, Uint8Array>();
  let identity;
  let selectedPath: string | null;
  try {
    for (const assetPath of declaredPaths) {
      assets.set(
        normalizeStrategyAssetPath(assetPath),
        readControlledStrategyAsset(root, assetPath),
      );
    }
    identity = buildStrategyPackageIdentity({
      assets: Array.from(assets, ([assetPath, bytes]) => ({
        path: assetPath,
        bytes,
      })),
    });
    selectedPath = selectedProfile ? normalizeStrategyAssetPath(selectedProfile.path) : null;
  } catch (error) {
    if (error instanceof StrategyPackageIdentityError) throw error;
    throw new StrategyPackageIdentityError(
      error instanceof Error ? error.message : 'Strategy package identity could not be computed.',
    );
  }
  const selectedDigest = identity.assetDigests.find(
    (asset) => asset.path === selectedPath,
  );
  if (selectedProfile && !selectedDigest) {
    throw new StrategyPackageIdentityError('Selected task profile is missing from strategy identity.');
  }

  const parsed = AppliedStrategyBindingV2Schema.safeParse({
    schema: 'open-design.applied-strategy/v2',
    id: declaration.id,
    version: input.plugin.version,
    packageHash: identity.packageHash,
    assetDigests: identity.assetDigests,
    ...(selectedProfile && selectedDigest
      ? { selectedTaskProfile: {
          taskType: selectedProfile.taskType,
          version: selectedProfile.version,
          path: selectedDigest.path,
          sha256: selectedDigest.sha256,
        } }
      : {
          selectionMode: 'agent-discovery',
          selectedTaskProfile: null,
          genericProfileVersion: '2.0.0',
          availableTaskProfiles: profiles.map((profile) => ({
            taskType: profile.taskType,
            version: profile.version,
            path: normalizeStrategyAssetPath(profile.path),
            sha256: identity.assetDigests.find(
              (asset) => asset.path === normalizeStrategyAssetPath(profile.path),
            )!.sha256,
          })),
        }),
    ...(input.discoveryCatalogRevision
      ? { discoveryCatalogRevision: input.discoveryCatalogRevision }
      : {}),
    taskProfileVersions: [...new Set(profiles.map((profile) => profile.version))],
    promptRecipe: declaration.promptRecipe,
  });
  if (!parsed.success) {
    throw new StrategyPackageIdentityError('Computed strategy binding failed schema validation.');
  }
  return {
    binding: parsed.data,
    assets,
    corePath: normalizeStrategyAssetPath(declaration.assets.core.path),
    orchestrationPath: normalizeStrategyAssetPath(declaration.assets.orchestration.path),
    selectedProfilePath: selectedPath,
    selectedResourcePaths: selectedProfile
      ? selectedResources.map((resource) => normalizeStrategyAssetPath(resource.path))
      : [],
  };
}

function readControlledStrategyAsset(pluginRoot: string, assetPath: string): Uint8Array {
  let normalized: string;
  try {
    normalized = normalizeStrategyAssetPath(assetPath);
  } catch (error) {
    throw new StrategyPackageAssetPathError(
      error instanceof Error ? error.message : 'Invalid strategy asset path.',
    );
  }

  try {
    const relativePath = normalized.slice(2);
    const candidate = path.resolve(pluginRoot, relativePath);
    assertInsideRoot(pluginRoot, candidate);

    let current = pluginRoot;
    for (const segment of relativePath.split('/')) {
      current = path.join(current, segment);
      const link = lstatSync(current);
      if (link.isSymbolicLink()) {
        throw new StrategyPackageAssetPathError(
          `Declared strategy asset may not cross a symbolic link: ${normalized}`,
        );
      }
    }

    const realCandidate = realpathSync(candidate);
    assertInsideRoot(pluginRoot, realCandidate);
    if (!statSync(realCandidate).isFile()) {
      throw new StrategyPackageAssetPathError(
        `Declared strategy asset is not a regular file: ${normalized}`,
      );
    }
    const descriptor = openSync(
      realCandidate,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
    );
    try {
      const beforeRead = fstatSync(descriptor);
      if (!beforeRead.isFile()) {
        throw new StrategyPackageAssetPathError(
          `Declared strategy asset changed before it could be read: ${normalized}`,
        );
      }
      const bytes = readFileSync(descriptor);
      const afterRead = fstatSync(descriptor);
      const verifiedCandidate = realpathSync(candidate);
      assertInsideRoot(pluginRoot, verifiedCandidate);
      const verifiedPath = statSync(verifiedCandidate);
      if (
        !sameFileIdentity(beforeRead, afterRead)
        || !sameFileIdentity(afterRead, verifiedPath)
      ) {
        throw new StrategyPackageAssetPathError(
          `Declared strategy asset changed while it was being read: ${normalized}`,
        );
      }
      return bytes;
    } finally {
      closeSync(descriptor);
    }
  } catch (error) {
    if (error instanceof StrategyPackageIdentityError) throw error;
    throw new StrategyPackageIdentityError(
      `Declared strategy asset is unavailable: ${normalized}`,
    );
  }
}

function assertInsideRoot(pluginRoot: string, candidate: string): void {
  const relative = path.relative(pluginRoot, candidate);
  if (relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))) return;
  throw new StrategyPackageAssetPathError('Declared strategy asset escapes the plugin root.');
}

function sameFileIdentity(left: Stats, right: Stats): boolean {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.mtimeMs === right.mtimeMs
    && left.ctimeMs === right.ctimeMs;
}
