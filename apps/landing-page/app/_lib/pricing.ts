/*
 * Pricing contract + static contract mirror for the /pricing/ page.
 *
 * The /pricing/ page renders `PRICING_SNAPSHOT` at build time for SEO and
 * first paint. A public JSON contract at `PLANS_JSON_URL` mirrors the same
 * shape for client-side reconciliation and smoke checks.
 *
 * Keep `PRICING_SNAPSHOT` and `public/pricing/plans.json` in lockstep until
 * OpenDesign Cloud exposes an external JSON contract that can replace this
 * static landing-page contract.
 */

export type PlanTier = 'go' | 'plus' | 'pro' | 'max';
export type TeamPlanTier =
  | 'team_basic'
  | 'team_plus'
  | 'team_pro'
  | 'team_max';
export type BillingInterval = 'monthly' | 'yearly';

export interface PlanMonthlyConfig {
  /** Standard recurring monthly price, USD major units. */
  priceUsd: number;
  /** First-month introductory price, USD major units. */
  introPriceUsd: number;
  /** Usage credit granted each month, USD major units. */
  grantUsd: number;
}

export interface PlanYearlyConfig {
  /** Up-front annual price, USD major units. */
  priceUsd: number;
  /** Headline savings vs. paying monthly, percent. */
  discountPct: number;
  /** Usage credit granted across the year, USD major units. */
  grantUsd: number;
}

export interface PlanTierConfig {
  tier: PlanTier;
  rank: number;
  recommended: boolean;
  monthly: PlanMonthlyConfig;
  yearly: PlanYearlyConfig;
  /** Concurrent deploy / preview slots included. */
  deployLimit: number;
}

export interface TeamPlanIntervalConfig {
  /** Recurring per-seat price for the complete billing period. */
  priceUsd: number;
  /** Introductory per-seat price for the first billing period. */
  introPriceUsd: number;
}

export interface TeamPlanYearlyConfig extends TeamPlanIntervalConfig {
  /** Savings against twelve recurring monthly payments. */
  discountPct: number;
}

export interface TeamPlanTierConfig {
  tier: TeamPlanTier;
  rank: number;
  recommended: boolean;
  minSeats: number;
  /** Model-credit allowance granted to each seat every month. */
  monthlyCreditsPerSeatUsd: number;
  monthly: TeamPlanIntervalConfig;
  yearly: TeamPlanYearlyConfig;
}

export interface PricingContract {
  /** Contract version; bump in vela when the shape changes. */
  version: number;
  currency: 'USD';
  /** Per-deploy overage price once `deployLimit` is exceeded, USD. */
  overageDeployPriceUsd: number;
  tiers: PlanTierConfig[];
  teamTiers: TeamPlanTierConfig[];
}

/** Query parameter carrying the Cloud Console deployment that opened Pricing. */
export const CLOUD_CONSOLE_BASE_PARAM = 'cloud_console_base';

/** Production Cloud Console used for direct public Pricing visits. */
export const DEFAULT_CLOUD_CONSOLE_BASE_URL = 'https://open-design.ai/cloud/';

/** Hosted domains (including their subdomains) allowed to receive a Pricing handoff. */
export const HOSTED_CLOUD_CONSOLE_DOMAINS = [
  'open-design.ai',
  'powerformer.net',
] as const;

