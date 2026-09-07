---
name: "image-event-poster"
en_name: "Bright Event Poster"
zh_name: "活动海报"
description: "Create a bold, type-led event poster for festivals, exhibitions, talks, nightlife, launches, and community gatherings. Use when exact event facts, a strong thumbnail hook, and tactile print energy must work in one finished image."
zh_description: "生成以大字排版为主的活动海报，适合音乐节、展览、讲座、夜店、发布会、社区活动。"
triggers:
  - "event poster"
  - "festival poster"
  - "exhibition poster"
  - "gig poster"
  - "talk poster"
  - "活动海报"
  - "展览海报"
  - "音乐节海报"
  - "讲座海报"
  - "发布会海报"
od:
  mode: "image"
  task_type: "image"
  surface: "image"
  scenario: "marketing"
  category: "event-poster"
  preview:
    type: "image"
    poster: "example.webp"
  design_system:
    requires: false
  example_prompt: "Create a 4:5 event poster for an indie music night: exact strings for title, date, city and doors time, oversized condensed type, screen-print texture."
---
# Bright Event Poster

Create one flat, finished event poster. It should attract attention at thumbnail size, then reveal a disciplined information hierarchy up close.

## Inputs

Collect or infer:

- exact event name, date, time, location, organizer, and optional program line
- channel and aspect ratio
- audience, energy, and one visual idea tied to the event
- brand colors, type character, and print or digital finish

Exact public-facing copy is a hard dependency. Never invent sponsors, addresses, ticket claims, QR codes, or legal text.

## Art direction

1. Reduce the event to one visual verb such as burst, collide, orbit, stack, stretch, or slice.
2. Make the event name the dominant shape, not a caption placed over decoration.
3. Assign every supplied text string one hierarchy level: title, event facts, or supporting line.
4. Default to a high-key field with two saturated colors and one sharp accent; preserve requested brand colors when supplied.
5. Add causal physical texture: screen-print grain, paper fibers, fold lines, tape, staples, ink misregistration, or halftone—not random noise.
6. Keep one visual weapon. Remove competing effects that weaken the first glance.

Use the host image-generation capability and save one finished bitmap.

## Reject generic AI styling

No glossy 3D type, black neon background, vaporwave gradient, floating shapes, centered showroom symmetry, illegible microcopy, fake logos, filler text, presentation mockup, or texture that has no physical cause.

## Quality gate

- The title is readable first; date and location are readable second.
- The concept survives a small social-feed preview.
- All supplied facts appear exactly once and remain accurate.
- Bright color creates contrast without washing out the copy.
- The image feels printed or deliberately art-directed rather than auto-composed.

## Demo brief

Create a 4:5 poster using only the exact text **AFTER DARK**, **23 AUG**, **SHANGHAI**, and **DOORS 22:00**. Use luminous butter-yellow paper, giant electric-cobalt type, a coral diagonal burst, a cyan halftone dancer, and acid-lime/orange registration details.
