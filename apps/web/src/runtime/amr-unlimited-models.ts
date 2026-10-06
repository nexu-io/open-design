function normalize(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? '';
}

export type PlanUnlimitedTier = 'go' | 'plus' | 'pro' | 'max';

/**
 * Highest tier first. A plan id carries exactly one tier word today, but
 * resolving from the top means an id that somehow carries two can only ever be
 * read as the tier the user already paid more for, never less.
 */
const TIER_ORDER: readonly PlanUnlimitedTier[] = ['max', 'pro', 'plus', 'go'];

/** Legacy label helper only. This never establishes model coverage or quota.
 * Team seats have Coding Plan pools too; exact eligibility comes from preflight.
 */
export function planUnlimitedTier(
  rawTier: string | null | undefined,
): PlanUnlimitedTier | null {
  const normalized = normalize(rawTier);
  if (!normalized) return null;
  const segments = new Set(normalized.split(/[_\-\s]+/).filter(Boolean));
  return TIER_ORDER.find((tier) => segments.has(tier)) ?? null;
}
