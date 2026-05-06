# Accessibility baseline craft rules

Universal rules for the legal floor of accessibility plus the craft
commitments that go beyond it. The active `DESIGN.md` decides brand
appearance; this file decides which rules an artifact has to clear
before it ships.

> Grounded in primary sources: WCAG 2.2 Understanding pages,
> ISO/IEC 40500:2025, ADA Title II 2024 + 2026 IFR, EN 301 549 v3.2.1,
> WAI-ARIA 1.3 + AccName 1.2 + Core AAM 1.2, WebAIM Million 2026
> (February 2026 crawl), A11yn (arXiv 2510.13914), APCA W3C silver
> branch.

## Prior art and scope

Existing OSS a11y guidance for AI agents (`fecarrico/A11Y.md`,
`awesome-copilot agents/accessibility.agent.md`,
`Community-Access/accessibility-agents`) tends to inline a checklist of
WCAG SCs without versioning the legal floor or specifying which
constraints survive on iOS / Android / Flutter. This file scopes
narrower: the compliance floor an OD artifact must clear, with
jurisdiction notes and native-mobile parity. Heuristic rules and
linter-checked items live in sibling craft files
(`anti-ai-slop.md`, `state-coverage.md`); WCAG SC numbers map to
specific rules below rather than being re-listed.

## The legal floor changes by jurisdiction

