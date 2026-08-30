import {
  PERSONAL_PRICING_TIERS,
  postPricingBridgeEvents,
  type PlanExposureInput,
  type PricingBridgeEvent,
  type PricingBridgeSource,
  type PricingClickInput,
} from './pricing-analytics-bridge';
import type {
  BillingInterval,
  PlanTier,
  PlanTierConfig,
} from './pricing';

export type ResolvedPricingContext = {
  authenticated: true;
  sourceSurface: PricingBridgeSource;
  currentPlanId: PlanTier | null;
  currentBillingInterval: BillingInterval | null;
  firstMonthEligible: boolean;
};

type PersonalExposureInput = {
  audience: 'creator' | 'team';
  interval: BillingInterval;
};

type IntervalChangeInput = Omit<PersonalExposureInput, 'interval'> & {
  currentInterval: BillingInterval;
  targetInterval: BillingInterval;
  userInitiated: boolean;
};

type PlanClickInput = {
  audience: 'creator' | 'team';
  planId: string;
  interval: BillingInterval;
  enabled: boolean;
};

type CompatibilityTransport = typeof postPricingBridgeEvents;

type PricingCompatibilityOptions = {
  apiOrigin?: string;
  sessionId?: string;
  tiers?: readonly PlanTierConfig[];
  postEvents?: CompatibilityTransport;
  now?: () => Date;
  createEventId?: () => string;
};

let fallbackEventSequence = 0;

function defaultEventId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  fallbackEventSequence += 1;
  return `pricing-${Date.now()}-${fallbackEventSequence}`;
}

function personalPlanFacts(
  tier: PlanTierConfig,
  interval: BillingInterval,
  firstMonthEligible: boolean,
) {
  const introOfferApplied =
    firstMonthEligible && interval === 'monthly';
  const priceUsd = interval === 'monthly'
    ? introOfferApplied
      ? tier.monthly.introPriceUsd
      : tier.monthly.priceUsd
    : tier.yearly.priceUsd;
  const creditsGrantedUsd = interval === 'monthly'
    ? tier.monthly.grantUsd
    : tier.yearly.grantUsd / 12;

  return {
    priceUsd: priceUsd.toFixed(2),
    creditsGrantedUsd: creditsGrantedUsd.toFixed(2),
    introOfferApplied,
  } as const;
}

function recommendedPlan(currentPlanId: PlanTier | null): PlanTier | null {
  if (currentPlanId === 'max') return null;
  return currentPlanId === 'pro' ? 'max' : 'pro';
}

