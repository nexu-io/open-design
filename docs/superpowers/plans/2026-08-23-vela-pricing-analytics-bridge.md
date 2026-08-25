# Vela Authenticated Pricing Analytics Endpoint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a narrow authenticated Vela endpoint that maps migrated OpenDesign Pricing interactions into the existing AMR subscription analytics registry.

**Architecture:** A dedicated module owns a strict reduced request schema, source-origin checks, bounded per-user throttling, and mapping into `AnalyticsService`. The browser never supplies registry keys or Vela common metadata; the server stamps them and reuses the existing AMR/PostHog pipeline.

**Tech Stack:** Hono, Zod, TypeScript, Vitest, Vela AnalyticsService/PostHog repository

## Global Constraints

- Base the work on the latest `powerformer/vela/main`.
- Preserve the existing registry keys, AMR PostHog event names, payload schemas, dashboards, and alerts.
- Require a valid Vela user session; never make either legacy event anonymous/public-page allowed.
- Accept only trusted configured web origins and no PII/free-form payload fields.
- The endpoint is best effort for callers but strict on auth, body size, timestamp freshness, enums, batch size, and rate.
- No database schema or billing behavior changes.

---

### Task 1: Define and test the reduced Pricing bridge contract

**Files:**
- Create: `services/api/src/pricing-analytics.ts`
- Create: `services/api/test/pricing-analytics.test.ts`

**Interfaces:**
- Consumes: `AnalyticsCommonEvent`, `AnalyticsService`, `analyticsEventRegistry`
- Produces: `pricingAnalyticsRequestSchema`, `mapPricingAnalyticsRequest()`, `registerPricingAnalyticsRoute()`

- [ ] **Step 1: Write failing schema tests**

```ts
expect(pricingAnalyticsRequestSchema.safeParse({
  sourceSurface: 'dashboard',
  sessionId: 'pricing-session-1',
  events: [{
    kind: 'plan_exposure',
    eventId: 'pricing-event-1',
    eventTime: '2026-08-23T12:00:00.000Z',
    payload: {
      planId: 'go',
      billingInterval: 'monthly',
      priceUsd: '5.00',
      creditsGrantedUsd: '0.00',
      deployLimit: 0,
      introOfferApplied: true,
      firstMonthEligible: true,
      isCurrentPlan: false,
      isRecommended: false,
    },
  }],
}).success).toBe(true);
```

Add negative cases for arbitrary registry keys, unknown properties, unknown plans/elements, raw URL/referrer/email fields, more than eight events, event IDs over 128 characters, malformed times, and source surfaces outside wallet/dashboard.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `pnpm --filter @vela/api exec vitest run test/pricing-analytics.test.ts`
Expected: FAIL because the bridge module does not exist.

- [ ] **Step 3: Implement strict schemas**

Use `.strict()` at the request, event, and payload layers. Export a discriminated union:

```ts
type PricingAnalyticsInput =
  | { kind: 'plan_exposure'; eventId: string; eventTime: string; payload: PlanPayload }
  | { kind: 'pricing_click'; eventId: string; eventTime: string; payload: ClickPayload };
```

Allow only plan IDs `go|plus|pro|max`, intervals `monthly|yearly`, and click elements `change_interval|subscribe_now|upgrade_now|request_team_access|team_lead_submit`. Limit a request to 1–8 events and body size to 16 KiB.

- [ ] **Step 4: Run schema tests and verify GREEN**

Run: `pnpm --filter @vela/api exec vitest run test/pricing-analytics.test.ts`
Expected: schema cases pass.

- [ ] **Step 5: Commit**

```bash
git add services/api/src/pricing-analytics.ts services/api/test/pricing-analytics.test.ts
git commit -m "feat(analytics): define authenticated pricing bridge contract"
```

### Task 2: Map reduced inputs to exact legacy analytics records

**Files:**
- Modify: `services/api/src/pricing-analytics.ts`
- Modify: `services/api/test/pricing-analytics.test.ts`

**Interfaces:**
- Consumes: validated bridge request, authenticated profile, server request metadata
- Produces: `Array<{ common: AnalyticsCommonEvent; payload: unknown }>` accepted by `AnalyticsService.ingest()`

- [ ] **Step 1: Write failing literal mapping tests**

Assert that plan exposure maps to:

```ts
expect(mapped[0]).toMatchObject({
  common: {
    registryKey: 'subscription_plan_exposure',
    eventName: 'subscription_plan_exposure',
    eventType: 'view',
    platform: 'web',
  },
  payload: {
    pageName: 'workspace',
    workspaceTab: 'dashboard',
    area: 'subscription_pricing',
    entryPoint: 'open_design_entry',
    planId: 'go',
  },
});
```

Assert that pricing click maps to `registryKey=subscription_pricing_click`, `eventName=ui_click`, `eventType=click`. Include wallet/dashboard, interval, plan CTA, Enterprise elements, zero-valued Go fields, null current-plan fields, and strict validated OpenDesign attribution.

- [ ] **Step 2: Run the mapping test and verify RED**

Run: `pnpm --filter @vela/api exec vitest run test/pricing-analytics.test.ts`
Expected: FAIL because the mapper is missing.

- [ ] **Step 3: Implement the mapper**

