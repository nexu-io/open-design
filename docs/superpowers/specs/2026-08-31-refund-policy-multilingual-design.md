# Refund Policy Multilingual Design

## Goal

Use the current regional refund-policy review page as the sole content baseline and ship the refund policy plus its pricing-page entry in every active landing-page locale.

## Scope

- Active locales: English (`en`), Simplified Chinese (`zh`), Japanese (`ja`), Korean (`ko`), German (`de`), French (`fr`), Russian (`ru`), Spanish (`es`), Brazilian Portuguese (`pt-br`), Italian (`it`), and Turkish (`tr`).
- Preserve the current page structure, visual design, support address, analytics event, and regional-policy meaning.
- Translate every user-visible field: metadata, heading, preamble, four policy sections, contact text, email subject, and note label where applicable.
- Make the refund-policy language switcher use the full active `LANDING_LOCALES` set.
- Localize the pricing FAQ refund entry and its CTA for all active locales.
- Link each localized pricing page to its matching localized refund-policy page.
- Do not deploy a review build as part of this change.

## Content Baseline

The policy shown at `https://open-design-refund-regional-review.vercel.app/zh/refund-policy/` is authoritative. Translations must preserve these rules:

- Payments are generally final except where applicable law requires otherwise; partial refunds may be considered in exceptional circumstances.
- EU, UK, and Turkey customers may request a refund within 14 days for monthly and annual subscriptions and must identify their region in the request.
- South Korean customers may request a refund within 7 days.
- All other customers may request a refund within 48 hours.
- Only the first approved refund request is processed.
- Approved refunds are full when no paid benefits were used; otherwise the refund is reduced proportionally based on service time used.
- Excessive use before the request may cause rejection.
- Applications are sent to `support@open-design.ai` and include the OpenDesign account email and reason.
- Eligibility and usage follow OpenDesign backend records; arrival time depends on the payment provider.
- Approved refunds are initiated to the original payment method within 10 business days.
- Fraud, policy violations, and refund-policy abuse are not eligible.

## Pricing Entry

Use a concise localized summary that does not repeat a single universal deadline: refund eligibility varies by region, subscription type, and usage; users should view the full policy for details. Keep the localized “view full refund policy” CTA.

## Implementation

- Extend `refund-policy-content.ts` from two localized objects to all 11 active locales, retaining English fallback only as a defensive default.
- Derive page language metadata, support-email subject, language switcher options, and analytics locale from the selected locale instead of an English/Chinese binary.
- Reuse existing localized pricing FAQ collections and update each active locale's refund item and CTA.
- Generate localized refund-policy routes through the existing `[locale]` wrapper and active locale source of truth.

## Verification

- Contract tests first verify all 11 locales have complete, non-English-fallback policy content and the required regional rules.
- Tests verify the language switcher uses all active locales and each pricing entry links to its matching localized policy route.
- Run the refund-policy contract tests, landing-page type checks/build, and inspect generated localized HTML for representative LTR and CJK locales.
- No Vercel deployment.

## Pull Request

- Keep the refund-policy page, pricing entry, translations, tests, and existing tracking in one PR.
- Use only the audit-controlled Odcrew CLI (`odc gh pr ...`) for publication and PR creation.
