# OpenDesign Authenticated Pricing Analytics Emitter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send migrated Pricing interactions to Vela's authenticated compatibility endpoint so the existing AMR subscription funnel resumes without changing the Pricing or checkout flow.

**Architecture:** A pure controller builds reduced, strictly bounded bridge records and a transport posts them to Vela with credentials and keepalive. The page activates the controller only after authenticated pricing context and a trusted wallet/dashboard source resolve; existing OpenDesign PostHog events remain independent.

**Tech Stack:** Astro 6, TypeScript, Node test runner, Playwright, PostHog wrapper (unchanged)

## Global Constraints

- Base the work on the latest `nexu-io/open-design/main`.
- Do not change Pricing UI, prices, entitlements, CTA destinations, checkout behavior, or existing OpenDesign analytics.
- Only authenticated Vela sessions arriving from trusted wallet/dashboard surfaces enter the compatibility funnel.
- Compatibility delivery is best effort and must never block navigation or form submission.
- Never include email, company, lead free text, raw URL, or raw referrer in the bridge request.
- Vela endpoint must deploy before this emitter.

---

### Task 1: Define the reduced bridge contract and strict source resolver

**Files:**
- Modify: `apps/landing-page/app/_lib/pricing.ts`
- Create: `apps/landing-page/app/_lib/pricing-analytics-bridge.ts`
- Create: `apps/landing-page/tests/pricing-analytics-bridge.test.ts`

**Interfaces:**
- Consumes: `GO_PLAN`, `PRICING_SNAPSHOT.tiers`, `HOSTED_CLOUD_CONSOLE_DOMAINS`
- Produces: `PERSONAL_PRICING_TIERS`, `resolvePricingBridgeSource()`, `postPricingBridgeEvents()`, and the reduced `PricingBridgeEvent` union

- [ ] **Step 1: Write failing contract tests**

```ts
test('personal compatibility catalog contains go plus pro max', () => {
  assert.deepEqual(PERSONAL_PRICING_TIERS.map((tier) => tier.tier), [
    'go', 'plus', 'pro', 'max',
  ]);
});

test('source resolver accepts only exact trusted wallet/dashboard routes', () => {
  assert.equal(resolvePricingBridgeSource({
    search: new URLSearchParams(),
    referrer: 'https://open-design.ai/cloud/dashboard?billing=plan',
  }), 'dashboard');
  assert.equal(resolvePricingBridgeSource({
    search: new URLSearchParams(),
    referrer: 'https://example.com/dashboard',
  }), null);
});
```

Also assert that unknown query values, substring routes, oversized IDs, and untrusted hosts return `null`, and that the Go adapter yields price 10/60, credits 0, deploy limit 0, and `recommended=false`.

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `pnpm --filter @open-design/landing-page exec node --import tsx --test tests/pricing-analytics-bridge.test.ts`
Expected: FAIL because the catalog, resolver, and transport do not exist.

- [ ] **Step 3: Implement the minimal bridge module**

```ts
export type PricingBridgeSource = 'wallet' | 'dashboard';

export type PricingBridgeEvent =
  | { kind: 'plan_exposure'; eventId: string; eventTime: string; payload: PlanExposureInput }
  | { kind: 'pricing_click'; eventId: string; eventTime: string; payload: PricingClickInput };

export async function postPricingBridgeEvents(input: {
  apiOrigin: string;
  sourceSurface: PricingBridgeSource;
  sessionId: string;
  events: readonly PricingBridgeEvent[];
  fetcher?: typeof fetch;
}): Promise<boolean>;
```

Build `PERSONAL_PRICING_TIERS` by adapting `GO_PLAN` and appending the existing snapshot tiers. Validate the API origin with the same hosted/loopback policy used by the checkout handoff. POST only the reduced body to `/api/v1/analytics/pricing-events` with `credentials: 'include'`, `keepalive: true`, JSON headers, and a short abort timeout. Return `false` on every failure without throwing.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `pnpm --filter @open-design/landing-page exec node --import tsx --test tests/pricing-analytics-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/app/_lib/pricing.ts \
  apps/landing-page/app/_lib/pricing-analytics-bridge.ts \
  apps/landing-page/tests/pricing-analytics-bridge.test.ts
git commit -m "feat(analytics): add authenticated pricing bridge contract"
```

### Task 2: Rebuild compatibility semantics around resolved authentication context

**Files:**
- Modify: `apps/landing-page/app/_lib/pricing-compat-analytics.ts`
- Modify: `apps/landing-page/tests/pricing-compat-analytics.test.ts`

**Interfaces:**
- Consumes: `PricingBridgeEvent`, `PERSONAL_PRICING_TIERS`
- Produces: `createPricingCompatibilityAnalytics()` that emits reduced records only after `resolveContext()`

- [ ] **Step 1: Replace the controller assertions with failing legacy-semantics tests**

Add literal expectations proving:

```ts
assert.deepEqual(exposures.map((event) => event.payload.planId), [
  'go', 'plus', 'pro', 'max',
]);
assert.equal(exposures[0].payload.creditsGrantedUsd, '0.00');
assert.equal(exposures[0].payload.deployLimit, 0);
```

Add independent tests that no exposure occurs before context resolution, a same-interval context correction emits the correct first exposure, dedupe includes eligibility/current-plan state, interval click precedes new exposures, disabled/Team CTAs are excluded, and Enterprise submit is an intent event.

