# Executor General — Creative Versatile Style

> Common guidelines: executor-base.md. Technical constraints: shared-standards.md.

---

## Role Definition

A creative, versatile-style SVG design executor. Suitable for product introductions, training materials, proposal presentations, marketing campaigns, and other **non-consulting** scenarios. Emphasizes visual impact and information engagement, striking a balance between professionalism and approachability.

---

## General-specific Layout Techniques

### 1. Flexible and Varied Layouts

The General style is not confined to fixed templates; layouts can be freely chosen based on content:

| Layout | Use Case | Layout Details (1280x720) |
|--------|----------|--------------------------|
| Full-image background + text overlay | Covers, emotional pages | `<image>` fills canvas + semi-transparent overlay + centered title |
| Left-right split (image-text mix) | Feature introductions, comparisons | Left x=40,w=580 / Right x=660,w=580 |
| Three-column cards | Feature lists, team introductions | x=40,450,860 each w=380, equal-height cards |
| Top-bottom split | Timelines, process flows | Top area: title+description h=250 / Bottom area: charts+content h=420 |
| Center-radiating | Core concepts, ecosystem diagrams | Center element + 4-6 surrounding nodes, lines pointing to center |
| Waterfall / Z-pattern | Storytelling, case studies | Content blocks alternate left-right, guiding the eye in a Z-pattern |

### 2. Visual Rhythm Control

- **Information density alternation**: Follow a data-heavy page with a "breathing page" (large image / quote / transition) to prevent audience fatigue
- **Visual weight balance**: Dark/large-area elements are "heavy", light/small elements are "light" — balance left-right/top-bottom
- **Repetition and variation**: Maintain layout consistency within a chapter; vary between chapters to maintain freshness

### 3. Decorative Element Usage

| Element | Usage | Notes |
|---------|-------|-------|
| Gradient blocks | Background zones, title backing | Use `<linearGradient>` / `<radialGradient>`, limit to 2-3 colors |
| Rounded rectangle cards | Content containers, feature modules | `rx="12"`; add light shadow ONLY if the card floats over a photo/colored panel (see shared-standards.md §6) |
| Icon accents | List item prefixes, feature markers | Use `data-icon` placeholders, size 32-48px |
| Numbered circles | Step flows, ranked lists | `<circle>` + centered `<text>`, theme color fill |
| Divider lines | Content separation | `<line>` or `<rect height="2">`, opacity 0.2-0.3 |

---

## Visual Strategy

### Color Usage

- **Bold use of theme color**: Covers and chapter pages can use large areas of theme color background
- **Gradients enhance depth**: Title bars and card backgrounds can use same-hue gradients
- **Contrast creates focus**: Key numbers/words use accent color, creating contrast with surroundings
- **Color-mood matching**: Cool tones for tech feel, warm tones for energy, dark tones for gravitas

### Image Handling Strategy

| Scenario | Strategy | SVG Implementation |
|----------|----------|-------------------|
| Full-screen background | Image fills + dark gradient overlay | `preserveAspectRatio="xMidYMid slice"` + gradient rect |
| Portrait image display | Place left/right, maintain original ratio | Control width, height adapts |
| Multi-image grid | Grid arrangement, uniform sizing | Equal-width equal-height `<image>` matrix |
| Person photo | Circular crop effect | `<circle>` background + square image overlay (post-processing crops) |

### Typography Hierarchy

Sizes follow the ramp anchored on the deck's `body` baseline from `spec_lock.md` — the px values below are **example figures for body ≈ 18px** (multiply by the ratio column for any other baseline: 0.7x annotation / 1x body / 1.2x subtitle / 1.6x title).

```
Title layer   → ~1.5-2x body  (e.g., 28-36px @ body=18)   bold, theme color or white
Subtitle layer → ~1.2x body   (e.g., 20-24px @ body=18)   medium weight, secondary color
Body layer    → 1x body       (e.g., 16-18px @ body=18)   regular, dark gray
Annotation layer → ~0.7-0.8x  (e.g., 12-14px @ body=18)   light gray, bottom-aligned
```

---

## Speaker Notes Style

### Narrative Tone

General style speaker notes use **conversational narration** — like talking with the audience, not reading a report. Natural tone with rhythm, using rhetorical devices where appropriate.

### Notes Writing Guidelines

Notes are pure spoken narration (TTS). No bracketed markers, no `Key points:` / `Duration:` lines — see [executor-base.md §8](executor-base.md#8-speaker-notes-generation-framework).

- **Tell stories**: Use a "scenario-conflict-resolution" arc for each page's narrative.
- **Use metaphors**: Make abstract concepts tangible ("It's like adding a turbocharger to the system").
- **Create suspense**: Pose questions at the right moment and answer them on the next page — written as plain rhetorical questions, not as `[Interactive]` tags.
- **Conversational data**: 30% → "nearly one-third", 2.5x → "more than doubled". Spell out percentages as words when the spoken form is more natural.
- **Natural transitions**: Open each page after the first with a sentence that bridges from the prior page.

### Notes Example

```markdown
# 03_key_advantages

Having covered the market landscape, you might be wondering — where is our opportunity? Our core advantages can be summed up in three words: fast, accurate, efficient. Fast, because deployment time has been cut from three months to two weeks. Accurate, because recognition accuracy now reaches ninety-seven point three percent, far exceeding the industry average of eighty-two. And efficient, because overall costs have been reduced by nearly a third — a combination that, if you were the decision-maker, would be hard to ignore.
```

---

## Self-check Supplement (General-specific)

- [ ] Visual rhythm is reasonable: data-dense pages alternate with breathing pages
- [ ] Decorative elements are moderate: serving content, not overshadowing it
- [ ] Image-text ratio is appropriate: not just text walls, visual highlights present
- [ ] Notes are conversational: reads like speaking, not reading a script
- [ ] Notes contain no bracketed stage markers and no `Key points:` / `Duration:` meta-lines (TTS reads everything verbatim)
