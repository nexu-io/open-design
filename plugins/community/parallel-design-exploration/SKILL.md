---
name: parallel-design-exploration
description: |
  Explore a design problem through several fully rendered sibling options in one persistent visual document. Preserve reliable current-state evidence when available, keep stable option identities across turns, and let the user decide when to converge. Use when the user asks for multiple design directions, variants, mockups, UI alternatives, wireframes, A/B-style explorations, or parallel prototypes to compare before choosing.
license: MIT
metadata:
  author: tungloong
  version: "0.10.1"
  repository: "https://github.com/tungloong/parallel-design-exploration"
---

# Parallel Design Exploration

Use a **persistent options canvas** when a design problem benefits from seeing several rendered possibilities before committing to one direction.

The skill owns the exploration protocol: one persistent artifact, visible design history, stable identities, sibling comparison, lineage, and the small amount of canvas chrome required to keep those things legible. The user's brief and design context own the product, aesthetic, fidelity, platform, and content of the designs themselves.

## 1. Establish the design context

Start from usable context supplied by the user or project: current screens, source code, screenshots, design files, prior artifacts, product constraints, design systems, and platform conventions that materially affect the task.

When that context contains a reliable current design, represent it as **`0 · Baseline`**. The baseline is current-state evidence for comparison. It can coexist with a complete rethink because baseline and design lineage are separate concepts.

When no trustworthy current state can be established, begin with Turn 1.

## 2. Render sibling alternatives

Create a compact set of materially different sibling options. A user-specified count takes precedence; otherwise choose enough siblings to expose genuinely different hypotheses while keeping comparison practical.

Choose variation axes from the actual design question: information architecture, layout, interaction, navigation, hierarchy, density, product metaphor, platform behavior, visual language, content strategy, or another consequential dimension.

Render each option far enough that the design itself can be judged. Comparable viewport, content, and fidelity are useful when controlled conditions improve the comparison. Siblings should reach a comparable level of craft so differences reflect the design hypotheses rather than uneven execution quality. Each option should respond specifically to the brief rather than read as a generic variant that could be transplanted unchanged to another problem.

## 3. Artifact and state mutation protocol

An exploration session has **one stable primary artifact identity**. The first generation establishes that artifact. Follow-up turns resolve the same artifact and extend it in place.

At the start of a follow-up turn:

1. locate the existing primary artifact that contains the current `main.pde-canvas`;
2. read its highest turn number and existing state nodes;
3. use that same artifact as the edit target;
4. insert the next turn immediately after the opening `main.pde-canvas` tag, before the previous newest state.

When the host supports targeted file edits, use that local insertion as the normal mutation mechanism. Existing delivered state subtrees stay untouched; whole-file regeneration is a fallback only when the host exposes no targeted edit mechanism.

A delivered design state — a turn or baseline — is an **immutable historical snapshot**. After a state has been shown to the user, its identity and rendering meaning become part of the visible record. A normal follow-up adds a newer state rather than re-authoring older states.

The canonical mutation is prepend-only at the state level:

```text
before follow-up                after follow-up

Turn 1                          Turn 2   ← inserted
0 · Baseline                    Turn 1   ← preserved
                                0 · Baseline
```

Equivalently in the document:

```html
<!-- existing artifact -->
<main class="pde-canvas">
  <section id="t1" data-turn="1">...</section>
  <section id="baseline" data-baseline="0">...</section>
</main>

<!-- after the next turn -->
<main class="pde-canvas">
  <section id="t2" data-turn="2">...</section>
  <section id="t1" data-turn="1">...</section>
  <section id="baseline" data-baseline="0">...</section>
</main>
```

Treat requests to riff on, deepen, combine, or refine prior work as new descendant states by default. A past state is edited directly only when the user explicitly asks to correct or replace that historical state itself.

Historical preservation includes rendering semantics as well as markup. New-turn implementation should extend styles and behavior additively or with state-local selectors so earlier states keep the same visual and interactive meaning.

## 4. Complete visible document protocol

The Options Canvas is the complete visible exploration document.

