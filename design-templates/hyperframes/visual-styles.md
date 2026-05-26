# Visual Style Library

Named visual identities for HyperFrames videos. Each style is grounded in a real graphic design tradition. Use them to give your video a specific visual personality, not just generic "clean" or "bold."

**How to pick:** Match mood first, content second. Ask: _"What should the viewer FEEL?"_

**How to use:** Reference the style in your scene plan. Translate the style's principles into concrete composition decisions — palette choice, font selection, entrance patterns, transition type, ambient motion feel.

## Quick Reference

| Style           | Mood                  | Best for                           | Primary shader                    |
| --------------- | --------------------- | ---------------------------------- | --------------------------------- |
| Swiss Pulse     | Clinical, precise     | SaaS, data, dev tools, metrics     | Cinematic Zoom or SDF Iris        |
| Velvet Standard | Premium, timeless     | Luxury, enterprise, keynotes       | Cross-Warp Morph                  |
| Deconstructed   | Industrial, raw       | Tech launches, security, punk      | Glitch or Whip Pan                |
| Maximalist Type | Loud, kinetic         | Big announcements, launches        | Ridged Burn                       |
| Data Drift      | Futuristic, immersive | AI, ML, cutting-edge tech          | Gravitational Lens or Domain Warp |
| Soft Signal     | Intimate, warm        | Wellness, personal stories, brand  | Thermal Distortion                |
| Folk Frequency  | Cultural, vivid       | Consumer apps, food, communities   | Swirl Vortex or Ripple Waves      |
| Shadow Cut      | Dark, cinematic       | Dramatic reveals, security, exposé | Domain Warp                       |

---

## 1. Swiss Pulse — Josef Müller-Brockmann

**Mood:** Clinical, precise | **Best for:** SaaS dashboards, developer tools, APIs, metrics

- Black (`#1a1a1a`), white, ONE accent — electric blue (`#0066FF`) or amber (`#FFB300`)
- Helvetica or Inter Bold for headlines, Regular for labels. Numbers large (80–120px)
- Grid-locked compositions. Every element snaps to an invisible 12-column grid
- Animated counters count up from 0. Hard cuts, no decorative transitions
- Transitions: Cinematic Zoom or SDF Iris (precise, geometric)

**GSAP signature:** `expo.out`, `power4.out`. Entries are fast and snap into place. Nothing floats.

```
Swiss Pulse: Black/white + one electric accent. Grid-locked compositions.
Numbers dominate the frame at 80-120px. Counter animations from 0.
Hard cuts or geometric transitions. Nothing decorative.
```

---

## 2. Velvet Standard — Massimo Vignelli

**Mood:** Premium, timeless | **Best for:** Luxury products, enterprise software, keynotes, investor decks

- Black, white, ONE rich accent — deep navy (`#1a237e`) or gold (`#c9a84c`)
- Thin sans-serif, ALL CAPS, wide letter-spacing (`0.15em+`)
- Generous negative space. Symmetrical, centered, architectural precision
- Slow, deliberate. Sequential reveals with long holds. No frantic motion
- Transitions: Cross-Warp Morph (elegant, organic flow between scenes)

**GSAP signature:** `sine.inOut`, `power1`. Nothing snaps — everything glides with intention.

```
Velvet Standard: Black, white, one rich accent. Thin ALL CAPS type with wide tracking.
Generous negative space. Sequential reveals, long holds.
Cross-Warp Morph transitions. Slow and deliberate — luxury takes its time.
```

---

## 3. Deconstructed — Neville Brody

**Mood:** Industrial, raw | **Best for:** Tech news, developer launches, security products, punk-energy reveals

- Dark grey (`#1a1a1a`), rust orange (`#D4501E`), raw white (`#f0f0f0`)
- Type at angles, overlapping edges, escaping frames. Bold industrial weight
- Gritty textures: scan-line effects, glitch artifacts baked into the design
- Text SLAMS and SHATTERS. Letters scramble then snap to final position
- Transitions: Glitch shader or Whip Pan (breaks the rules, feels aggressive)

**GSAP signature:** `back.out(2.5)`, `steps(8)`, `elastic.out(1.2, 0.4)`. Intentional irregularity.

```
Deconstructed: Dark grey #1a1a1a + rust orange #D4501E. Type at angles, escaping frames.
Scan-line glitch overlays. Text SLAMS and scrambles into place.
Glitch shader transitions. Industrial and raw — nothing should feel polished.
```

---

## 4. Maximalist Type — Paula Scher

**Mood:** Loud, kinetic | **Best for:** Big product launches, milestone announcements, high-energy hype videos

- Bold saturated: red (`#E63946`), yellow (`#FFD60A`), black, white — maximum contrast
- Text IS the visual. Overlapping type layers at different scales and angles, filling 50–80% of frame
- Everything is kinetic: slamming, sliding, scaling. 2–3 second rapid-fire scenes
- Text layered OVER footage — never empty backgrounds
- Transitions: Ridged Burn (explosive, dramatic, impossible to ignore)

**GSAP signature:** `expo.out`, `back.out(1.8)`. Fast arrivals, hard stops.

