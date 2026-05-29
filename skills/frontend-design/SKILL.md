---
name: frontend-design
description: |
  Create distinctive, production-grade frontend interfaces with strong visual direction, polished typography, considered layout, and working HTML/CSS/JS or framework code. Use for websites, landing pages, dashboards, React components, application screens, and UI beautification.
triggers:
  - "frontend design"
  - "ui design"
  - "ux design"
  - "web design"
  - "production ui"
  - "landing page"
  - "dashboard design"
  - "react component design"
license: Complete terms in LICENSE.txt
od:
  mode: prototype
  category: web-artifacts
  craft:
    requires: [typography, color, anti-ai-slop]
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design and build a production-quality SaaS analytics dashboard for a finance team, with real interaction states, refined typography, and a distinctive visual direction."
  upstream: "https://github.com/anthropics/skills/tree/main/skills/frontend-design"
---

# frontend-design

> Adapted from Anthropic's official `frontend-design` skill for Open Design.

Use this skill when the user asks to build or improve a frontend interface: a website, landing page, dashboard, application screen, HTML/CSS artifact, React/Vue/Svelte component, or a visual redesign of an existing UI.

The goal is not just "make it nicer." The goal is to ship working frontend code with a clear design point of view, strong craft, and enough product detail that the result feels designed for the user's actual context.

## Workflow

1. Understand the brief before choosing the look.
   - Identify the audience, primary job, domain, and emotional tone.
   - Note any technical constraints: framework, existing styles, accessibility, performance, export target, or responsive requirements.
   - If the repo already has design tokens, components, screenshots, or a `DESIGN.md`, use those as the source of truth.

2. Commit to one specific aesthetic direction.
   - Pick a direction that fits the product: brutally minimal, editorial, luxury, playful, industrial, retro-futuristic, dense operational, calm enterprise, artful consumer, or another precise direction.
   - Make the direction concrete through typography, spacing, color, hierarchy, motion, and component shape.
   - Avoid generic AI defaults: purple-blue gradients, vague glass cards, interchangeable SaaS layouts, over-rounded cards, stock icon rows, and decorative blobs that do not serve the interface.

3. Design the real interface, not a placeholder poster.
   - Include the controls, empty/loading/error states, tables, filters, navigation, and responsive behavior a real user would expect.
   - Use honest content. If data is unknown, label it as sample, pending, or unavailable instead of inventing claims.
   - Keep workflows efficient for the target user. Dashboards and tools should be scannable and dense enough for repeated use; marketing pages can be more expressive.

4. Build production-grade frontend code.
   - Prefer the repository's existing framework, component conventions, icons, tokens, and styling approach.
   - For standalone artifacts, create self-contained HTML/CSS/JS unless the user asked for a framework.
   - Use semantic markup, keyboard-accessible controls, visible focus states, sensible contrast, and responsive layout constraints.
   - Use CSS variables for repeated colors, spacing, shadows, and type scale.

5. Refine visual craft.
   - Typography: choose expressive but readable type pairings. Avoid using default system stacks as the main visual idea unless the direction is intentionally utilitarian.
   - Color: create a balanced palette with role clarity. Use accent color sparingly and deliberately.
   - Layout: use alignment, rhythm, density, and negative space intentionally. Do not let cards, panels, or labels drift.
   - Motion: add purposeful transitions for state changes, reveals, and feedback. Prefer transforms and opacity for performance.
   - Details: use texture, borders, shadows, dividers, media, and iconography only when they support the concept.

6. Self-review before final delivery.
   - The interface works at mobile and desktop widths.
   - Text fits its containers and does not overlap adjacent UI.
   - Interactive elements have hover/focus/active/disabled states.
   - The design avoids obvious AI-generated visual tropes.
   - The result has one memorable quality a user could describe after closing the page.

## Open Design Integration

When Open Design provides an active design system, treat it as the product's brand contract. Use the injected color, typography, layout, and component guidance first, then apply this skill's frontend craft rules where the design system is silent.

When Open Design injects craft references such as `typography`, `color`, and `anti-ai-slop`, apply those checks before finishing. If the user's brand guidance conflicts with a generic craft rule, the user's brand guidance wins.

## Source

- Upstream: https://github.com/anthropics/skills/tree/main/skills/frontend-design
- Category: `web-artifacts`

## License

This skill is adapted from Anthropic's official skills repository. See `LICENSE.txt` in this folder for the upstream Apache-2.0 license terms.
