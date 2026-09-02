# Refund Policy Multilingual Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the approved regional refund policy and its pricing-page entry in all 11 active landing-page locales, then open one audited ODC pull request without deploying.

**Architecture:** Keep structured policy copy in `refund-policy-content.ts`, keyed by `LandingLocaleCode`, and use `LANDING_LOCALES` as the single source of truth for routes and the language switcher. Keep pricing FAQ copy in the existing locale arrays, but replace deadline-specific summaries with localized neutral summaries and localized policy links.

**Tech Stack:** Astro 6, TypeScript, Node test runner, pnpm, Odcrew CLI.

## Global Constraints

- Use the current regional review page as the sole policy-content baseline.
- Active locales are exactly `en`, `zh`, `ja`, `ko`, `de`, `fr`, `ru`, `es`, `pt-br`, `it`, and `tr`.
- Preserve the current layout, `support@open-design.ai`, `ui_click` tracking event, and policy meaning.
- Do not deploy to Vercel.
- Use only `odc gh pr ...` for PR publication and creation.

---

### Task 1: Lock the multilingual contract

**Files:**
- Modify: `apps/landing-page/tests/refund-policy-contract.test.ts`

**Interfaces:**
- Consumes: `LANDING_LOCALES`, `getRefundPolicyContent(locale)`, `getFaqs(locale)`, `localizedHref(path, locale)`.
- Produces: regression coverage requiring complete policy and pricing-entry localization for every active locale.

- [ ] **Step 1: Write failing tests for all active locales**

Add assertions equivalent to:

```ts
const activeLocaleCodes = LANDING_LOCALES.map((locale) => locale.code);
assert.deepEqual(activeLocaleCodes, [
  'en', 'zh', 'ja', 'ko', 'de', 'fr', 'ru', 'es', 'pt-br', 'it', 'tr',
]);

for (const locale of activeLocaleCodes) {
  const policy = getRefundPolicyContent(locale);
  assert.equal(policy.sections.length, 4, `${locale}: incomplete policy`);
  assert.equal(policy.locale, locale, `${locale}: fell back to another locale`);
  assert.ok(policy.supportSubject.length > 0, `${locale}: missing email subject`);

  const refundFaq = getFaqs(locale).find((item) => item.refundPolicyCta);
  assert.ok(refundFaq, `${locale}: missing pricing refund entry`);
}
```

Also assert that the page uses `LANDING_LOCALES`, the localized wrapper maps all active locales, and pricing uses `href('/refund-policy/')` without an English/Chinese conditional.

- [ ] **Step 2: Run the contract test and verify RED**

Run:

```bash
pnpm --dir apps/landing-page exec node --import tsx --test tests/refund-policy-contract.test.ts
```

Expected: FAIL because most locales fall back to English, the wrapper emits only Chinese, the switcher exposes only English/Chinese, and Italian/Turkish pricing FAQ entries are absent.

- [ ] **Step 3: Commit the failing contract test**

```bash
git add apps/landing-page/tests/refund-policy-contract.test.ts
git commit -m "test(landing): require localized refund policy"
```

### Task 2: Add complete refund-policy translations

**Files:**
- Modify: `apps/landing-page/app/_lib/refund-policy-content.ts`

**Interfaces:**
- Consumes: `LandingLocaleCode`.
- Produces: `RefundPolicyContent` with `locale: LandingLocaleCode` and `supportSubject: string`; `getRefundPolicyContent(locale)` returns a locale-specific object for all 11 active locales.

- [ ] **Step 1: Extend the policy content contract**

Add these fields:

```ts
export interface RefundPolicyContent {
  locale: LandingLocaleCode;
  supportSubject: string;
  // existing fields remain unchanged
}
```

Populate `locale` and a localized refund-request subject on every policy object.

- [ ] **Step 2: Add nine missing localized policy objects**

Create `JA`, `KO`, `DE`, `FR`, `RU`, `ES`, `PT_BR`, `IT`, and `TR`. Each object must translate all metadata, preamble paragraphs, section titles/intros/items/closing text, contact label, and support subject while preserving these exact policy facts:

```ts
const POLICY_FACTS = {
  euUkTurkeyDays: 14,
  southKoreaDays: 7,
  otherCustomersHours: 48,
  processingBusinessDays: 10,
  supportEmail: 'support@open-design.ai',
} as const;
```

The Italian and Turkish content must not fall back to English. Turkish copy must refer to Türkiye/Turkey consistently with the approved policy, and Korean copy must preserve the South Korea seven-day rule without adding a monthly/annual sentence.

- [ ] **Step 3: Register all active locales explicitly**

Use a complete map:

```ts
const CONTENT: Partial<Record<LandingLocaleCode, RefundPolicyContent>> = {
  en: EN,
  zh: ZH,
  ja: JA,
  ko: KO,
  de: DE,
  fr: FR,
  ru: RU,
  es: ES,
  'pt-br': PT_BR,
  it: IT,
  tr: TR,
};
```

Keep `CONTENT[locale] ?? EN` only as a defensive fallback for retired locale codes.

- [ ] **Step 4: Run the content portion of the test**

```bash
pnpm --dir apps/landing-page exec node --import tsx --test tests/refund-policy-contract.test.ts
```

Expected: locale/content assertions pass; route, switcher, and pricing-entry assertions still fail.