- [ ] **Step 2: Run the controller test and verify RED**

Run: `pnpm --filter @open-design/landing-page exec node --import tsx --test tests/pricing-compat-analytics.test.ts`
Expected: FAIL for missing Go, eager exposure, incomplete signature, and old transport event names.

- [ ] **Step 3: Implement the minimal state machine**

The controller owns:

```ts
type ResolvedPricingContext = {
  authenticated: true;
  sourceSurface: 'wallet' | 'dashboard';
  currentPlanId: 'go' | 'plus' | 'pro' | 'max' | null;
  currentBillingInterval: 'monthly' | 'yearly' | null;
  firstMonthEligible: boolean;
};
```

Before `resolveContext()`, all methods no-op. After resolution, exposure signatures include audience, interval, eligibility, current plan, and current interval. Emit arrays through the bridge transport rather than `window.__odTrack`. Preserve exact old click intent and ordering.

- [ ] **Step 4: Run the focused controller and bridge suites**

Run: `pnpm --filter @open-design/landing-page exec node --import tsx --test tests/pricing-compat-analytics.test.ts tests/pricing-analytics-bridge.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/app/_lib/pricing-compat-analytics.ts \
  apps/landing-page/tests/pricing-compat-analytics.test.ts
git commit -m "fix(analytics): restore complete personal pricing semantics"
```

### Task 3: Wire Pricing context, DOM interactions, and navigation-safe delivery

**Files:**
- Modify: `apps/landing-page/app/pages/pricing/index.astro`
- Modify: `apps/landing-page/app/_components/enterprise-lead-form.astro`
- Modify: `apps/landing-page/tests/pricing-contract.test.ts`
- Create: `apps/landing-page/tests/pricing-analytics-browser.test.ts`

**Interfaces:**
- Consumes: Vela `POST /api/v1/analytics/pricing-events`
- Produces: real Pricing-page bridge requests after authenticated context resolution

- [ ] **Step 1: Write failing DOM/browser tests**

Use a real browser page with intercepted session, billing-summary, and pricing-events requests. Assert:

```ts
assert.deepEqual(
  captured.events.filter((event) => event.kind === 'plan_exposure')
    .map((event) => event.payload.planId),
  ['go', 'plus', 'pro', 'max'],
);
assert.equal(captured.sourceSurface, 'dashboard');
```

Also assert no request for signed-out/direct/untrusted traffic; resolved current-plan fields on first exposure; interval click before exposure batch; Team-to-Personal re-exposure; disabled CTA exclusion; and `team_lead_submit` on submit intent even when validation fails.

- [ ] **Step 2: Run the browser test and verify RED**

Run: `pnpm --filter @open-design/landing-page exec node --import tsx --test tests/pricing-analytics-browser.test.ts`
Expected: FAIL because the page still captures compatibility events locally and emits before context resolution.

- [ ] **Step 3: Wire the context-resolved event**

After `loadPersonalPricingContext(apiOrigin)` resolves, set a resolved marker and dispatch:

```ts
pricingRoot.dispatchEvent(new CustomEvent('pricing:personal-context-resolved', {
  detail: { authenticated: context !== null, context },
}));
```

The compatibility script waits for this event, resolves the trusted source, creates one session ID, and sends bridge batches. Do not initialize for null context or null source.

- [ ] **Step 4: Restore Enterprise submit intent timing**

Dispatch `pricing:enterprise-submit` from the form's synchronous `submit` event before validation. Remove the compatibility dispatch from `od:lead-success`; retain the existing OpenDesign success bridge and non-PII lead analytics unchanged.

- [ ] **Step 5: Run browser, contract, and full landing tests**

Run:

```bash
pnpm --filter @open-design/landing-page exec node --import tsx --test \
  tests/pricing-analytics-browser.test.ts tests/pricing-contract.test.ts
pnpm --filter @open-design/landing-page test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/landing-page/app/pages/pricing/index.astro \
  apps/landing-page/app/_components/enterprise-lead-form.astro \
  apps/landing-page/tests/pricing-contract.test.ts \
  apps/landing-page/tests/pricing-analytics-browser.test.ts
git commit -m "fix(analytics): relay authenticated pricing funnel events"
```

### Task 4: Validate, document dependency, and update the OpenDesign PR

**Files:**
- Modify: `docs/superpowers/specs/2026-08-23-restore-pricing-plan-exposure-design.md` only if implementation reveals a factual mismatch
- Modify: PR #7299 body through `odc`

- [ ] **Step 1: Run all static and build gates**

```bash
pnpm --filter @open-design/landing-page typecheck
pnpm --filter @open-design/landing-page build
pnpm guard
git diff --check
```

Expected: zero errors and a clean worktree after committed changes.

- [ ] **Step 2: Verify against a locally running Vela endpoint**

With an authenticated fixture, trigger initial Personal exposure, interval change, Personal/Team return, plan CTA, Enterprise open, and invalid Enterprise submit. Confirm requests reach Vela and no compatibility events hit `window.__odTrack`.

- [ ] **Step 3: Update PR #7299 through `odc`**

Cross-link the Vela PR, state that Vela must deploy first, list exact restored interactions, and remove the obsolete claim that direct OpenDesign PostHog capture restores AMR.

- [ ] **Step 4: Request independent review**

Review the final `origin/main..HEAD` diff using the requesting-code-review skill. Resolve every Critical and Important issue before considering the PR ready.
