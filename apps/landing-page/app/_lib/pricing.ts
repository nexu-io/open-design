/*
 * Pricing contract + static contract mirror for the /pricing/ page.
 *
 * The /pricing/ page renders `PRICING_SNAPSHOT` at build time for SEO and
 * first paint. A public JSON contract at `PLANS_JSON_URL` mirrors the same
 * shape for client-side reconciliation and smoke checks.
 *
 * Keep `PRICING_SNAPSHOT` and `public/pricing/plans.json` in lockstep until
 * Open Design Cloud exposes an external JSON contract that can replace this
 * static landing-page contract.
 */

export type PlanTier = 'plus' | 'pro' | 'max';
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

export interface PricingContract {
  /** Contract version; bump in vela when the shape changes. */
  version: number;
  currency: 'USD';
  /** Per-deploy overage price once `deployLimit` is exceeded, USD. */
  overageDeployPriceUsd: number;
  tiers: PlanTierConfig[];
}

/** Production public host for the Open Design Cloud commerce app. */
export const CLOUD_BASE_URL = 'https://open-design.ai/cloud';

/** Public pricing contract served by the landing page. */
export const PLANS_JSON_URL = '/pricing/plans.json';

/**
 * Cloud billing console (the vela "wallet"). This is where subscriptions are
 * managed and where a successful Stripe checkout returns. Use this for any
 * "go to the console" link.
 */
export const CLOUD_CONSOLE_URL = `${CLOUD_BASE_URL}/wallet`;

/**
 * Deep link that starts subscription checkout for one tier inside the cloud
 * console, then returns to the console on success.
 *
 * The console is auth-gated by the cloud app: an unauthenticated visitor is
 * bounced to the login/registration page and returned to this exact URL after
 * authenticating — so the same intent resumes with no extra step. The
 * `checkout=auto` flag asks the console to open the Stripe checkout for
 * `{plan, interval}` immediately instead of just showing the plans modal.
 */
export function cloudSubscribeUrl(
  tier: string,
  interval: 'monthly' | 'yearly',
): string {
  const params = new URLSearchParams({
    view: 'plans',
    plan: tier,
    interval,
    checkout: 'auto',
  });
  return `${CLOUD_CONSOLE_URL}?${params.toString()}`;
}

/**
 * Baked fallback snapshot. Mirrors `public/pricing/plans.json`; the client
 * fetch path uses the same contract shape to guard against stale or invalid
 * published JSON.
 */
export const PRICING_SNAPSHOT: PricingContract = {
  version: 1,
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
      monthly: { priceUsd: 100, introPriceUsd: 70, grantUsd: 100 },
      yearly: { priceUsd: 720, discountPct: 40, grantUsd: 1200 },
      deployLimit: 20,
    },
    {
      tier: 'max',
      rank: 3,
      recommended: false,
      monthly: { priceUsd: 200, introPriceUsd: 120, grantUsd: 200 },
      yearly: { priceUsd: 1176, discountPct: 51, grantUsd: 2400 },
      deployLimit: 50,
    },
  ],
};

/** Whole-dollar USD, no trailing cents (prices are whole-dollar by design). */
export function formatUsd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

/** Monthly-equivalent of an annual price, rounded to whole dollars. */
export function yearlyMonthlyEquivalent(yearlyPriceUsd: number): number {
  return Math.round(yearlyPriceUsd / 12);
}