export function createPricingCompatibilityAnalytics({
  apiOrigin = '',
  sessionId = '',
  tiers = PERSONAL_PRICING_TIERS,
  postEvents = postPricingBridgeEvents,
  now = () => new Date(),
  createEventId = defaultEventId,
}: PricingCompatibilityOptions) {
  let context: ResolvedPricingContext | null = null;
  let lastExposureSignature: string | null = null;

  const createEvent = <T extends PricingBridgeEvent['kind']>(
    kind: T,
    payload: T extends 'plan_exposure' ? PlanExposureInput : PricingClickInput,
  ): Extract<PricingBridgeEvent, { kind: T }> => ({
    kind,
    eventId: createEventId(),
    eventTime: now().toISOString(),
    payload,
  }) as Extract<PricingBridgeEvent, { kind: T }>;

  const emit = (bridgeEvents: readonly PricingBridgeEvent[]) => {
    if (!context || bridgeEvents.length === 0) return;
    try {
      void Promise.resolve(postEvents({
        apiOrigin,
        sourceSurface: context.sourceSurface,
        sessionId,
        events: bridgeEvents,
      })).catch(() => undefined);
    } catch {
      // Compatibility delivery is best effort and must not block the action.
    }
  };

  const exposureEvents = (
    input: PersonalExposureInput,
  ): PricingBridgeEvent[] => {
    const resolved = context;
    if (!resolved) return [];
    if (input.audience === 'team') {
      lastExposureSignature = null;
      return [];
    }

    const signature = JSON.stringify([
      input.audience,
      input.interval,
      resolved.firstMonthEligible,
      resolved.currentPlanId,
      resolved.currentBillingInterval,
    ]);
    if (lastExposureSignature === signature) return [];
    lastExposureSignature = signature;

    return tiers.map((tier) => {
      const facts = personalPlanFacts(
        tier,
        input.interval,
        resolved.firstMonthEligible,
      );
      return createEvent('plan_exposure', {
        planId: tier.tier,
        billingInterval: input.interval,
        priceUsd: facts.priceUsd,
        creditsGrantedUsd: facts.creditsGrantedUsd,
        deployLimit: tier.deployLimit,
        introOfferApplied: facts.introOfferApplied,
        firstMonthEligible: resolved.firstMonthEligible,
        isCurrentPlan:
          resolved.currentPlanId === tier.tier &&
          resolved.currentBillingInterval === input.interval,
        isRecommended: tier.tier === recommendedPlan(resolved.currentPlanId),
      });
    });
  };

  const exposePlans = (input: PersonalExposureInput) => {
    emit(exposureEvents(input));
  };

  const changeInterval = (input: IntervalChangeInput) => {
    if (!context) return;
    const bridgeEvents: PricingBridgeEvent[] = [];
    if (
      input.audience === 'creator' &&
      input.userInitiated &&
      input.currentInterval !== input.targetInterval
    ) {
      bridgeEvents.push(createEvent('pricing_click', {
        element: 'change_interval',
        currentPlanId: context.currentPlanId,
        currentBillingInterval: input.currentInterval,
        targetBillingInterval: input.targetInterval,
      }));
    }
    bridgeEvents.push(...exposureEvents({
      audience: input.audience,
      interval: input.targetInterval,
    }));
    emit(bridgeEvents);
  };

  const clickPlan = (input: PlanClickInput) => {
    if (!context || input.audience !== 'creator' || !input.enabled) return;
    const tier = tiers.find((candidate) => candidate.tier === input.planId);
    if (!tier) return;

    const facts = personalPlanFacts(
      tier,
      input.interval,
      context.firstMonthEligible,
    );
    const common = {
      currentBillingInterval: context.currentBillingInterval,
      targetPlanId: tier.tier,
      targetBillingInterval: input.interval,
      priceUsd: facts.priceUsd,
      creditsGrantedUsd: facts.creditsGrantedUsd,
      introOfferApplied: facts.introOfferApplied,
      isCurrentPlan:
        context.currentPlanId === tier.tier &&
        context.currentBillingInterval === input.interval,
      isRecommended: tier.tier === recommendedPlan(context.currentPlanId),
    } as const;
    const payload: PricingClickInput = context.currentPlanId === null
      ? {
          element: 'subscribe_now',
          currentPlanId: null,
          ...common,
        }
      : {
          element: 'upgrade_now',
          currentPlanId: context.currentPlanId,
          ...common,
        };
    emit([createEvent('pricing_click', payload)]);
  };

  const enterpriseClick = (
    element: 'request_team_access' | 'team_lead_submit',
  ) => {
    if (!context) return;
    const enterpriseContext = {
      currentPlanId: context.currentPlanId,
      currentBillingInterval: context.currentBillingInterval,
    } as const;
    const payload: PricingClickInput = element === 'request_team_access'
      ? { element: 'request_team_access', ...enterpriseContext }
      : { element: 'team_lead_submit', ...enterpriseContext };
    emit([createEvent('pricing_click', payload)]);
  };

  return {
    resolveContext(resolved: ResolvedPricingContext) {
      if (resolved?.authenticated === true) context = resolved;
    },
    exposePlans,
    changeInterval,
    clickPlan,
    openEnterpriseLead: () => enterpriseClick('request_team_access'),
    submitEnterpriseLead: () => enterpriseClick('team_lead_submit'),
  };
}
