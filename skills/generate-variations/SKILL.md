---
name: "Generate Variations"
description: "Claude design system prompt skill for Generate Variations"
triggers:
  - "claude generate variations"
od:
  category: prompt-library
  upstream: "https://github.com/Trystan-SA/claude-design-system-prompt"
---
# Generate Variations: Produce 3+ Design Options

Produce multiple distinct design variations of a screen, component, or flow so the user can mix and match the strongest pieces. Use this when the user asks for options, alternatives, "different takes," or "show me a few." **Variations are the cheapest path to good design** — one design is one bet; three let the user reject what they don't want and combine what they do.

## Phase 1: Establish the baseline

Confirm: **what is being varied** (screen, component, flow, visual treatment — scope determines how many variations are useful); **existing design context** (variations should root in the UI kit / design system unless explicitly asked to break free); **number** (default 3; 5–6 is a healthy ceiling); **axis preference** (visuals, interactions, layout, or copy/tone — where does the user want exploration weighted?).

## Phase 2: Pick the axes

Pick 2–4 dimensions to vary across: visual treatment (color tone, density, shadow, radius, type weight); layout (centered vs asymmetric, single vs multi-column, full-bleed vs inset); interaction model (single page vs multi-step, modal vs inline); information hierarchy; tone; component style. Write down which axis each variation flexes — it makes the comparison legible to the user.

## Phase 3: Build with intent — basic to bold

Order from most by-the-book to most novel:

1. **By the book.** Matches existing patterns and conventions — the safe option.
2. **Refined.** Same structure, one or two dimensions pushed — bolder type, more confident layout, more expressive color. Often the user's actual pick.
3. **Novel.** A genuinely different take — unconventional layout, strong visual metaphor, daring aesthetic. Stretches the conversation and surfaces preferences the user didn't know they had.
4. **4–6 (if requested).** Hybrids along the spectrum, or a wildcard on a different axis.

**Cover both ends.** All-safe wastes the user's time; all-wild ignores the brief.

## Phase 4: Vary substantively, not cosmetically

Variations should differ in layout, hierarchy, what's primary, type system, density, interaction approach, or copy strategy — not just button color, accent shade, or shadow opacity. If two are too close, drop one for a more substantive alternative. The user should be able to articulate the difference between any two variations in one sentence.

**Specify each variation concretely before building it** — distinct palette family, distinct type pairing, distinct layout skeleton, written down per variation. Variety must be designed, not hoped for: left unspecified, variations drift toward one default look (typically the warm-editorial house style). For the novel variation, deliberately pick something off-distribution and interesting.

## Phase 5: Present in a single file

Use the `design_canvas.jsx` starter for static variations side-by-side, or **tweaks** (`make-tweakable`) if the variations share structure and differ on a few axes. For flows, build each variation as a small storyboard within the canvas. **Do not produce v1.html / v2.html / v3.html** — one file, all variations visible or toggle-able.

## Phase 6: Annotate and recommend

Caption each variation in one or two sentences ("Variation 2 — Refined. Same structure, expressive headline type, warmer palette."). The captions are a thinking tool: if you can't write a clear one, the variation isn't distinct enough.

End with a clear recommendation — the user decides, but a designer offers an opinion ("Variation 2 is my pick — the safety of 1 with more visual confidence"). Don't hedge that all options are equally good; they aren't.

Then suggest the next step: a refinement round on the chosen direction, another variation round on a different axis, `make-a-prototype` to go interactive, or `polish-pass` if the user is ready to ship.
