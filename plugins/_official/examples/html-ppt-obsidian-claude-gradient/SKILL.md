---
name: html-ppt-obsidian-claude-gradient
en_name: "Write an Enterprise AI Adoption Brief like a Transformation Lead"
zh_name: "像企业 AI 转型负责人一样写落地简报"
description: |
  Open Design's enterprise AI-adoption brief: local-first agents at work, the risk controls, the ROI, and the rollout plan. Built as a decision-grade AI literacy deck for leadership, IT, security.
en_description: |
  Open Design's enterprise AI-adoption brief: local-first agents at work, the risk controls, the ROI, and the rollout plan. Built as a decision-grade AI literacy deck for leadership, IT, security.
zh_description: |
  像企业 AI 转型负责人一样写落地简报——一份可商业交付的AI 素养 Deck，围绕真实主题、证据链与决策目标组织。
tags:
  - "ai-literacy"
  - "enterprise-ai-copilot-rollout-brief"
  - "ai"
  - "copilot"
  - "workflow"
  - "decision-deck"
  - "commercial-slide-agent"
  - "html-ppt-obsidian-claude-gradient"
triggers:
  - "enterprise-ai-copilot-rollout-brief"
  - "ai-literacy"
  - "Write an Enterprise AI Adoption Brief like a Transformation Lead"
  - "像企业 AI 转型负责人一样写落地简报"
  - "ai"
  - "copilot"
  - "workflow"
  - "html deck"
  - "html slides"
od:
  mode: deck
  featured: 31
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
  example_prompt: "Create \"Write an Enterprise AI Adoption Brief like a Transformation Lead\" as a decision-grade AI literacy deck in this template's own visual system. Subject: Open Design's enterprise AI-adoption brief: local-first agents at work, the risk controls, the ROI, and the rollout plan. Audience: leadership, IT, security. First ask only for missing essentials: audience, decision target, source-of-truth materials, deadline, and must-keep numbers. Then produce the slide plan, written slides, visual direction, speaker-ready structure, and a critic pass against this rubric: does the deck make AI implementation concrete enough to fund."
---
# HTML PPT · GitHub 暗紫渐变

A focused entry point into the [`html-ppt`](../html-ppt/SKILL.md) master skill that lands the user directly on the **`obsidian-claude-gradient`** full-deck template.

## When this card is picked

The Examples gallery wires "Use this prompt" to the example_prompt above. When you accept that prompt, this card is the right pick if the user wants exactly the visual identity of `obsidian-claude-gradient` (see the upstream [full-decks catalog](../html-ppt/references/full-decks.md) for screenshots and rationale).

## How to author the deck

1. **Read the master skill first.** All authoring rules live in
   [`skills/html-ppt/SKILL.md`](../html-ppt/SKILL.md) — content/audience checklist,
   token rules, layout reuse, presenter mode, the keyboard runtime, and the
   "never put presenter-only text on the slide" rule.
2. **Start from the matching template folder:**
   `skills/html-ppt/templates/full-decks/obsidian-claude-gradient/` — copy `index.html` and
   `style.css` into the project, keep the `.tpl-obsidian-claude-gradient` body class.
3. **Bring the shared runtime with the template.** The upstream
   `index.html` links the shared CSS/JS via `../../../assets/...` because it
   sits three folders deep inside `skills/html-ppt/templates/full-decks/`.
   Once you copy `index.html` into the project, those parent-relative URLs
   no longer resolve and `base.css`, `animations.css`, and `runtime.js`
   will 404 — meaning the deck never activates and slide navigation is
   dead. Pick one of these two recipes per project:
   - **Recipe A — copy + rewrite (preferred):** copy
     `skills/html-ppt/assets/fonts.css`, `skills/html-ppt/assets/base.css`,
     `skills/html-ppt/assets/animations/animations.css`, and
     `skills/html-ppt/assets/runtime.js` into a project-local
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
   feel, swap in any of the 36 themes from `skills/html-ppt/assets/themes/*.css`
   via `<link id="theme-link">` and let `T` cycle.
5. **Replace demo content, not classes.** The `.tpl-obsidian-claude-gradient` scoped CSS only
   recognises the structural classes shipped in the template — keep them.
6. **Speaker notes go inside `<aside class="notes">` or `<div class="notes">`** — never as visible text on the slide.

## Attribution

Visual system, layouts, themes and the runtime keyboard model come from
the upstream MIT-licensed [`lewislulu/html-ppt-skill`](https://github.com/lewislulu/html-ppt-skill). The
LICENSE file ships at `skills/html-ppt/LICENSE`; please keep it in place when
redistributing.
