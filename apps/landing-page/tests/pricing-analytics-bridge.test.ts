import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PERSONAL_PRICING_TIERS,
  postPricingBridgeEvents,
  resolvePricingBridgeSource,
  type PricingBridgeEvent,
} from '../app/_lib/pricing-analytics-bridge.ts';

const eventTime = '2026-08-23T12:00:00.000Z';

const exposureEvent: PricingBridgeEvent = {
  kind: 'plan_exposure',
  eventId: 'exposure-1',
  eventTime,
  payload: {
    planId: 'go',
    billingInterval: 'monthly',
    priceUsd: '10.00',
    creditsGrantedUsd: '0.00',
    deployLimit: 0,
    introOfferApplied: false,
    firstMonthEligible: false,
    isCurrentPlan: false,
    isRecommended: false,
  },
};

test('personal compatibility catalog contains go plus pro max', () => {
  assert.deepEqual(
    PERSONAL_PRICING_TIERS.map((tier) => tier.tier),
    ['go', 'plus', 'pro', 'max'],
  );

  const go = PERSONAL_PRICING_TIERS[0];
  assert.equal(go?.monthly.priceUsd, 10);
  assert.equal(go?.yearly.priceUsd, 60);
  assert.equal(go?.monthly.grantUsd, 0);
  assert.equal(go?.yearly.grantUsd, 0);
  assert.equal(go?.deployLimit, 0);
  assert.equal(go?.recommended, false);
});

test('source resolver accepts only exact trusted wallet/dashboard routes', () => {
  assert.equal(
    resolvePricingBridgeSource({
      search: new URLSearchParams(),
      referrer: 'https://open-design.ai/cloud/dashboard?billing=plan',
    }),
    'dashboard',
  );
  assert.equal(
    resolvePricingBridgeSource({
      search: new URLSearchParams(),
      referrer: 'https://open-design.ai/cloud/wallet',
    }),
    'wallet',
  );
  assert.equal(
    resolvePricingBridgeSource({
      search: new URLSearchParams(),
      referrer: 'https://vela.powerformer.net/dashboard',
    }),
    'dashboard',
  );
  assert.equal(
    resolvePricingBridgeSource({
      search: new URLSearchParams(),
      referrer: 'http://127.0.0.1:5179/wallet',
    }),
    'wallet',
  );

  for (const referrer of [
    'https://example.com/dashboard',
    'https://open-design.ai/cloud/dashboard-settings',
    'https://open-design.ai/cloud/wallet/../dashboard',
    'https://open-design.ai/cloud/%64ashboard',
    'https://open-design.ai.evil.example/cloud/dashboard',
    'http://localhost/dashboard',
  ]) {
    assert.equal(
      resolvePricingBridgeSource({
        search: new URLSearchParams(),
        referrer,
      }),
      null,
      referrer,
    );
  }
});

test('source resolver ignores unrelated handoff state but rejects source overrides', () => {
  const unrelated = new URLSearchParams({
    od_locale: 'en',
    cloud_console_base: 'https://open-design.ai/cloud/',
    od_entry_id: 'not-forwarded',
  });
  assert.equal(
    resolvePricingBridgeSource({
      search: unrelated,
      referrer: 'https://open-design.ai/cloud/dashboard',
    }),
    'dashboard',
  );

  for (const [key, value] of [
    ['sourceSurface', 'dashboard'],
    ['source_surface', 'wallet'],
    ['workspaceTab', 'dashboard'],
    ['pricing_source', 'wallet'],
    ['source', 'workspace_dashboard'],
    ['od_entry_source', 'workspace_dashboard'],
    ['sourceSurface', 'unknown'],
  ]) {
    assert.equal(
      resolvePricingBridgeSource({
        search: new URLSearchParams([[key, value]]),
        referrer: 'https://open-design.ai/cloud/dashboard',
      }),
      null,
      `${key}=${value}`,
    );
  }
});

test('transport posts only the reduced authenticated bridge body', async () => {
  let capturedUrl = '';
  let capturedInit: RequestInit | undefined;
  const eventWithForbiddenFields = {
    ...exposureEvent,
    registryKey: 'subscription_plan_exposure',
    eventName: 'subscription_plan_exposure',
    payload: {
      ...exposureEvent.payload,
      planName: 'Go',
      autoRechargeSupported: true,
      email: 'must-not-leave@example.com',
    },
  } as PricingBridgeEvent;
  const clickEvent: PricingBridgeEvent = {
    kind: 'pricing_click',
    eventId: 'click-1',
    eventTime,
    payload: {
      element: 'subscribe_now',
      currentPlanId: null,
      currentBillingInterval: null,
      targetPlanId: 'go',
      targetBillingInterval: 'monthly',
      priceUsd: '10.00',
      creditsGrantedUsd: '0.00',
      introOfferApplied: false,
      isCurrentPlan: false,
      isRecommended: false,
    },
  };
  const enterpriseClickEvents: PricingBridgeEvent[] = [
    {
      kind: 'pricing_click',
      eventId: 'enterprise-open-1',
      eventTime,
      payload: {
        element: 'request_team_access',
        currentPlanId: null,
        currentBillingInterval: null,
      },
    },
    {
      kind: 'pricing_click',
      eventId: 'enterprise-submit-1',
      eventTime,
      payload: {
        element: 'team_lead_submit',
        currentPlanId: 'pro',
        currentBillingInterval: 'yearly',
      },
    },
  ];

  const result = await postPricingBridgeEvents({
    apiOrigin: 'https://amr-api.open-design.ai/',
    sourceSurface: 'dashboard',
    sessionId: 'pricing-session-1',
    events: [eventWithForbiddenFields, clickEvent, ...enterpriseClickEvents],
    fetcher: async (input, init) => {
      capturedUrl = String(input);
      capturedInit = init;
      return new Response(null, { status: 204 });
    },
  });

  assert.equal(result, true);
  assert.equal(
    capturedUrl,
    'https://amr-api.open-design.ai/api/v1/analytics/pricing-events',
  );
  assert.equal(capturedInit?.method, 'POST');
  assert.equal(capturedInit?.credentials, 'include');
  assert.equal(capturedInit?.keepalive, true);
  assert.equal(
    new Headers(capturedInit?.headers).get('content-type'),
    'application/json',
  );
  assert.ok(capturedInit?.signal instanceof AbortSignal);
  assert.deepEqual(JSON.parse(String(capturedInit?.body)), {
    sourceSurface: 'dashboard',
    sessionId: 'pricing-session-1',
    events: [exposureEvent, clickEvent, ...enterpriseClickEvents],
  });
});

