# Chala.AI tokens.json — Reconciliation Audit

> Date: 2026-05-14
> Author: Hand-authored seed v1 (per plan `calm-floating-fern` §5a step 1–3)
> Reconciled against: `design-systems/chala-ai/DESIGN.md` and `projects/Gym.AI/Chala.AI/apps/ios/ChalaAI/ChalaAI/Views/Components/Theme.swift` (read at this date)

This file records the one-time reconciliation between the three sources of
chala-ai design values that existed before `tokens.json` was authored:

1. **DESIGN.md** — the human-readable rationale doc.
2. **Theme.swift** — the iOS app's hand-authored constants.
3. **chala-ai-mobile/assets/template.html** (legacy) — the skill's preview shim
   had its own CSS variables.

`tokens.json` is now the source of truth. Future updates flow via
`tools/tokens-build/extract.ts` (LLM extraction) and PR review.

---

## Color reconciliation

| Token | DESIGN.md value | Theme.swift constant | tokens.json | Notes |
|---|---|---|---|---|
| `bg` | `#050505` | `Theme.Dark.bg = #050505` | `#050505` | Match |
| `bg-elevated` | `#0B0B0B` | `Theme.Dark.bgRaised = #0B0B0B` | `#0B0B0B` | DESIGN.md calls this "Raised background". `bgRaised` → `bg-elevated` is a rename to match ODML naming. |
| `bg-overlay` | (not specified) | (not present) | `rgba(255,255,255,0.06)` via `$extensions.opacity` | **NEW.** Filling the ODML vocabulary slot. Reasonable midpoint between `bg-elevated` and `border-strong` (16%). Needs design sign-off when first used. |
| `fg` | `#FFFFFF` | `Theme.Dark.text = .white` | `#FFFFFF` | Match |
| `fg-muted` | `rgba(255,255,255,0.55)` | `Theme.Dark.textDim = .white.opacity(0.55)` | white @ 0.55 | DESIGN.md term "Text Dim" → ODML `fg-muted` rename |
| `fg-subtle` | `rgba(255,255,255,0.32)` | `Theme.Dark.textFaint = .white.opacity(0.32)` | white @ 0.32 | DESIGN.md term "Text Faint" → ODML `fg-subtle` rename. Note: DESIGN.md also has `Text Muted = 0.18` which has no ODML slot; consider adding `fg-faint` in v2. |
| `accent` | `#FFFFFF` (system is monochrome) | (no constant — derived from `text`) | `#FFFFFF` | DESIGN.md §2.Accent: "system is monochrome; accent is pure white" |
| `accent-fg` | `#0B0B0B` | `Theme.Dark.primaryText = #0B0B0B` | `#0B0B0B` | Match — primary button text |
| `success` | `#34C759` (legacy) | `Theme.Color.success = #34C759` | `#34C759` | Match. Legacy iOS green — avoid in new V2 surfaces. |
| `warning` | `#FF9500` (legacy) | `Theme.Color.warning = #FF9500` | `#FF9500` | Match. Avoid in V2. |
| `danger` | `#FF3B30` (legacy) | `Theme.Color.destructive = #FF3B30` | `#FF3B30` | Match. Used for destructive button variant. |
| `border` | `rgba(255,255,255,0.08)` | `Theme.Dark.hairline = .white.opacity(0.08)` | white @ 0.08 | Match (rename `hairline` → `border`) |
| `border-strong` | `rgba(255,255,255,0.16)` | `Theme.Dark.hairlineStrong = .white.opacity(0.16)` | white @ 0.16 | Match (rename `hairlineStrong` → `border-strong`) |

**Untranslated DESIGN.md colors** (in DESIGN.md but no ODML slot — documented for posterity):
- `Text Muted` (0.18 opacity) — too subtle for any of the named ODML colors. Defer.
- `Card` (`rgba(255,255,255,0.04)`) — chala renderers will need to derive this from `bg-overlay` or accept a card-specific fill. Layer 2 `ODCard.swift` decision pending.
- `Card Selected` (`rgba(255,255,255,0.12)`) — same as above; state, not token.
- `Input Background` (`rgba(255,255,255,0.05)`) — input-specific, not a global token.
- `Pill Background` (`rgba(255,255,255,0.10)`) — pill-specific.
- iOS-blue `#007AFF` legacy — out of V2; do not propagate.

---

## Spacing reconciliation