`main.pde-canvas` is the single visible top-level container in the artifact body. Its direct children are design states in temporal order: newest turns first, older turns next, and the optional baseline last.

```html
<body>
  <main class="pde-canvas">
    <section class="pde-turn" id="t2" data-turn="2">...</section>
    <section class="pde-turn" id="t1" data-turn="1">...</section>
    <section class="pde-baseline" id="baseline" data-baseline="0">...</section>
  </main>

  <script>/* optional interaction support */</script>
</body>
```

For greenfield work without a reliable current state, the baseline section is absent.

## 5. Canonical canvas substrate

Canvas chrome is stable infrastructure rather than another design assignment. Use the canonical substrate below as the base workspace chrome. Extend it for artifact content; adapt it only when the medium or host requires a different representation.

```css
*{box-sizing:border-box}
html,body{margin:0;background:#f1efe9;color:#1c1c1a;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
a{color:inherit;text-decoration:none}
.pde-turn,.pde-baseline{padding:40px 44px 32px;border-bottom:1px solid rgba(0,0,0,.08);scroll-margin-top:16px}
.pde-turn-head,.pde-baseline-head,.pde-option-head{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.pde-turn-head,.pde-baseline-head{margin-bottom:20px}
.pde-turn-id,.pde-option-id,.pde-baseline-id{display:inline-flex;border-radius:5px;font:650 10.5px/1 ui-monospace,SFMono-Regular,Menlo,monospace}
.pde-turn-id{padding:4px 8px;background:#1c1c1a;color:#fff}
.pde-option-id,.pde-baseline-id{padding:4px 7px;background:rgba(0,0,0,.075)}
.pde-turn-title,.pde-baseline-title{font:650 13px/1.2 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.pde-options{display:flex;flex-wrap:wrap;gap:28px;align-items:flex-start;overflow-x:auto;padding-bottom:4px}
.pde-option{flex:none;width:max-content;display:flex;flex-direction:column;gap:9px;scroll-margin-top:16px}
.pde-option-head{color:rgba(0,0,0,.58);font:400 11px/1.3 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
.pde-option-name{font-weight:600}
.pde-parent{color:rgba(0,0,0,.62)}
.pde-ref,.pde-parent{text-decoration:underline;text-decoration-style:dotted;text-underline-offset:2px}
.pde-design{overflow:hidden;background:#fff;border:1px solid rgba(0,0,0,.08);border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,.05)}
.pde-turn:target .pde-turn-id,.pde-option:target .pde-option-id,.pde-baseline:target .pde-baseline-id{background:#2f6fd1;color:#fff}
.pde-next{margin:22px 0 0;color:rgba(0,0,0,.60);font:12px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
```

The substrate establishes turn spacing, small state labels, sibling layout, and the artifact surface. Option containers remain spatial containers rather than presentation cards. Size each `.pde-design` to the artifact it contains. A wide artboard keeps its authored width and the sibling row provides horizontal scrolling when the available viewport is narrower.

## 6. Turn protocol

A turn needs only a stable turn anchor and its sibling options. A concise turn name is useful when it helps orient the user. Additional framing can appear when the design question genuinely benefits from it.

```html
<section class="pde-turn" id="t2" data-turn="2">
  <header class="pde-turn-head">
    <a class="pde-turn-id" href="#t2">2</a>
    <span class="pde-turn-title">Riffs on <a class="pde-ref" href="#o-1b">1b</a></span>
  </header>

  <div class="pde-options">...</div>

  <p class="pde-next">Try next: “...” · “...” · “...”</p>
</section>
```

When continuation cues are useful, keep them to one quiet line with a few concrete moves the user could ask for next.

## 7. Option protocol

Options use stable logical `{turn}{letter}` identities:

```text
1a  1b  1c
2a  2b  2c
```

The logical id is the visible label, conversational reference, and `data-option` value. DOM anchors use an `o-` prefix so they remain safe CSS and JavaScript selectors:

