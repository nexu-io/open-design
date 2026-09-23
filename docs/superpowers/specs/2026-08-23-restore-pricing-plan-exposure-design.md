# Restore Authenticated Pricing Funnel Analytics Design

## Goal

Restore the Vela subscription funnel that was lost when the authenticated
plan-selection modal was replaced by the shared OpenDesign `/pricing/` page.
The restored events must continue into the existing AMR PostHog project and
preserve the current dashboard and alert contract. The migrated Pricing UI,
checkout handoff, prices, and entitlements remain unchanged.

## Confirmed Legacy Semantics

The retired surface lived behind Vela authentication on `/wallet` and
`/dashboard`. It emitted `subscription_plan_exposure` for Go, Plus, Pro, and
Max, and emitted the registry-backed `subscription_pricing_click` event for
plan CTAs, interval changes, and the Enterprise lead interactions that existed
on the modal. Both registry entries have `anonymousAllowed: false` and
`publicPageAllowed: false`.

The Vela API stored the events in AMR PostHog as:

| Registry key | AMR PostHog event | Existing breakdown key |
| --- | --- | --- |
| `subscription_plan_exposure` | `subscription_plan_exposure` | `registry_key=subscription_plan_exposure` |
| `subscription_pricing_click` | `ui_click` | `registry_key=subscription_pricing_click` |

The public Pricing page's direct OpenDesign PostHog capture is a different
pipeline. Reusing the same JavaScript event name there does not restore the AMR
funnel. The new bridge therefore terminates at Vela's authenticated analytics
pipeline rather than OpenDesign PostHog.

## Scope

- Two repositories and two PRs: Vela provides the authenticated ingestion
  boundary; OpenDesign emits from the migrated Pricing interactions.
- Only visitors with a valid Vela session and a trusted `/wallet` or
  `/dashboard` Pricing entry are included in the restored AMR funnel.
- Anonymous or direct public Pricing visitors continue to use the existing
  OpenDesign Pricing analytics only.
- Restore equivalent interactions that still exist: Go/Plus/Pro/Max exposure,
  enabled Personal subscribe/upgrade CTA, interval change, Enterprise lead
  open, and Enterprise lead submit intent.
- Do not recreate the retired modal, removed controls, checkout-result events,
  or PII-bearing legacy lead payloads.
- Do not change Pricing rendering, plan selection, checkout URLs, payment
  behavior, entitlement behavior, or existing OpenDesign analytics.

## Architecture

### Vela: authenticated Pricing analytics endpoint

Add a purpose-built authenticated endpoint at
`POST /api/v1/analytics/pricing-events`. The endpoint accepts only a small,
discriminated Pricing request contract; it does not accept arbitrary registry
keys, event names, common metadata, or free-form properties.

The endpoint:

1. requires the same valid Vela user session used by the public Pricing page's
   existing subscription-context request;
2. validates the request origin against the existing OpenDesign hosted-origin
   policy and rejects anonymous calls with `401`;
3. accepts only `plan_exposure` and `pricing_click` records, with a bounded
   batch size and bounded string fields;
4. accepts only `sourceSurface=wallet|dashboard`, Personal plan IDs
   `go|plus|pro|max`, billing intervals `monthly|yearly`, and the legacy click
   elements that the new page actually emits;
5. maps the reduced request into the existing analytics registry contract,
   stamping `pageName=workspace`, `workspaceTab=sourceSurface`, the authenticated
   user profile, server receive time, registry key, event name, event type, and
   normal common metadata;
6. sends the mapped records through the existing `AnalyticsService`, so the
   primary AMR destination receives the same event names and
   `registry_key` properties as before;
7. never accepts or forwards email, name, company, free-form lead text, URL,
   referrer text, or other PII.

The client supplies a bounded event ID and occurrence time so navigation-safe
`keepalive` delivery remains idempotent. The server rejects stale, future, or
malformed timestamps and validates every plan/click payload against the
existing registry schema before storage.

### OpenDesign: Pricing compatibility emitter

The Pricing page gains a small client that posts reduced events to the Vela
endpoint with credentials and `keepalive: true`. It does not synthesize Vela's
internal analytics envelope and does not send these compatibility records to
`window.__odTrack`.

The emitter activates only after all of the following are true:

- the Cloud Console destination is an allowlisted production Vela origin;
- the subscription-context request confirms a valid authenticated session;
- the inbound entry resolves to a trusted Vela `/wallet` or `/dashboard`
  surface;
- the Personal pricing context has finished resolving, including current plan,
  current interval, and first-month eligibility.

The trusted surface is derived only from the browser referrer when it has an
allowlisted OpenDesign/Vela origin and an exact `/wallet`, `/dashboard`,
`/cloud/wallet`, or `/cloud/dashboard` path. Query parameters never select the
source surface, and arbitrary query strings or external referrers cannot create
new analytics dimensions.

