# Chala.AI design-system — Reconciliation Audit

> Date: 2026-05-14 (revised same day to add tokens.css)
> Author: Hand-authored seed v1 (per plan `calm-floating-fern` §5a step 1–3)
> Reconciled against: `design-systems/chala-ai/DESIGN.md` and `projects/Gym.AI/Chala.AI/apps/ios/ChalaAI/ChalaAI/Views/Components/Theme.swift` (read at this date)

This file records the one-time reconciliation between the multiple sources
of chala-ai design values:

1. **DESIGN.md** — human-readable rationale.
2. **Theme.swift** — iOS app hand-authored constants.
3. **chala-ai-mobile/assets/template.html** (legacy) — skill preview shim with
   its own CSS variables (now superseded by `od-elements.js`).

## Provenance model (revised after reading upstream's loader)

Initial seed treated `tokens.json` as the source of truth. Reading
`apps/daemon/src/prompts/system.ts` and `apps/daemon/src/design-systems.ts`
revealed that **upstream already ships its own structured token convention
(`tokens.css`)** and consumes it for picker / lint / system-prompt
injection. To avoid fighting upstream's contract, chala-ai now ships
three coexisting machine-readable forms with distinct consumers:

| File | Consumer | Naming idiom |
|---|---|---|
| `DESIGN.md` | Humans (rationale). Daemon also injects it as prose into system prompt. | Free prose |
| `tokens.css` | Upstream OD daemon: design-system loader (`design-systems.ts`), picker UI (`NewProjectPanel.tsx`), system-prompt injection (`prompts/system.ts:321`), artifact lint (`lint-artifact.ts`) | Standard schema (`--bg`, `--surface`, `--fg`, `--muted`, `--meta`, `--border`, `--accent`, `--accent-on`, `--warn`, `--danger`, `--font-display`, …) per `craft/color.md` |
| `tokens.json` | ODML side: skill validator (forthcoming), per-platform translators (SwiftUI, future React/RN). Skill prompt references these names directly via `<od-* color="fg-muted">` attributes. | ODML idiom (`bg`, `fg-muted`, `accent-fg`, `bg-elevated`, `bg-overlay`, …) per the SKILL.md token tables |

**Source of intent:** `DESIGN.md` — when changing a token value, the prose
gets updated first, then the two structured files mirror it. `tokens.css`
and `tokens.json` are both DERIVED forms; neither is privileged over the
other. They serve parallel contracts (upstream HTML pipeline vs ODML
multi-platform pipeline) and MUST stay in sync on value (the hex codes
must match across the two files; only the name keys differ).

A future automation could derive both from a single source (e.g.
`tools/tokens-build/extract.ts` per plan §5a) but until that exists, the
human PR author updates all three files together when changing any value.

## ODML ↔ standard-schema name cross-walk

For audit: every name in `tokens.json` (ODML idiom) maps to a name in
`tokens.css` (standard schema). Values are identical; names differ.

| ODML name (tokens.json) | Standard-schema name (tokens.css) | Shared value |
|---|---|---|
| `bg` | `--bg` | `#050505` |
| `bg-elevated` | `--surface` | `#0B0B0B` |
| `bg-overlay` | (no direct standard-schema slot) | `rgba(255,255,255,0.06)` — exposed only on ODML side; HTML artifacts use `--surface-warm` which aliases to `--surface` |
| `fg` | `--fg` | `#FFFFFF` |
| `fg-muted` | `--muted` | `rgba(255,255,255,0.55)` |
| `fg-subtle` | `--meta` | `rgba(255,255,255,0.32)` |
| `accent` | `--accent` | `#E0E0E0` (mapped to DESIGN.md `--primary-fill`; the prose "system is monochrome; accent is pure white" describes intent, but the FILL token lands here per DESIGN.md §2.Interactive) |
| `accent-fg` | `--accent-on` | `#0B0B0B` |
| `success` | `--success` | `#34C759` |
| `warning` | `--warn` | `#FF9500` (note: schema uses `--warn`, ODML uses `warning`) |
| `danger` | `--danger` | `#FF3B30` |
| `border` | `--border` | `rgba(255,255,255,0.08)` |
| `border-strong` | (exposed via `--elev-ring`) | `rgba(255,255,255,0.16)` — `border-strong` in ODML maps to elevation-ring on the HTML side, not a separate border tier |

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
