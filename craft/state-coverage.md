# State coverage craft rules

Universal rules for what every interactive surface must render. The active
`DESIGN.md` decides how each state looks; this file decides which states must
exist and what they must contain. The single most reliable AI-design failure
is shipping only the populated state.

> Distilled from WCAG 2.2, NN/g, Material Design 3, Apple HIG, and Baymard
> Institute checkout research.

## The five required states

Every surface that fetches, transforms, or accepts data must render all five.

| State | Triggered when | Must contain |
|---|---|---|
| **Loading** | Data is in flight | Skeleton, spinner, or shell — plus a 15 s "taking longer than expected" fallback |
| **Empty** | No records yet, or query returned nothing | Headline, plain explanation, primary CTA |
| **Error** | Fetch failed, server failure, validation rejection | Plain-language cause, recovery action, preserved user input |
| **Populated** | Data present, primary case | The state the design was actually drawn for |
| **Edge** | Extreme volume, long strings, missing optional fields, RTL or long-word content, partial network | Layout that does not break |

Render-and-screenshot test: every list, table, card, form, and panel in the
artifact has all five. Missing states are the most common silent failure of
AI-generated UI.

**Test matrix.** Concrete edge scenarios the surface must survive:

| Skill type | Edge scenario |
|---|---|
| Dashboard / table | 10,000+ rows, all numeric columns, sort + filter applied |
| Mobile card / list | 200-char title, missing avatar, missing secondary CTA |
| Form | All optional fields empty, all required fields at max length |
| Search results | Single-character query, query with only special chars, 1,000+ result count |
| Detail view | Missing all optional metadata, RTL primary content with LTR embeds |

## Form-specific states

Forms add three states on top of the five.

| State | Triggered when | Behavior |
|---|---|---|
| **Untouched** | Field has not yet had focus | Default styling; no validation messages |
| **Dirty (valid)** | User typed and field passes validation | Persistent helper text remains; no success-coloring |
| **Submitted-pending** | Submit clicked, awaiting server | Submit button enters loading state; fields lock against re-submission |

Validation timing: validate **on blur**, not on first keystroke. For password
and similar live fields, validate on each keystroke *only after the first
blur*. Remove the error message the instant input becomes valid.

## Empty state composition

Empty is not the absence of state. It is its own state with a job.

- **First-use empty** — illustration + headline + value sentence + primary CTA. The empty is the onboarding moment.
- **No-results empty** — echo the query, suggest alternatives, never leave a true blank.
- **Cleared empty** — celebratory phrasing, optional next-action.
- **Error-as-empty** — never. An error is its own state with recovery information; do not collapse error into empty.

**Server-driven vs client-driven.** When a search or query API can return fallback content in the empty payload (suggestions, related categories, popular results), prefer that over a client-side echo. Algolia, Elastic, and most modern search backends support this — the server has more context for what "no results, but maybe try X" should mean.

## Error state composition

Every error must answer three questions, in this order:

1. **What happened.** "Your card was declined." Not "Something went wrong."
2. **Why, if knowable.** "Insufficient funds." Or "Network unreachable — check your connection."
3. **What the user can do.** A retry button, an alternative path, or a support link.

Preserve user input across the error. The form must not clear on submit
failure.

Severity tiers:

- **Field-level** — red border, inline message, focus moves to the field.
- **Form-level** — error summary banner at top + per-field markers.
- **Section-level** — inline panel with retry, surrounding sections still functional.
- **Page-level** — full error state with illustration and recovery CTA.
- **App-level** — persistent banner or modal for critical loss-of-functionality.

Match severity to surface scope. A field validation failure does not warrant
a page-level error.

**Retry discipline.** A retry surface is not a button alone. It has timing rules:

- First retry fires immediately on user click.
- Second and third retries use exponential backoff: 2 s, 4 s, 8 s max.
- After 3 failed retries, replace "Retry" with "Contact support" plus a copyable error ID. The user has done their job; the system now needs a human.
- Show "Last attempted: Xs ago" on the error surface after the first retry, so the user knows how stale the failure is.

## Loading state thresholds

Pick the indicator by expected duration, not by what's available in the
component library.

| Duration | Indicator |
|---|---|
| 0–300 ms | None. Render synchronously; users perceive no delay. |
| 300 ms – 2 s | Subtle spinner or skeleton. |
| 2 – 10 s | Skeleton matched to expected layout, or labelled spinner ("Loading payments…"). |
| 10 – 30 s | Determinate progress bar with cancel option. |
| 30 – 60 s | Progress bar with explicit cancel affordance. The "taking longer than expected" notice already appeared at 15 s; do not repeat it. |
| 60 s+ | Stop animation. Show error with retry, cancel, or continue. |

Never leave a spinner running indefinitely. Start a timeout on every request.

## ARIA and focus rules

State changes must be announced and focused correctly.

| Change | ARIA | Focus action |
|---|---|---|
| Inline error on submit | `role="alert"` on the message | Move focus to first error field |
| Toast / non-urgent confirmation | `role="status"` (polite live region) | Do not move focus |
| Critical error or destructive confirmation | `role="alertdialog"` (assertive) | Move focus to dialog |
| Loading begins | `role="status"` announcement ("Loading…") | Do not move focus to spinner |
| Loading ends, content appears | — | Move focus to loaded content if action was user-initiated |

Live region containers must exist in the DOM before content is injected.
Adding `aria-live` simultaneously with content does not trigger an
announcement.

## Common mistakes (lint these)

- Surface renders only the populated state; loading, empty, error, and edge are absent.
- Empty state is a literal blank or "No data" text with no headline, explanation, or action.
- Error message reads "Something went wrong" with no cause or recovery.
- Spinner with no timeout; runs indefinitely on slow or failed requests.
- Submit clears form fields on validation failure, forcing re-entry.
- Inline validation fires on first keystroke instead of on blur.
- Full-page loading replaces the chrome when only one section is fetching.
- Toast appears at a different screen position than previous toasts in the same artifact.
- Color alone conveys error state — no icon, no text label.
- Auto-dismissing toast cannot be paused on hover or focus (WCAG SC 2.2.1).
