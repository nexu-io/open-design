import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadPersonalPricingContext,
  resolvePersonalPlanAction,
} from '../app/_lib/pricing-current-plan.ts';

function billingFetcher(summary: Record<string, unknown>) {
  let request = 0;
  return async () =>
    Response.json(
      request++ === 0
        ? { user: { id: 'user-1' } }
        : summary,
    );
}

test('loads the active personal plan and pricing capabilities without discarding its interval', async () => {
  const context = await loadPersonalPricingContext(
    'https://amr-api.open-design.ai/',
    billingFetcher({
      membershipTier: 'go',
      billingInterval: 'monthly',
      subscriptionStatus: 'active',
      subscriptionEntitlementStatus: 'active',
      subscriptionCancelAtPeriodEnd: false,
      pendingSubscriptionChange: null,
      personalSubscriptionCheckoutAllowed: true,
      firstMonthIntroEligible: false,
      availableActions: ['billing_portal'],
    }),
  );

  assert.deepEqual(context, {
    current: { tier: 'go', interval: 'monthly' },
    checkoutAllowed: true,
    firstMonthIntroEligible: false,
    cancelAtPeriodEnd: false,
    pendingChange: null,
    billingPortalAvailable: true,
  });
});

test('does not treat a retained tier from a canceled entitlement as a current subscription', async () => {
  const context = await loadPersonalPricingContext(
    'https://amr-api.open-design.ai',
    billingFetcher({
      membershipTier: 'pro',
      billingInterval: 'yearly',
      subscriptionStatus: 'canceled',
      subscriptionEntitlementStatus: 'inactive',
      subscriptionCancelAtPeriodEnd: false,
      pendingSubscriptionChange: null,
      personalSubscriptionCheckoutAllowed: true,
      firstMonthIntroEligible: true,
      availableActions: ['subscription_checkout'],
    }),
  );

  assert.equal(context?.current, null);
  assert.equal(context?.checkoutAllowed, true);
});

test('keeps a same-tier monthly-to-yearly change actionable', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'go', interval: 'monthly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'go', interval: 'yearly' },
    ),
    { kind: 'interval_upgrade', enabled: true },
  );
});

test('blocks a simultaneous tier and billing-interval upgrade', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'go', interval: 'monthly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'plus', interval: 'yearly' },
    ),
    { kind: 'dual_change', enabled: false },
  );
});

test('blocks personal checkout when the billing summary says the account cannot buy it', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: null,
        checkoutAllowed: false,
        firstMonthIntroEligible: true,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: false,
      },
      { tier: 'plus', interval: 'monthly' },
    ),
    { kind: 'checkout_unavailable', enabled: false },
  );
});

test('allows a brand-new personal checkout when no usable subscription exists', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: null,
        checkoutAllowed: true,
        firstMonthIntroEligible: true,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: false,
      },
      { tier: 'plus', interval: 'monthly' },
    ),
    { kind: 'new_checkout', enabled: true },
  );
});

test('marks new Go checkouts as sold out without blocking existing Go subscribers', () => {
  const emptyContext = {
    current: null,
    checkoutAllowed: true,
    firstMonthIntroEligible: true,
    cancelAtPeriodEnd: false,
    pendingChange: null,
    billingPortalAvailable: false,
  } as const;

  assert.deepEqual(
    resolvePersonalPlanAction(emptyContext, { tier: 'go', interval: 'monthly' }),
    { kind: 'sold_out', enabled: false },
  );
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'plus', interval: 'monthly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'go', interval: 'monthly' },
    ),
    { kind: 'sold_out', enabled: false },
  );
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'go', interval: 'monthly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'go', interval: 'monthly' },
    ),
    { kind: 'current', enabled: false },
  );
});

test('marks only the exact tier and interval as the current plan', () => {
  const context = {
    current: { tier: 'pro', interval: 'yearly' } as const,
    checkoutAllowed: true,
    firstMonthIntroEligible: false,
    cancelAtPeriodEnd: false,
    pendingChange: null,
    billingPortalAvailable: true,
  };

  assert.deepEqual(
    resolvePersonalPlanAction(context, { tier: 'pro', interval: 'yearly' }),
    { kind: 'current', enabled: false },
  );
});

test('allows a higher tier on the current billing interval', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'plus', interval: 'monthly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'pro', interval: 'monthly' },
    ),
    { kind: 'upgrade', enabled: true },
  );
});

test('blocks a yearly-to-monthly interval change until cancellation', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'pro', interval: 'yearly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'pro', interval: 'monthly' },
    ),
    { kind: 'interval_downgrade_unavailable', enabled: false },
  );
});

test('keeps lower personal tiers unavailable on public Pricing', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'pro', interval: 'monthly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'plus', interval: 'monthly' },
    ),
    { kind: 'downgrade_unavailable', enabled: false },
  );
});

test('marks the already scheduled target instead of offering the change again', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'pro', interval: 'monthly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: {
          tier: 'plus',
          interval: 'monthly',
          effectiveAt: '2026-09-01T00:00:00.000Z',
        },
        billingPortalAvailable: true,
      },
      { tier: 'plus', interval: 'monthly' },
    ),
    { kind: 'scheduled', enabled: false },
  );
});

test('distinguishes a current plan that is set to cancel at period end', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'pro', interval: 'yearly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: true,
        pendingChange: null,
        billingPortalAvailable: true,
      },
      { tier: 'pro', interval: 'yearly' },
    ),
    { kind: 'current_canceling', enabled: false },
  );
});

test('does not offer a yearly-to-monthly change without billing-portal capability', () => {
  assert.deepEqual(
    resolvePersonalPlanAction(
      {
        current: { tier: 'pro', interval: 'yearly' },
        checkoutAllowed: true,
        firstMonthIntroEligible: false,
        cancelAtPeriodEnd: false,
        pendingChange: null,
        billingPortalAvailable: false,
      },
      { tier: 'pro', interval: 'monthly' },
    ),
    { kind: 'interval_downgrade_unavailable', enabled: false },
  );
});
