---
name: example-qiaomu-wizard
description: Light warm-paper multi-step booking wizard with step indicator, inline validation, review step, and success state.
---

# Booking Wizard

A trust-first multi-step flow on a warm paper ground: numbered step bar, selectable option cards (flights), passenger form with inline validation, payment review, and an animated success state. Function contract comes first — the user can always tell where they are, what's left, and how to go back.

## When to use

- Multi-step booking / checkout / signup / onboarding flows
- Any form long enough to need chunking into 3-5 steps
- Flows mixing selection cards + text input + a final review step

## Style rules

- Palette: warm paper background `#FAF9F7`, white `#FFFFFF` cards, warm border `#E8E4DE`. One calm accent `#4A6FA5` (trust blue, desaturated) with light fill `#EEF3FA`. Functional colors fixed: success `#2D7A4F`, error `#B94040`, warning `#96600A`, each with a matching light tint background.
- Text: `rgba(0,0,0,.88)` primary / `.55` secondary / `.28` disabled. Body sans (DM Sans) + mono (DM Mono) for flight numbers, prices, times; Chinese on the system stack. Body text ≥ 14px.
- Step indicator: numbered circles joined by connector lines; states = done (accent fill + check), active (accent ring), upcoming (`#D0CBC3`). Steps are also a progress promise — never remove a completed step's checkmark.
- Selection cards: whole card clickable, selected state = accent border + light accent fill + check; hover = shadow-md `0 4px 16px rgba(0,0,0,.08)`; keyboard focusable.
- Validation is inline and kind: error appears next to the field with the message plus what to do next; never a bare "invalid input"; never block on first keystroke — validate on blur/submit.
- Navigation contract: primary "next" button right, ghost "back" left, both always visible; disable next only with a visible reason.
- Review step restates every prior choice with an edit link per section; totals in mono, tabular numerals.
- Success state: single clear confirmation with reference code and next actions; a modest one-time animation (scale 0.95 → 1 + fade, `cubic-bezier(0.23, 1, 0.32, 1)`, ≤ 400ms).
- Shadows stay soft and layered (`0 1px 3px rgba(0,0,0,.06), 0 1px 2px rgba(0,0,0,.04)`); radius consistent; spacing on a 4px base.

## Anti-patterns

- Dark theme or high-saturation accents in a trust/transaction flow
- Steps without a way back; losing entered data when navigating between steps
- Error text without a fix ("Something went wrong")
- Dumping all fields on one screen and calling the header a "wizard"
- Confetti or long celebratory animations that delay the confirmation info

## Template fidelity (hard constraint)

The bundled `example.html` in this folder is the ground truth for this
template, not loose inspiration. Before generating, read `example.html`
and reproduce its visual system:

1. Reuse its layout skeleton, section order, spacing rhythm, typography
   stack, color tokens, and signature components as-is.
2. Swap only CONTENT for the user's brief: copy, data, imagery subjects,
   brand name. Structure, hierarchy, and visual language stay.
3. Keep the same fonts (or the closest available), the same accent-color
   discipline, and the same interaction details (hover states, motion).
4. Output copy follows the language of the user's brief, but the result
   must remain recognizably this template when placed side-by-side with
   `example.html`.
5. If the brief conflicts with the template, make the smallest deviation
   that satisfies the brief. Never redesign from scratch.

Adapted from https://github.com/joeseesun/qiaomu-design (MIT)
