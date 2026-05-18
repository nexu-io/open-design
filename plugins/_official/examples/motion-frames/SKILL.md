---
name: motion-frames
description: |
  A single-frame motion-design composition with looping CSS animations —
  rotating type ring, animated globe, ticking timer, parallax labels.
  Renders as a hero video poster you can hand straight to HyperFrames or
  any keyframe-based exporter. Use when the brief asks for "motion design",
  "animated hero", "loop", "video poster", "title card", or pairs Open
  Claude Design with HyperFrames for a kinetic export.
triggers:
  - "motion design"
  - "motion graphic"
  - "animated hero"
  - "loop animation"
  - "video poster"
  - "title card"
  - "hyperframes"
  - "kinetic typography"
  - "动态设计"
  - "动效"
od:
  mode: prototype
  platform: desktop
  scenario: marketing
  featured: 6
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  example_prompt: "Design an animated hero — a rotating type ring around a wireframe globe, with the headline ‘Reach every country.’ Loop at 12s, ready for HyperFrames export."
---

# Motion Frames Skill

Produce a single full-bleed motion composition. Inline CSS animations only —
the page is the loop. Treat it as a poster frame that an exporter (HyperFrames,
Lottie, etc.) can capture into a video.

## Workflow

1. **Read the active DESIGN.md** (injected above). Motion lives or dies on
   typography contrast — pick the most expressive serif / display token in
   the DS for the headline; the body / mono token labels everything else.
2. **Compose** the canvas as a 16:9 hero with these layers, back to front:
   - **Stage** — full-bleed `<main>`. Off-white or DS-canvas background, very
     subtle dotted grid texture (CSS background, `radial-gradient` dots at
     22–32px intervals).
   - **Concentric rings** — 2–3 SVG circles radiating from a focal point.
     Ultra-thin strokes (0.5–1px) in DS-foreground at low opacity. These
     rotate at different speeds (60s, 90s, 180s).
   - **Focal mark** — a wireframe globe, a stylized object, or a typographic
     monogram drawn as inline SVG. ~28% of the canvas wide.
   - **Ring labels** — short words / phonetic tokens placed around one of
     the rings (e.g. "Hola · Bonjour · 你好 · नमस्ते"). They co-rotate with
     the ring, with `<text>` paths counter-rotated so the words stay upright.
   - **Headline** — bottom-left or center-bottom. Display serif, italic
     accent on one word. Add a subtle `letterSpacing` + opacity reveal
     animation (`@keyframes type-in`).
   - **Frame chrome** — corner stamps (top-left lab tag, top-right brand or
     issue number) and a thin baseline rule. Static.
3. **Animate** with `@keyframes` only — no JS:
   - `rotate-slow`, `rotate-med`, `rotate-fast` for rings.
   - `globe-spin` for the focal mark.
   - `pulse` for the focal dot, ~2s, easing.
   - `marquee-fade` to reveal headline once on load.
4. **Write** a single HTML document:
   - `<!doctype html>` through `</html>`, CSS inline.
   - All motion uses CSS — no scripts, so HyperFrames or any frame-grabber
     can capture it deterministically.
   - `data-od-id` on stage, focal, ring, headline, chrome.
5. **Self-check**:
   - The composition still reads as a poster with motion paused at frame 0.
   - At least 3 layers move at different speeds (depth comes from delta
     velocity, not parallax tricks).
   - Accent appears once — usually the italic word in the headline.

## Output contract

Emit between `<artifact>` tags:

```
<artifact identifier="motion-slug" type="text/html" title="Motion — Title">
<!doctype html>
<html>...</html>
</artifact>
```

One sentence before the artifact, nothing after.
