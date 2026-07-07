---
name: "Make A Deck"
description: "Claude design system prompt skill for Make A Deck"
triggers:
  - "claude make a deck"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Make a Deck: Slide Presentation in HTML

Build a slide presentation as a single HTML file with fixed-size slides (typically 1920×1080, 16:9) that letterbox to any viewport. Use this when the user asks for a deck, presentation, slides, or pitch. Don't hand-roll the scaling — use the deck shell starter.

## Phase 1: Discovery

Confirm before building: **audience** (determines tone and density); **format** (aspect ratio — 16:9 default — and slide count: a 10-minute deck is ~10 slides, a 30-minute one ~20–25); **tone** (formal corporate, casual internal, marketing-bold, technical); **source content** (read any PRD or existing material before sketching); **speaker notes** (off by default, only when explicitly requested); **brand / design system** (always confirm — if none, invoke `frontend-aesthetic-direction` before drawing).

If the user gave enough context (e.g., "make a 5-slide deck for engineering all-hands from this PRD"), skip the question round.

## Phase 2: Plan the layout system

Before building any slide, commit to a layout system and vocalize it in a comment block at the top of the file. A typical deck has 4–6 layout types: cover/title, section header (full-bleed color or image), content slide (headline + chart/image/list), quote/pull-out, comparison/two-column, closing/CTA. For each: background treatment, headline size and position, body content area, footer (page number, brand mark, none).

Limit the deck to **1–2 background colors**; section headers may break to a third, no more.

## Phase 3: Build the deck shell

Use the deck-shell starter (`copy_starter_component` with `kind: "deck_stage.js"`) — it handles scaling/letterboxing, keyboard and tap navigation, the slide counter, localStorage persistence, print-to-PDF, and `data-om-validate` tagging. Each slide is a direct child `<section>` of `<deck-stage>`.

Give each slide a `data-screen-label` so the user can reference it by name when commenting (`<section data-screen-label="01 Title">`). **Labels are 1-indexed** to match the slide counter the user sees.

## Phase 4: Build slide-by-slide

Build in order, and show the user the file after 1–2 slides — don't perfect 15 in private and then reveal. Per slide:

- **Type.** Body never under 24px on a 1920×1080 canvas, ideally 32px+; headlines 60–96px+.
- **Hierarchy.** One primary message per slide; supporting elements smaller and more muted.
- **Imagery.** From the design system, or honest placeholders (striped background, monospace label). No hand-drawn SVG filler.
- **No filler slides.** "Why choose us?" / "About this deck" cost the user attention — cut them.
- **Charts.** Show what matters; cut columns and data points that don't support the slide's point.

Use the design system's spacing and color tokens — no new values inline.

## Phase 5: Speaker notes (only if requested)

When asked: add a `<script type="application/json" id="speaker-notes">` array in the head, one entry per slide, written as full conversational scripts (not bullet outlines). Slides with notes can carry less on-screen text. The shell renders them automatically.

## Phase 6: Verify and deliver

Walk the deck top to bottom in the preview: scaling at multiple viewport sizes, counter increments correctly, keyboard nav (arrows, space) works, nothing overflows slide bounds, type meets the 24px+ minimum, contrast passes WCAG (invoke `accessibility-audit` for thoroughness).

For end-of-turn delivery, surface the final HTML file and call the verifier subagent for the thorough pass. Summarize briefly: caveats (e.g., placeholder imagery still needed), next steps (e.g., real charts to swap in), and decisions the user should sign off on.
