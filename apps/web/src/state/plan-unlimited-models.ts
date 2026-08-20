/**
 * Which hosted models a subscription tier may call WITHOUT spending wallet
 * credits — the 「无限使用」 set the public Pricing page promises per tier.
 *
 * The authority for this table is the Pricing page's own `unlimitedByTier`
 * (`apps/landing-page/app/_components/pricing-individual-plans.astro`). The two
 * live in different apps on purpose — the marketing site owns display names and
 * its own art, the runtime owns AMR model ids — and they are pinned together by
 * `e2e/tests/pricing-unlimited-models.test.ts`, which goes red the moment
 * either side is edited alone.
 *
 * Model ids are the AMR (vela) slugs the model switcher actually receives.
 */
export type PlanUnlimitedTier = 'go' | 'plus' | 'pro' | 'max';

/** Every popular model the Pricing page lists, in its display order. */
export const POPULAR_MODEL_IDS = [
  'deepseek-v4-flash',
  'glm-5.2',
  'kimi-k2.7-code',
  'deepseek-v4-pro',
  'minimax-m2.7',
  'kimi-k2.6',
  'mimo-v2.5-pro',
  'glm-5.1',
] as const;

export const PLAN_UNLIMITED_MODEL_IDS: Record<PlanUnlimitedTier, readonly string[]> = {
  go: ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2'],
  plus: ['deepseek-v4-flash', 'deepseek-v4-pro', 'glm-5.2', 'kimi-k2.7-code'],
  pro: [
    'deepseek-v4-flash',
    'deepseek-v4-pro',
    'glm-5.2',
    'kimi-k2.7-code',
    'mimo-v2.5-pro',
  ],
  max: [...POPULAR_MODEL_IDS],
};

/**
 * Highest tier first. A plan id carries exactly one tier word today, but
 * resolving from the top means an id that somehow carries two can only ever be
 * over-credited toward the tier the user already paid more for, never under.
 */
const TIER_ORDER: readonly PlanUnlimitedTier[] = ['max', 'pro', 'plus', 'go'];

/**
 * The unlimited-models tier a raw vela plan id belongs to, or null when the id
 * names no tier that carries an unlimited set (`free`, `team_basic`, an empty
 * string billing has not answered yet).
 *
 * Team plans are namespaced ids on their own ladder (`team_plus`,
 * `team_max_yearly`), so the tier is read off the id's SEGMENTS rather than by
 * comparing the whole string — matching how `isTopPlanTier` in
 * `collab/team-plan.ts` derives MAX. Substring matching is deliberately not
 * used: it is what made an earlier plan-badge rule answer `plus` for
 * "Team Plus" before the team branch could run.
 */
export function planUnlimitedTier(rawTier?: string | null): PlanUnlimitedTier | null {
  const normalized = rawTier?.trim().toLowerCase() ?? '';
  if (!normalized) return null;
  const segments = new Set(normalized.split(/[_\-\s]+/).filter(Boolean));
  return TIER_ORDER.find((tier) => segments.has(tier)) ?? null;
}

/** The unlimited model ids for a raw plan id; empty when the tier has none. */
export function unlimitedModelIdsForPlanTier(
  rawTier?: string | null,
): readonly string[] {
  const tier = planUnlimitedTier(rawTier);
  return tier ? PLAN_UNLIMITED_MODEL_IDS[tier] : [];
}

/**
 * Model ids reach the client as bare vela slugs, but a provider-prefixed form
 * (`deepseek/deepseek-v4-pro`) is a shape the AMR model list has carried
 * before, so the last path segment is what gets compared.
 */
function normalizeModelId(modelId?: string | null): string {
  const trimmed = modelId?.trim().toLowerCase() ?? '';
  if (!trimmed) return '';
  const lastSlash = trimmed.lastIndexOf('/');
  return lastSlash === -1 ? trimmed : trimmed.slice(lastSlash + 1);
}

/**
 * Whether this model is unlimited on this plan — the single question the
 * 「无限使用」 badge asks.
 *
 * Fails closed on an unknown tier: billing that has not answered yet knows
 * nothing, and promising unlimited use that then disappears is worse than one
 * late paint.
 */
export function isUnlimitedModelForPlanTier(
  modelId: string | null | undefined,
  rawTier: string | null | undefined,
): boolean {
  const normalized = normalizeModelId(modelId);
  if (!normalized) return false;
  return unlimitedModelIdsForPlanTier(rawTier).includes(normalized);
}
