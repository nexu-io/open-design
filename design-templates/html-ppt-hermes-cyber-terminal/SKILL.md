---
name: html-ppt-hermes-cyber-terminal
en_name: "Run a BYOK Model-Choice Session like an Applied-AI Engineer"
zh_name: "像应用 AI 工程师一样讲 BYOK 选型"
description: |
  Open Design + BYOK: choosing and wiring your own model, hands-on — cost, quality, and the routing decision. Built as a decision-grade AI literacy deck for engineers, IT, applied-AI teams.
en_description: |
  Open Design + BYOK: choosing and wiring your own model, hands-on — cost, quality, and the routing decision. Built as a decision-grade AI literacy deck for engineers, IT, applied-AI teams.
zh_description: |
  像应用 AI 工程师一样讲 BYOK 选型——一份可商业交付的AI 素养 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "ai-literacy"
  - "enterprise-ai-copilot-rollout-brief"
  - "ai"
  - "copilot"
  - "workflow"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-hermes-cyber-terminal"
triggers:
  - "enterprise-ai-copilot-rollout-brief"
  - "ai-literacy"
  - "Run a BYOK Model-Choice Session like an Applied-AI Engineer"
  - "像应用 AI 工程师一样讲 BYOK 选型"
  - "ai"
  - "copilot"
  - "workflow"
  - "html deck"
  - "html slides"
od:
  mode: deck
  upstream: "https://github.com/lewislulu/html-ppt-skill"
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  speaker_notes: true
  animations: true
  category: "ai-literacy"
  scenario: "ai"
  example_prompt: "Create \"Run a BYOK Model-Choice Session like an Applied-AI Engineer\" as a decision-grade AI literacy deck in this template's own visual system. Subject: Open Design + BYOK: choosing and wiring your own model, hands-on — cost, quality, and the routing decision. Audience: engineers, IT, applied-AI teams. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck make AI implementation concrete enough to fund."
---
# HTML PPT · 暗终端测评

A focused entry point into the [`html-ppt`](../html-ppt/SKILL.md) master skill that lands the user directly on the **`hermes-cyber-terminal`** full-deck template.

## When this card is picked

The Examples gallery wires "Use this prompt" to the example_prompt above. When you accept that prompt, this card is the right pick if the user wants exactly the visual identity of `hermes-cyber-terminal` (see the upstream [full-decks catalog](../html-ppt/references/full-decks.md) for screenshots and rationale).

## How to author the deck

1. **Read the master skill first.** All authoring rules live in
   [`design-templates/html-ppt/SKILL.md`](../html-ppt/SKILL.md) — content/audience checklist,
   token rules, layout reuse, presenter mode, the keyboard runtime, and the
   "never put presenter-only text on the slide" rule.
2. **Start from the matching template folder:**
   `design-templates/html-ppt/templates/full-decks/hermes-cyber-terminal/` — copy `index.html` and
   `style.css` into the project, keep the `.tpl-hermes-cyber-terminal` body class.
3. **Bring the shared runtime with the template.** The upstream
   `index.html` links the shared CSS/JS via `../../../assets/...` because it
   sits three folders deep inside `design-templates/html-ppt/templates/full-decks/`.
   Once you copy `index.html` into the project, those parent-relative URLs
   no longer resolve and `base.css`, `animations.css`, and `runtime.js`
   will 404 — meaning the deck never activates and slide navigation is
   dead. Pick one of these two recipes per project:
   - **Recipe A — copy + rewrite (preferred):** copy
     `design-templates/html-ppt/assets/fonts.css`, `design-templates/html-ppt/assets/base.css`,
     `design-templates/html-ppt/assets/animations/animations.css`, and
     `design-templates/html-ppt/assets/runtime.js` into a project-local
     `assets/` (with `assets/animations/animations.css`), then rewrite the
     four `<link>`/`<script>` tags in `index.html` from
     `../../../assets/...` to the matching project-local paths
     (`assets/fonts.css`, `assets/base.css`,
     `assets/animations/animations.css`, `assets/runtime.js`).
   - **Recipe B — inline:** read the same four files and replace each
     `<link rel="stylesheet" href="../../../assets/...">` with a
     `<style>...</style>` containing the file's contents, and the
     `<script src="../../../assets/runtime.js">` with a
     `<script>...</script>` containing `runtime.js`. Yields a single
     self-contained `index.html`.
   Either way, do not ship the upstream `../../../assets/...` URLs
   verbatim into a project artifact — they only work in-tree.
4. **Pick a theme.** Default tokens look fine; if the user wants a different
   feel, swap in any of the 36 themes from `design-templates/html-ppt/assets/themes/*.css`
   via `<link id="theme-link">` and let `T` cycle.
5. **Replace demo content, not classes.** The `.tpl-hermes-cyber-terminal` scoped CSS only
   recognises the structural classes shipped in the template — keep them.
6. **Speaker notes go inside `<aside class="notes">` or `<div class="notes">`** — never as visible text on the slide.

## Attribution

Visual system, layouts, themes and the runtime keyboard model come from
the upstream MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill). The
LICENSE file ships at `design-templates/html-ppt/LICENSE`; please keep it in place when
redistributing.
