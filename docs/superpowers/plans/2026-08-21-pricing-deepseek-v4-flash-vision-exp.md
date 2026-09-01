# Pricing DeepSeek V4 Flash Vision Exp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DeepSeek V4 Flash Vision Exp as the first popular model on Pricing and mark it unlimited for Go, Plus, Pro, and Max while keeping Pricing and workbench behavior aligned.

**Architecture:** Extend the existing display-name table in the Astro Pricing component and the existing model-ID entitlement table in the web runtime. Keep the two independently owned tables synchronized through the cross-app e2e contract; do not refactor the Pricing data model or change Vela backend billing.

**Tech Stack:** Astro 6, TypeScript 5.9, React 18 runtime utilities, Node test runner, Vitest 4, pnpm 10.33.2.

## Global Constraints

- Display name: `DeepSeek V4 Flash Vision Exp`.
- Temporary internal ID: `deepseek-v4-flash-vision-exp`.
- Reuse `/agents/deepseek.svg`.
- The new model is first in the popular-model ordering.
- Cards continue to preview exactly three models.
- Unlimited counts become Go 4, Plus 5, Pro 6, Max 9.
- The full comparison shows nine popular models and marks the new row unlimited for every personal tier.
- Free, Team, and unknown plans remain excluded.
- Do not change Vela backend pricing, billing, or quota behavior.
- Add the usage-estimate chart row with the confirmed value `8,000` per five hours, ordered between MiMo V2.5 Pro (`11,000`) and DeepSeek V4 Pro (`4,300`).

---

### Task 1: Pin the new cross-surface pricing contract

**Files:**
- Modify: `e2e/tests/pricing-unlimited-models.test.ts:22-32`
- Modify: `e2e/tests/pricing-unlimited-models.test.ts:150-169`
- Modify: `apps/web/tests/runtime/amr-unlimited-models.plan-tier.test.ts:54-78`
- Modify: `apps/web/tests/runtime/amr-unlimited-models.plan-tier.test.ts:99-133`
- Modify: `apps/landing-page/tests/pricing-contract.test.ts:423-459`

**Interfaces:**
- Consumes: Pricing display names from `popularModels` and runtime model IDs from `UNLIMITED_MODELS_BY_PLAN`.
- Produces: Contract assertions for display name `DeepSeek V4 Flash Vision Exp`, ID `deepseek-v4-flash-vision-exp`, ordering, tier counts `4 / 5 / 6 / 9`, and Free/Team exclusion.

- [ ] **Step 1: Add the failing display-name mapping and contract assertions**

Add the mapping:

```ts
'DeepSeek V4 Flash Vision Exp': 'deepseek-v4-flash-vision-exp',
```

Change the advertised-count test to:

```ts
it('keeps the advertised model counts (4 / 5 / 6 / 9)', async () => {
  const pricing = await pricingUnlimitedIdsByTier();
  expect(pricing.go).toHaveLength(4);
  expect(pricing.plus).toHaveLength(5);
  expect(pricing.pro).toHaveLength(6);
  expect(pricing.max).toHaveLength(9);
});
```

Add an ordering assertion:

```ts
it('puts DeepSeek V4 Flash Vision Exp first in the popular-model list', async () => {
  expect((await pricingPopularModelNames())[0]).toBe('DeepSeek V4 Flash Vision Exp');
});
```

- [ ] **Step 2: Add the failing workbench entitlement assertions**

Insert `deepseek-v4-flash-vision-exp` first in `POPULAR_MODEL_IDS`, update the count expectations to `4`, `5`, `6`, and `9`, and add:

```ts
it('badges DeepSeek V4 Flash Vision Exp on every personal tier only', () => {
  for (const tier of ['go', 'plus', 'pro', 'max']) {
    expect(isUnlimitedModelForPlanTier('deepseek-v4-flash-vision-exp', tier)).toBe(true);
  }
  expect(isUnlimitedModelForPlanTier('deepseek-v4-flash-vision-exp', 'free')).toBe(false);
  expect(isUnlimitedModelForPlanTier('deepseek-v4-flash-vision-exp', 'team_pro')).toBe(false);
});
```

Add `DeepSeek V4 Flash Vision Exp` first to the reviewed Pricing order, update the Pro unlimited-set length to `6`, and assert the usage rows contain this literal sequence:

```ts
assert.match(
  individualPlans,
  /popularModel\('MiMo V2\.5 Pro'\), value: 11000[\s\S]*popularModel\('DeepSeek V4 Flash Vision Exp'\), value: 8000[\s\S]*popularModel\('DeepSeek V4 Pro'\), value: 4300/,
);
```

- [ ] **Step 3: Run the focused tests and verify they fail for the intended reasons**

Run:

```bash
pnpm --dir e2e test tests/pricing-unlimited-models.test.ts
pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/runtime/amr-unlimited-models.plan-tier.test.ts
pnpm --filter @open-design/landing-page test
```

Expected: the e2e contract reports the old `3 / 4 / 5 / 8` sets or missing first model, and the web runtime reports the new ID is not unlimited.

