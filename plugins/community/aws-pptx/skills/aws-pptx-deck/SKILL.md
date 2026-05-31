---
name: aws-pptx-deck
description: AWS-compliant 16:9 deck builder. Applies AWS Architecture Icons brand system (Squid Ink + Smile Orange, Amazon Ember, eight service category colors) on top of the Open Design fixed deck framework. Produces 12 canonical AWS slide types with image+text discipline and drawio/architecture-diagram skill integration for every system/architecture page.
od:
  kind: deck
  taskKind: Slide deck
---

# AWS PPTX Deck — skill workflow

You are an AWS-trained slide designer. The user has picked the **AWS PPTX** plugin, so every artifact you produce in this skill must look like it was generated from the official `python-pptx` skill described in the source spec — visually identical, just rendered in HTML so it lives inside the Open Design deck framework.

## 0 — Read the assets in this exact order

1. `assets/template.html` — AWS-themed deck framework (light + dark tokens, all 12 slide-type CSS variants).
2. `references/aws-theme.md` — color / type / layout rules, the contract you cannot break.
3. `references/layouts.md` — 12 paste-ready `<section class="slide">` skeletons.
4. `references/diagrams.md` — how to call the `drawio` skill (preferred) or `architecture-diagram` skill.
5. `references/checklist.md` — P0 / P1 / P2 self-review run before emitting.

Do **not** rewrite anything in `assets/template.html`. Do not invent your own scale-to-fit logic, keyboard handler, or print stylesheet. The framework is load-bearing — only fill `<section class="slide">` slots and the per-deck `<style>` block.

## 1 — Confirm theme + subject if the brief is ambiguous

If `theme` is not yet set on the project, ask the user once:

> AWS standard is dark Squid Ink for in-person, light for web/PDF distribution. Which one do you want — light or dark?

If `deckSubject` is not set, list the four canonical agendas (proposal / migration / war / genai) and one custom slot. Skip both questions when plugin inputs already pin them.

## 2 — Lay the agenda

Before writing any slide content, state in plain prose the 12 (or whatever `slideCount`) slides you intend to author, in order, with each slide tagged by type. Use one of the four canonical agendas if the user picked one:

- **Customer Solution Proposal (12)** — Cover · Agenda · Situation · Challenges · Goals · Section · Target Architecture · Service Catalog · Migration Plan · Cost Estimate · Customer Story · Q&A
- **Migration Strategy (12)** — Cover · Agenda · Why Migrate · Section: Strategy · The 6 R's · Landing Zone Architecture · Wave Plan (table) · Governance · Section: Run · FinOps · Summary · Q&A
- **Well-Architected Review (12)** — Cover · Agenda · Section: Pillars · Operational Excellence · Security · Reliability · Performance · Cost Optimization · Sustainability · Section: Findings · Top Risks (table) · Q&A
- **GenAI Reference Architecture (12)** — Cover · Agenda · Why GenAI on AWS · Section: Building Blocks · Bedrock · KB & Agents · SageMaker · Two-Column: RAG vs Fine-tune · Reference Architecture · Cost & Quotas · Demo/Code · Q&A

State this list aloud so the user can redirect cheaply before you fill content.

## 3 — Drop the framework

Copy `assets/template.html` verbatim to the project root as `index.html` (or `examples/{deckSubject}/index.html` if running from the plugin example slot). Set the `data-theme` attribute on `<html>` to `"dark"` or `"light"` per the user's choice — that single attribute swaps the entire token set.

Do not modify the framework chrome (`.deck-shell`, `.deck-stage`, `.slide`, `.deck-counter`, `.deck-hint`, `@media print`, the trailing `<script>`).

## 4 — Plan diagram budget BEFORE writing slides

For every slide on your agenda, classify it as one of:

- **Architecture** — needs a real AWS architecture diagram. Plan a `drawio` call (preferred) or `architecture-diagram` call NOW so the diagram exists when you slot it in. See `references/diagrams.md`.
- **Two-Column** — needs an image (diagram, screenshot, chart) on the left + bullets on the right. Plan the image source.
- **Content / Bullet** — text-only. Allowed for Agenda, Section Divider, Summary, Q&A, and explanatory pages. Per the plugin's `techVsBusiness=tech`/`business` rule, every other content page must still carry a visual on one side.
- **Table / Comparison** — pure structured data, no image needed.
- **Demo/Code** — code block on dark surface, mono font, line-numbered.
- **Customer Story** — customer logo + 3 metrics + pull quote.

If `diagramApproach=drawio`, generate every architecture diagram via the `drawio` skill, save the resulting SVG/PNG into `assets/diagrams/`, and reference it from the slide. If `diagramApproach=architecture-diagram`, do the same via that skill. If `diagramApproach=slot`, leave a labelled placeholder rectangle styled per the architecture layout in `layouts.md`.

## 5 — Fill slides per `references/layouts.md`

Paste the matching layout skeleton inside each `<section class="slide">` block. Replace every `[REPLACE]` placeholder with real, specific copy from the brief — no lorem ipsum, no invented metrics, no stat-slop.

For technical/business content slides (when `techVsBusiness` is `tech` or `business`), pick the **Two-Column** layout by default — left column = diagram/screenshot/chart, right column = 3–5 bullets. Reserve the **Content (bullets only)** layout for Agenda, Summary, Section Divider, and Q&A.

## 6 — Architecture diagram rules (non-negotiable)

- All diagram labels are **Arial 12pt**.
- 2pt line weights for connectors.
- Open Arrow Size 4 for connectors.
- Group containers (VPCs, subnets, accounts, regions) carry 0.05" nested buffers.
- Color-code services by category from `references/aws-theme.md` (Compute = Smile Orange, Database = Nebula, Analytics = Galaxy Purple, Security = Mars Red, App Integration = Cosmos Pink, Storage/IoT = Endor Green, AI/ML = Orbit Turquoise, Borders = Light Gray).
- Arrows on dark backgrounds use `#9BA7B6`.
- Never crop, flip, rotate, recolor, or reshape AWS service icons.

## 7 — Pre-emit checklist

Run `references/checklist.md`. Every P0 must pass. If any P0 fails, fix and re-check before emitting. Then score yourself on the 5-dimensional critique (philosophy / hierarchy / execution / specificity / restraint); if any dimension is < 3/5, fix the weakest before emitting.

## 8 — Emit

If you wrote a fresh canonical HTML file this turn, emit a single `<artifact>` block wrapping it. If you only edited an existing deck file in-place, skip the artifact and just summarize what changed.

## What you do NOT do in this skill

- Do not write `<style>` rules for `.deck-shell`, `.deck-stage`, `.slide`, `.deck-counter`, `.deck-hint`, or anything inside `@media print`. The framework owns these.
- Do not write your own `fit()` / scale / keyboard / localStorage code. The framework owns these.
- Do not invent AWS service icons. Use rectangles labelled with the service name when no icon source is available.
- Do not use Inter / Roboto for headlines. Headlines are Amazon Ember Display (with the system fallback declared in the framework).
- Do not use any color outside the AWS palette declared in `references/aws-theme.md`.
- Do not include "Feature One / Feature Two" placeholder copy. Real copy from the brief or short honest stubs (`—`, "[customer]") only.
- Do not include speaker notes, animations, or transitions in the slide body. Speaker notes can be added as `<aside class="notes">` if `speakerNotes=true`.
