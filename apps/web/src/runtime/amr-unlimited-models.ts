const GO_UNLIMITED_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'glm-5.2',
] as const;

const PLUS_UNLIMITED_MODELS = [
  ...GO_UNLIMITED_MODELS,
  'kimi-k2.7-code',
] as const;

const PRO_UNLIMITED_MODELS = [
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'glm-5.2',
  'kimi-k2.7-code',
  'mimo-v2.5-pro',
] as const;

const MAX_UNLIMITED_MODELS = [
  ...PRO_UNLIMITED_MODELS,
  'minimax-m2.7',
  'kimi-k2.6',
  'glm-5.1',
] as const;

// This table only decides whether the client-side balance preflight may
// stand down. Vela remains authoritative for plan access and usage limits.
const UNLIMITED_MODELS_BY_PLAN: Readonly<Record<string, ReadonlySet<string>>> = {
  go: new Set(GO_UNLIMITED_MODELS),
  plus: new Set(PLUS_UNLIMITED_MODELS),
  pro: new Set(PRO_UNLIMITED_MODELS),
  max: new Set(MAX_UNLIMITED_MODELS),
};

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export function isUnlimitedAmrModelForPlan(
  plan: string | null | undefined,
  modelId: string | null | undefined,
): boolean {
  const models = UNLIMITED_MODELS_BY_PLAN[normalize(plan)];
  return models?.has(normalize(modelId)) ?? false;
}
