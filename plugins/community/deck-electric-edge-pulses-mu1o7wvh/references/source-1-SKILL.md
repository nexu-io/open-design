---
name: deck-electric-edge-pulses
description: "Trigger: animated SVG edges, electric pulses, pulsing connectors, animated slide diagrams. Add directional multicolor pulses to SVG edges."
license: Apache-2.0
metadata:
  author: "Raul Camacho / Inteliside"
  version: "1.0"
---

## Activation Contract

Use when a slide diagram needs animated energy, signal, data, or control flow along existing SVG connections.

## Hard Rules

- Preserve the diagram geometry, nodes, copy, and global design tokens unless the user requests other changes.
- Draw each connection twice: a restrained base path and a colored pulse overlay with the same `d` value.
- Start every path at the source and end it at the destination. Animate from source to destination.
- Set `pathLength="100"` on pulse paths so different edge lengths share one timing system.
- Scope CSS to the target slide. Pause animation when the slide is inactive.
- Give semantic edges distinct OKLCH colors; avoid gradients and decorative glow.
- Provide a static colored edge under `prefers-reduced-motion: reduce`.

## Decision Gates

| Situation | Action |
| --- | --- |
| Existing SVG path | Duplicate it as base + pulse overlay |
| Connector direction is reversed | Rewrite `d` before animating |
| Many edges share one meaning | Reuse color; vary delay only |
| Edge meanings differ | Assign one consistent color per meaning |

## Execution Steps

1. Inspect only the requested slide and identify every source and destination.
2. Copy the pattern from `assets/pulse-pattern.html` and replace its placeholders.
3. Keep base edges visible beneath the pulses.
4. Stagger negative delays so edges do not fire simultaneously.
5. Verify edge count, unique colors, direction, inactive-slide pause, reduced motion, and balanced SVG/HTML.

## Output Contract

Return the modified file, animated edge count, color mapping, direction, and accessibility status.

## References

- `assets/pulse-pattern.html` — reusable SVG and scoped CSS pattern.
