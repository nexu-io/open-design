import type { Dict } from '../i18n/types';
import type { AgentModelOption } from '../types';

export type ModelCapabilityTag =
  | 'fast'
  | 'value'
  | 'balanced'
  | 'reasoning'
  | 'premium'
  | 'coding';

export type ModelCostTier = 'upToHalf' | 'halfToOne' | 'oneToFour' | 'overFour';

export const MODEL_CAPABILITY_TAG_LABEL_KEYS: Record<
  ModelCapabilityTag,
  keyof Dict
> = {
  fast: 'modelCapability.fast',
  value: 'modelCapability.value',
  balanced: 'modelCapability.balanced',
  reasoning: 'modelCapability.reasoning',
  premium: 'modelCapability.premium',
  coding: 'modelCapability.coding',
};

export const MODEL_CAPABILITY_TAG_DESCRIPTION_KEYS: Record<
  ModelCapabilityTag,
  keyof Dict
> = {
  fast: 'modelCapability.fastDescription',
  value: 'modelCapability.valueDescription',
  balanced: 'modelCapability.balancedDescription',
  reasoning: 'modelCapability.reasoningDescription',
  premium: 'modelCapability.premiumDescription',
  coding: 'modelCapability.codingDescription',
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

const KNOWN_MODEL_FAMILIES = [
  'claude',
  'codex',
  'command',
  'deepseek',
  'doubao',
  'ernie',
  'gemini',
  'glm',
  'gpt',
  'grok',
  'kimi',
  'llama',
  'mimo',
  'minimax',
  'mistral',
  'mixtral',
  'o1',
  'o3',
  'o4',
  'qwen',
];

export function getModelCapabilityTag(
  model: Pick<AgentModelOption, 'id' | 'label'>,
): ModelCapabilityTag | null {
  const haystack = getModelHaystack(model);
  if (!haystack) return null;

  if (/(^|[-\s])(codex|coder?|coding|codestral)([-\s]|$)|[-\s]k2\.7-code\b/.test(haystack)) {
    return 'coding';
  }
  if (/(^|[-\s])(o1|o3|o4|r1|reasoner|reasoning|thinking)([-\s]|$)/.test(haystack)) {
    return 'reasoning';
  }
  if (/(^|[-\s])(flash|haiku|instant|turbo)([-\s]|$)/.test(haystack)) {
    return 'fast';
  }
  if (/(^|[-\s])(mini|nano|lite|small|oss|air)([-\s]|$)/.test(haystack)) {
    return 'value';
  }
  if (/(^|[-\s])(fable|opus|pro|ultra|max)([-\s]|$)|\bgpt-5\b/.test(haystack)) {
    return 'premium';
  }
  return 'balanced';
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
  const haystack = `${id} ${label}`.replace(/[_/]+/g, '-');
  return isLikelyModelName(haystack) ? haystack : null;
}

function isLikelyModelName(value: string): boolean {
  return KNOWN_MODEL_FAMILIES.some((family) =>
    new RegExp(`(^|[-\\s])${escapeRegExp(family)}([-\\s.]|$)`).test(value),
  );
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