test('transport mirrors Vela UTC datetime syntax for event times', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };

  for (const accepted of [
    '2026-08-23T12:00Z',
    '2026-08-23T12:00:00Z',
    '2026-08-23T12:00:00.123456Z',
    '2028-02-29T23:59:59.9Z',
  ]) {
    assert.equal(
      await postPricingBridgeEvents({
        apiOrigin: 'https://amr-api.open-design.ai',
        sourceSurface: 'dashboard',
        sessionId: 'session',
        events: [{ ...exposureEvent, eventTime: accepted }],
        fetcher,
      }),
      true,
      accepted,
    );
  }

  for (const rejected of [
    '2026-08-23',
    '2026-08-23T12:00:00+08:00',
    '2026-08-23T12:00:00.000+0800',
    '2026-08-23T12:00:00z',
    '2026-02-30T12:00:00Z',
    '2026-08-23T24:00:00Z',
    'not-a-time',
  ]) {
    assert.equal(
      await postPricingBridgeEvents({
        apiOrigin: 'https://amr-api.open-design.ai',
        sourceSurface: 'dashboard',
        sessionId: 'session',
        events: [{ ...exposureEvent, eventTime: rejected }],
        fetcher,
      }),
      false,
      rejected,
    );
  }
  assert.equal(calls, 4);
});

test('transport rejects invalid origins and bounded request IDs before fetch', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };
  const attempts = [
    {
      apiOrigin: 'https://example.com',
      sessionId: 'session',
      events: [exposureEvent],
    },
    {
      apiOrigin: 'http://localhost',
      sessionId: 'session',
      events: [exposureEvent],
    },
    {
      apiOrigin: 'http://localhost:5179/not-an-origin/',
      sessionId: 'session',
      events: [exposureEvent],
    },
    {
      apiOrigin: 'https://open-design.ai/?next=evil',
      sessionId: 'session',
      events: [exposureEvent],
    },
    {
      apiOrigin: 'https://amr-api.open-design.ai',
      sessionId: '',
      events: [exposureEvent],
    },
    {
      apiOrigin: 'https://amr-api.open-design.ai',
      sessionId: 's'.repeat(129),
      events: [exposureEvent],
    },
    {
      apiOrigin: 'https://amr-api.open-design.ai',
      sessionId: 'session',
      events: [],
    },
    {
      apiOrigin: 'https://amr-api.open-design.ai',
      sessionId: 'session',
      events: [{ ...exposureEvent, eventId: 'e'.repeat(129) }],
    },
    {
      apiOrigin: 'https://amr-api.open-design.ai',
      sessionId: 'session',
      events: [exposureEvent, { ...exposureEvent }],
    },
  ] as const;

  for (const attempt of attempts) {
    assert.equal(
      await postPricingBridgeEvents({
        ...attempt,
        sourceSurface: 'dashboard',
        fetcher,
      }),
      false,
    );
  }
  assert.equal(calls, 0);
});

test('transport returns false for malformed runtime shapes without fetching', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async () => {
    calls += 1;
    return new Response(null, { status: 204 });
  };
  const postUnchecked = postPricingBridgeEvents as unknown as (
    input: unknown,
  ) => Promise<boolean>;
  const validBase = {
    apiOrigin: 'https://amr-api.open-design.ai',
    sourceSurface: 'dashboard',
    sessionId: 'session',
    events: [exposureEvent],
    fetcher,
  };

  for (const malformed of [
    null,
    undefined,
    {},
    { ...validBase, apiOrigin: 42 },
    { ...validBase, events: null },
    { ...validBase, events: { length: 1 } },
    { ...validBase, events: [null] },
    { ...validBase, events: [{ ...exposureEvent, payload: null }] },
    { ...validBase, events: [{ kind: 'plan_exposure' }] },
  ]) {
    assert.equal(await postUnchecked(malformed), false);
  }
  assert.equal(calls, 0);
});

test('transport fails open on network and endpoint failures', async () => {
  assert.equal(
    await postPricingBridgeEvents({
      apiOrigin: 'https://amr-api.open-design.ai',
      sourceSurface: 'wallet',
      sessionId: 'session',
      events: [exposureEvent],
      fetcher: async () => new Response(null, { status: 401 }),
    }),
    false,
  );
  assert.equal(
    await postPricingBridgeEvents({
      apiOrigin: 'https://amr-api.open-design.ai',
      sourceSurface: 'wallet',
      sessionId: 'session',
      events: [exposureEvent],
      fetcher: async () => {
        throw new TypeError('network unavailable');
      },
    }),
    false,
  );
});
