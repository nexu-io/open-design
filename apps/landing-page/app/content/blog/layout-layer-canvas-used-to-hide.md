---
title: "The layout layer the canvas used to hide"
date: 2026-05-18
category: "Community"
readingTime: 5
summary: "A community reply on the 0.8.0 preview named the real question behind agent-native design: if the canvas stops being the work unit, how do users still understand layout?"
---

A useful community reply does not ask for a bigger button. It names the missing layer.

That is what happened under the [Open Design 0.8.0-preview discussion](https://github.com/nexu-io/open-design/discussions/1727). The launch thread argued for two shifts: stop treating the canvas as the primary work unit, and make the agent the first-class design worker. One reply agreed with the direction, then pointed at the hard part: when the canvas disappears, users still need a way to understand what the agent made before they can edit it with confidence.

The phrase in the reply was "Layout Understanding Layer." It is a good name because it refuses the lazy answer. Agent-native design cannot mean "trust the screenshot." It needs a readable model of the artifact: sections, intent, editable parts, stable references, and suggested edit moves.

## The canvas gave designers spatial confidence

Figma's canvas is not only a drawing surface. It is also an explanation surface. You can zoom out, see the page hierarchy, click a frame, inspect constraints, rename layers, and understand where one piece of the work ends and another begins.

That understanding is easy to underestimate until it is gone. A generated landing page can look correct in a sandboxed preview and still be hard to direct. "Make the hero more confident" is useful only if the agent and the human agree on what the hero is. "Tighten the pricing section" works only if the artifact carries a stable section identity across revisions.

This is the part of the #DeFigma argument that needs care. The canvas may be the wrong unit of work for an agent-native system, but the clarity people got from the canvas is still valuable. Open Design has to move that clarity into the artifact model, not throw it away.

## Open Design already has the right primitives

The reason this proposal fits Open Design is that the project is already built around explicit contracts. A skill is a `SKILL.md` file. A design system is a `DESIGN.md` file. A plugin adds an `open-design.json` sidecar. The mechanics are covered in [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/), and the product argument is in [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/).

The layout layer should follow the same pattern. It should be text the agent can read, state the UI can render, and metadata another agent can reuse.

In repo terms, that points at three surfaces:

| Surface | What it should carry |
|---|---|
| Artifact manifest | Stable IDs for sections, components, assets, and generated files |
| Plugin snapshot | Which skill, design system, inputs, and pipeline stages produced the artifact |
| Review UI / headless output | A layout map, editable aspects, and suggested edit intents |

The important constraint: the layer should not become a second proprietary canvas. It should be a plain artifact map that travels with the files.

## A practical shape for the layout layer

Here is the smallest version that would make agent-native design feel less opaque:

1. Each generated artifact gets stable semantic IDs: `hero`, `proof-strip`, `pricing`, `faq`, `final-cta`.
2. Each ID carries an intent sentence: "Explain the product promise in one screen," not "top section."
3. Each section lists editable aspects: copy, density, layout, color, media, motion, data source.
4. Each generated file links back to the section ID that produced it.
5. Each review pass emits suggested edit intents: "shorten hero headline," "increase contrast in pricing cards," "split testimonial block."
6. The UI renders this as a navigator, while headless users receive the same structure as JSON or Markdown.

That is enough to let a designer say, "Change `pricing.cards` from three plans to two," and enough to let a code agent patch the right file without guessing from pixels.

It also gives the community a clean contribution path. A contributor does not need to redesign the product to help here. They can write a plugin, a review atom, a manifest extension, or a test case around one artifact type. The layout layer becomes a public contract, not a private trick inside the app.

## What to do next

If this is the kind of problem you want to work on, contribute a small skill or plugin that makes one artifact easier to inspect. Start with a concrete output: a landing page, a deck, or a mobile screen. Add stable section IDs, describe the editable aspects, and open the PR with a before/after artifact.

[Contribute a skill](https://github.com/nexu-io/open-design/tree/main/skills).

## Related reading

- [Why we built Open Design as a skill layer, not a product](/blog/why-we-built-open-design-as-a-skill-layer/) — the product shape that makes public artifact contracts possible
- [31 skills, 72 systems: how the Open Design library works](/blog/31-skills-72-systems-how-the-library-works/) — the current file-driven primitives underneath the proposal
- [The open-source alternative to Claude Design](/blog/open-source-alternative-to-claude-design/) — the comparison that explains why local, inspectable design work matters