| Token | DESIGN.md | Theme.swift | tokens.json | Notes |
|---|---|---|---|---|
| `none` | (implicit) | (not present) | 0 | Filling the gap. |
| `xs` | `4` | `Theme.Spacing.xs = 4` | 4 | Match |
| `sm` | `8` | `Theme.Spacing.sm = 8` | 8 | Match |
| `md` | `16` | `Theme.Spacing.md = 16` | 16 | Match |
| `lg` | `24` | `Theme.Spacing.lg = 24` | 24 | Match |
| `xl` | `32` | `Theme.Spacing.xl = 32` | 32 | Match |
| `2xl` | `48` | `Theme.Spacing.xxl = 48` | 48 | **Rename: xxl → 2xl** per plan §10 locked decision. Breaking change to current Theme.Spacing callers — grep + replace required during Layer 0 iOS work. |
| `3xl` | (not specified) | (not present) | 64 | **NEW.** Filling the ODML vocabulary slot. Value chosen as 2 × `lg`; needs validation when first used in a design. |

---

## Radius reconciliation

| Token | DESIGN.md | Theme.swift | tokens.json | Notes |
|---|---|---|---|---|
| `none` | (implicit) | (not present) | 0 | Filling the gap. |
| `sm` | `6` | `Theme.Radius.small = 6` | 6 | Match. (Theme.Radius also has `sharp = 2` — too subtle for ODML, omitted.) |
| `md` | `8` | `Theme.Radius.card = 8`, `Theme.Radius.button = 8` | 8 | Both card and button share this value in V2. |
| `lg` | `15` | `Theme.Radius.input = 15` | 15 | Match. The 15px non-power-of-2 is intentional (input rounding feels softer than card). |
| `xl` | (not specified) | (not present) | 24 | **NEW.** For larger surfaces (sheets, hero cards). Needs validation. |
| `full` | `9999` | `Theme.Radius.pill = 9999` | 9999 | Match — used for pills, avatars. |

**Untranslated Theme.Radius values:**
- `Theme.Radius.sharp = 2` — DESIGN.md §1 calls out "2px border radius on interactive elements (sharp, not rounded)". This is a chala-specific micro-radius that doesn't fit the ODML stepped scale. The Layer 2 SwiftUI `ODButton` may bake in `Theme.Radius.sharp` for primary buttons instead of using `radius="sm"` — a Layer 2 implementation decision, not a token gap.

---

## Typography reconciliation

DESIGN.md scale (subset):

| Role | Size | Weight | Font | Tracking | ODML mapping |
|---|---|---|---|---|---|
| Display | 42 | 500 | Geist | −0.02em | `display` |
| Title | 36 | 500 | Geist | −0.02em | `title` |
| Heading | 28-32 | 500 | Geist | −0.02em | (not in ODML v1 — use `title`) |
| Subheading | 22-26 | 500 | Geist | −0.02em | `headline` |
| Body | 14-15 | 400 | Geist | normal | `body` |
| Label | 9-11 | 400 | GeistMono | +0.18em UPPERCASE | `caption` |
| Numeric | variable | 500 | GeistMono | −0.02em tabular | (consumer-specific — apply `mono` family + tabular variant locally) |
| Button | 13 | 500 | Geist | +0.12em UPPERCASE | (button-specific — baked into Layer 2 `ODButton`) |
| Caption | 8-9 | 400 | GeistMono | +0.06em | (overlaps with `caption`; using `caption` for both) |

**Coverage note:** ODML's 6 text styles are a coarser bucket than DESIGN.md's 9.
The mid-tier "Heading" (28-32px) collapses into `title`; mid-tier "Caption"
(8-9px) collapses into `caption`. The lost granularity is acceptable for v1
of the dialect — adding stripes (`title-sm`, `caption-lg`) later is a
backward-compatible extension.

---

## Open questions raised by this audit

1. **`fg-faint` slot in v2?** DESIGN.md has `Text Muted = 0.18` which has no
   ODML home. Three options: (a) add `fg-faint` to ODML vocab; (b) drop the
   0.18-opacity tier; (c) treat it as an opacity modifier on top of `fg-subtle`.
   No action this session; deferred to v2 dialect work.

2. **`bg-overlay` opacity value** — I chose 0.06 as a reasonable midpoint.
   Confirm with first design that consumes it.

3. **3xl spacing + xl radius values** — both are new and need a design that
   actually uses them before the values are validated.

4. **Card/Input/Pill backgrounds** — these are component-specific surface
   colors that don't fit the global palette cleanly. Recommend Layer 2 SwiftUI
   `ODCard.swift` etc. bake in the 0.04/0.05/0.10 values as part of the
   component's style, not as global tokens. Documented for Layer 2 plan.

5. **Theme.Spacing.xxl → 2xl rename** is a breaking change to existing iOS
   callers. Currently blocked on `chalaai/workout-exercise-swap` branch
   resolution.
