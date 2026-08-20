export type PersonalPlanTier = 'go' | 'plus' | 'pro' | 'max';

type PricingFetch = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const PERSONAL_PLAN_TIERS = new Set<PersonalPlanTier>([
  'go',
  'plus',
  'pro',
  'max',
]);
const PERSONAL_PLAN_ORDER: readonly PersonalPlanTier[] = [
  'go',
  'plus',
  'pro',
  'max',
];

export function isPersonalPlanAtOrBelow(
  candidateTier: string,
  currentTier: PersonalPlanTier,
): boolean {
  const candidateIndex = PERSONAL_PLAN_ORDER.indexOf(
    candidateTier as PersonalPlanTier,
  );
  return (
    candidateIndex >= 0 &&
    candidateIndex <= PERSONAL_PLAN_ORDER.indexOf(currentTier)
  );
}

function personalPlanTier(value: unknown): PersonalPlanTier | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/_(monthly|yearly)$/, '');
  return PERSONAL_PLAN_TIERS.has(normalized as PersonalPlanTier)
    ? (normalized as PersonalPlanTier)
    : null;
}

/**
 * Resolve only the signed-in account's personal subscription tier. Landing
 * remains a static comparison surface: failures, signed-out visitors, and
 * workspace/team plans leave every CTA exactly as rendered at build time.
 */
export async function loadCurrentPersonalPlanTier(
  apiOrigin: string,
  fetcher: PricingFetch = fetch,
): Promise<PersonalPlanTier | null> {
  const origin = apiOrigin.trim().replace(/\/+$/, '');
  if (!origin) return null;

  try {
    const sessionResponse = await fetcher(`${origin}/api/auth/get-session`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!sessionResponse.ok) return null;
    const session = await sessionResponse.json();
    if (!session?.user) return null;

    const billingResponse = await fetcher(`${origin}/api/v1/billing/summary`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!billingResponse.ok) return null;
    const summary = await billingResponse.json();
    return personalPlanTier(summary?.membershipTier);
  } catch {
    return null;
  }
}
