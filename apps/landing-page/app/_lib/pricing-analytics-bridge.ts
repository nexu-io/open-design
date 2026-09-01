import {
  GO_PLAN,
  HOSTED_CLOUD_CONSOLE_DOMAINS,
  PRICING_SNAPSHOT,
  type BillingInterval,
  type PlanTier,
  type PlanTierConfig,
} from './pricing';

export type PricingBridgeSource = 'wallet' | 'dashboard';

export type PlanExposureInput = {
  planId: PlanTier;
  billingInterval: BillingInterval;
  priceUsd: string;
  creditsGrantedUsd: string;
  deployLimit: number;
  introOfferApplied: boolean;
  firstMonthEligible: boolean;
  isCurrentPlan: boolean;
  isRecommended: boolean;
};

type ChangeIntervalClickInput = {
  element: 'change_interval';
  currentPlanId: PlanTier | null;
  currentBillingInterval: BillingInterval;
  targetBillingInterval: BillingInterval;
};

type PlanCtaClickFields = {
  currentBillingInterval: BillingInterval | null;
  targetPlanId: PlanTier;
  targetBillingInterval: BillingInterval;
  priceUsd: string;
  creditsGrantedUsd: string;
  introOfferApplied: boolean;
  isCurrentPlan: boolean;
  isRecommended: boolean;
};

type EnterpriseClickContext = {
  currentPlanId: PlanTier | null;
  currentBillingInterval: BillingInterval | null;
};

type EnterpriseClickInput =
  | (EnterpriseClickContext & { element: 'request_team_access' })
  | (EnterpriseClickContext & { element: 'team_lead_submit' });

export type PricingClickInput =
  | (PlanCtaClickFields & {
      element: 'subscribe_now';
      currentPlanId: null;
    })
  | (PlanCtaClickFields & {
      element: 'upgrade_now';
      currentPlanId: PlanTier;
    })
  | ChangeIntervalClickInput
  | EnterpriseClickInput;

export type PricingBridgeEvent =
  | {
      kind: 'plan_exposure';
      eventId: string;
      eventTime: string;
      payload: PlanExposureInput;
    }
  | {
      kind: 'pricing_click';
      eventId: string;
      eventTime: string;
      payload: PricingClickInput;
    };

const goTier: PlanTierConfig = {
  tier: GO_PLAN.tier,
  rank: 0,
  recommended: false,
  monthly: {
    priceUsd: GO_PLAN.monthly.priceUsd,
    introPriceUsd: GO_PLAN.monthly.introPriceUsd,
    grantUsd: 0,
  },
  yearly: {
    priceUsd: GO_PLAN.yearly.priceUsd,
    discountPct: 50,
    grantUsd: 0,
  },
  deployLimit: 0,
};

export const PERSONAL_PRICING_TIERS: readonly PlanTierConfig[] = [
  goTier,
  ...PRICING_SNAPSHOT.tiers,
];

const sourceOverrideKeys = [
  'sourceSurface',
  'source_surface',
  'workspaceTab',
  'workspace_tab',
  'pricingSource',
  'pricing_source',
  'source',
  'od_entry_source',
] as const;

const sourceByPath: Readonly<Record<string, PricingBridgeSource>> = {
  '/wallet': 'wallet',
  '/dashboard': 'dashboard',
  '/cloud/wallet': 'wallet',
  '/cloud/dashboard': 'dashboard',
};

function isTrustedHostedUrl(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.port.length === 0 &&
    HOSTED_CLOUD_CONSOLE_DOMAINS.some(
      (domain) =>
        url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  );
}

function isTrustedLoopbackUrl(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.port.length > 0
  );
}

/** Resolve only canonical Vela routes; query state never creates a surface. */
export function resolvePricingBridgeSource(input: {
  search: URLSearchParams;
  referrer: string;
}): PricingBridgeSource | null {
  if (sourceOverrideKeys.some((key) => input.search.has(key))) return null;
  if (!input.referrer) return null;

  try {
    const referrer = new URL(input.referrer);
    if (
      referrer.href !== input.referrer ||
      referrer.username ||
      referrer.password ||
      referrer.hash ||
      (!isTrustedHostedUrl(referrer) && !isTrustedLoopbackUrl(referrer))
    ) {
      return null;
    }
    return sourceByPath[referrer.pathname] ?? null;
  } catch {
    return null;
  }
}