- **EU (EAA, enforcement live 2025-06-28):** EN 301 549 v3.2.1 is the OJ-cited harmonised standard; it references **WCAG 2.1 AA**. EN 301 549 v4.1.1 (which incorporates WCAG 2.2's nine new SCs) is OJ-citation-targeted late 2026 / 2027. Until then, EAA references WCAG 2.1. The Web Accessibility Directive (WAD, EU 2016/2102) covers public-sector bodies separately and also points at EN 301 549.
- **US public sector — ADA Title II 2024 final rule:** **WCAG 2.1 AA**. The 2026-04-20 IFR slipped deadlines: 2027-04-26 for jurisdictions with population ≥ 50,000; 2028-04-26 for sub-50,000 and special districts.
- **US federal procurement — Section 508 (Revised 508 Standards):** harmonised with EN 301 549 → references **WCAG 2.0 AA** in the current published rev. The Access Board has WCAG 2.x updates in flight; until they ship, federal IT procurement floor is WCAG 2.0.
- **US private sector — ADA Title III:** no federal regulation specifies a technical standard. Settlements and DOJ guidance routinely cite **WCAG 2.1 AA** as the de-facto target, but the legal mechanism is case-by-case, not rule-based.
- **ISO/IEC 40500:2025** (October 2025) ratified WCAG 2.2 verbatim. Does not by itself change EU or US legal floors.

**Practical rule for craft:** target **WCAG 2.2 AA** as the working
ceiling. It clears the WCAG 2.1 AA legal floor in both jurisdictions
and prepares for v4.1.1. Anything below 2.2 AA is craft debt.

## Color contrast

| Pair | WCAG 2.x AA minimum |
|---|---|
| Normal text below 18 pt regular / 14 pt bold (covers most body and UI text) | 4.5:1 |
| Large text (≥18 *pt* regular ≈24 px, or ≥14 *pt* bold ≈18.5 px) | 3:1 |
| Non-text UI components and graphical objects | 3:1 |
| Focus indicator vs adjacent and unfocused state | 3:1 |

Thresholds are **inclusive** — exactly 4.5:1 or 3:1 passes. Don't round
up: 2.999:1 fails because rounding is not a permitted mechanism.

"Large text" means **18 pt** regular, not 18 px. 18 px regular needs
4.5:1; 14 pt bold (≈18.5 px) qualifies for 3:1, 14 px bold does not.

**APCA as a parallel design check.** APCA's Lc value catches font-weight
and stem-thickness effects that WCAG 2.x luminance ratios miss. Body
copy at Lc ≥60 is a reasonable parallel pass; APCA's actual lookup
table is size- and weight-dependent (heavier weights at larger sizes
clear at lower Lc, thin small text needs Lc ≥75+). APCA is not part
of WCAG, EN 301 549, ADA, or Section 508 compliance as of 2026-05 —
keep WCAG 2.2 AA as the compliance floor and treat APCA as
design-review only. If you ship APCA tooling, use the `apca-w3`
package; the SAPC repo is non-commercial.

## Touch targets

| Bar | SC | Size |
|---|---|---|
| AA (legal floor) | 2.5.8 Target Size (Minimum) | **24×24 CSS px** |
| AAA (craft commitment) | 2.5.5 Target Size (Enhanced) | 44×44 CSS px |
| iOS HIG | — | 44×44 pt |
| Material 3 | — | 48×48 dp |

WCAG 2.5.8 lists five exceptions where the 24×24 minimum doesn't
apply: **Spacing** (a 24-CSS-px exclusion circle around the target
doesn't intersect adjacent ones), **Equivalent** (an alternative
control of sufficient size achieves the same function), **Inline**
(target sits inside a sentence, e.g. links in body copy), **User
agent control** (browser default like a native scrollbar), and
**Essential** (the smaller size is required to convey information,
e.g. a map pin). The Spacing exception is the one icon-button
toolbars rely on; the others are narrower than they read and
shouldn't be used to justify undersized primary actions.

## Focus visibility

Removing the focus outline via CSS is a **triple failure**: 1.4.11
Non-text Contrast, 2.4.7 Focus Visible, and 2.4.13 Focus Appearance
(AAA). Use `:focus-visible` for keyboard users; suppress the outline
for mouse clicks only when an alternative non-color affordance exists.

For AAA (2.4.13): indicator area must equal at least a 2 CSS px
perimeter of the component, contrast ≥3:1 between focused and
unfocused states. A 1-px outline at 3:1 doesn't qualify.

## Form input labels

WebAIM Million 2026 (which uses WAVE, not axe-core): **51% of top 1M
home pages have at least one missing form-input label; 33.1% of all
6.9M inputs are unlabeled**. The page-level rate moved from 48.2%
(2025) to 51% (2026) — missing-label prevalence is one of the few
categories WebAIM explicitly calls out as rising in 2026, against an
overall errors-per-page count of 56.1.

Default form-error wiring (WCAG 2.2 + ARIA APG):

```html
<label for="email">Email</label>
<input id="email" type="email" required
       aria-describedby="email-hint email-error"
       aria-invalid="true">
<span id="email-hint">Used for receipts only.</span>
<span id="email-error" role="alert">Email must include @ and a domain.</span>
```

`aria-describedby` is the production default; `aria-errormessage` has
incomplete screen-reader support as of 2026-05 (full on NVDA, partial
on JAWS / VoiceOver / TalkBack) — treat as progressive enhancement.

WCAG 3.3.7 Redundant Entry is **Level A** (legal floor). Re-asking for
data the user already entered "in the same process" fails unless the
site auto-populates or offers a selectable shortcut. Browser autofill
does not satisfy it.

## Keyboard operability and semantic structure

Visual contrast and labelled inputs don't matter if a keyboard or
screen-reader user can't reach the control or parse the page. The
bullets below are Level A / AA WCAG essentials plus a small set of
structural conventions OD treats as craft commitments. WCAG levels
are noted per item.

- **Tab reachability** (2.1.1 Keyboard, Level A): every interactive element must be reachable and operable via keyboard. `tabindex="-1"` removes from the tab order; `tabindex` values >0 break document order and should not be used. (2.1.3 No Exception extends 2.1.1 to AAA by removing the underlying-function exception.)
- **Activation keys** (2.1.1, Level A): `<button>` activates on Enter and Space; `<a href="…">` activates on Enter. A bare `<a>` without `href` is not a link, not focusable, and not keyboard-operable — use `<a href="…">` for navigation or `<button>` for actions, never a placeholder anchor. Custom controls must implement the matching key handlers and `role`.
- **No keyboard trap** (2.1.2, Level A): focus must be able to leave any component via the same standard keys it entered with. Modal dialogs are a focus-trap *by design*, not a violation — they trap until dismissed by Escape or the close button.
- **Focus order** (2.4.3, Level A): tab order must follow the meaningful reading order. Don't rely on positive `tabindex` to fix DOM that's out of order; fix the DOM.
- **Native control first** (craft convention, anchored on 4.1.2 Name/Role/Value Level A): a `<button>` is keyboard-operable, focusable, name-resolvable, and announced as a button by every AT for free. `<div role="button" tabindex="0">` requires you to re-implement all of that and most reimplementations miss `aria-pressed`, disabled state, or Space-on-keyup. Reach for ARIA only when no native element fits.
- **Document language** (3.1.1, Level A): `<html lang="...">` is required. Sub-tree language switches use `lang` on the inner element.
- **Heading hierarchy** (1.3.1 Info and Relationships Level A; 2.4.6 Headings and Labels Level AA): WCAG requires programmatically-determined structure and descriptive headings, not a specific outline shape. OD craft convention layers on: prefer one `<h1>` per page and don't skip levels (`<h1>` → `<h3>` without `<h2>`). Visual size and heading level are independent.
- **Landmarks** (1.3.1, 2.4.1 Bypass Blocks Level A): use `<header>` `<nav>` `<main>` `<aside>` `<footer>` rather than `<div role="banner">` etc. AT users navigate by landmark; a page with no landmarks is a wall of divs.
- **Text alternatives** (1.1.1 Non-text Content, Level A): `<img alt="...">` for content images, `alt=""` for decorative; `aria-label` on icon-only buttons; long-form description for charts and SVG data viz. A chart without a text alternative is unreadable to a screen reader.

## ARIA discipline

WebAIM Million 2026 shows ARIA pages average **59.1 errors** vs
**42** on non-ARIA pages — about 17 extra errors on the ARIA side.
The gap was 30 in 2025 (57 vs 27) and 15 in 2024; YoY direction is
noisy, but ARIA usage is up (82.7% of home pages in 2026 vs 79.4% in
2025) while correctness lags. ARIA deployment outpaces ARIA
correctness.

Decision order, per ARIA APG:

1. Native HTML element with the right semantics.
2. Native element under custom visuals if restyling is required.
3. APG pattern verbatim if neither fits.
4. Closest APG pattern + documented deviation. Last resort.

Never invent ARIA.

## Reduced motion and flashing

See `animation-discipline.md` for the full rule set. The non-negotiable
that anchors here: WCAG 2.3.1 (Level A) — flashing more than three
times per one-second period is non-conformant unless the flash area
stays below the general and red flash thresholds. Photosensitive
epilepsy is the protected concern.

## Native mobile parity

Web ARIA does not auto-translate. Each platform has its own labelling API.

| Platform | Label | Role |
|---|---|---|
| iOS UIKit | `accessibilityLabel` | `accessibilityTraits` |
| iOS SwiftUI | `.accessibilityLabel(…)` | `.accessibilityAddTraits(.isButton)` |
| Android Compose | `Modifier.semantics { contentDescription = … }` | `Modifier.semantics { role = Role.Button }` |
| Flutter | `Semantics(label: …)` | `Semantics(button: true, …)` |
| React Native | `accessibilityLabel` | `accessibilityRole` |

Use the platform API for each target. AI-generated mobile UI that
mirrors web ARIA verbatim usually misses the platform-native screen
reader path.

## Common mistakes (lint these)

- "Target Size 44×44" cited as the AA bar. 44×44 is **AAA** (2.5.5). AA is **24×24** (2.5.8).
- "18 px = large text" — wrong. Threshold is 18 *pt* regular (~24 px) or 14 pt bold (~18.5 px).
- "EAA = WCAG 2.2 AA" — wrong. EN 301 549 v3.2.1 is anchored to WCAG 2.1.
- "Section 508 = WCAG 2.1 AA" — wrong as of 2026-05. Revised 508 still references WCAG 2.0 AA; the Access Board update is in flight, not shipped.
- "Tabindex fixes focus order" — `tabindex` >0 reorders against DOM and almost always makes it worse. Fix the DOM.
- "Modal traps focus → keyboard trap" — confusing 2.1.2. A modal trapping focus until Escape / close is correct behaviour, not a violation.
- "Heading size = heading level" — visual hierarchy and `<h1>`/`<h2>`/`<h3>` are independent. Style the level you mean.
- "WebAIM Million uses axe-core" — uses WAVE.
- "WCAG 3 will use APCA" — APCA was dropped from WCAG 3 in July 2023.
- "Adding ARIA improves accessibility" — empirically the opposite. WebAIM Million 2026: ARIA pages average 59.1 errors, non-ARIA pages 42.
- "Bare `<a>` with click handler is a link" — wrong. `<a>` without `href` is not focusable, not keyboard-operable, and not a link. Use `<a href="…">` for navigation, `<button>` for actions.
- Removing the focus outline via `outline: none` without a replacement. Triple failure: 1.4.11, 2.4.7, 2.4.13.
- Placeholder text as the only label for a form input. Fails 1.3.1 and 3.3.2; placeholder disappears on input.
- Using `aria-description` as the sole state-carrier on `role="row"`. JAWS 2025/2026 silently drops it ([FreedomScientific standards-support #927](https://github.com/FreedomScientific/standards-support/issues/927)).
- Native HTML `<button>` reimplemented as `<div role="button">` without keyboard handling, focus, or `aria-pressed`.
- A11y treated as web-only. Flutter / iOS / Android have their own labelling APIs that web ARIA doesn't reach.
