/**
 * Which hosted models a subscription tier may call WITHOUT spending wallet
 * credits — the 「无限使用」 set the public Pricing page promises per tier.
 *
 * Two features read this one table and they ask slightly different questions:
 *  • the balance preflight (`amr-balance-gate`) asks whether it may stand down,
 *    via {@link isUnlimitedAmrModelForPlan}, which matches the personal ladder
 *    exactly — Team workspaces spend their own balance and deliberately do not
 *    inherit the personal answer (#7187);
 *  • the model switcher's badge asks what to mark on screen, via
 *    {@link isUnlimitedModelForPlanTier}, which reads the tier out of a
 *    personal ladder only — see {@link planUnlimitedTier} for why a Team plan
 *    is not the same question.
 *
 * Keeping both on one table is the point: the sets are a product promise, and
 * a second copy would drift. The Pricing page's own `unlimitedByTier`
 * (`apps/landing-page/app/_components/pricing-individual-plans.astro`) is
 * pinned to this file by `e2e/tests/pricing-unlimited-models.test.ts`.
 */
const GO_UNLIMITED_MODELS = [
  'deepseek-v4-flash-vision-exp',
  'deepseek-v4-flash',
  'deepseek-v4-pro',
  'glm-5.2',
] as const;

const PLUS_UNLIMITED_MODELS = [
  ...GO_UNLIMITED_MODELS,
  'kimi-k2.7-code',
] as const;

const PRO_UNLIMITED_MODELS = [
  'deepseek-v4-flash-vision-exp',
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

export type PlanUnlimitedTier = 'go' | 'plus' | 'pro' | 'max';

/**
 * Highest tier first. A plan id carries exactly one tier word today, but
 * resolving from the top means an id that somehow carries two can only ever be
 * read as the tier the user already paid more for, never less.
 */
const TIER_ORDER: readonly PlanUnlimitedTier[] = ['max', 'pro', 'plus', 'go'];

/**
 * The unlimited-models tier a raw vela plan id belongs to, or null when the id
 * names no tier that carries an unlimited set — `free`, the empty string
 * billing reports before it has answered, and every TEAM plan.
 *
 * Team is excluded on evidence, not on tidiness. "Team plans are paid too" is
 * the wrong test; the question is whether the plan funds usage without
 * touching the wallet, and vela's schema answers no: in-plan usage is recorded
 * through the `coding_plan` billing mode, constrained to
 * `membership_tier_snapshot = ANY (ARRAY['go','plus','pro','max'])`, so a Team
 * workspace never produces a zero-charge call. `team_basic` is seats-only on
 * top of that (`monthly_credits_per_seat = 0` in the seeded catalog). The
 * balance preflight above already refuses to stand down for Team, and a badge
 * promising what the preflight then blocks is worse than no badge.
 *
 * The tier is read off the id's SEGMENTS rather than by substring: substring
 * matching is what made an earlier plan-badge rule answer `plus` for
 * "Team Plus", which is exactly the confusion this function must not repeat.
 */
export function planUnlimitedTier(
  rawTier: string | null | undefined,
): PlanUnlimitedTier | null {
  const normalized = normalize(rawTier);
  if (!normalized) return null;
  const segments = new Set(normalized.split(/[_\-\s]+/).filter(Boolean));
  if (segments.has('team')) return null;
  return TIER_ORDER.find((tier) => segments.has(tier)) ?? null;
}

/**
 * Whether this model is unlimited on this plan — the question the 「无限使用」
 * badge asks, for personal and team ladders alike.
 *
 * Fails closed on an unknown tier: billing that has not answered yet knows
 * nothing, and promising unlimited use that then disappears is worse than one
 * late paint. A provider-prefixed model id (`deepseek/deepseek-v4-pro`, a shape
 * the AMR model list has carried before) is compared by its last segment.
 */
export function isUnlimitedModelForPlanTier(
  modelId: string | null | undefined,
  rawTier: string | null | undefined,
): boolean {
  const tier = planUnlimitedTier(rawTier);
  if (!tier) return false;
  const normalized = normalize(modelId);
  if (!normalized) return false;
  const slug = normalized.slice(normalized.lastIndexOf('/') + 1);
  return UNLIMITED_MODELS_BY_PLAN[tier]?.has(slug) ?? false;
}
