import type {
  AppliedStrategyBindingV2,
  InstalledPluginRecord,
  PluginPipeline,
} from '@open-design/contracts';
import { OD_NEXT_PROMPT_STAGE_CONTRACT_V2 } from '@open-design/contracts';
import { validateBundledStrategyActivationV2 } from './strategy-provenance.js';

export class InvalidOdNextStrategyPipelineV2Error extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidOdNextStrategyPipelineV2Error';
  }
}

function hasExactKeys(
  value: Readonly<Record<string, unknown>>,
  expected: ReadonlyArray<string>,
): boolean {
  const actual = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  return actual.length === sortedExpected.length
    && actual.every((key, index) => key === sortedExpected[index]);
}

/**
 * Exact, internal stage policy for the hash-gated bundled strategy. The
 * ordinary quality floor never calls this function, and community manifests
 * cannot supply the validated binding required to cross the apply boundary.
 */
export function enforceOdNextStrategyPipelineV2(input: {
  plugin: InstalledPluginRecord;
  binding: AppliedStrategyBindingV2;
  pipeline: PluginPipeline | undefined;
}): PluginPipeline {
  validateBundledStrategyActivationV2(input.plugin, input.binding);
  if (!input.pipeline || !hasExactKeys(input.pipeline, ['stages'])) {
    throw new InvalidOdNextStrategyPipelineV2Error(
      'OD Next V2 pipeline contains unsupported top-level policy fields.',
    );
  }
  const stages = input.pipeline?.stages;
  if (
    !Array.isArray(stages)
    || stages.length !== OD_NEXT_PROMPT_STAGE_CONTRACT_V2.length
  ) {
    throw new InvalidOdNextStrategyPipelineV2Error(
      'OD Next V2 pipeline must contain exactly discovery, plan, and generate.',
    );
  }
  for (const [index, expected] of OD_NEXT_PROMPT_STAGE_CONTRACT_V2.entries()) {
    const actual = stages[index];
    if (
      !actual
      || !hasExactKeys(actual, ['id', 'atoms'])
      || actual.id !== expected.id
      || actual.repeat !== undefined
      || actual.until !== undefined
      || actual.atoms.length !== expected.atoms.length
      || expected.atoms.some((atom, atomIndex) => actual.atoms[atomIndex] !== atom)
    ) {
      throw new InvalidOdNextStrategyPipelineV2Error(
        `OD Next V2 stage ${index + 1} does not match the ${expected.id} contract.`,
      );
    }
  }
  // Return a fresh, version-owned shape so later generic policy code cannot
  // append a quality stage by mutating the manifest-derived array.
  return {
    stages: OD_NEXT_PROMPT_STAGE_CONTRACT_V2.map((stage) => ({
      id: stage.id,
      atoms: [...stage.atoms],
    })),
  };
}
