---
name: DeviceChart
description: Clean, premium SaaS — cool neutral canvas, emerald accent, always-on soft elevation.
colors:
  canvas: "#eef1f5"
  ink: "#111827"
  ink-hover: "#000000"
  card-white: "#ffffff"
  muted-surface: "#f1f2f4"
  faded-ink: "#4b5563"
  hairline: "#e5e7eb"
  emerald: "#059669"
  destructive: "#c81e1e"
  success: "#15803d"
  success-bg: "#f0fdf4"
  warning: "#b45309"
  warning-bg: "#fffbeb"
  danger-bg: "#fef2f2"
  sidebar-active: "#d1fae5"
  mint-tint: "#e3f2ec"
  butter-tint: "#fbf0d3"
  blush-tint: "#fae8e1"
typography:
  headline:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 600
    fontSize: "0.875rem"
    lineHeight: 1
  body:
    fontFamily: "IBM Plex Sans, ui-sans-serif, system-ui, sans-serif"
    fontWeight: 400
    fontSize: "0.875rem"
    lineHeight: 1.5
  label:
    fontFamily: "JetBrains Mono, ui-monospace, SFMono-Regular, monospace"
    fontWeight: 500
    fontSize: "11px"
    letterSpacing: "0.08em"
    fontFeature: "tabular-nums"
rounded:
  full: "999px"
  lg: "0.625rem"
  md: "0.5rem"
  sm: "0.375rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-primary-hover:
    backgroundColor: "{colors.ink-hover}"
  button-outline:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  button-destructive:
    backgroundColor: "{colors.destructive}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.full}"
    padding: "8px 16px"
  card:
    backgroundColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "20px"
    shadow: "always-on soft"
  badge-success:
    backgroundColor: "{colors.success-bg}"
    textColor: "{colors.success}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-warning:
    backgroundColor: "{colors.warning-bg}"
    textColor: "{colors.warning}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  badge-destructive:
    backgroundColor: "{colors.danger-bg}"
    textColor: "{colors.destructive}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  tag-chip:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  input:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "36px"
---

# Design System: DeviceChart

## 1. Overview

**Creative North Star: "Clean Premium"**

DeviceChart looks like a well-built, premium enterprise SaaS tool — the register a
finance or IT lead already trusts, in the visual family of Stripe's dashboard or Attio,
not a themed "concept." A cool neutral canvas holds white cards that read as gently
raised via a soft, always-on shadow (not a flat page). One confident emerald accent does
all interactive work. Figures are set in a true monospace so counts, tags, dates, and
prices line up like real ledger columns — that discipline carries over from this
system's predecessor, "The Ledger," even though the palette and elevation model changed.
Status color (red/amber/green) is confined strictly to badges and alerts; it never
decorates.

This replaced "The Ledger" (warm paper, verdigris, flat-at-rest cards) after that system
was judged too quiet/generic once fully built out — see `docs/session-handoff.md` and
git history for the design history. It still explicitly rejects the original
pre-Ledger prototype look: no indigo, no dark sidebar, no crowded toolbars, no nested
tabs, no nav badges implying a feature is locked behind a plan tier (every plan gets
every feature; only counts gate).

**Key Characteristics:**
- Cool neutral canvas (`#eef1f5`) under white cards that are always gently elevated, never flat
- One accent color (emerald) does all interactive work; pastel tints are backgrounds only, never accents
- Monospace for anything tabular — tags, dates, counts, prices — sans-serif for everything else
- Buttons and tags stay fully pill-shaped (retained from the prior system); cards use a tighter 10px radius, not 16px
- Status color lives only in badges; masked/sensitive values get an explicit, audited reveal, never a default show

## 2. Colors

A restrained palette: one primary interactive color, a cool-neutral scale for structure, and status colors locked to badges/alerts only.

### Primary
- **Emerald** (`#059669`): the only interactive accent in the system — links, focus rings, active nav state, primary data highlights (health-score ring, stat-card icon chips). Used sparingly; its rarity is what makes it read as intentional rather than decorative. Deliberately a more saturated, cleaner green than the muted teal it replaced.

