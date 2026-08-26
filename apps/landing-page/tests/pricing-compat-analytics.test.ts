import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  createPricingCompatibilityAnalytics,
  type ResolvedPricingContext,
} from '../app/_lib/pricing-compat-analytics.ts';
import {
  PERSONAL_PRICING_TIERS,
  type PricingBridgeEvent,
  type postPricingBridgeEvents,
} from '../app/_lib/pricing-analytics-bridge.ts';

type BridgeRequest = Parameters<typeof postPricingBridgeEvents>[0];
type Harness = ReturnType<typeof harness>;

const dashboardContext: ResolvedPricingContext = {
  authenticated: true,
  sourceSurface: 'dashboard',
  currentPlanId: null,
  currentBillingInterval: null,
  firstMonthEligible: true,
};

function harness() {
  const requests: BridgeRequest[] = [];
  let eventSequence = 0;
  const analytics = createPricingCompatibilityAnalytics({
    apiOrigin: 'https://amr-api.open-design.ai',
    sessionId: 'pricing-session-1',
    tiers: PERSONAL_PRICING_TIERS,
    now: () => new Date('2026-08-23T12:00:00.000Z'),
    createEventId: () => `event-${++eventSequence}`,
    postEvents: async (request) => {
      requests.push(request);
      return true;
    },
  });
  return { analytics, requests };
}

function resolve(
  testHarness: Harness,
  overrides: Partial<Omit<ResolvedPricingContext, 'authenticated'>> = {},
) {
  testHarness.analytics.resolveContext({
    ...dashboardContext,
    ...overrides,
  });
}

function events(testHarness: Harness): PricingBridgeEvent[] {
  return testHarness.requests.flatMap((request) => [...request.events]);
}

function exposures(testHarness: Harness) {
  return events(testHarness).filter(
    (event): event is Extract<PricingBridgeEvent, { kind: 'plan_exposure' }> =>
      event.kind === 'plan_exposure',
  );
}

function clicks(testHarness: Harness) {
  return events(testHarness).filter(
    (event): event is Extract<PricingBridgeEvent, { kind: 'pricing_click' }> =>
      event.kind === 'pricing_click',
  );
}

