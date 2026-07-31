---
name: "Frontend Aesthetic Direction"
description: "Claude design system prompt skill for Frontend Aesthetic Direction"
triggers:
  - "claude frontend aesthetic direction"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Frontend Aesthetic Direction: Commit to a Look When No Brand Exists

Establish an aesthetic direction (typography, color, density, mood, component style) when the user is designing without an existing brand or design system. Use this **before** hi-fi work in a greenfield context: mocking hi-fi from scratch without committing to an aesthetic is the fastest path to AI-template output. Pick a direction first, then design within it.

## Phase 1: Confirm there's truly no existing context

Double-check: no brand guide, no existing app or product to match, no reference site the user wants to mimic, no partial design system in the codebase. If any exist, **stop and use them** — aesthetic direction is for true greenfield. If the user has a brand and forgot to attach it, ask for it before proceeding.

## Phase 2: Discover the intent

Ask the user (or confirm if stated): **three adjectives** for the desired feel; **audience**; **industry context**; **reference designs they admire** (and what specifically — the type, spacing, color, tone, density?); **off-limits** aesthetics or tropes.

If the user is unsure, propose **4 distinct visual directions**, each specified concretely — background hex / accent hex / display + body typeface, with a one-line rationale tied to the brief — and let them pick. The directions must not share a palette family: four takes on warm-cream is one direction, not four. Make at least one deliberately off-distribution.

## Phase 3: Commit to the system — make it concrete

Vague aesthetic statements ("modern and clean") produce generic designs. Commit on each axis:

### Typography

Pick **specific** fonts — headline, body (often the same family), and mono if needed — with weights and a type scale. 1–2 families maximum.

Avoid the overused defaults — Inter, Roboto, Arial, bare system stacks, and the silent serif-display defaults (Fraunces, Playfair Display, Georgia-as-display). Pick with intent: a humanist sans (Söhne, Suisse), a modern serif (Tiempos, GT Sectra), an editorial classic (Tiempos Headline, Canela), a typewriter mono (JetBrains Mono, IBM Plex Mono), a geometric sans (Söhne Buch, Visby), depending on the mood. If a paid foundry may be out of reach, name the closest free alternative (e.g., Söhne for production, Albert Sans / Geist free).

### Color

Pick a tone — warm (cream, gold, terracotta), cool (gray, slate, ice, blue), or neutral (concrete, charcoal, off-white).

**The warm-editorial combination (cream background + serif display + terracotta/amber accent) is the current default-model look.** Choose it only when the brief is genuinely editorial, hospitality, or portfolio — and say so explicitly in the direction block. If the direction drifts there without a stated reason, pick again.

Then pick: a primary brand color (with light/dark variants), at most one accent, semantic colors (success/warning/error/info), and a 5–10 step neutral scale on the chosen tone. Use `oklch()` for harmony when building from scratch (`--brand-primary: oklch(55% 0.18 250)`). Subtly tone whites and blacks — pure `#FFFFFF`/`#000000` is harsh; match the tone (e.g., `#FAFAFA` / `#1A1A1A`).

### Density

Pick a spacing scale (4px or 8px base) and a density — tight (compact dashboards, dense data UIs), normal (typical product UI), or loose (editorial, marketing, premium, generous whitespace). Density is felt as much as seen.

### Border radius and shadow

Sharp (0–2px — utilitarian, brutalist, editorial), soft (4–8px — typical modern product), or pill/fully-rounded (playful, friendly, consumer). Shadows likewise: sharp / soft / none. One elevation system, not a mix.

### Component style

Filled, ghost, outlined, or elevated. Pick a default, with secondary styles for hierarchy.

### Imagery and iconography

Real photography (Unsplash, brand, stock), professional illustration, icons from an established set (Feather, Material, Phosphor, Heroicons), or honest placeholders when assets aren't available. Avoid hand-drawn SVG illustrations.

### Motion

Quiet (transitions on state changes only, 200ms ease), expressive (entrance animations, scroll-driven reveals), or playful (springs, micro-interactions on hover). Commit to one mode — mixed motion feels unintentional.

## Phase 4: Document the direction

Write the direction into the file — a comment block at the top of the source AND a visible "design system summary" in the rendered output, like a junior designer showing their thinking:

```
/* Aesthetic direction:
 * Editorial / serious / spacious.
 * - Type: Tiempos Headline (display) + Söhne (body). Free alt: GT Sectra → Albert Sans.
 * - Color: cool-neutral. #FAFAFA bg / #1A1A1A text. Brand: oklch(55% 0.18 250) deep blue. No accent.
 * - Density: loose. 8px scale, generous padding.
 * - Radius: 4px. No shadow — borders only.
 * - Components: ghost buttons; filled for primary CTA only.
 * - Imagery: real photography, full-bleed.
 * - Motion: quiet. 200ms ease, no entrance animations.
 */
```

## Phase 5: Apply, test, and keep consistent

Build a small surface (a hero, a card, a button group) with the direction and show it to the user early. Ask: "Does this read as [the three adjectives]?" If not — or the user pushes back on an axis — revise before going broader. A direction that fails at small scale gets worse as it scales up, not better.

Every subsequent design references the direction's tokens, not new inline values. If a new design needs an undefined value, **add it to the direction first**, then use it. When the direction matures, extract it into a tokens file (`design-system-extract`).

Summarize: the three adjectives, the committed choices per axis, any axes the user should review before you go broader, and the first surface built with the direction.
