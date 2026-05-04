---
name: gamified-app
description: |
  A multi-frame gamified mobile-app prototype — three phone frames on a dark
  showcase stage. Frame 1: cover / poster, Frame 2: today's quests with XP
  ribbons and a level bar, Frame 3: quest detail. Vivid quest tiles, level
  ribbon, bottom tab bar. Use when the brief asks for a "gamified app",
  "habit tracker", "RPG-style life app", "level-up app", "daily quests",
  "XP / streak app", or "ELI5-style explainer app".
triggers:
  - "gamified app"
  - "habit tracker"
  - "rpg app"
  - "level up app"
  - "daily quests"
  - "xp app"
  - "streak app"
  - "life management app"
  - "游戏化"
  - "习惯打卡"
od:
  mode: prototype
  platform: mobile
  scenario: personal
  featured: 12
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design a gamified life-management app — multi-screen mobile prototype: cover poster, today's quests with XP, and a quest detail. ‘Daily quests for becoming a better human.’"
---

# Gamified App Skill

Produce a multi-screen mobile prototype on a single dark showcase page.
Three phone frames side-by-side, each one its own moment in the journey.

## Workflow

1. **Read the active DESIGN.md** (injected above). For gamified apps, lean
   on bold display type for headlines and a brighter, broader palette than
   most products — quests look like quests because the colors do.
2. **Pick the brand + value prop** from the brief. Generate real quest
   names (e.g. "Body — 20-min strength: pushups & planks", "Read — Four
   Thousand Weeks", "Listen — Huberman Lab · Sleep Architecture",
   "Nourish — Cook a high-protein lunch", "Mind — 10-min focus
   meditation", "Watch — The Bear · S3 E4").
3. **Stage** — full-bleed dark page (near-black `#0e0d0c` or DS dark token)
   with a soft top spotlight gradient. Above the phones, a small caption
   row: "HI-FI PROTOTYPE · IPHONE" left, brand wordmark right, both in mono.
4. **Phones** — three 360×780 phone frames in a horizontal row (wraps to
   stack on narrow viewports). Each phone:
   - 12px black bezel, 44px corner radius, dynamic-island notch.
   - Status bar (time / signal / battery).
   - Phone-specific content (below).
   - Bottom tab bar with 5 icons (Today, Library, Stats, ⊕ central CTA,
     Profile). Active tab in accent.
5. **Phone 1 — cover poster (sales/value prop)**:
   - Status bar.
   - HI-FI PROTOTYPE · IPHONE eyebrow.
   - Big display headline ("Daily quests for becoming a better human."),
     accent on "becoming".
   - 1–2 sentence body in muted serif/sans.
   - Mono tip line ("Tap quests to open detail. Toggle [theme] in the
     toolbar to switch theme & layout.")
   - Subtle scrolling teaser of the next screen at the bottom edge.
6. **Phone 2 — today's quests dashboard** (the hero screen):
   - Greeting "Good morning, Sam" + small XP-bell ringing.
   - Level ribbon — "LV 14 · Level 14 · 1648 / 2480 XP" with a progress
     bar inside a glassmorphic ribbon.
   - Sub-line: "8 quests waiting · earn 430 XP today".
   - 3×2 grid of quest tiles. Each tile: rounded corner, pastel accent
     color, glyph chip in top-left, title, mini-meta line, "+NN XP" pill
     in bottom-right.
   - Bottom tab bar.
7. **Phone 3 — quest detail**:
   - Back arrow + screen title ("Quest").
   - Hero block with the quest's accent color, big serif quest title
     ("Body — strength"), short narrative body, "REWARD +90 XP" stamp.
   - Steps checklist (3–4 micro-tasks, one done, two pending).
   - Big primary CTA "Start quest" pill at the bottom in accent.
8. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline.
   - All in CSS — no images. Use `linear-gradient` and inline SVG glyphs
     for tile chips and tab icons.
   - `data-od-id` on stage, each phone, each frame's regions.
9. **Self-check**:
   - Three frames, each with a distinct purpose. Not three copies of the
     same screen.
   - Tile colors don't overpower — each quest tile uses a different pastel
     against the same neutral surface.
   - Reads as gamified and adult — playful, not childish.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="game-slug" type="text/html" title="Mobile — App Name">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
