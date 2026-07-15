import type { Dict } from '../i18n/types';
import type { AgentModelOption } from '../types';

export type ModelCapabilityTag =
  | 'standard'
  | 'advanced'
  | 'bestQuality';

export type ModelCostTier = 'upToHalf' | 'halfToOne' | 'oneToFour' | 'overFour';

export const MODEL_CAPABILITY_TAG_LABEL_KEYS: Record<
  ModelCapabilityTag,
  keyof Dict
> = {
  standard: 'modelCapability.standard',
  advanced: 'modelCapability.advanced',
  bestQuality: 'modelCapability.bestQuality',
};

export const MODEL_CAPABILITY_TAG_DESCRIPTION_KEYS: Record<
  ModelCapabilityTag,
  keyof Dict
> = {
  standard: 'modelCapability.standardDescription',
  advanced: 'modelCapability.advancedDescription',
  bestQuality: 'modelCapability.bestQualityDescription',
};

export const MODEL_COST_TIER_LABEL_KEYS: Record<ModelCostTier, keyof Dict> = {
  upToHalf: 'modelCost.upToHalf',
  halfToOne: 'modelCost.halfToOne',
  oneToFour: 'modelCost.oneToFour',
  overFour: 'modelCost.overFour',
};

const NON_MODEL_IDS = new Set([
  '',
  'default',
  '__custom__',
  '__same_as_chat__',
]);

const BEST_QUALITY_MODELS = [
  'fable5',
  'opus4.8',
  'gpt5.5pro',
  'grok4.5',
  'gemini3.1-pro',
].map(compactModelName);

const ADVANCED_MODELS = [
  'opus4.7',
  'opus4.6',
  'sonnet5',
  'deepseek-v4-pro',
  'gpt-5.5',
  'kimi-k2.7-code',
  'qwen3.7-max',
  'glm-5.2',
].map(compactModelName);

export function getModelCapabilityTag(
  model: Pick<AgentModelOption, 'id' | 'label'>,
): ModelCapabilityTag | null {
  const haystack = getModelHaystack(model);
  if (!haystack) return null;

  const compact = compactModelName(haystack);
  if (BEST_QUALITY_MODELS.some((modelKey) => compact.includes(modelKey))) {
    return 'bestQuality';
  }
  if (ADVANCED_MODELS.some((modelKey) => compact.includes(modelKey))) {
    return 'advanced';
  }
  return 'standard';
}

export function getModelCostTier(
  model: Pick<AgentModelOption, 'id' | 'label' | 'inputPriceUsdPerMillion'>,
): ModelCostTier | null {
  const inputPrice = model.inputPriceUsdPerMillion;
  if (typeof inputPrice !== 'number' || !Number.isFinite(inputPrice) || inputPrice < 0) {
    return null;
  }
  if (inputPrice <= 0.5) return 'upToHalf';
  if (inputPrice <= 1) return 'halfToOne';
  if (inputPrice <= 4) return 'oneToFour';
  return 'overFour';
}

function getModelHaystack(
  model: Pick<AgentModelOption, 'id' | 'label'>,
): string | null {
  const id = model.id.trim().toLowerCase();
  if (NON_MODEL_IDS.has(id)) return null;

  const label = model.label.trim().toLowerCase();
  return `${id} ${label}`.replace(/[_/]+/g, '-');
}

function compactModelName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}
