/*
 * Pricing contract + baked fallback snapshot for the /pricing/ page.
 *
 * Single source of truth lives in the **vela** repo at
 * `apps/web/src/data/commerce/plans.ts` (`PLAN_CONFIGS`). vela publishes that
 * config, serialized to the shape below, as a public JSON at
 * `PLANS_JSON_URL`. The /pricing/ page renders `PRICING_SNAPSHOT` at build
 * time (SEO + first paint + offline fallback) and a small inline script
 * refetches `PLANS_JSON_URL` on load to reconcile the displayed numbers — so a
 * vela price change goes live on the marketing site WITHOUT a landing-page
 * rebuild.
 *
 * This file must never become a second source of truth. `PRICING_SNAPSHOT` is
 * a fallback mirror only; when it drifts from production the live fetch wins.
 * Keep it shaped exactly like the published JSON so the same renderer formats
 * both.
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

/**
 * Production public host for the vela commerce app (mounted under /cloud on
 * the same origin as the marketing site). Change here if the deployment base
 * path moves; everything else derives from these two constants.
 */
export const CLOUD_BASE_URL = 'https://open-design.ai/cloud';

/** Canonical published pricing contract. Public, non-secret, CORS-open. */
export const PLANS_JSON_URL = `${CLOUD_BASE_URL}/plans.json`;

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
 * Baked fallback snapshot. Mirrors vela `PLAN_CONFIGS` at authoring time. The
 * live fetch overrides these numbers on load; this only governs first paint,
 * SEO, and the no-JS / upstream-down path.
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