```
Maximalist Type: Red, yellow, black, white — max contrast. Text IS the visual.
Overlapping at different scales, 50-80% of frame. Everything in motion.
Ridged Burn transitions. No static moments — kinetic energy throughout.
```

---

## 5. Data Drift — Refik Anadol

**Mood:** Futuristic, immersive | **Best for:** AI products, ML platforms, data companies, speculative tech

- Iridescent: deep black (`#0a0a0a`), electric purple (`#7c3aed`), cyan (`#06b6d4`)
- Thin futuristic sans-serif — floating, weightless, minimal
- Fluid morphing compositions. Extreme scale shifts (micro → macro)
- Particles coalesce into numbers. Light traces data paths through the frame
- Transitions: Gravitational Lens or Domain Warp (otherworldly distortion)

**GSAP signature:** `sine.inOut`, `power2.out`. Smooth, continuous, organic. Nothing hard.

```
Data Drift: Deep black #0a0a0a with electric purple #7c3aed and cyan #06b6d4.
Thin futuristic type, minimal text. Particles coalesce into numbers.
Gravitational Lens or Domain Warp transitions. Fluid, immersive, otherworldly.
```

---

## 6. Soft Signal — Stefan Sagmeister

**Mood:** Intimate, warm | **Best for:** Wellness brands, personal stories, lifestyle products, human-centered apps

- Warm amber (`#F5A623`), cream (`#FFF8EC`), dusty rose (`#C4A3A3`), sage green (`#8FAF8C`)
- Handwritten-style or humanist serif fonts. Personal, lowercase, delicate
- Close-up framing feel: single element fills the frame. Nothing feels corporate
- Slow drifts and floats, never snaps. Soft organic motion throughout
- Transitions: Thermal Distortion (warm, flowing, like heat shimmer)

**GSAP signature:** `sine.inOut`, `power1.inOut`. Everything breathes.

```
Soft Signal: Warm amber, cream, dusty rose, sage green. Humanist or handwritten type.
Single elements fill the frame — intimate, never corporate.
Slow drifts and floats throughout. Thermal Distortion transitions.
Nothing should feel hurried or polished.
```

---

## 7. Folk Frequency — Eduardo Terrazas

**Mood:** Cultural, vivid | **Best for:** Consumer apps, food platforms, community products, festive launches

- Vivid folk: hot pink (`#FF1493`), cobalt blue (`#0047AB`), sun yellow (`#FFE000`), emerald (`#009B77`)
- Bold warm rounded type. Pattern and repetition — folk art rhythm and density
- Layered compositions with rich visual texture. Every frame feels handcrafted
- Colorful motion: elements bounce, pop, and spin into place with joy
- Transitions: Swirl Vortex or Ripple Waves (hypnotic, celebratory)

**GSAP signature:** `back.out(1.6)`, `elastic.out(1, 0.5)`. Overshoots feel intentional.

```
Folk Frequency: Hot pink #FF1493, cobalt blue, sun yellow, emerald. Bold rounded type.
Pattern and repetition throughout. Layered, dense, handcrafted feeling.
Swirl Vortex or Ripple Waves transitions. Joyful, celebratory energy.
```

---

## 8. Shadow Cut — Hans Hillmann

**Mood:** Dark, cinematic | **Best for:** Security products, dramatic reveals, investigative content, intense launches

- Near-monochrome: deep blacks (`#0a0a0a`), cold greys (`#3a3a3a`), stark white + blood red (`#C1121F`) or toxic green (`#39FF14`)
- Sharp angular text like film noir title cards. Heavy contrast, no softness
- Heavy shadow — elements emerge from darkness. Reveal is the narrative
- Slow creeping push-ins, dramatic scale reveals, silence before the hit
- Transitions: Domain Warp (dissolves reality itself before revealing the next scene)

**GSAP signature:** `power4.in` for exits, `power3.out` for dramatic reveals. The pause before the hit matters.

```
Shadow Cut: Deep blacks #0a0a0a, cold greys, stark white + one accent (blood red or toxic green).
Sharp angular type, film noir aesthetic. Elements emerge from darkness.
Slow creeping push-ins. Domain Warp transitions. The reveal IS the story.
```

---

## Mood → Style Guide

| If the content feels...            | Use...          |
| ---------------------------------- | --------------- |
| Data-driven, analytical, technical | Swiss Pulse     |
| Premium, enterprise, luxury        | Velvet Standard |
| Raw, punk, aggressive, rebellious  | Deconstructed   |
| Hype, loud, high-energy launch     | Maximalist Type |
| AI, ML, speculative, futuristic    | Data Drift      |
| Human, warm, personal, wellness    | Soft Signal     |
| Cultural, fun, consumer, festive   | Folk Frequency  |
| Dark, dramatic, intense, cinematic | Shadow Cut      |

---

## Creating Custom Styles

These 8 styles are examples — not constraints. Create your own by:

1. **Name it** after a designer, art movement, or cultural reference
2. **Palette**: 2-3 colors max. Declare explicit hex values
3. **Typography**: One family, two weights. State the role of each
4. **Motion rules**: How fast? Snappy or fluid? Overshoot or precision?
5. **Transition**: Which shader matches the energy?
6. **What NOT to do**: 2-3 explicit anti-patterns for this style

The pattern: **named style → palette → typography → motion rules → transition → avoids.**
