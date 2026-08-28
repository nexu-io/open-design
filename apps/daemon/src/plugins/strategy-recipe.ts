import path from 'node:path';
import {
  assertOdNextPlanningBuildOnlyV2,
  OD_NEXT_PROMPT_STAGE_CONTRACT_V2,
  OD_NEXT_PROMPT_RECIPE_ID,
  OD_NEXT_STRATEGY_ID,
  type AppliedPluginSnapshot,
  type OdNextPromptBundleStageV2,
  type OdNextStrategyRequestRecipeV2,
} from '@open-design/contracts';
import { resolvePluginFolder } from './registry.js';
import {
  loadBundledStrategyPromptAssetsV2,
  StrategyPackageIdentityError,
} from './strategy-package.js';
import { enforceOdNextStrategyPipelineV2 } from './strategy-stage-policy.js';

export class InvalidOdNextStrategyPromptRecipeV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOdNextStrategyPromptRecipeV2Error';
  }
}

const REQUIRED_PROMPT_BODY_ATOMS = new Set([
  'discovery-question-form',
  'direction-picker',
  'todo-write',
]);

export interface OdNextStrategyAtomBodyV2 {
  atomId: string;
  body: string;
}

/**
 * Validate one stage's loaded atom bodies and return it as structured data.
 *
 * The pipeline already knows which atoms belong to the stage, so the stage is
 * expressed as `{ name, atoms }` and the Bundle renders it as elements. An atom
 * with no prompt fragment carries no body: its presence is the fact.
 */
function buildValidatedStage(
  stage: (typeof OD_NEXT_PROMPT_STAGE_CONTRACT_V2)[number],
  loadedBodies: ReadonlyArray<OdNextStrategyAtomBodyV2>,
): OdNextPromptBundleStageV2 {
  const expectedAtoms = new Set<string>(stage.atoms);
  const bodies = new Map<string, string>();
  for (const entry of loadedBodies) {
    const atomId = entry.atomId.toLowerCase();
    if (!expectedAtoms.has(atomId) || bodies.has(atomId)) {
      throw new InvalidOdNextStrategyPromptRecipeV2Error(
        `OD Next ${stage.id} atom bodies do not match the validated pipeline.`,
      );
    }
    const body = entry.body.trim();
    if (!body) {
      throw new InvalidOdNextStrategyPromptRecipeV2Error(
        `OD Next ${stage.id} atom body is empty: ${atomId}`,
      );
    }
    if (/^###\s+/m.test(body)) {
      throw new InvalidOdNextStrategyPromptRecipeV2Error(
        `OD Next ${stage.id} atom body contains an unexpected subsection heading: ${atomId}`,
      );
    }
    try {
      assertOdNextPlanningBuildOnlyV2(body, `atom body ${atomId}`);
    } catch (error) {
      throw new InvalidOdNextStrategyPromptRecipeV2Error(
        error instanceof Error ? error.message : String(error),
      );
    }
    bodies.set(atomId, body);
  }
  for (const atomId of stage.atoms) {
    if (REQUIRED_PROMPT_BODY_ATOMS.has(atomId) && !bodies.has(atomId)) {
      throw new InvalidOdNextStrategyPromptRecipeV2Error(
        `OD Next required bundled atom body is unavailable: ${atomId}`,
      );
    }
  }

  return {
    name: stage.id,
    atoms: stage.atoms.map((atomId) => {
      const body = bodies.get(atomId);
      return body ? { name: atomId, body } : { name: atomId };
    }),
  };
}

/**
 * Resolve the internal prompt payload from the hidden shipped folder. A
 * snapshot without a Strategy Binding is an ordinary plugin snapshot and
 * returns null, even when its display id imitates the official strategy.
 */
export async function resolveOdNextStrategyRequestRecipeV2(input: {
  bundledPluginsDir: string;
  snapshot: AppliedPluginSnapshot;
  executionProfile: 'filesystem' | 'text_artifact';
  atomPromptsEnabled: boolean;
  loadAtomBodies: (
    atomIds: ReadonlyArray<string>,
  ) => Promise<ReadonlyArray<OdNextStrategyAtomBodyV2>>;
}): Promise<OdNextStrategyRequestRecipeV2 | null> {
  const binding = input.snapshot.strategy;
  if (!binding) return null;
  const snapshotId = input.snapshot.snapshotId.trim();
  if (!snapshotId) {
    throw new InvalidOdNextStrategyPromptRecipeV2Error(
      'Applied OD Next snapshot id is unavailable.',
    );
  }
  if (
    input.snapshot.pluginId !== OD_NEXT_STRATEGY_ID
    || binding.id !== OD_NEXT_STRATEGY_ID
    || binding.promptRecipe !== OD_NEXT_PROMPT_RECIPE_ID
  ) {
    throw new InvalidOdNextStrategyPromptRecipeV2Error(
      'Applied snapshot does not match the OD Next V2 recipe identity.',
    );
  }

  const folder = path.join(
    input.bundledPluginsDir,
    'scenarios',
    OD_NEXT_STRATEGY_ID,
  );
  const resolved = await resolvePluginFolder({
    folder,
    folderId: OD_NEXT_STRATEGY_ID,
    sourceKind: 'bundled',
    source: folder,
    trust: 'bundled',
  });
  if (!resolved.ok) {
    throw new InvalidOdNextStrategyPromptRecipeV2Error(
      `Bundled OD Next recipe is unavailable: ${resolved.errors.join('; ')}`,
    );
  }

  try {
    // Re-check the persisted pipeline at consumption time. A malformed or
    // tampered snapshot must never fall back to generic composition.
    const pipeline = enforceOdNextStrategyPipelineV2({
      plugin: resolved.record,
      binding,
      pipeline: input.snapshot.pipeline,
    });
    if (!input.atomPromptsEnabled) {
      throw new InvalidOdNextStrategyPromptRecipeV2Error(
        'OD Next atom prompts are disabled; refusing an incomplete request recipe.',
      );
    }
    const activeStages: OdNextPromptBundleStageV2[] = [];
    for (const [index, stage] of pipeline.stages.entries()) {
      const expected = OD_NEXT_PROMPT_STAGE_CONTRACT_V2[index];
      if (!expected || stage.id !== expected.id) {
        throw new InvalidOdNextStrategyPromptRecipeV2Error(
          'OD Next validated stage order changed before prompt composition.',
        );
      }
      const loadedBodies = await input.loadAtomBodies(stage.atoms);
      activeStages.push(buildValidatedStage(expected, loadedBodies));
    }
    const assets = loadBundledStrategyPromptAssetsV2({
      plugin: resolved.record,
      binding,
    });
    return {
      recipe: binding.promptRecipe,
      strategyId: binding.id,
      strategyVersion: binding.version,
      snapshotId,
      packageHash: binding.packageHash,
      taskProfileDigest: binding.selectedTaskProfile.sha256,
      taskProfileVersion: binding.selectedTaskProfile.version,
      taskType: binding.selectedTaskProfile.taskType,
      executionProfile: input.executionProfile,
      coreStrategy: assets.coreStrategy,
      generalOrchestration: assets.generalOrchestration,
      taskSkill: assets.taskSkill,
      activeStages,
      taskResources: assets.taskResources,
    };
  } catch (error) {
    if (error instanceof InvalidOdNextStrategyPromptRecipeV2Error) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new InvalidOdNextStrategyPromptRecipeV2Error(
      error instanceof StrategyPackageIdentityError
        ? message
        : `OD Next V2 recipe gate failed: ${message}`,
    );
  }
}