```html
<article class="pde-option" id="o-2a" data-option="2a" data-parent="1b">
  <header class="pde-option-head">
    <a class="pde-option-id" href="#o-2a">2a</a>
    <span class="pde-option-name">Sentence builder</span>
    <a class="pde-parent" href="#o-1b">← 1b</a>
  </header>

  <div class="pde-design" style="width:360px">
    <!-- Render the actual screen, component, flow, composition, or prototype. -->
  </div>

  <!-- Optional local explanation when it materially improves understanding. -->
</article>
```

Visible references to existing turns, options, or the baseline link to their DOM anchors while preserving the logical label in text:

```html
<a class="pde-ref" href="#o-2a">2a</a>
<a class="pde-ref" href="#o-1c">1c</a>
<a class="pde-ref" href="#baseline">0</a>
```

Local explanation is content, not chrome. It can be a sentence, paragraph, bullets, or absent when the design is self-explanatory. Its purpose is simply to make a meaningful design difference easier to understand.

### Lineage

`data-parent` stores the logical parent id and represents intentional design descent. Baseline presence alone does not imply parentage.

When a concept combines several sources, keep the main lineage id in `data-parent` and reference other sources in nearby linked text when that helps explain the design.

## 8. Baseline protocol

When reliable current-state evidence exists, render it as the oldest visible state:

```html
<section class="pde-baseline" id="baseline" data-baseline="0">
  <header class="pde-baseline-head">
    <a class="pde-baseline-id" href="#baseline">0</a>
    <span class="pde-baseline-title">Baseline</span>
  </header>

  <div class="pde-design">
    <!-- Faithful current-state rendering. -->
  </div>
</section>
```

Represent the current state faithfully enough to support comparison. Source or state notes can accompany it when they materially improve interpretation.

## 9. Artifact identity and naming

Derive a concise, stable, kebab-case filename from the subject being explored, for example:

```text
search-and-go-exploration.html
checkout-flow-exploration.html
analytics-dashboard-exploration.html
```

That path becomes the primary artifact identity for the exploration session. Follow-up turns resolve and update that same artifact. Host-required entry paths take precedence when applicable. Supporting files can exist when the implementation or requested output benefits from them, while the visible exploration history remains anchored in the same primary artifact.

## 10. Progressive authoring

When the host refreshes the artifact as files change, establish the primary canvas early and let the newest turn take shape through coherent incremental updates:

1. resolve the existing primary artifact when the session already has one;
2. insert the new turn shell in canonical position;
3. render sibling options as they become coherent;
4. add local explanation and continuation cues when they improve the work.

Hosts that expose only a final-write workflow still use the same artifact identity and state mutation semantics.

## 11. Open Design compatibility

Open Design may contribute host-level discovery, craft, or design-direction guidance. Treat that guidance as context for the designs while preserving the persistent options-canvas interaction model and canonical substrate.

A host-level visual direction can coexist with meaningful divergence in structure, hierarchy, interaction, navigation, density, content strategy, or option-local visual systems when visual direction itself is part of the design question.

## Structural validation

Before finishing a turn, confirm that:

- the exploration still uses the same primary artifact identity established for the session;
- `main.pde-canvas` owns the complete visible exploration document;
- its direct state children are ordered newest-first, with the optional baseline last;
- every turn has `id="tN"` and matching `data-turn="N"`;
- every option has logical `data-option="Nletter"` and matching DOM anchor `id="o-Nletter"`;
- references to existing design states navigate to their DOM anchors;
- baseline evidence and design lineage remain separate concepts;
- every previously delivered state retains the same identity, visible content, and rendering meaning;
- follow-up work uses a local prepend mutation when the host supports targeted edits;
- new-turn styles and behavior extend the artifact without changing historical states unintentionally;
- sibling options are rendered to a comparable level of craft and fidelity for direct comparison;
- the canvas uses the canonical substrate while the designs themselves carry the brief's visual language.

The target experience is:

> I can see the current state when one exists, compare several real alternatives at once, refer to any state by a stable logical id, ask for another riff, and keep the same visible history intact as the exploration grows.