- [ ] **Step 5: Commit localized policy content**

```bash
git add apps/landing-page/app/_lib/refund-policy-content.ts
git commit -m "feat(landing): localize refund policy"
```

### Task 3: Localize routes, switcher, email subject, and pricing entry

**Files:**
- Modify: `apps/landing-page/app/pages/refund-policy/index.astro`
- Modify: `apps/landing-page/app/pages/[locale]/refund-policy/index.astro`
- Modify: `apps/landing-page/app/pages/pricing/index.astro`
- Modify: `apps/landing-page/app/_lib/pricing-extras-content.ts`

**Interfaces:**
- Consumes: `LANDING_LOCALES`, `localeFromPath`, `localizedHref`, `RefundPolicyContent.supportSubject`, and existing `getFaqs(locale)`.
- Produces: 11 localized refund-policy routes, full active-locale switcher, locale-correct metadata/analytics, and locale-correct pricing links.

- [ ] **Step 1: Make the refund page locale-driven**

Replace the binary language handling with:

```ts
import { LANDING_LOCALES, localeFromPath } from '../../i18n';

const locale = localeFromPath(Astro.url.pathname);
const copy = getRefundPolicyContent(locale);
const localeMeta = LANDING_LOCALES.find((item) => item.code === locale) ?? LANDING_LOCALES[0];
const supportHref = `mailto:support@open-design.ai?subject=${encodeURIComponent(copy.supportSubject)}`;
```

Set `availableLocaleCodes={LANDING_LOCALES.map((item) => item.code)}`, article `lang={localeMeta.htmlLang}`, JSON-LD `inLanguage: localeMeta.htmlLang`, and tracking `data-refund-locale={locale}`. Use a locale-neutral note field so no English/Chinese condition remains.

- [ ] **Step 2: Generate every active localized route**

Change the wrapper to:

```ts
export function getStaticPaths() {
  return LANDING_LOCALES
    .filter((locale) => locale.code !== 'en')
    .map((locale) => ({ params: { locale: locale.code } }));
}
```

English remains at `/refund-policy/`; every other active locale uses `/:locale/refund-policy/`.

- [ ] **Step 3: Make the pricing link locale-correct**

Replace the conditional with:

```ts
const refundPolicyHref = href('/refund-policy/');
```

- [ ] **Step 4: Update every active pricing refund entry**

For each active locale array, make the answer a localized equivalent of “Refund eligibility varies by region, subscription type, and usage. See the full refund policy for details.” Keep a localized `refundPolicyCta`. Add complete `FAQ_IT` and `FAQ_TR` collections only if they do not already exist; otherwise add their localized refund entries to the existing collections and register them in `FAQ_BY_LOCALE`.

- [ ] **Step 5: Run the focused contract test and verify GREEN**

```bash
pnpm --dir apps/landing-page exec node --import tsx --test tests/refund-policy-contract.test.ts
```

Expected: all refund-policy contract tests pass.

- [ ] **Step 6: Commit the routes and pricing entry**

```bash
git add apps/landing-page/app/pages/refund-policy/index.astro apps/landing-page/app/pages/'[locale]'/refund-policy/index.astro apps/landing-page/app/pages/pricing/index.astro apps/landing-page/app/_lib/pricing-extras-content.ts
git commit -m "feat(landing): link localized refund policy"
```

### Task 4: Verify and create the audited pull request

**Files:**
- Verify: `apps/landing-page/out/*/refund-policy/index.html`
- Verify: `apps/landing-page/out/*/pricing/index.html`

**Interfaces:**
- Consumes: completed source changes and ODC-authenticated `nexu-io/open-design` repository.
- Produces: one reviewable PR containing the page, entry, translations, tests, docs, and existing analytics.

- [ ] **Step 1: Run formatting/diff checks**

```bash
git diff --check
```

Expected: exit 0 with no whitespace errors.

- [ ] **Step 2: Run the full landing-page test suite and build**

```bash
pnpm --dir apps/landing-page test
pnpm --dir apps/landing-page build
```

Expected: all tests pass, Astro checks report zero errors, and all 11 locale routes are generated.

- [ ] **Step 3: Inspect representative generated output**

Verify English, Chinese, Japanese, Turkish, and Italian output includes localized policy text, a localized pricing CTA, `support@open-design.ai`, and no replacement characters (`�`). Verify the localized pricing CTA targets the same locale's refund-policy route.

- [ ] **Step 4: Reconcile with current main without losing scoped work**

Fetch `origin/main`, inspect conflicts, and rebase/cherry-pick the scoped commits onto a fresh `codex/refund-policy-multilingual` branch. Preserve unrelated user work; do not use destructive reset or checkout commands.

- [ ] **Step 5: Re-run focused tests and build after reconciliation**

```bash
pnpm --dir apps/landing-page exec node --import tsx --test tests/refund-policy-contract.test.ts
pnpm --dir apps/landing-page build
```

Expected: exit 0 after synchronization with current main.

- [ ] **Step 6: Create the PR through ODC**

```bash
odc gh pr create --title "feat(landing): localize refund policy" --body-file /tmp/open-design-refund-policy-pr.md
```

The PR body must summarize the 11-language policy, localized pricing entry, existing support-email tracking, validation performed, and explicitly state that no Vercel deployment is part of this PR.
