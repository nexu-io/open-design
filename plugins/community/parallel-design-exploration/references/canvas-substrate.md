# Canvas Substrate — design reference

This note explains the small visual substrate used by Parallel Design Exploration.

The substrate is intentionally narrow in scope. It is not a design system for the product being explored. It is the workspace chrome that makes turns, options, lineage, and comparison legible across many kinds of design work.

## Separation of responsibilities

```text
CANVAS CHROME
stable across runs and turns
→ turn spacing
→ state ids
→ sibling placement
→ artifact boundary
→ navigation cues

DESIGN CONTENT
changes with the brief
→ typography
→ color
→ layout
→ interaction
→ density
→ visual style
→ product-specific components
```

Keeping those responsibilities separate prevents the exploration workspace from competing with the designs it contains.

## Why a concrete substrate

Descriptive guidance such as "quiet," "neutral," or "restrained" still asks the model to invent a new workspace style. A small concrete substrate removes that secondary design problem while leaving the actual design work open-ended.

The canonical substrate therefore specifies only a few utility properties:

- warm neutral page background;
- compact system-ui turn labels;
- compact monospace state ids;
- thin separators between temporal states;
- a wrapping horizontal sibling row;
- intrinsic option sizing;
- transparent option containers;
- a light bounded artifact surface;
- understated continuation cues.

These properties are the base workspace chrome, not a visual-direction prompt. Artifact-specific styling extends inside or beneath the design states rather than redefining the PDE workspace on every generation.

## Spatial model

Options behave more like artboards on a working surface than cards in a responsive dashboard.

```text
1a label        1b label        1c label
[artifact]      [artifact]      [artifact]
optional note   optional note
```

The option wrapper mainly establishes position and identity. The rendered artifact provides the visual surface.

## Intrinsic sizing

The canvas may hold a phone screen, dashboard, poster, component, flow, chart, or other design object. Each artifact can choose a useful width for its own content.

The sibling container uses flex wrapping rather than a predetermined responsive column count:

```text
artifact width → option width
          siblings wrap as workspace width changes
```

This keeps comparison spatial while remaining usable in a normal HTML preview.

## Chrome stability over time

A later turn may need substantial new product-specific CSS or JavaScript. That new implementation should leave the historical workspace states semantically stable.

State-local selectors are a useful default pattern:

```css
.phone-1a { ... }
.phone-1b { ... }
.phone-2a { ... }
.phone-2b { ... }
```

This keeps new-turn craft additive. Broad changes to shared selectors are appropriate only when they preserve the rendering meaning of previously delivered states.

## Annotation and metadata

Explanatory text is content, not mandatory chrome. It can sit near an option when it materially improves understanding and can disappear when the design speaks for itself.

Likewise, comparison conditions such as viewport, dataset, or fidelity are execution context. They can become visible when they help the user interpret the work, but the substrate does not reserve a permanent metadata component for them.

## Continuation cues

A short line of next-step suggestions can make the design space easier to navigate conversationally. The cue stays visually secondary and points to concrete options through stable ids.

## Baseline

`0 · Baseline` uses the same state-label and separator language as later turns. Its internal evidence presentation follows the source material rather than a separate baseline-specific page layout.

## Guiding principle

> Fix the workspace grammar; generate the design content.

The stable parts of the canvas should require as little aesthetic interpretation as possible. The creative bandwidth belongs to the options themselves.
