export type PersonalPlanTier = 'go' | 'plus' | 'pro' | 'max';
export type PersonalBillingInterval = 'monthly' | 'yearly';

export interface PersonalPlanState {
  tier: PersonalPlanTier;
  interval: PersonalBillingInterval;
}

export interface PendingPersonalPlanChange {
  tier: PersonalPlanTier;
  interval: PersonalBillingInterval;
  effectiveAt: string | null;
}

export interface PersonalPricingContext {
  current: PersonalPlanState | null;
  checkoutAllowed: boolean;
  firstMonthIntroEligible: boolean;
  cancelAtPeriodEnd: boolean;
  pendingChange: PendingPersonalPlanChange | null;
  billingPortalAvailable: boolean;
}

export type PersonalPlanActionKind =
  | 'interval_upgrade'
  | 'dual_change'
  | 'checkout_unavailable'
  | 'new_checkout'
  | 'current'
  | 'upgrade'
  | 'downgrade_unavailable'
  | 'scheduled'
  | 'current_canceling'
  | 'interval_downgrade_unavailable';

export interface PersonalPlanAction {
  kind: PersonalPlanActionKind;
  enabled: boolean;
}

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

export function personalPlanRelation(
  candidateTier: string,
  currentTier: PersonalPlanTier,
): 'lower' | 'current' | 'higher' | null {
  const candidateIndex = PERSONAL_PLAN_ORDER.indexOf(
    candidateTier as PersonalPlanTier,
  );
  if (candidateIndex < 0) return null;
  const currentIndex = PERSONAL_PLAN_ORDER.indexOf(currentTier);
  if (candidateIndex < currentIndex) return 'lower';
  if (candidateIndex === currentIndex) return 'current';
  return 'higher';
}

export function resolvePersonalPlanAction(
  context: PersonalPricingContext,
  target: PersonalPlanState,
): PersonalPlanAction {
  if (!context.current && !context.checkoutAllowed) {
    return { kind: 'checkout_unavailable', enabled: false };
  }
  if (!context.current) {
    return { kind: 'new_checkout', enabled: true };
  }
  if (
    context.pendingChange?.tier === target.tier &&
    context.pendingChange.interval === target.interval
  ) {
    return { kind: 'scheduled', enabled: false };
  }
  if (
    context.current.tier === target.tier &&
    context.current.interval === target.interval
  ) {
    return {
      kind: context.cancelAtPeriodEnd ? 'current_canceling' : 'current',
      enabled: false,
    };
  }
  if (
    context.current?.tier === target.tier &&
    context.current.interval === 'monthly' &&
    target.interval === 'yearly'
  ) {
    return { kind: 'interval_upgrade', enabled: true };
  }
  if (
    context.current.tier === target.tier &&
    context.current.interval === 'yearly' &&
    target.interval === 'monthly'
  ) {
    return { kind: 'interval_downgrade_unavailable', enabled: false };
  }
  if (personalPlanRelation(target.tier, context.current.tier) === 'lower') {
    return { kind: 'downgrade_unavailable', enabled: false };
  }
  if (
    context.current &&
    context.current.tier !== target.tier &&
    context.current.interval !== target.interval
  ) {
    return { kind: 'dual_change', enabled: false };
  }
  if (personalPlanRelation(target.tier, context.current.tier) === 'higher') {
    return { kind: 'upgrade', enabled: true };
  }
  throw new Error('unsupported_personal_plan_action');
}

function personalPlanTier(value: unknown): PersonalPlanTier | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase().replace(/_(monthly|yearly)$/, '');
  return PERSONAL_PLAN_TIERS.has(normalized as PersonalPlanTier)
    ? (normalized as PersonalPlanTier)
    : null;
}

function billingInterval(value: unknown): PersonalBillingInterval | null {
  return value === 'monthly' || value === 'yearly' ? value : null;
}

function pendingPersonalPlanChange(value: unknown): PendingPersonalPlanChange | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Record<string, unknown>;
  const tier = personalPlanTier(record.targetMembershipTier);
  const interval = billingInterval(record.targetBillingInterval);
  if (!tier || !interval || record.status !== 'scheduled') return null;
  return {
    tier,
    interval,
    effectiveAt: typeof record.effectiveAt === 'string' ? record.effectiveAt : null,
  };
}

function usablePersonalPlan(summary: Record<string, unknown>): PersonalPlanState | null {
  const tier = personalPlanTier(summary.membershipTier);
  const interval = billingInterval(summary.billingInterval);
  if (!tier || !interval) return null;
  if (
    summary.subscriptionStatus === 'canceled' ||
    summary.subscriptionEntitlementStatus === 'inactive' ||
    summary.subscriptionEntitlementStatus === 'canceled'
  ) {
    return null;
  }
  return { tier, interval };
}

/**
 * Resolve the signed-in account's Personal pricing state. Failures and
 * signed-out visitors leave the static catalog unchanged; authenticated
 * visitors get the same tier/interval boundaries used by Vela checkout.
 */
export async function loadPersonalPricingContext(
  apiOrigin: string,
  fetcher: PricingFetch = fetch,
): Promise<PersonalPricingContext | null> {
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
    if (!summary || typeof summary !== 'object') return null;
    const record = summary as Record<string, unknown>;
    return {
      current: usablePersonalPlan(record),
      checkoutAllowed: record.personalSubscriptionCheckoutAllowed !== false,
      firstMonthIntroEligible: record.firstMonthIntroEligible === true,
      cancelAtPeriodEnd: record.subscriptionCancelAtPeriodEnd === true,
      pendingChange: pendingPersonalPlanChange(record.pendingSubscriptionChange),
      billingPortalAvailable:
        Array.isArray(record.availableActions) &&
        record.availableActions.includes('billing_portal'),
    };
  } catch {
    return null;
  }
}

export async function loadCurrentPersonalPlanTier(
  apiOrigin: string,
  fetcher: PricingFetch = fetch,
): Promise<PersonalPlanTier | null> {
  return (await loadPersonalPricingContext(apiOrigin, fetcher))?.current?.tier ?? null;
}