Derive event name/type from `analyticsEventRegistry`, never from browser input. Stamp required nullable common fields with server-owned values, use the authenticated profile separately in `AnalyticsService.ingest`, derive locale from bounded request input or `Accept-Language`, and browser from `User-Agent`. Reject event times older than 24 hours or more than five minutes in the future before mapping.

- [ ] **Step 4: Validate mapped payloads through the real registry**

Call the same registry payload validator used by `AnalyticsService` in the test path. Mutation checks must fail for `pageName=pricing`, a missing click `workspaceTab`, an unknown element, or an invalid attribution enum.

- [ ] **Step 5: Run focused tests and commit**

```bash
pnpm --filter @vela/api exec vitest run test/pricing-analytics.test.ts
git add services/api/src/pricing-analytics.ts services/api/test/pricing-analytics.test.ts
git commit -m "feat(analytics): map pricing bridge to legacy registry"
```

### Task 3: Register the authenticated, origin-restricted, bounded route

**Files:**
- Modify: `services/api/src/pricing-analytics.ts`
- Modify: `services/api/src/app.ts`
- Create: `services/api/test/pricing-analytics-routes.test.ts`

**Interfaces:**
- Consumes: `getApiProfile(headers)`, `trustedWebOrigins(config)`, `AnalyticsService`
- Produces: `POST /api/v1/analytics/pricing-events` returning 202/400/401/403/413/429

- [ ] **Step 1: Write failing route tests**

Build a focused Hono test app with an in-memory analytics repository. Prove:

- missing session returns 401;
- untrusted or missing browser Origin returns 403;
- oversized body returns 413 before JSON parsing;
- invalid strict payload returns 400 without issue values containing request data;
- more than 120 accepted events per authenticated user per minute returns 429;
- a valid request returns 202 and stores exact mapped records;
- a duplicate event ID is forwarded as the same PostHog `$insert_id`, preserving PostHog ingestion deduplication without claiming repository-level deduplication.

- [ ] **Step 2: Run route tests and verify RED**

Run: `pnpm --filter @vela/api exec vitest run test/pricing-analytics-routes.test.ts`
Expected: FAIL because the route is not registered.

- [ ] **Step 3: Implement route safeguards**

Register the route only when analytics is configured. Resolve the profile before body mapping. Compare the normalized `Origin` header against `trustedWebOrigins(config)`. Read at most 16 KiB using the existing bounded-body helper pattern. Add an injected per-user fixed-window limiter with 120 events/minute and periodic stale-entry pruning; production creates one limiter with the app, tests inject a deterministic clock.

- [ ] **Step 4: Ingest through the existing AnalyticsService**

```ts
await analytics.ingest({
  profile,
  events: mapPricingAnalyticsRequest(parsed.data, requestMetadata),
});
return c.json({ accepted: parsed.data.events.length }, 202);
```

Do not alter `anonymousAllowed` or `publicPageAllowed` on either registry entry. Preserve the browser-supplied `eventId` as the analytics record `eventId`; the existing PostHog adapter maps it to `$insert_id`, so best-effort retries keep a stable ingestion identity.

- [ ] **Step 5: Run focused route and existing analytics tests**

```bash
pnpm --filter @vela/api exec vitest run \
  test/pricing-analytics.test.ts \
  test/pricing-analytics-routes.test.ts \
  test/analytics-events.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add services/api/src/pricing-analytics.ts services/api/src/app.ts \
  services/api/test/pricing-analytics-routes.test.ts
git commit -m "feat(api): accept authenticated pricing analytics"
```

### Task 4: Prove AMR PostHog compatibility and publish the Vela PR

**Files:**
- Modify: `services/api/test/analytics-events.test.ts`
- Create: `docs/superpowers/specs/2026-08-23-pricing-analytics-bridge-design.md`
- Create: `docs/superpowers/plans/2026-08-23-pricing-analytics-bridge.md`

**Interfaces:**
- Consumes: final mapped records
- Produces: regression proof for exact PostHog event names/properties and a ready Vela PR

- [ ] **Step 1: Add a failing PostHog delivery regression**

Pass mapped plan and click records through `PostHogAnalyticsRepository` and assert:

```ts
expect(batch[0].event).toBe('subscription_plan_exposure');
expect(batch[0].properties.registry_key).toBe('subscription_plan_exposure');
expect(batch[1].event).toBe('ui_click');
expect(batch[1].properties.registry_key).toBe('subscription_pricing_click');
```

- [ ] **Step 2: Run the regression and verify it passes through production mapping**

Run: `pnpm --filter @vela/api exec vitest run test/analytics-events.test.ts test/pricing-analytics.test.ts`
Expected: PASS after the route mapper is complete.

- [ ] **Step 3: Run repository verification**

```bash
pnpm --filter @vela/shared build
pnpm --filter @vela/api typecheck
pnpm --filter @vela/api test
pnpm lint
git diff --check
```

Expected: zero failures.

- [ ] **Step 4: Create the Vela PR with `odc`**

Verify `nexus status --json`, `odc whoami`, and `odc agent verify codex --scope project`. Create the PR with Vela-first deployment instructions and cross-link OpenDesign PR #7299.

- [ ] **Step 5: Request independent review**

Review `origin/main..HEAD` with the requesting-code-review skill. Resolve every Critical and Important issue, rerun validation, and update the PR before handing the pair to the user.
