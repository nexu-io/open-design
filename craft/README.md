# Craft references

Brand-agnostic craft knowledge. Each file is a small, dense rulebook on one
dimension of professional UI craft (typography, color, motion, …). Skills
opt into the references they need; the daemon injects only the requested
ones into the system prompt above the active skill body.

## Why a third axis next to `skills/` and `design-systems/`

| Axis | Scope | Example |
|---|---|---|
| `skills/` | Artifact shape | `saas-landing`, `dashboard`, `pricing-page` |
| `design-systems/` | Brand visual language (the 9-section `DESIGN.md`) | `linear-app`, `apple`, `notion` |
| `craft/` | **Universal** craft knowledge — true regardless of brand | letter-spacing rules, accent-overuse caps, anti-AI-slop |

`DESIGN.md` tells the agent which colors and fonts a brand uses. `craft/`
tells the agent the universal rules a competent designer applies on top —
e.g. ALL CAPS always needs ≥0.06em tracking, regardless of the brand.

## How a skill opts in

Add an `od.craft.requires` array to the skill's front-matter. Only the
listed sections are injected, so a skill that needs only typography pays
no token cost for color/motion content.

```yaml
od:
  craft:
    requires: [typography, color, anti-ai-slop]
```

Allowed values match the file names in this directory minus the `.md`
extension. Unknown values are silently ignored (forward-compatible).

### Why silent fallback instead of fail-fast?

A skeptical reader will ask: "If a skill requests `motion` and we don't
ship `motion.md` yet, shouldn't we warn the user?" We chose
forward-compatibility over fail-fast: a skill authored today can list
`motion` and start benefiting the moment we vendor `craft/motion.md` in
a follow-up PR, with no skill edit needed. The cost of a missed
reference is a missing paragraph in the system prompt, not a broken
skill — so the loud failure mode is not worth the friction.

## Files

| File | Section name | When to require |
|---|---|---|
| `typography.md` | `typography` | Any skill that emits typed content (~all skills) |
| `color.md` | `color` | Any skill that emits styled output (~all skills) |
| `anti-ai-slop.md` | `anti-ai-slop` | Marketing pages, landing pages, decks |

More sections (`motion`, `icons`, `craft-details`) will be added in
follow-up PRs as we wire the linter side.

## Attribution

Craft content is adapted from the MIT-licensed
[refero_skill](https://github.com/referodesign/refero_skill) project
(© Refero Design), with edits to fit Open Design's house style and link
back to OD's design tokens (`var(--accent)` etc.) instead of generic
Tailwind hex values.
