# DESIGN.md — Format Specification

**Status:** v0.1 · 2026-05-15
**Parent:** [`../spec.md`](../spec.md) · **Sibling:** [`../architecture.md`](../architecture.md)

DESIGN.md is a self-contained, plain-text representation of a visual identity. It is the single file that tells coding agents what a brand looks like — its colors, type, spacing, components, and the rationale behind every choice. Open Design uses it as the authoritative source for every artifact generation run.

---

## 1. Relationship to Google DESIGN.md Spec

This specification is designed to be **compatible with the [Google DESIGN.md format](https://github.com/google-labs-code/design.md)** (`@google/design.md`, version `alpha`), with two extensions that serve open-design's multi-agent, multi-output workflow.

| Aspect | Google spec | Open Design |
|--------|-------------|-------------|
| Machine-readable tokens | YAML front matter (recommended) | Same — adopted verbatim |
| Section names | 8 canonical names with aliases | Same 8 + 2 open-design extensions |
| Metadata | `name`, `description` in YAML | Additionally: `Category`, `Surface` in blockquotes |
| Component tokens | `components:` in YAML | Same; also `components.html` fixture for agent reference |
| Validation | `@google/design.md lint` | Same + `pnpm guard` for token-schema compliance |
| Token references | `{colors.primary}` | Same; CSS `var(--token)` also supported |

Any DESIGN.md that passes `@google/design.md lint` is a valid open-design DESIGN.md. The reverse is true when open-design extensions are absent.

---

## 2. File Structure

A DESIGN.md file has two layers:

```
┌──────────────────────────────┐
│  YAML front matter           │  ← Machine-readable tokens
│  (delimited by --- fences)   │     Recommended but not required
├──────────────────────────────┤
│  Markdown body               │  ← Human-readable design rationale
│  (## sections)               │     Required; 8 canonical + 2 extensions
└──────────────────────────────┘
```

### 2.1 YAML Front Matter (Design Tokens)

The front matter block begins with a line containing exactly `---` and ends with a line containing exactly `---`. The YAML content between these delimiters defines design tokens in structured form.

```yaml
---
version: alpha           # optional; current: "alpha"
name: <string>           # required if front matter present
description: <string>    # optional
colors:
  <token-name>: <Color>
typography:
  <token-name>: <Typography>
rounded:
  <level>: <Dimension>
spacing:
  <level>: <Dimension | number>
components:
  <component-name>:
    backgroundColor: <Color | TokenRef>
    textColor: <Color | TokenRef>
    typography: <TokenRef>
    rounded: <TokenRef>
    padding: <Dimension>
---
```

When front matter is present, its token values are **normative** — they take precedence over any prose descriptions that may differ.

### 2.2 Markdown Body (Sections)

The body uses `##` headings. Sections are identified by heading text, not position. The canonical heading names (with aliases) are defined below.

---

## 3. Token Types

### 3.1 Color

Format: `#` followed by 3, 6, or 8 hex digits (sRGB). **No other format is valid for a Color token.**

```
"#1A1C1E"
"#fff"
"#B8422E"
```

### 3.2 Dimension

Format: a number immediately followed by a CSS unit. Valid units: `px`, `em`, `rem`.

```
"48px"
"-0.02em"
"1.5rem"
```

### 3.3 Token Reference

Format: a dot-separated path to another token in the YAML tree, wrapped in `{` `}`.

```
"{colors.primary}"
"{typography.label-md}"
"{rounded.sm}"
```

For component-level tokens, references may point to composite values (e.g., `"{typography.label-md}"` resolves to the entire typography object).

### 3.4 Typography

An object with these optional properties:

| Property | Type | Example |
|----------|------|---------|
| `fontFamily` | string | `"Public Sans"` |
| `fontSize` | Dimension | `"48px"` |
| `fontWeight` | number | `600` |
| `lineHeight` | Dimension \| number | `1.1` (unitless multiplier) or `"28px"` |
| `letterSpacing` | Dimension | `"-0.02em"` |
| `fontFeature` | string | `'"ss01", "tnum"'` |
| `fontVariation` | string | `'"wght" 600'` |

---

## 4. Canonical Sections

Sections may be omitted if irrelevant, but when present they **must appear in the order listed below**. Section headings are matched by name using the canonical heading with its defined aliases.

| # | Canonical heading | Aliases | Notes |
|---|-------------------|---------|-------|
| 1 | `## Overview` | `## Brand & Style`, `## Visual Theme & Atmosphere` | |
| 2 | `## Colors` | `## Color Palette & Roles` | |
| 3 | `## Typography` | `## Typography Rules` | |
| 4 | `## Layout` | `## Layout & Spacing`, `## Layout Principles` | |
| 5 | `## Elevation & Depth` | `## Elevation`, `## Depth & Elevation` | |
| 6 | `## Shapes` | — | New section; previously merged into Layout |
| 7 | `## Components` | `## Component Stylings` | |
| 8 | `## Do's and Don'ts` | — | |
| E1 | `## Responsive Behavior` | — | open-design extension |
| E2 | `## Agent Prompting Guide` | — | open-design extension |

### 4.1 Overview

Also: `Brand & Style`, `Visual Theme & Atmosphere`.

Holistic description of the brand's look and feel. Defines the emotional response the UI should evoke. 2-5 paragraphs of prose, typically ending with a `**Key Characteristics:**` bullet list.

**Required sub-elements:** none.
**Token mapping:** none (context for the agent).

### 4.2 Colors

Also: `Color Palette & Roles`.

Defines the color palettes. Each major role should have a prose description naming the color and its hex value.

Common naming convention for roles: `primary`, `secondary`, `tertiary`, `neutral` — with sub-roles (`container`, `on-*`) for richer systems.

**Format:** Prose paragraphs followed by `###` subsections (e.g., `### Primary`, `### Surface & Background`, `### Neutrals & Text`, `### Semantic & Accent`). Each color described as `- **Role Name** (\`#hex\`)`. May include gradient definitions in code blocks.

**Required:** At minimum, `primary` must be defined. Recommended: at least 5 colors covering background, foreground, accent, muted/secondary, and border.

**Token mapping (prose → YAML):**

| Prose role hint | YAML color token | open-design CSS token |
|-----------------|-----------------|----------------------|
| Primary / Brand / Accent | `colors.primary` | `--accent` |
| Background / Canvas / Page | `colors.background` | `--bg` |
| Surface / Card | `colors.surface` | `--surface` |
| Foreground / Text / Ink | `colors.foreground` | `--fg` |
| Muted / Secondary / Subtext | `colors.muted` | `--muted` |
| Border / Divider / Hairline | `colors.border` | `--border` |
| Error / Danger | `colors.error` | `--danger` |
| Success | `colors.success` | `--success` |
| Warning | `colors.warning` | `--warn` |

### 4.3 Typography

Also: `Typography Rules`.

Defines font families and the type hierarchy.

**Format:**
- `### Font Families` — prose or bullet list naming display and body fonts
- `### Hierarchy` — a GFM pipe table with columns: Role, Font Family, Size, Weight, Line-height, Letter-spacing (and optional Notes)
- `### Principles` (optional) — guidelines for type usage
- `### Font Fallback Notes` (optional)

Alternatively, a compact form is also valid: `size · size · size · size` sequence for the scale, with line-height and tracking described in prose.

**Required:** At minimum, display and body font families. A hierarchy definition (table or compact scale).

**Token mapping (prose → YAML):**

| Prose element | YAML typography token | open-design CSS token |
|---------------|----------------------|----------------------|
| Display font | `typography.h1` or `typography.display` | `--font-display` |
| Body font | `typography.body-md` or `typography.body` | `--font-body` |
| Mono font | `typography.code` or `typography.mono` | `--font-mono` |
| Hierarchy scale rows | `typography.<size-role>` each | `--text-xs` through `--text-4xl` |
| Line-height values | `.lineHeight` on each typography entry | `--leading-body`, `--leading-tight` |
| Letter-spacing values | `.letterSpacing` on display entries | `--tracking-display` |

### 4.4 Layout

Also: `Layout & Spacing`, `Layout Principles`.

Describes the spacing system, grid, container constraints, and border radius scale.

**Format:**
- `### Spacing System` — prose describing the base grid unit (typically 4px or 8px)
- `### Grid & Container` — max content width, gutters, column structure
- `### White Space Philosophy` (optional)
- `### Border Radius Scale` — pipe table: Level, Value, Usage

**Required:** Container max-width. Spacing base unit.

**Token mapping (prose → YAML):**

| Prose element | YAML token | open-design CSS token |
|---------------|-----------|----------------------|
| Max container width | `spacing.container-max` | `--container-max` |
| Desktop gutter | `spacing.gutter` | `--container-gutter-desktop` |
| Section gap | — | `--section-y-desktop` |
| Spacing scale | `spacing.<level>` each | `--space-1` through `--space-12` |
| Border radius scale | `rounded.<level>` each | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill` |

### 4.5 Elevation & Depth

Also: `Elevation`, `Depth & Elevation`.

Describes how visual hierarchy is conveyed — shadows, borders, color contrast, or glassmorphism.

**Format:** A pipe table (Level / Effect / Usage) followed by prose describing the shadow/elevation philosophy. Subsection: `### Decorative Depth` (optional).

**Token mapping (prose → YAML):**

| Prose element | open-design CSS token |
|---------------|----------------------|
| Flat/base level | `--elev-flat` |
| Ring/border level | `--elev-ring` |
| Raised/shadow level | `--elev-raised` |

### 4.6 Shapes

New section (previously merged into Layout as `### Border Radius Scale`). Defines the corner radius scale and any shape philosophy beyond radius (e.g., "circles and arcs encouraged for orbital themes").

**Format:** Prose describing shape language, plus a pipe table mapping radius levels to values.

**When absent:** The `### Border Radius Scale` subsection in `## Layout` is treated as equivalent.

**Token mapping (prose → YAML):**

| Prose element | YAML token | open-design CSS token |
|---------------|-----------|----------------------|
| Radius levels | `rounded.<level>` each | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill` |

### 4.7 Components

Also: `Component Stylings`.

Style guidance for component atoms. Defines per-component properties (colors, typography, rounding, padding) in prose. When YAML front matter includes `components:`, those values are normative.

**Format:** `###` subsections per component type (Buttons, Cards, Inputs, Navigation, Images). Each subsection uses bullets: `- **Property:** value description`.

**Token mapping (prose → YAML):**

| Component property | YAML component token property |
|--------------------|------------------------------|
| Background | `backgroundColor` |
| Text color | `textColor` |
| Font | `typography` (reference) |
| Corner rounding | `rounded` (reference) |
| Internal padding | `padding` |
| Fixed height | `height` |
| Fixed width | `width` |
| Fixed size | `size` |

Variants (hover, active, pressed, disabled) are expressed as separate component entries with a related key name (e.g., `button-primary`, `button-primary-hover`).

### 4.8 Do's and Don'ts

Practical guidelines and common pitfalls. Two subsections: `### Do` and `### Don't`. Each is a bullet list.

**Required:** no.
**Token mapping:** none (behavioral guardrails for the agent).

### E1. Responsive Behavior

**open-design extension** — not part of the Google spec.

Defines how the design adapts across screen sizes.

**Format:**
- A pipe table: Name, Width, Key Change
- `### Touch Targets` — minimum touch sizes
- `### Collapse Strategy` — how layout collapses on smaller screens
- `### Image Behavior` — image scaling rules

**Token mapping:**

| Prose element | open-design CSS token |
|---------------|----------------------|
| Tablet section gap | `--section-y-tablet` |
| Phone section gap | `--section-y-phone` |
| Tablet container gutter | `--container-gutter-tablet` |
| Phone container gutter | `--container-gutter-phone` |

### E2. Agent Prompting Guide

**open-design extension** — not part of the Google spec.

Quick-reference material designed for agent consumption during generation.

**Format:**
- `### Quick Color Reference` — compact bullet map: `- **Role:** "Name" (#hex)`
- `### Example Component Prompts` — 3-5 natural-language prompts
- `### Iteration Guidelines` — rules for how an agent should iterate
- `### Known Limitations` (optional)

**Required:** no.
**Token mapping:** none (guides agent behavior, not token values).

---

## 5. open-design Metadata

In addition to the YAML front matter `name` and `description`, open-design uses blockquote metadata lines immediately after the H1 heading.

```markdown
# Design System Inspired by Airbnb

> Category: E-Commerce & Retail
> Surface: web
```

### 5.1 Category

Format: `> Category: <name>`. Required. Must match one of the known category names:

`Starter`, `AI & LLM`, `Developer Tools`, `Productivity & SaaS`, `Backend & Data`, `Design & Creative`, `Fintech & Crypto`, `E-Commerce & Retail`, `Media & Consumer`, `Automotive`, `Uncategorized`

### 5.2 Surface

Format: `> Surface: <web|image|video|audio>`. Optional. Defaults to `web`. Defines the primary output surface this design system targets.

### 5.3 Description

Format: `> <one-line description>`. Optional. A single blockquote line (not starting with `Category:` or `Surface:`) between the H1 and the first `##` section. Serves as a one-line summary.

---

## 6. Token Mapping to open-design Schema

When YAML front matter is present, tokens are read directly from the YAML structure. When absent, tokens must be derived from prose (the responsibility of the derive script; see P1).

### 6.1 Mapping from YAML to open-design CSS tokens

| YAML path | open-design CSS token | Layer | Derivable from prose? |
|-----------|----------------------|-------|----------------------|
| `colors.primary` | `--accent` | A1-identity | Yes — §4.2 "Primary" or "Accent" role |
| `colors.background` (or `colors.surface`) | `--bg` | A1-identity | Yes — §4.2 "Background" role |
| `colors.surface` (card level) | `--surface` | A1-identity | Yes — §4.2 "Surface" or "Card" role |
| `colors.foreground` (or `colors.text`) | `--fg` | A1-identity | Yes — §4.2 "Foreground" or "Text" role |
| `colors.muted` (or `colors.secondary`) | `--muted` | A1-identity | Yes — §4.2 "Muted" or "Secondary" role |
| `colors.border` | `--border` | A1-identity | Yes — §4.2 "Border" role |
| `colors.error` | `--danger` | A2 | Yes — §4.2 "Error" role |
| `colors.success` | `--success` | A2 | Yes — §4.2 "Success" role |
| `colors.warning` | `--warn` | A2 | Yes — §4.2 "Warning" role |
| `typography.h1.fontFamily` (or `.display`) | `--font-display` | A1-identity | Yes — §4.3 first named font |
| `typography.body-md.fontFamily` (or `.body`) | `--font-body` | A1-identity | Yes — §4.3 body font |
| `typography.code.fontFamily` (or `.mono`) | `--font-mono` | A2 | Yes — §4.3 mono font or fallback |
| `typography.<*>.fontSize` (sorted) | `--text-xs` … `--text-4xl` | A1-structure | Yes — §4.3 hierarchy table |
| `typography.<*>.lineHeight` | `--leading-body`, `--leading-tight` | A1-structure | Yes — §4.3 hierarchy table |
| `typography.<*>.letterSpacing` | `--tracking-display` | A1-structure | Yes — §4.3 hierarchy table |
| `spacing.container-max` | `--container-max` | A1-structure | Yes — §4.4 container width |
| `spacing.<level>` (sorted) | `--space-1` … `--space-12` | A2 | Yes — §4.4 spacing base unit × multiples |
| `rounded.<level>` (sorted) | `--radius-sm`, `--radius-md`, `--radius-lg`, `--radius-pill` | A2 | Yes — §4.6 radius table |
| `(no YAML source)` | `--accent-on` | A2 | No — derived from accent luminance |
| `(no YAML source)` | `--accent-hover` | A2 | No — `color-mix(in oklab, var(--accent), black 8%)` |
| `(no YAML source)` | `--accent-active` | A2 | No — `color-mix(in oklab, var(--accent), black 14%)` |
| `(no YAML source)` | `--focus-ring` | A2 | No — `0 0 0 3px color-mix(...)` |
| `(no YAML source)` | `--motion-fast` | A2 | No — `150ms` default |
| `(no YAML source)` | `--motion-base` | A2 | No — `200ms` default |
| `(no YAML source)` | `--ease-standard` | A2 | No — `cubic-bezier(0.2, 0, 0, 1)` default |
| `(no YAML source)` | `--elev-flat` | A2 | Yes — §4.5 flat level |
| `(no YAML source)` | `--elev-ring` | A2 | Yes — §4.5 ring/border level |
| `(no YAML source)` | `--elev-raised` | A2 | Yes — §4.5 raised level |
| `(no YAML source)` | `--surface-warm` | B-slot | No — alias `var(--surface)` |
| `(no YAML source)` | `--fg-2` | B-slot | No — alias `var(--fg)` |
| `(no YAML source)` | `--meta` | B-slot | No — alias `var(--muted)` |
| `(no YAML source)` | `--border-soft` | B-slot | No — alias `var(--border)` |

Tokens listed as "No" for prose derivability default to either:
- **A2 tokens**: the `fallback` value from `design-systems/_schema/defaults.css`
- **B-slot tokens**: `var(--sibling-name)` aliasing to the nearest lower tier

---

## 7. Validation Rules

### 7.1 Google Spec Rules (run via `@google/design.md lint`)

| Rule | Severity | What it checks |
|------|----------|---------------|
| `broken-ref` | error | Token references (`{colors.primary}`) that don't resolve |
| `duplicate-heading` | error | Two sections with the same heading text |
| `missing-primary` | warning | Colors defined but no `primary` |
| `contrast-ratio` | warning | Component background/text pairs below WCAG AA 4.5:1 |
| `orphaned-tokens` | warning | Colors defined but never referenced by any component |
| `missing-typography` | warning | Colors defined but no typography tokens |
| `section-order` | warning | Sections out of canonical order |
| `missing-sections` | info | Optional sections absent when related tokens exist |
| `token-summary` | info | Count summary per token section |

### 7.2 open-design Guard Rules (run via `pnpm guard`)

Enforced by `scripts/check-tokens-fixture-sync.ts` and `scripts/check-design-system-flag-parity.ts`:

| Rule | What it checks |
|------|---------------|
| A1 required tokens | Every brand's `tokens.css` declares all A1-identity + A1-structure tokens |
| A2 required tokens | Every brand's `tokens.css` declares all A2 tokens |
| B-slot required tokens | Every brand's `tokens.css` declares all B-slot tokens |
| Unknown tokens | No stray custom property names outside schema + brand extensions |
| A2 defaults parity | `_schema/defaults.css` matches `tokens.schema.ts` fallback fields |
| Fixture sync | `components.html` `:root` block matches `tokens.css` `:root` block byte-for-byte |
| Flag parity | Token channel flag produces same output for brands without structured assets |

### 7.3 open-design Structural Rules (manual review)

| # | Rule | Severity |
|---|------|----------|
| H1 | File must begin with `# ` heading | error |
| Category | Line `> Category: <name>` must follow H1 | error |
| Sections | At least §4.1 (Overview) and §4.2 (Colors) must be present | warning |
| Colors | At least 5 color roles defined in §4.2 (bg, fg, accent, muted, border) | warning |
| Typography | At least display + body fonts defined in §4.3 | warning |
| Layout | Container max-width defined in §4.4 | warning |
| Hex format | All color values must be valid `#hex` (3/6/8 digits, sRGB) | error |

---

## 8. Consumer Behavior for Unknown Content

Compatible with [Google spec §Consumer Behavior](https://github.com/google-labs-code/design.md#consumer-behavior-for-unknown-content):

| Scenario | Behavior | Example |
|----------|----------|---------|
| Unknown section heading | Preserve; do not error | `## Iconography` |
| Unknown color token name | Accept if value is valid | `surface-container-high: "#ede7dd"` |
| Unknown typography token name | Accept as valid typography | `telemetry-data` |
| Unknown spacing value | Accept; store as string if not a valid Dimension | `grid-columns: "5"` |
| Unknown component property | Accept with warning | `borderColor` |
| Duplicate section heading | Error; reject the file | Two `## Colors` headings |

---

## 9. C-Extension Mechanism

Brand-specific tokens that fall outside the shared `TOKEN_SCHEMA` are tracked in `design-systems/_schema/tokens.schema.ts` via:

- `BRAND_EXTENSIONS[brand]` — an allowlist of brand-specific token names
- `BRAND_EXTENSION_PREFIXES` — global prefix allowlist (e.g., `--tag-bg-*`)

**Promotion path:** C-extension → B-slot → A2 → A1-identity (see `design-systems/_schema/AGENTS.md` §C → B-slot → A2 promotion path).

Cross-brand components **must not** reference C-extension tokens. They may only reference tokens in the shared `TOKEN_SCHEMA`.

---

## 10. Conformance Tiers

Every brand in `design-systems/<brand>/DESIGN.md` falls into one of three tiers:

| Tier | YAML front matter | Section names | Count | derive support |
|------|-------------------|---------------|-------|---------------|
| **Google-compatible** | Present | Google canonical | 1 (totality-festival) | Full — read tokens directly from YAML |
| **Open-design conformant** | Absent | Google canonical or open-design alias | ~146 | Derive from prose with heuristic extraction |
| **Non-conformant** | Varies | Custom / non-standard headings | ~3 (wechat, urdu, shadcn) | Read-only; no token derivation |

Non-conformant brands are preserved as-is. They still serve as agent context (the DESIGN.md body is injected into the system prompt) but cannot be machine-compiled into `tokens.css`.

---

## 11. Examples

### 11.1 Google-compatible (totality-festival)

```
design-systems/totality-festival/DESIGN.md
```
Has YAML front matter with colors, typography, rounded, spacing, components. Uses Google canonical section names. Validates with `@google/design.md lint`.

### 11.2 Open-design conformant with tokens.css (kami)

```
design-systems/kami/DESIGN.md       ← prose, 9-section, open-design section names
design-systems/kami/tokens.css      ← hand-authored, passes pnpm guard
design-systems/kami/components.html  ← fixture, synced with tokens.css
```

### 11.3 Open-design conformant, prose-only (Airbnb)

```
design-systems/airbnb/DESIGN.md     ← prose, 9-section, open-design section names
                                    ← no tokens.css (awaiting derive script)
```

---

## 12. References

- [Google DESIGN.md Spec](https://github.com/google-labs-code/design.md) — upstream canonical spec
- [`@google/design.md` on npm](https://www.npmjs.com/package/@google/design.md) — CLI: `lint`, `diff`, `export`, `spec`
- [W3C Design Tokens Format Module](https://tr.designtokens.org/format/) — DTCG format that `export --format dtcg` emits
- [`design-systems/_schema/AGENTS.md`](../../design-systems/_schema/AGENTS.md) — open-design token layering (A1/A2/B-slot/C)
- [`design-systems/_schema/tokens.schema.ts`](../../design-systems/_schema/tokens.schema.ts) — canonical token list
- [`design-systems/_schema/defaults.css`](../../design-systems/_schema/defaults.css) — A2 fallback values
