/** Coding Plan model membership comes from Vela, never from a local tier table. */

function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

/**
 * Whether Vela's authoritative Coding Plan model list includes this model.
 * `null` means the list itself is unavailable and callers must choose their
 * own fail-open/fail-closed presentation behavior.
 */
export function codingPlanModelDecision(
  modelIds: readonly string[] | null | undefined,
  modelId: string | null | undefined,
): boolean | null {
  const normalized = normalize(modelId);
  if (!normalized) return false;
  if (!Array.isArray(modelIds)) return null;
  const slug = normalized.slice(normalized.lastIndexOf('/') + 1);
  return modelIds.some((candidate) => normalize(candidate) === slug);
}

export type PlanUnlimitedTier = 'go' | 'plus' | 'pro' | 'max';

/**
 * Highest tier first. A plan id carries exactly one tier word today, but
 * resolving from the top means an id that somehow carries two can only ever be
 * read as the tier the user already paid more for, never less.
 */
const TIER_ORDER: readonly PlanUnlimitedTier[] = ['max', 'pro', 'plus', 'go'];

/**
 * The Personal Coding Plan tier a raw Vela plan id belongs to, or null for
 * `free`, an unresolved billing response, and every Team plan.
 *
 * Team is excluded on evidence, not on tidiness. "Team plans are paid too" is
 * the wrong test; the question is whether the plan funds usage without
 * touching the wallet, and vela's schema answers no: in-plan usage is recorded
 * through the `coding_plan` billing mode, constrained to
 * `membership_tier_snapshot = ANY (ARRAY['go','plus','pro','max'])`, so a Team
 * workspace never produces a zero-charge call. `team_basic` is seats-only on
 * top of that (`monthly_credits_per_seat = 0` in the seeded catalog).
 *
 * The tier is read off the id's SEGMENTS rather than by substring: substring
 * matching is what made an earlier plan rule answer `plus` for "Team Plus",
 * which is exactly the confusion this function must not repeat.
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
