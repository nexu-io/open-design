# Pricing Free Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the discontinued public Go Pricing card with the permanent Free card and supplied Free wordmark.

**Architecture:** Keep paid-plan configuration and account compatibility untouched. Treat Free as a display-only card in the Astro comparison component, then teach the existing browser enhancement to render a truthful current/disabled state for authenticated users while preserving the signed-out dashboard entry.

**Tech Stack:** Astro 6, TypeScript 5.9, Node test runner, static SVG assets.

## Global Constraints

- Preserve Plus, Pro, Max, Team, billing, campaign, and existing-Go-account behavior.
- The first card and its analytics identity must be `free`, never a paid Go checkout.
- Use `/pricing/plan-free.svg` copied from the user-supplied `Group 2147224558.svg`.
- Keep all ten supported locales complete.
- Base commit is local `origin/main@57de743`; rebase once GitHub authentication is available.

---

### Task 1: Lock the Free-card contract with failing tests

**Files:**
- Modify: `apps/landing-page/tests/pricing-contract.test.ts`
- Modify: `apps/landing-page/tests/pricing-current-plan.test.ts`

**Interfaces:**
- Consumes: `getPricingContent(locale)` and the static Astro source.
- Produces: assertions that require `data-tier={tier}` to receive `free`, `/pricing/plan-free.svg`, `$0`, `freeForever`, and no public Go offer.

- [ ] **Step 1: Replace the Go-entry contract assertion**

Assert that the component contains `tier: 'free' as const`, `logo: '/pricing/plan-free.svg'`, localized Free copy, and no `tier: 'go' as const` or Go CTA configuration. Assert the Pricing page structured offer is `OpenDesign Free` at price `0` and has no `OpenDesign Go` offer.

- [ ] **Step 2: Add authenticated Free action coverage**

Add a source-level/current-plan integration assertion that a loaded context with `current === null` marks the Free card as current and disables it, while a missing unauthenticated context leaves the normal Free dashboard entry intact.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
pnpm --filter @open-design/landing-page exec node --import tsx --test tests/pricing-contract.test.ts tests/pricing-current-plan.test.ts
```

Expected: failure because the component still emits Go and has no Free-specific action handling.

### Task 2: Render the Free card and wordmark

**Files:**
- Create: `apps/landing-page/public/pricing/plan-free.svg`
- Modify: `apps/landing-page/app/_components/pricing-individual-plans.astro`

**Interfaces:**
- Consumes: `content.free`, `L.freeForever`, and the supplied SVG.
- Produces: first card `{ tier: 'free', logo: '/pricing/plan-free.svg' }` followed by unchanged paid tiers.

- [ ] **Step 1: Copy the supplied SVG with a semantic name**

Copy `/Users/zhanghuihua/Downloads/会员模式。/Group 2147224558.svg` byte-for-byte to `apps/landing-page/public/pricing/plan-free.svg`.

- [ ] **Step 2: Replace Go-only card data**

Remove `GO_PLAN`, `goView`, Go discount calculations, Go model access, and the inline Go wordmark. Add a Free card view with amount `0`, no strike/discount/savings, the `freeForever` subline, `content.free` CTA/tagline, and `content.free` benefits.

- [ ] **Step 3: Keep paid model modules paid-only**

Render Free's three benefits directly below its CTA. Render the current model modules and comparison access logic only for Plus, Pro, and Max so Free never implies hosted model entitlement.

- [ ] **Step 4: Format the component**

Run:

```bash
pnpm exec prettier --write apps/landing-page/app/_components/pricing-individual-plans.astro
```

### Task 3: Align Free CTA state and public structured data

**Files:**
- Modify: `apps/landing-page/app/pages/pricing/index.astro`

**Interfaces:**
- Consumes: `PersonalPricingContext | null`, `content.free`, and existing localized action labels.
- Produces: authenticated Free current state, paid-user disabled Free state, signed-out dashboard link, and Free JSON-LD offer.

- [ ] **Step 1: Replace the structured Go offer**

Remove the page's `GO_PLAN` import and emit an `OpenDesign Free` offer with price `0` and `CLOUD_CONSOLE_URL`. Keep existing paid and Team offers unchanged.

- [ ] **Step 2: Apply truthful Free CTA states**

Before paid-tier action resolution, handle `[data-tier='free']`: when `pricingContext.current === null`, set the localized current label and disable the CTA; when a paid current tier exists, keep the Free CTA disabled as an unavailable downgrade. Do not run this block when `pricingContext` itself is `null`, preserving the signed-out dashboard entry.

- [ ] **Step 3: Run focused tests and verify GREEN**

Run:

```bash
pnpm --filter @open-design/landing-page exec node --import tsx --test tests/pricing-contract.test.ts tests/pricing-current-plan.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 4: Commit the behavior**

```bash
git add apps/landing-page/public/pricing/plan-free.svg apps/landing-page/app/_components/pricing-individual-plans.astro apps/landing-page/app/pages/pricing/index.astro apps/landing-page/tests/pricing-contract.test.ts apps/landing-page/tests/pricing-current-plan.test.ts
git commit -m "feat(pricing): restore permanent Free plan"
```

### Task 4: Full validation and visual review

**Files:**
- Verify: `apps/landing-page/**`

**Interfaces:**
- Consumes: completed Free card.
- Produces: passing package validation and a browser-verified Pricing page.

- [ ] **Step 1: Run package tests**

```bash
pnpm --filter @open-design/landing-page test
```

- [ ] **Step 2: Run typecheck and static build**

```bash
pnpm --filter @open-design/landing-page typecheck
pnpm --filter @open-design/landing-page build
```

- [ ] **Step 3: Run repository guard**

```bash
pnpm guard
```

- [ ] **Step 4: Render the Pricing page locally**

Start `pnpm --filter @open-design/landing-page dev`, open `/pricing/`, and verify desktop and narrow layouts show `Free / Plus / Pro / Max`, the supplied Free wordmark, `$0`, permanent-free copy, and unchanged paid cards.

- [ ] **Step 5: Inspect the final diff**

Confirm no Go checkout URL or public Go structured offer remains and no unrelated files changed.