Vela links directly to the matching localized Pricing route and carries
`od_locale` alongside `cloud_console_base`. Avoiding an intermediate locale
redirect preserves the trusted Vela referrer needed by this source check; the
locale parameter itself is not used as analytics attribution.

## Event Mapping

### Plan exposure

When the Personal audience is visible, emit one `plan_exposure` input for each
visible Personal plan: Go, Plus, Pro, and Max. Vela maps each record to
`subscription_plan_exposure` with the legacy properties:

- `pageName=workspace`
- `workspaceTab=wallet|dashboard`
- `area=subscription_pricing`
- `entryPoint=open_design_entry`
- `planId`, `planName`, `billingInterval`, `priceUsd`
- `creditsGrantedUsd`, `deployLimit`, `introOfferApplied`
- `firstMonthEligible`, `isCurrentPlan`, `isRecommended`
- `autoRechargeSupported=true`
- validated optional OpenDesign campaign attribution already allowed by the
  Vela registry

Go uses the legacy catalog values: zero credits, zero deploy limit, and not
recommended. Yearly credits are normalized to one month, matching the retired
modal.

Exposure is deferred until authenticated pricing context resolves. Deduplication
includes audience, interval, eligibility, current plan, and current interval,
so a state correction cannot be swallowed. Switching to Team clears the active
Personal exposure signature; returning to Personal creates a genuine
re-exposure. Repeating the same resolved state does not.

### Pricing click

Vela maps `pricing_click` inputs to the existing registry key
`subscription_pricing_click`, whose AMR PostHog event remains `ui_click`.

- Enabled Go/Plus/Pro/Max CTA: `subscribe_now` when no current Personal plan,
  otherwise `upgrade_now`, with current and target plan/interval fields.
- User-initiated monthly/yearly change: `change_interval`, emitted before the
  new interval's exposures.
- Enterprise lead open: `request_team_access`,
  `area=enterprise_contact`, `targetDestination=lead_form`.
- Enterprise form submit intent: `team_lead_submit` before client validation or
  network submission, preserving the legacy click meaning. Existing
  `lead_submit_invalid`, `lead_submit_attempt`, `lead_submit_success`, and
  `lead_submit_failed` events continue independently in OpenDesign PostHog.

Disabled/current/downgrade-unavailable Personal CTAs, Team checkout CTAs,
removed email/story/proof controls, and programmatic interval synchronization
do not emit compatibility clicks.

## Failure and Privacy Behavior

Compatibility analytics are best effort. A timeout, `401`, validation failure,
network error, or unavailable Vela endpoint must not block rendering, form
validation, checkout navigation, or lead submission. Failures may be logged in
development but must not expose request bodies or user data.

The endpoint is authenticated, origin-restricted, schema-restricted, and
rate-limited. It stores no additional cookies and accepts no PII. Direct public
traffic cannot write to the AMR funnel, preserving the original population.

## Rollout

Deploy the Vela endpoint first. The OpenDesign emitter may then be deployed
without a compatibility window or feature migration. Until Vela is available,
OpenDesign continues its existing local Pricing analytics and checkout behavior;
the compatibility post simply fails open.

The two PRs cross-link each other and state the deployment order. The existing
AMR dashboard and alert continue querying
`subscription_plan_exposure` and `ui_click` with
`registry_key=subscription_pricing_click`; no data-source migration is required.

## Testing and Acceptance

### Vela

- Route tests prove anonymous and untrusted-origin requests are rejected.
- Contract tests prove arbitrary registry keys, unknown plans/elements,
  malformed/stale times, oversized batches, and free-form fields are rejected.
- Mapping tests prove both registry entries receive exact legacy event names,
  types, common metadata, `pageName=workspace`, and the correct
  `workspaceTab`.
- Repository tests prove the resulting PostHog payloads remain
  `subscription_plan_exposure` and `ui_click` with the legacy `registry_key`.

### OpenDesign

- Pure contract tests cover Go/Plus/Pro/Max price and grant payloads, strict
  source resolution, context-aware deduplication, click classification, and
  excluded interactions.
- DOM/browser integration tests cover authenticated context resolution before
  first exposure, same-interval state correction, audience leave/return,
  interval control ordering, enabled/disabled CTAs, Enterprise submit intent,
  and navigation-safe endpoint delivery.
- Existing `page_view`, `ui_click`, lead-form analytics, pricing UI, and checkout
  destinations remain unchanged.
- Full repository gates, typechecks, unit suites, and relevant browser tests
  pass in both repositories.

## Documentation

Update the current Feishu tracking rows for `subscription_plan_exposure` and
`subscription_pricing_click` to state that the migrated public Pricing page
emits them only through the authenticated Vela bridge and preserves
`pageName=workspace` plus `workspaceTab`. No new event name or dashboard source
is introduced.