- [ ] **Step 4: Commit the red tests**

```bash
git add e2e/tests/pricing-unlimited-models.test.ts apps/web/tests/runtime/amr-unlimited-models.plan-tier.test.ts apps/landing-page/tests/pricing-contract.test.ts
git commit -m "test(pricing): cover vision model entitlement"
```

### Task 2: Implement the Pricing and workbench model data

**Files:**
- Modify: `apps/landing-page/app/_components/pricing-individual-plans.astro:37-102`
- Modify: `apps/landing-page/app/_components/pricing-individual-plans.astro:241-251`
- Modify: `apps/landing-page/app/_components/pricing-individual-plans.astro:270-274`
- Modify: `apps/web/src/runtime/amr-unlimited-models.ts:20-44`

**Interfaces:**
- Consumes: `ModelItem`, `TierId`, `PlanTierId`, `popularAccessStatus`, and `isUnlimitedModelForPlanTier` already defined in their owning files.
- Produces: A first-position popular `ModelItem`, Pricing tier sets of sizes `4 / 5 / 6 / 9`, comparison count `9`, and runtime entitlement for model ID `deepseek-v4-flash-vision-exp`.

- [ ] **Step 1: Add the new model as the first Pricing model**

Insert at the start of `popularModels`:

```ts
{ name: 'DeepSeek V4 Flash Vision Exp', icon: '/agents/deepseek.svg' },
```

Insert `DeepSeek V4 Flash Vision Exp` first in `popularModelDisplayOrder`.

- [ ] **Step 2: Add the display name to every personal tier's unlimited set**

Add `DeepSeek V4 Flash Vision Exp` to the `go`, `plus`, and `pro` sets. Leave `max` derived from all `popularModels`, so it includes the ninth model automatically.

- [ ] **Step 3: Derive the comparison count from the model list**

Replace the hard-coded popular count with:

```ts
count: fillTemplate(P.modelCount, { count: String(comparisonPopular.length) }),
```

This keeps the category label synchronized with the nine rendered comparison rows.

- [ ] **Step 4: Add the runtime model ID to the entitlement ladder**

Insert `deepseek-v4-flash-vision-exp` first in both `GO_UNLIMITED_MODELS` and `PRO_UNLIMITED_MODELS`. Plus inherits Go; Max inherits Pro. Do not change Team handling or ID normalization.

- [ ] **Step 5: Add the confirmed usage estimate**

Insert the new row between MiMo V2.5 Pro and DeepSeek V4 Pro:

```ts
{ ...popularModel('DeepSeek V4 Flash Vision Exp'), value: 8000 },
```

- [ ] **Step 6: Run the focused tests and verify they pass**

Run:

```bash
pnpm --dir e2e test tests/pricing-unlimited-models.test.ts
pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/runtime/amr-unlimited-models.plan-tier.test.ts
pnpm --filter @open-design/landing-page test
```

Expected: both test files pass with `4 / 5 / 6 / 9`, first-position ordering, and personal-only unlimited status.

- [ ] **Step 7: Commit the implementation**

```bash
git add apps/landing-page/app/_components/pricing-individual-plans.astro apps/web/src/runtime/amr-unlimited-models.ts
git commit -m "feat(pricing): add DeepSeek vision unlimited model"
```

### Task 3: Validate the affected packages and prepare the review branch

**Files:**
- Verify: `apps/landing-page/app/_components/pricing-individual-plans.astro`
- Verify: `apps/web/src/runtime/amr-unlimited-models.ts`
- Verify: `apps/web/tests/runtime/amr-unlimited-models.plan-tier.test.ts`
- Verify: `e2e/tests/pricing-unlimited-models.test.ts`

**Interfaces:**
- Consumes: The implementation and tests from Tasks 1 and 2.
- Produces: A clean, reviewable feature branch ready for the later usage-chart value and PR creation.

- [ ] **Step 1: Run Landing Page tests and type checking**

```bash
pnpm --filter @open-design/landing-page test
pnpm --filter @open-design/landing-page typecheck
```

Expected: all Landing Page tests pass and Astro reports no type errors.

- [ ] **Step 2: Run web runtime tests and type checking**

```bash
pnpm --dir apps/web exec vitest run -c vitest.config.ts tests/runtime/amr-unlimited-models.plan-tier.test.ts
pnpm --filter @open-design/web typecheck
```

Expected: the focused runtime suite and web type check pass.

- [ ] **Step 3: Run the cross-app contract and repository diff checks**

```bash
pnpm --dir e2e test tests/pricing-unlimited-models.test.ts
git diff --check origin/main...HEAD
git status --short --branch
```

Expected: the contract passes, diff check emits no errors, and only intentional committed changes remain.

- [ ] **Step 4: Push the branch and create the PR**

Push `codex/pricing-deepseek-vision-exp` and open a PR targeting `main` with the repository PR template completed. The PR must state that the runtime ID is temporarily assumed to be `deepseek-v4-flash-vision-exp` and that Vela remains authoritative for actual entitlement enforcement.
