import type { Dict } from '../i18n/types';
import type { AgentModelOption } from '../types';

export type ModelCapabilityTag =
  | 'standard'
  | 'advanced'
  | 'bestQuality';

export type ModelCostTier = 'low' | 'medium' | 'high' | 'very_high';

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
  low: 'modelCost.upToHalf',
  medium: 'modelCost.halfToOne',
  high: 'modelCost.oneToFour',
  very_high: 'modelCost.overFour',
};

const NON_MODEL_IDS = new Set([
  '',
  'default',
  '__custom__',
  '__same_as_chat__',
]);

export function getModelCapabilityTag(
  model: Pick<AgentModelOption, 'id' | 'metadata'>,
): ModelCapabilityTag | null {
  if (isNonModelId(model.id)) return null;
  const capability = model.metadata?.capability;
  if (capability === 'best_quality') return 'bestQuality';
  if (capability === 'advanced') return 'advanced';
  if (capability === 'standard') return 'standard';
  return null;
}

export function getModelCostTier(
  model: Pick<AgentModelOption, 'id' | 'metadata'>,
): ModelCostTier | null {
  if (isNonModelId(model.id)) return null;
  const cost = model.metadata?.cost;
  if (cost === 'low' || cost === 'medium' || cost === 'high' || cost === 'very_high') {
    return cost;
  }
  return null;
}

function isNonModelId(id: string): boolean {
  return NON_MODEL_IDS.has(id.trim().toLowerCase());
}