### Neutral
- **Canvas** (`#eef1f5`): page background — cool, not warm-tinted. The single biggest lever that took this system out of "generic AI cream" territory.
- **Card White** (`#ffffff`): card/surface background.
- **Muted Surface** (`#f1f2f4`): recessed surfaces (table zebra-adjacent rows, filter bars, the topbar's demo badge).
- **Ink** (`#111827`): primary text and the fill for primary buttons — cool near-black, not warm.
- **Faded Ink** (`#4b5563`): secondary/muted text — labels, timestamps, helper copy. ~8.9:1 against both Canvas and Card White, comfortably over WCAG AA's 4.5:1 floor.
- **Hairline** (`#e5e7eb`): dividers, table rules, and any border that's intentionally kept (e.g. dashed empty-state cards, destructive-outline cards) — always 1px. Ordinary cards no longer carry a border at all; elevation alone does that job now (see Elevation).

### Named Rules
**The One-Accent Rule.** Emerald is the only color that means "interactive" anywhere in the system. If something is clickable and not emerald (or ink, for primary buttons), reconsider it.

**The Badge-Only Status Rule.** Destructive red (`#c81e1e`), success green (`#15803d`), and warning amber (`#b45309`) exist only inside badges, alerts, and small status text. They never appear as a section background, a button default, or a decorative flourish. Success green sits at a different value/saturation than the emerald accent on purpose — don't let them converge.

**The Tint-Is-Not-Accent Rule.** Mint (`#e3f2ec`), butter (`#fbf0d3`), and blush (`#fae8e1`) are pastel *section-background* tints, currently only used on the public marketing page's Hardware/Software split cards. They are never used for interactive elements; emerald still owns that role even inside a tinted block.

## 3. Typography

**Body/Headline Font:** IBM Plex Sans (with system-ui, sans-serif fallback)
**Label/Mono Font:** JetBrains Mono (with ui-monospace, SFMono-Regular fallback)

**Character:** Unchanged from the prior system — a grotesque-and-mono pairing chosen for a data-focused, trustworthy register. IBM Plex Sans reads plainly and confidently for prose and UI labels; JetBrains Mono's tabular figures give tags, dates, counts, and prices real-ledger-column alignment.

### Hierarchy
- **Headline** (600, 1.25rem–1.5rem, 1.2 line-height): page titles ("Assets", "Dashboard").
- **Title** (600, 0.875rem, 1.0 line-height): card titles, table column headers.
- **Body** (400, 0.875rem, 1.5 line-height): default UI text, form labels, table cells. Prose blocks (marketing copy, docs) cap at 65–75ch.
- **Label** (500, 11px, 0.08em tracking, uppercase, tabular-nums): the `.eyebrow`/`.stamp` idiom — mono, wide-tracked, small-caps-by-case labels used for section eyebrows, status stamps, and any numeral that needs to line up (asset tags, warranty countdowns, dashboard stat figures).

### Named Rules
**The Tabular-Figures Rule.** Any numeral that represents a count, a date, a price, or a tag renders in JetBrains Mono with `font-variant-numeric: tabular-nums`. Sans-serif numerals are reserved for prose paragraphs only.

## 4. Elevation

Cards read as gently raised, always — the defining trait that separates this system from
the flat-at-rest cards it replaced.

### Shadow Vocabulary
- **Soft** (`box-shadow: 0 1px 3px rgba(16,24,40,0.08), 0 2px 6px rgba(16,24,40,0.1)`): the **default, always-on** card shadow — every ordinary `Card` uses this at rest, not just on hover.
- **Lift** (`box-shadow: 0 6px 16px rgba(16,24,40,0.14), 0 2px 6px rgba(16,24,40,0.1)`): reserved for genuinely floating surfaces — the command palette, modal-like overlays — and for the hover state of already-elevated interactive cards/buttons.

### Named Rules
**The Always-Elevated Rule.** Every ordinary card carries Shadow/Soft at rest. Reserve Shadow/Lift for hover states and truly floating surfaces (dialogs, popovers) — never apply Lift as a resting state, or elevation stops communicating hierarchy.

**Cards no longer carry a border by default.** Elevation alone separates a card from the canvas. Keep a real `border` only where it's carrying independent meaning — a dashed border on an empty-state card, or a destructive-tinted border on an error card — and always pair that meaning-carrying border with an explicit `border` width utility (not the bare style modifier alone).

## 5. Components

### Buttons
- **Shape:** fully pill-shaped (`border-radius: 999px`) — retained unchanged from the prior system; not part of this redesign pass.
- **Primary:** ink fill (`#111827`), white text, `8px 16px` padding (default size). Hover shifts fill to pure black and lifts (`-translate-y-0.5` + Shadow/Lift).
- **Outline:** white fill, ink text; hover fills to Muted Surface and lifts with Shadow/Soft.
- **Ghost:** transparent, ink text; hover fills to Muted Surface only, no lift.
- **Destructive:** red fill (`#c81e1e`), white text; same pill shape and padding as primary.
- **Link:** emerald text, underline on hover only.

### Chips / Tags
- **Tag chip** (`.tag-chip`): mono, 12px, pill (999px radius), hairline border, white fill — used for asset tags (`IT-005`), and any short identifier that should look "stamped."
- **Badge:** pill, `2px 8px` padding, 12px text. Status variants (success/warning/destructive) use the matching tint background + saturated text color; `secondary` uses Muted Surface + Faded Ink; never a solid saturated fill (keeps text contrast comfortable at small size).

### Cards / Containers
- **Corner Style:** 10px radius (`--radius: 0.625rem`) — tighter and more structured than the prior system's 16px, matching the Stripe/Attio reference point.
- **Background:** Card White on Canvas.
- **Shadow Strategy:** Shadow/Soft always-on (see Elevation) — this is the primary way a card reads as a card now, not a border.
- **Border:** none by default. Only present where it independently carries meaning (dashed empty-state, destructive-tinted error card) — see the Elevation section's Named Rule.
- **Internal Padding:** 20px (header/content/footer sections use 20px horizontal, with header bottom-padding trimmed to 12px to sit tight against a title).

### Inputs / Fields
- **Style:** white fill, Hairline border, 8px-radius (`rounded-md`), 36px height, 12px horizontal padding.
- **Focus:** 2px emerald-tinted ring (`focus-visible:ring-2 ring-ring`), no border-color change alone — the ring is the sole focus signal, and it must always be visible (never removed for aesthetics).

### Navigation
- **Sidebar:** White background (distinct from the slightly cooler-gray canvas the content area sits on — a deliberate two-tone split, not a dark sidebar), ink text, active item marked with a light emerald tint (`sidebar-active`, `#d1fae5`) fill rather than a colored highlight or left-border stripe.
- **Topbar:** white/paper, hairline bottom border, org name + demo badge (Muted Surface pill) + search trigger + user menu.

### Eyebrow (signature component)
The `.eyebrow` idiom is retained from the prior system: small mono, wide-tracked, uppercase Faded Ink text for section labels.

## 6. Do's and Don'ts

### Do:
- **Do** keep emerald (`#059669`) as the only color that means "interactive" anywhere in the product.
- **Do** render every count, tag, date, or price in JetBrains Mono with tabular figures.
- **Do** use the full pill shape (999px radius) for every button and chip, no exceptions.
- **Do** give every ordinary card the always-on Shadow/Soft elevation — a flat, borderless, shadowless card is a bug in this system, not a stylistic choice.
- **Do** mask sensitive values (recovery keys, costs where role-gated) by default, with an explicit, audited reveal action — never show them plainly and never hide them with no way to reveal.
- **Do** keep every plan's UI identical — count-gating only, never a lock icon, badge, or grayed-out affordance implying a feature is paywalled.

### Don't:
- **Don't** use indigo, or any dark/near-black sidebar — this system's sidebar stays white/light.
- **Don't** add a border to an ordinary card "for definition" — elevation already does that job; a bordered-and-shadowed card looks doubled-up and dated.
- **Don't** use `border-left`/`border-right` colored stripes as an accent on cards, list rows, or callouts.
- **Don't** use gradient text, glassmorphism-as-decoration, or a hero-metric SaaS template (big number + small label + gradient accent) anywhere.
- **Don't** put a tiny uppercase tracked "eyebrow" above every section out of habit — `.eyebrow` is a real component here, which makes overusing it worse, not safer; reserve it for genuine section labels, not decoration.
- **Don't** apply status color (red/amber/green) outside a badge, alert, or explicit status text.
- **Don't** let the success badge green and the emerald accent visually converge — keep them distinguishable in context (success only ever appears inside a small badge/tint, accent appears on interactive elements).

## Provenance

Formalized by Open Design from candidate fd6e07f7-cd09-4523-a402-95225d174f5a.