describe('migrated Pricing compatibility analytics', () => {
  it('no-ops every interaction until authenticated Vela context resolves', () => {
    const testHarness = harness();

    testHarness.analytics.exposePlans({ audience: 'creator', interval: 'yearly' });
    testHarness.analytics.changeInterval({
      audience: 'creator',
      currentInterval: 'yearly',
      targetInterval: 'monthly',
      userInitiated: true,
    });
    testHarness.analytics.clickPlan({
      audience: 'creator',
      planId: 'go',
      interval: 'monthly',
      enabled: true,
    });
    testHarness.analytics.openEnterpriseLead();
    testHarness.analytics.submitEnterpriseLead();

    assert.deepEqual(testHarness.requests, []);
  });

  it('emits resolved Free Plus Pro Max yearly exposures with literal legacy facts', () => {
    const testHarness = harness();
    resolve(testHarness);

    testHarness.analytics.exposePlans({ audience: 'creator', interval: 'yearly' });

    const captured = exposures(testHarness);
    assert.deepEqual(
      captured.map((event) => event.payload.planId),
      ['go', 'plus', 'pro', 'max'],
    );
    assert.deepEqual(captured[0], {
      kind: 'plan_exposure',
      eventId: 'event-1',
      eventTime: '2026-08-23T12:00:00.000Z',
      payload: {
        planId: 'go',
        billingInterval: 'yearly',
        priceUsd: '60.00',
        creditsGrantedUsd: '0.00',
        deployLimit: 0,
        introOfferApplied: false,
        firstMonthEligible: true,
        isCurrentPlan: false,
        isRecommended: false,
      },
    });
    assert.deepEqual(
      captured.map((event) => [
        event.payload.planId,
        event.payload.priceUsd,
        event.payload.creditsGrantedUsd,
        event.payload.deployLimit,
        event.payload.isRecommended,
      ]),
      [
        ['go', '60.00', '0.00', 0, false],
        ['plus', '168.00', '20.00', 3, false],
        ['pro', '720.00', '120.00', 20, true],
        ['max', '1176.00', '300.00', 50, false],
      ],
    );
    assert.equal(testHarness.requests[0]?.sourceSurface, 'dashboard');
    assert.equal(testHarness.requests[0]?.sessionId, 'pricing-session-1');
  });

  it('preserves the legacy recommendation progression for every current plan exposure', () => {
    const fixtures = [
      { currentPlanId: null, expected: [false, false, true, false] },
      { currentPlanId: 'go', expected: [false, false, true, false] },
      { currentPlanId: 'plus', expected: [false, false, true, false] },
      { currentPlanId: 'pro', expected: [false, false, false, true] },
      { currentPlanId: 'max', expected: [false, false, false, false] },
    ] as const;

    for (const fixture of fixtures) {
      const testHarness = harness();
      resolve(testHarness, {
        currentPlanId: fixture.currentPlanId,
        currentBillingInterval: fixture.currentPlanId ? 'monthly' : null,
      });
      testHarness.analytics.exposePlans({ audience: 'creator', interval: 'yearly' });

      assert.deepEqual(
        exposures(testHarness).map((event) => event.payload.isRecommended),
        fixture.expected,
        `current plan ${fixture.currentPlanId ?? 'none'}`,
      );
    }
  });

  it('does not let a pre-resolution render swallow the corrected first exposure', () => {
    const testHarness = harness();

    testHarness.analytics.exposePlans({ audience: 'creator', interval: 'monthly' });
    resolve(testHarness, {
      sourceSurface: 'wallet',
      currentPlanId: 'pro',
      currentBillingInterval: 'monthly',
      firstMonthEligible: false,
    });
    testHarness.analytics.exposePlans({ audience: 'creator', interval: 'monthly' });

    const captured = exposures(testHarness);
    assert.equal(captured.length, 4);
    assert.equal(captured[0]?.payload.introOfferApplied, false);
    assert.equal(captured[0]?.payload.firstMonthEligible, false);
    assert.equal(captured[2]?.payload.planId, 'pro');
    assert.equal(captured[2]?.payload.isCurrentPlan, true);
    assert.equal(testHarness.requests[0]?.sourceSurface, 'wallet');
  });

  it('deduplicates the full resolved state and re-exposes after Team', () => {
    const testHarness = harness();
    resolve(testHarness);
    const visible = { audience: 'creator' as const, interval: 'yearly' as const };

    testHarness.analytics.exposePlans(visible);
    testHarness.analytics.exposePlans(visible);
    assert.equal(exposures(testHarness).length, 4);

    resolve(testHarness, { firstMonthEligible: false });
    testHarness.analytics.exposePlans(visible);
    resolve(testHarness, { firstMonthEligible: false, currentPlanId: 'plus' });
    testHarness.analytics.exposePlans(visible);
    resolve(testHarness, {
      firstMonthEligible: false,
      currentPlanId: 'plus',
      currentBillingInterval: 'monthly',
    });
    testHarness.analytics.exposePlans(visible);
    assert.equal(exposures(testHarness).length, 16);

    testHarness.analytics.exposePlans({ audience: 'team', interval: 'yearly' });
    testHarness.analytics.exposePlans(visible);
    assert.equal(exposures(testHarness).length, 20);
  });

  it('sends a real interval click before the new interval exposure batch', () => {
    const testHarness = harness();
    resolve(testHarness);
    testHarness.analytics.exposePlans({ audience: 'creator', interval: 'yearly' });
    testHarness.requests.length = 0;

    testHarness.analytics.changeInterval({
      audience: 'creator',
      currentInterval: 'yearly',
      targetInterval: 'monthly',
      userInitiated: true,
    });

    assert.equal(testHarness.requests.length, 1);
    assert.deepEqual(
      testHarness.requests[0]?.events.map((event) =>
        event.kind === 'pricing_click' ? event.payload.element : event.payload.planId,
      ),
      ['change_interval', 'go', 'plus', 'pro', 'max'],
    );
    assert.deepEqual(clicks(testHarness)[0]?.payload, {
      element: 'change_interval',
      currentPlanId: null,
      currentBillingInterval: 'yearly',
      targetBillingInterval: 'monthly',
    });
  });

  it('excludes programmatic interval changes from click events', () => {
    const testHarness = harness();
    resolve(testHarness);

    testHarness.analytics.changeInterval({
      audience: 'creator',
      currentInterval: 'yearly',
      targetInterval: 'monthly',
      userInitiated: false,
    });

    assert.equal(clicks(testHarness).length, 0);
    assert.deepEqual(
      exposures(testHarness).map((event) => event.payload.planId),
      ['go', 'plus', 'pro', 'max'],
    );
  });

  it('emits exact subscribe and upgrade payloads for enabled Personal CTAs', () => {
    const testHarness = harness();
    resolve(testHarness, { firstMonthEligible: true });

    testHarness.analytics.clickPlan({
      audience: 'creator',
      planId: 'go',
      interval: 'monthly',
      enabled: true,
    });
    resolve(testHarness, {
      currentPlanId: 'plus',
      currentBillingInterval: 'monthly',
      firstMonthEligible: false,
    });
    testHarness.analytics.clickPlan({
      audience: 'creator',
      planId: 'pro',
      interval: 'yearly',
      enabled: true,
    });

    assert.deepEqual(clicks(testHarness).map((event) => event.payload), [
      {
        element: 'subscribe_now',
        currentPlanId: null,
        currentBillingInterval: null,
        targetPlanId: 'go',
        targetBillingInterval: 'monthly',
        priceUsd: '5.00',
        creditsGrantedUsd: '0.00',
        introOfferApplied: true,
        isCurrentPlan: false,
        isRecommended: false,
      },
      {
        element: 'upgrade_now',
        currentPlanId: 'plus',
        currentBillingInterval: 'monthly',
        targetPlanId: 'pro',
        targetBillingInterval: 'yearly',
        priceUsd: '720.00',
        creditsGrantedUsd: '120.00',
        introOfferApplied: false,
        isCurrentPlan: false,
        isRecommended: true,
      },
    ]);
  });

  it('preserves the legacy recommendation progression for every current plan CTA', () => {
    const fixtures = [
      { currentPlanId: null, expected: [false, false, true, false] },
      { currentPlanId: 'go', expected: [false, false, true, false] },
      { currentPlanId: 'plus', expected: [false, false, true, false] },
      { currentPlanId: 'pro', expected: [false, false, false, true] },
      { currentPlanId: 'max', expected: [false, false, false, false] },
    ] as const;
    const planIds = ['go', 'plus', 'pro', 'max'] as const;

    for (const fixture of fixtures) {
      const testHarness = harness();
      resolve(testHarness, {
        currentPlanId: fixture.currentPlanId,
        currentBillingInterval: fixture.currentPlanId ? 'monthly' : null,
      });
      for (const planId of planIds) {
        testHarness.analytics.clickPlan({
          audience: 'creator',
          planId,
          interval: 'yearly',
          enabled: true,
        });
      }

      assert.deepEqual(
        clicks(testHarness).map((event) => event.payload.isRecommended),
        fixture.expected,
        `current plan ${fixture.currentPlanId ?? 'none'}`,
      );
    }
  });

  it('excludes disabled, Team, and unknown plan CTAs', () => {
    const testHarness = harness();
    resolve(testHarness);

    for (const input of [
      { audience: 'creator' as const, planId: 'go', enabled: false },
      { audience: 'team' as const, planId: 'go', enabled: true },
      { audience: 'creator' as const, planId: 'team', enabled: true },
      { audience: 'creator' as const, planId: 'unknown', enabled: true },
    ]) {
      testHarness.analytics.clickPlan({ ...input, interval: 'yearly' });
    }

    assert.deepEqual(testHarness.requests, []);
  });

  it('fails closed when a Personal CTA omits its audience', () => {
    const testHarness = harness();
    resolve(testHarness);

    testHarness.analytics.clickPlan({
      planId: 'go',
      interval: 'monthly',
      enabled: true,
    });

    assert.deepEqual(testHarness.requests, []);
  });

  it('records Enterprise submit as an immediate intent event', () => {
    const testHarness = harness();
    resolve(testHarness, {
      currentPlanId: 'pro',
      currentBillingInterval: 'yearly',
    });

    testHarness.analytics.openEnterpriseLead();
    testHarness.analytics.submitEnterpriseLead();

    assert.deepEqual(clicks(testHarness).map((event) => event.payload), [
      {
        element: 'request_team_access',
        currentPlanId: 'pro',
        currentBillingInterval: 'yearly',
      },
      {
        element: 'team_lead_submit',
        currentPlanId: 'pro',
        currentBillingInterval: 'yearly',
      },
    ]);
  });

  it('records nullable Enterprise context for users without a current plan', () => {
    const testHarness = harness();
    resolve(testHarness);

    testHarness.analytics.openEnterpriseLead();
    testHarness.analytics.submitEnterpriseLead();

    assert.deepEqual(clicks(testHarness).map((event) => event.payload), [
      {
        element: 'request_team_access',
        currentPlanId: null,
        currentBillingInterval: null,
      },
      {
        element: 'team_lead_submit',
        currentPlanId: null,
        currentBillingInterval: null,
      },
    ]);
  });

  it('keeps transport failures best effort', async () => {
    const rejected = createPricingCompatibilityAnalytics({
      apiOrigin: 'https://amr-api.open-design.ai',
      sessionId: 'pricing-session-1',
      tiers: PERSONAL_PRICING_TIERS,
      postEvents: async () => {
        throw new Error('offline');
      },
    });
    const synchronous = createPricingCompatibilityAnalytics({
      apiOrigin: 'https://amr-api.open-design.ai',
      sessionId: 'pricing-session-2',
      tiers: PERSONAL_PRICING_TIERS,
      postEvents: (() => {
        throw new Error('offline');
      }) as typeof postPricingBridgeEvents,
    });
    for (const analytics of [rejected, synchronous]) {
      analytics.resolveContext(dashboardContext);
      assert.doesNotThrow(() => analytics.openEnterpriseLead());
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 0));
  });
});
