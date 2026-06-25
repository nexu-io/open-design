---
name: instagram-carousel
description: |
  Generate a 7-slide Instagram carousel as self-contained HTML.
  Each slide is 1080x1350px. Output is a single HTML file with
  inline CSS, Google Fonts, and all slides in sequence.
triggers:
  - "instagram carousel"
  - "social carousel"
  - "carousel slides"
od:
  mode: prototype
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
  craft:
    requires: [typography, anti-ai-slop]
  outputs:
    primary: index.html
---

# Instagram Carousel Builder

You are building a 7-slide Instagram carousel as a single self-contained HTML file. Every slide is exactly 1080px wide by 1350px tall. The output must work as a local file opened in a browser — all CSS inline, fonts loaded from Google Fonts CDN, no external dependencies besides fonts.

## CRITICAL: Headless Mode

Do NOT use AskUserQuestion or any interactive tool. All content is provided in the user prompt. Do NOT run a discovery phase. Do NOT ask clarifying questions. Read the prompt, build the carousel, output the artifact immediately.

## Slide Structure

The carousel has exactly 7 slides in this order:

1. **Cover** — Hook headline + subcopy + "Swipe →" indicator + social handle
2. **Content 1** — Ghost number (01) + step label + headline + body + handle
3. **Content 2** — Ghost number (02) + step label + headline + body + handle
4. **Content 3** — Ghost number (03) + step label + headline + body + handle
5. **Content 4** — Ghost number (04) + step label + headline + body + handle
6. **Content 5** — Ghost number (05) + step label + headline + body + handle
7. **CTA** — Eyebrow + headline + "Link in Bio" button + subcopy + handle

## HTML Architecture

```html
<div class="gallery" id="gallery">
  <!-- Repeat for each slide: -->
  <div class="frame-wrap">
    <div class="slide-frame" id="carousel-1-slide-N">
      <div class="slide">
        <!-- slide content -->
      </div>
    </div>
  </div>
</div>
```

**Required classes** (screenshot tooling depends on these):
- `.slide-frame` — the 1080x1350 container. Must have `width: 1080px; height: 1350px`.
- `.slide` — the content area inside the frame. Same dimensions.
- `.frame-wrap` — outer wrapper for each slide.
- `.gallery` with `id="gallery"` — the parent container.

## CSS Rules

Read the active DESIGN.md. Apply its color palette, typography, and spacing rules. Specifically:

- Use the display font for headlines (ALL CAPS, letter-spacing: 0.06em minimum)
- Use the body font for body text
- Use the brand accent color for: divider lines, one accent element per slide max
- Background colors must alternate per the brand's section rhythm
- `border-radius: 0` unless the brand's DESIGN.md explicitly allows rounded corners
- All font sizes use `px` units (not rem/em/cqw — this is a fixed-dimension canvas)
- Social handle appears on every slide, bottom-right or bottom-center, muted color

## Typography Scale (1080px canvas)

- Cover headline: 48-64px display font, ALL CAPS
- Content headline: 36-44px display font, ALL CAPS
- Content body: 22-26px body font, regular weight
- Step label: 14-16px body font, uppercase, tracked
- Ghost number: 180-220px display font, opacity 0.06-0.08
- CTA headline: 44-56px display font, ALL CAPS
- Social handle: 14-16px body font, muted

## Slide Composition Rules

- Cover: headline at bottom-third of slide, subcopy below, generous top space
- Content slides: ghost number top-left (absolute positioned), content vertically centered
- Each content slide has an orange/accent divider line between step-label and headline
- CTA: content bottom-third, "Link in Bio" as a styled button element
- "Swipe →" indicator on cover slide only, bottom area

## Output Contract

- Write a single `index.html` file wrapped in `<artifact type="html" title="Instagram Carousel">` tags
- ALL CSS must be in a `<style>` tag in `<head>` — no external stylesheets
- Google Fonts loaded via `<link>` in `<head>` (the only allowed external resource)
- No JavaScript required (static slides, no navigation needed)
- Slides render vertically stacked — screenshot tooling captures each `.slide-frame` individually

## Quality Checks Before Output

1. Exactly 7 `.slide-frame` elements
2. Every slide is 1080x1350px
3. Brand colors from DESIGN.md used — no hardcoded colors outside of `:root`
4. Display font from DESIGN.md on all headlines
5. Social handle on every slide
6. No emoji icons
7. No placeholder text or lorem ipsum
8. ALL CAPS on headlines with letter-spacing ≥ 0.06em