function isHostedCloudConsole(url: URL): boolean {
  return (
    url.protocol === 'https:' &&
    url.port.length === 0 &&
    url.pathname.endsWith('/') &&
    HOSTED_CLOUD_CONSOLE_DOMAINS.some(
      (domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`),
    )
  );
}

function isLoopbackCloudConsole(url: URL): boolean {
  return (
    url.protocol === 'http:' &&
    (url.hostname === 'localhost' || url.hostname === '127.0.0.1') &&
    url.port.length > 0 &&
    url.pathname === '/'
  );
}

/**
 * Resolve an explicit environment handoff without exposing an open redirect.
 * A missing value is a normal direct public visit and uses production; a
 * present but invalid value fails visibly at the Pricing CTA seam.
 */
export function resolveCloudConsoleBase(rawValue: string | null): string {
  if (rawValue === null) return DEFAULT_CLOUD_CONSOLE_BASE_URL;
  const value = rawValue.trim();
  if (!value) throw new RangeError('Invalid Cloud Console base: value is empty');

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new RangeError('Invalid Cloud Console base: expected an absolute URL');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new RangeError('Invalid Cloud Console base: credentials and URL state are not allowed');
  }

  const normalized = url.toString();
  if (!isHostedCloudConsole(url) && !isLoopbackCloudConsole(url)) {
    throw new RangeError('Invalid Cloud Console base: destination is not allowlisted');
  }
  return normalized;
}

/** Production dashboard that owns authenticated checkout. */
export const CLOUD_BASE_URL = new URL(
  'dashboard',
  DEFAULT_CLOUD_CONSOLE_BASE_URL,
).toString();

/** Public pricing contract served by the landing page. */
export const PLANS_JSON_URL = '/pricing/plans.json';

/** Confirmed Go launch prices shared by the page, SEO metadata, and tests. */
export const GO_PLAN = {
  tier: 'go',
  monthly: { priceUsd: 10, introPriceUsd: 5 },
  yearly: { priceUsd: 60 },
} as const;

/** New Go checkouts are closed; existing Go subscribers keep current-plan actions. */
export const GO_PLAN_SOLD_OUT = true;

/**
 * Stable Vela contract for opening the generic billing entry. Specific plan
 * CTAs use `cloudSubscribeUrl` so Vela can start checkout without reopening a
 * plan chooser.
 */
export const CLOUD_CONSOLE_URL = `${CLOUD_BASE_URL}?billing=plan`;

/**
 * Landing pricing is the authoritative comparison surface. A selected plan and
 * interval are handed to Vela so the dashboard can authenticate and continue
 * directly into checkout.
 */
export function cloudSubscribeUrl(
  tier: string,
  interval: 'monthly' | 'yearly',
): string {
  const url = new URL(CLOUD_BASE_URL);
  url.searchParams.set('billing', 'plan');
  url.searchParams.set('plan', tier);
  url.searchParams.set('interval', interval);
  url.searchParams.set('checkout', 'auto');
  return url.toString();
}

/**
 * Exact Team checkout handoff. Landing owns the comparison controls; Vela owns
 * authentication, live catalog validation, workspace permissions, and Stripe.
 * Carry the visitor's complete selection so Vela can prefill its existing
 * confirmation dialog instead of asking for the same choices a second time.
 */
export function cloudTeamSubscribeUrl(
  tier: TeamPlanTier,
  interval: BillingInterval,
  seats: number,
): string {
  if (!Number.isSafeInteger(seats) || seats < 1) {
    throw new RangeError('Team checkout seats must be a positive integer');
  }
  const url = new URL(cloudSubscribeUrl(tier, interval));
  url.searchParams.set('seats', String(seats));
  return url.toString();
}

/**
 * Preserve an explicitly supplied workspace scope without inventing one from
 * local state. The browser enhancement calls this same URL contract when the
 * public pricing page itself was opened with `?workspaceId=...`.
 */
export function scopedBillingPlanUrl(workspaceId?: string | null): string {
  const normalized = workspaceId?.trim();
  if (!normalized) return CLOUD_CONSOLE_URL;
  const url = new URL(CLOUD_CONSOLE_URL);
  url.searchParams.set('workspaceId', normalized);
  return url.toString();
}

/**
 * Baked fallback snapshot. Mirrors `public/pricing/plans.json`; the client
 * fetch path uses the same contract shape to guard against stale or invalid
 * published JSON.
 */
export const PRICING_SNAPSHOT: PricingContract = {
  version: 2,
  currency: 'USD',
  overageDeployPriceUsd: 2,
  tiers: [
    {
      tier: 'plus',
      rank: 1,
      recommended: false,
      monthly: { priceUsd: 20, introPriceUsd: 16, grantUsd: 20 },
      yearly: { priceUsd: 168, discountPct: 30, grantUsd: 240 },
      deployLimit: 3,
    },
    {
      tier: 'pro',
      rank: 2,
      recommended: true,
      monthly: { priceUsd: 100, introPriceUsd: 70, grantUsd: 120 },
      yearly: { priceUsd: 720, discountPct: 40, grantUsd: 1440 },
      deployLimit: 20,
    },
    {
      tier: 'max',
      rank: 3,
      recommended: false,
      monthly: { priceUsd: 200, introPriceUsd: 120, grantUsd: 300 },
      yearly: { priceUsd: 1176, discountPct: 51, grantUsd: 3600 },
      deployLimit: 50,
    },
  ],
  teamTiers: [
    {
      tier: 'team_basic',
      rank: 0,
      recommended: false,
      minSeats: 3,
      monthlyCreditsPerSeatUsd: 0,
      monthly: { priceUsd: 5, introPriceUsd: 4 },
      yearly: { priceUsd: 60, introPriceUsd: 42, discountPct: 30 },
    },
    {
      tier: 'team_plus',
      rank: 1,
      recommended: false,
      minSeats: 3,
      monthlyCreditsPerSeatUsd: 20,
      monthly: { priceUsd: 25, introPriceUsd: 20 },
      yearly: { priceUsd: 300, introPriceUsd: 210, discountPct: 30 },
    },
    {
      tier: 'team_pro',
      rank: 2,
      recommended: true,
      minSeats: 3,
      monthlyCreditsPerSeatUsd: 100,
      monthly: { priceUsd: 105, introPriceUsd: 73.5 },
      yearly: { priceUsd: 1260, introPriceUsd: 756, discountPct: 40 },
    },
    {
      tier: 'team_max',
      rank: 3,
      recommended: false,
      minSeats: 3,
      monthlyCreditsPerSeatUsd: 200,
      monthly: { priceUsd: 205, introPriceUsd: 123 },
      // The yearly Max coupon caps at 50.91%, so the first-year seat price does
      // not divide evenly into twelve months — keep the exact cloud amount.
      yearly: { priceUsd: 2460, introPriceUsd: 1207.61, discountPct: 51 },
    },
  ],
};

/**
 * USD with cents only when the amount actually has them. Individual plans are
 * whole-dollar, but Team seat prices are percentage-derived off the cloud
 * catalog and land on cents ($73.50 / seat / month, $100.63 / seat / month on
 * the yearly Max coupon), so silently rounding them would misquote the price.
 */
export function formatUsd(amount: number): string {
  const cents = Math.round(amount * 100);
  const value = cents / 100;
  return `$${value.toLocaleString('en-US', {
    minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Monthly-equivalent of an annual price, to the cent. */
export function yearlyMonthlyEquivalent(yearlyPriceUsd: number): number {
  return Math.round((yearlyPriceUsd / 12) * 100) / 100;
}

/** Introductory Team charge for the selected billing period and seat count. */
export function teamIntroTotalUsd(
  tier: TeamPlanTierConfig,
  interval: BillingInterval,
  seats: number,
): number {
  return tier[interval].introPriceUsd * seats;
}