const idMaxLength = 128;
const maxEventsPerRequest = 8;
const transportTimeoutMs = 3_000;
const usdAmountPattern = /^(?:0|[1-9][0-9]{0,8})\.[0-9]{2}$/u;
// Mirrors Zod 3.25 `z.string().datetime()` used by Vela: real calendar date,
// UTC Z suffix, optional seconds, and arbitrary fractional-second precision.
const velaDateTimePattern = new RegExp(
  '^((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))T([01]\\d|2[0-3]):[0-5]\\d(:[0-5]\\d(\\.\\d+)?)?Z$',
  'u',
);

function isBoundedId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= idMaxLength &&
    value.trim() === value
  );
}

function isPlanTier(value: unknown): value is PlanTier {
  return (
    value === 'go' ||
    value === 'plus' ||
    value === 'pro' ||
    value === 'max'
  );
}

function isBillingInterval(value: unknown): value is BillingInterval {
  return value === 'monthly' || value === 'yearly';
}

function isUsdAmount(value: unknown): value is string {
  return typeof value === 'string' && usdAmountPattern.test(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

function isVelaDateTime(value: unknown): value is string {
  return typeof value === 'string' && velaDateTimePattern.test(value);
}

function sanitizedPlanPayload(value: unknown): PlanExposureInput | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  if (
    !isPlanTier(payload.planId) ||
    !isBillingInterval(payload.billingInterval) ||
    !isUsdAmount(payload.priceUsd) ||
    !isUsdAmount(payload.creditsGrantedUsd) ||
    !Number.isSafeInteger(payload.deployLimit) ||
    Number(payload.deployLimit) < 0 ||
    !isBoolean(payload.introOfferApplied) ||
    !isBoolean(payload.firstMonthEligible) ||
    !isBoolean(payload.isCurrentPlan) ||
    !isBoolean(payload.isRecommended)
  ) {
    return null;
  }
  return {
    planId: payload.planId,
    billingInterval: payload.billingInterval,
    priceUsd: payload.priceUsd,
    creditsGrantedUsd: payload.creditsGrantedUsd,
    deployLimit: Number(payload.deployLimit),
    introOfferApplied: payload.introOfferApplied,
    firstMonthEligible: payload.firstMonthEligible,
    isCurrentPlan: payload.isCurrentPlan,
    isRecommended: payload.isRecommended,
  };
}

function sanitizedPlanCtaPayload(
  payload: Record<string, unknown>,
): PlanCtaClickFields | null {
  if (
    (payload.currentBillingInterval !== null &&
      !isBillingInterval(payload.currentBillingInterval)) ||
    !isPlanTier(payload.targetPlanId) ||
    !isBillingInterval(payload.targetBillingInterval) ||
    !isUsdAmount(payload.priceUsd) ||
    !isUsdAmount(payload.creditsGrantedUsd) ||
    !isBoolean(payload.introOfferApplied) ||
    !isBoolean(payload.isCurrentPlan) ||
    !isBoolean(payload.isRecommended)
  ) {
    return null;
  }
  return {
    currentBillingInterval: payload.currentBillingInterval,
    targetPlanId: payload.targetPlanId,
    targetBillingInterval: payload.targetBillingInterval,
    priceUsd: payload.priceUsd,
    creditsGrantedUsd: payload.creditsGrantedUsd,
    introOfferApplied: payload.introOfferApplied,
    isCurrentPlan: payload.isCurrentPlan,
    isRecommended: payload.isRecommended,
  };
}

function sanitizedClickPayload(value: unknown): PricingClickInput | null {
  if (!value || typeof value !== 'object') return null;
  const payload = value as Record<string, unknown>;
  switch (payload.element) {
    case 'change_interval':
      if (
        (payload.currentPlanId !== null && !isPlanTier(payload.currentPlanId)) ||
        !isBillingInterval(payload.currentBillingInterval) ||
        !isBillingInterval(payload.targetBillingInterval)
      ) {
        return null;
      }
      return {
        element: 'change_interval',
        currentPlanId: payload.currentPlanId,
        currentBillingInterval: payload.currentBillingInterval,
        targetBillingInterval: payload.targetBillingInterval,
      };
    case 'subscribe_now': {
      const fields = sanitizedPlanCtaPayload(payload);
      if (payload.currentPlanId !== null || !fields) return null;
      return { element: 'subscribe_now', currentPlanId: null, ...fields };
    }
    case 'upgrade_now': {
      const fields = sanitizedPlanCtaPayload(payload);
      if (!isPlanTier(payload.currentPlanId) || !fields) return null;
      return {
        element: 'upgrade_now',
        currentPlanId: payload.currentPlanId,
        ...fields,
      };
    }
    case 'request_team_access':
      if (
        (payload.currentPlanId !== null && !isPlanTier(payload.currentPlanId)) ||
        (payload.currentBillingInterval !== null &&
          !isBillingInterval(payload.currentBillingInterval))
      ) {
        return null;
      }
      return {
        element: 'request_team_access',
        currentPlanId: payload.currentPlanId,
        currentBillingInterval: payload.currentBillingInterval,
      };
    case 'team_lead_submit':
      if (
        (payload.currentPlanId !== null && !isPlanTier(payload.currentPlanId)) ||
        (payload.currentBillingInterval !== null &&
          !isBillingInterval(payload.currentBillingInterval))
      ) {
        return null;
      }
      return {
        element: 'team_lead_submit',
        currentPlanId: payload.currentPlanId,
        currentBillingInterval: payload.currentBillingInterval,
      };
    default:
      return null;
  }
}

function sanitizedEvent(event: PricingBridgeEvent): PricingBridgeEvent | null {
  if (
    !isBoundedId(event.eventId) ||
    !isVelaDateTime(event.eventTime)
  ) {
    return null;
  }
  if (event.kind === 'plan_exposure') {
    const payload = sanitizedPlanPayload(event.payload);
    return payload
      ? {
          kind: event.kind,
          eventId: event.eventId,
          eventTime: event.eventTime,
          payload,
        }
      : null;
  }
  if (event.kind === 'pricing_click') {
    const payload = sanitizedClickPayload(event.payload);
    return payload
      ? {
          kind: event.kind,
          eventId: event.eventId,
          eventTime: event.eventTime,
          payload,
        }
      : null;
  }
  return null;
}

function resolveApiBase(rawValue: string): URL | null {
  const value = rawValue.trim();
  if (!value) return null;
  try {
    const url = new URL(value.endsWith('/') ? value : `${value}/`);
    if (url.username || url.password || url.search || url.hash) return null;
    const hosted = isTrustedHostedUrl(url) && url.pathname.endsWith('/');
    const loopback = isTrustedLoopbackUrl(url) && url.pathname === '/';
    return hosted || loopback ? url : null;
  } catch {
    return null;
  }
}

/** Best-effort authenticated transport. Invalid input and failures never throw. */
export async function postPricingBridgeEvents(input: {
  apiOrigin: string;
  sourceSurface: PricingBridgeSource;
  sessionId: string;
  events: readonly PricingBridgeEvent[];
  fetcher?: typeof fetch;
}): Promise<boolean> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const apiBase = resolveApiBase(input.apiOrigin);
    if (
      !apiBase ||
      (input.sourceSurface !== 'wallet' &&
        input.sourceSurface !== 'dashboard') ||
      !isBoundedId(input.sessionId) ||
      !Array.isArray(input.events) ||
      input.events.length < 1 ||
      input.events.length > maxEventsPerRequest
    ) {
      return false;
    }

    const events: PricingBridgeEvent[] = [];
    const eventIds = new Set<string>();
    for (const event of input.events) {
      const sanitized = sanitizedEvent(event);
      if (!sanitized || eventIds.has(sanitized.eventId)) return false;
      eventIds.add(sanitized.eventId);
      events.push(sanitized);
    }

    const abortController = new AbortController();
    timeout = setTimeout(
      () => abortController.abort(),
      transportTimeoutMs,
    );
    const response = await (input.fetcher ?? fetch)(
      new URL('api/v1/analytics/pricing-events', apiBase),
      {
        method: 'POST',
        credentials: 'include',
        keepalive: true,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceSurface: input.sourceSurface,
          sessionId: input.sessionId,
          events,
        }),
        signal: abortController.signal,
      },
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}
