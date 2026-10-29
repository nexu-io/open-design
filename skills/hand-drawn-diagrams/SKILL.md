---
name: hand-drawn-diagrams
description: |
  Generate hand-drawn Excalidraw diagrams from a prompt — animated SVG, hosted edit link, and PNG export. Diagrams argue visually: concept-mapped patterns, evidence artifacts for technical topics, section-by-section JSON, and a render-view-fix loop. Works with Claude Code, Codex, Gemini CLI, and any agent supporting standard skill paths.
triggers:
  - "excalidraw"
  - "hand drawn diagram"
  - "sketch diagram"
  - "whiteboard diagram"
  - "argue visually"
  - "evidence diagram"
od:
  mode: prototype
  category: diagrams
  upstream: "https://github.com/muthuishere/hand-drawn-diagrams"
---

# hand-drawn-diagrams

> Curated from @muthuishere. Diagram method adapted from
> [coleam00/excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill).

## What it does

Generate hand-drawn Excalidraw diagrams from a prompt — animated SVG, hosted edit link, and PNG export. Works with Claude Code, Codex, Gemini CLI, and any agent supporting standard skill paths.

## Diagram method: argue, don't display

A diagram is a visual argument, not formatted text. The shape should BE the
meaning — fan-out for one-to-many, timeline for sequences, convergence for
aggregation, tree for hierarchy, cycle for loops. No uniform card grids.
Two tests before emitting: the isomorphism test (structure alone communicates
without text?) and the education test (viewer learns something concrete, not
just labels?).

### Depth first

- **Simple/conceptual** (mental models, overviews): abstract shapes and labels.
- **Comprehensive/technical** (systems, protocols, tutorials): concrete evidence
  artifacts — real event names, actual request/response payloads, code snippets,
  timelines with spec terms. Research the actual spec before drawing; never use
  "Event 1" / "Input" / "API" placeholders. Operate at three zooms: summary
  flow, section boundaries, detail inside sections.

### Container discipline

Default to free-floating text; add a container only when it groups, anchors
arrows, or carries meaning (decision diamond). Use lines + text for trees and
timelines. Aim for fewer than 30% of text elements inside containers.

### Large diagrams: one section per pass

Build the `.excalidraw` JSON one visual section per edit with descriptive
string ids and per-section seed namespaces. Review cross-section bindings and
spacing balance before rendering.

### Render-view-fix loop

Render the JSON to PNG, view the image, fix (clipped text, overlaps, arrows
crossing elements, unbalanced spacing), re-render. Repeat 2–4 passes until no
defects and the composition matches the plan. The upstream Playwright renderer
(`uv sync` + `playwright install chromium` in the skill references) is
optional and needs a user-side browser toolchain — disclose that before
relying on it in sandboxed runs.

## Source

- Upstream: https://github.com/muthuishere/hand-drawn-diagrams
- Method: https://github.com/coleam00/excalidraw-diagram-skill
- Category: `diagrams`

## How to use

This catalogue entry advertises the skill in OpenDesign so the agent
discovers it during planning. To run the full upstream workflow with
its original assets, scripts, and references, install the upstream
bundle into your active agent's skills directory:

```bash
# Inspect the upstream README for exact paths
open https://github.com/muthuishere/hand-drawn-diagrams
# Diagram method reference
open https://github.com/coleam00/excalidraw-diagram-skill
```

Then ask the agent to invoke this skill by name (`hand-drawn-diagrams`) or with
one of the trigger phrases listed in this skill's frontmatter.
