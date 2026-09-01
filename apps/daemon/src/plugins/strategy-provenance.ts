import {
  AppliedStrategyBindingV2Schema,
  BundledStrategyDeclarationV2Schema,
  type AppliedStrategyBindingV2,
  type BundledStrategyDeclarationV2,
  type InstalledPluginRecord,
} from '@open-design/contracts';
import {
  normalizeStrategyAssetPath,
  strategyPackageHashFromDigests,
} from '@open-design/plugin-runtime';

type StrategyProvenanceInput = Pick<InstalledPluginRecord, 'sourceKind' | 'manifest'>;

export type BundledStrategyProvenanceV2 =
  | { kind: 'none' }
  | { kind: 'invalid'; errors: string[] }
  | { kind: 'inactive'; declaration: BundledStrategyDeclarationV2 };

function strategyCandidate(manifest: InstalledPluginRecord['manifest']): unknown {
  const od = manifest.od as (Record<string, unknown> | undefined);
  return od?.['strategy'];
}

/**
 * Interpret the V2 strategy sidecar only after installed provenance proves
 * that the bytes came from the daemon's bundled tree. `PluginManifestSchema`
 * deliberately keeps this field as unknown passthrough data so community and
 * older manifests cannot be forced through an internal contract.
 *
 * Task 04 ships content and contracts only. Until the later activation task
 * supplies hash-gated binding, every valid bundled declaration is internal
 * and every invalid bundled declaration fails closed as internal too.
 */
export function inspectBundledStrategyProvenanceV2(
  plugin: StrategyProvenanceInput,
): BundledStrategyProvenanceV2 {
  if (plugin.sourceKind !== 'bundled') return { kind: 'none' };
  const candidate = strategyCandidate(plugin.manifest);
  if (candidate === undefined) return { kind: 'none' };

  const parsed = BundledStrategyDeclarationV2Schema.safeParse(candidate);
  if (!parsed.success) {
    return {
      kind: 'invalid',
      errors: parsed.error.issues.map(
        (issue) => `${issue.path.join('.') || '<strategy>'}: ${issue.message}`,
      ),
    };
  }
  return { kind: 'inactive', declaration: parsed.data };
}

export function isInternalBundledStrategyV2(
  plugin: StrategyProvenanceInput,
): boolean {
  return inspectBundledStrategyProvenanceV2(plugin).kind !== 'none';
}

export class InvalidBundledStrategyActivationV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidBundledStrategyActivationV2Error';
  }
}

/**
 * Validate the hash-gated activation produced by the daemon content reader.
 * Generic/public apply callers never receive this binding and remain closed.
 */
export function validateBundledStrategyActivationV2(
  plugin: StrategyProvenanceInput & Pick<InstalledPluginRecord, 'id' | 'version'>,
  candidate: unknown,
): AppliedStrategyBindingV2 {
  const provenance = inspectBundledStrategyProvenanceV2(plugin);
  if (provenance.kind !== 'inactive') {
    throw new InvalidBundledStrategyActivationV2Error(
      provenance.kind === 'invalid'
        ? provenance.errors.join('; ')
        : 'Plugin is not an internal bundled strategy.',
    );
  }
  const parsedBinding = AppliedStrategyBindingV2Schema.safeParse(candidate);
  if (!parsedBinding.success) {
    throw new InvalidBundledStrategyActivationV2Error(
      'Applied strategy binding failed schema validation.',
    );
  }
  const binding = parsedBinding.data;
  const declaration = provenance.declaration;
  const selected = declaration.assets.taskProfiles.find(
    (profile) => profile.taskType === binding.selectedTaskProfile.taskType,
  );
  if (
    plugin.id !== declaration.id
    || binding.id !== declaration.id
    || binding.version !== plugin.version
    || binding.promptRecipe !== declaration.promptRecipe
    || !selected
    || normalizeStrategyAssetPath(selected.path) !== binding.selectedTaskProfile.path
    || selected.version !== binding.selectedTaskProfile.version
  ) {
    throw new InvalidBundledStrategyActivationV2Error(
      'Applied strategy binding does not match the bundled declaration.',
    );
  }

  const expectedPaths = [
    './open-design.json',
    './SKILL.md',
    declaration.assets.core.path,
    declaration.assets.orchestration.path,
    selected.path,
    declaration.assets.taskProfileMapping.path,
    ...(selected.resources ?? []).map((resource) => resource.path),
  ].map(normalizeStrategyAssetPath).sort((a, b) => a < b ? -1 : a > b ? 1 : 0);
  const actualPaths = binding.assetDigests.map((asset) => asset.path);
  if (
    expectedPaths.length !== actualPaths.length
    || expectedPaths.some((assetPath, index) => assetPath !== actualPaths[index])
    || binding.taskProfileVersions.length !== 1
    || binding.taskProfileVersions[0] !== selected.version
  ) {
    throw new InvalidBundledStrategyActivationV2Error(
      'Applied strategy binding asset roster does not match the selected package.',
    );
  }
  let recomputedHash: string;
  try {
    recomputedHash = strategyPackageHashFromDigests(binding.assetDigests);
  } catch {
    throw new InvalidBundledStrategyActivationV2Error(
      'Applied strategy binding digest roster is invalid.',
    );
  }
  if (recomputedHash !== binding.packageHash) {
    throw new InvalidBundledStrategyActivationV2Error(
      'Applied strategy package hash does not match its asset digests.',
    );
  }
  return binding;
}
