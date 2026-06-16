# Quality Checklist

This checklist comes from the real iteration process behind the "One-Person Company" talk deck. Every item is a lesson learned after stepping on a rake, ordered by importance.

Read it through once before generating a deck; after generating, self-check item by item.

---

## 🔴 P0 · Mistakes you must never make

### 0. The class-name check that must pass before generating (most important)

**Symptom**: you paste the layouts.md skeletons straight into a new HTML file and all the styling is gone: big headlines turn sans-serif, big-number stats shrink to body size, multi-section pipelines collapse into a blob, images pile up at the bottom of the browser.

**Root cause**: if `template.html`'s `<style>` does not define these classes, the browser falls back to default styles.

**What to do**:
- **Before generating a deck, you must first `Read` `assets/template.html`** and confirm that every class used in layouts.md is defined.
- Most commonly missing classes: `h-hero / h-xl / h-sub / h-md / lead / meta-row / stat-card / stat-label / stat-nb / stat-unit / stat-note / pipeline-section / pipeline-label / pipeline / step / step-nb / step-title / step-desc / grid-2-7-5 / grid-2-6-6 / grid-2-8-4 / grid-3-3 / frame / frame-img / img-cap / callout-src`
- If a class really is missing, **add it to template.html's `<style>`**; do not rewrite it inline on every page.
- After generating, open the browser. If you see "the headline is sans-serif" or "the pipeline steps are crammed onto one line," it is almost 100% this problem.

### 1. Do not use emoji as icons

**Symptom**: using emoji (🎯 💡 ✅) in a Chinese editorial-magazine style instantly ruins the tone.

**What to do**: use the Lucide icon library, referenced via CDN:

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
...
<i data-lucide="target" class="ico-md"></i>
...
<script>lucide.createIcons();</script>
```

Common icon names: `target / palette / search-check / compass / share-2 / crown / check-circle / x-circle / plus / arrow-right / grid-2x2 / network`

### 2. Images may only be cropped at the bottom; the sides and top must never be cut

**Symptom**: stretching an image with `aspect-ratio` makes the grid stack or crop key image information (like the title bar at the top of a screenshot) when the parent container is too small.

**What to do**: give the image container a **fixed height + overflow hidden**, and let the image use `object-fit:cover + object-position:top`:

```html
<figure class="frame-img" style="height:26vh">
  <img src="screenshot.png">
</figure>
```

In the CSS, `.frame-img img` already presets `object-position:top`, so only the bottom is cropped.

**Never write it this way** (it breaks the container in a grid):

```html
<!-- bad example -->
<figure class="frame-img" style="aspect-ratio: 16/9">...</figure>
```

**Exception**: a single hero visual (not inside a grid) may use `aspect-ratio + max-height`, because the parent container provides a fallback.

### 2b. Light pages with a dark WebGL background = washed-out gray (theme switching didn't take effect)

**Symptom**: every light page's background looks like it has a layer of gray over it; even hero light looks gray.

**Root cause**: the JS switches the opacity of the two canvases based on the slide's theme. If the whole deck opens on hero dark and nothing ever switches the bg to light, the body never gets the `light-bg` class and `canvas#bg-dark` stays on top.

**What to do**:
- The template's `go()` function now infers the theme from `classList` (`light` / `dark`), so **a slide must explicitly carry a `light` or `dark` class**. Don't forget it, and don't use any other custom theme name.
- Hero pages use `hero light` / `hero dark`; body pages use `light` / `dark`. Writing only `hero` without a theme color is bad.
- A deck must have at least one **non-hero light page** so the body has a chance to get `light-bg`.

### 2b-2. The whole deck is light, with no rhythm

**Symptom**: apart from the `hero dark` cover, every page defaults to `light`: visually flat, no breathing room, a sea of white.

**Root cause**: the layouts.md skeletons all default to `light`, so if you just paste a skeleton without adjusting the theme, everything comes out bright.

**What to do**:
- **Draw a "theme rhythm table" before generating**: write the chosen `hero dark` / `hero light` / `light` / `dark` for each page, align it, then write the code.
- **Hard rules**: 3+ consecutive pages on the same theme = not allowed; a deck of 8+ pages must have ≥1 `hero dark` + ≥1 `hero light`; you cannot have only `light` body pages: you must have a `dark` body page.
- **Choose the theme by layout** (see "Theme rhythm planning" at the top of layouts.md):
  - Lead image + text (Layout 4), big quote (Layout 8), image + text mix (Layout 10) → **alternate `light` / `dark`**
  - Big numbers, image grid, pipeline, comparison pages → `light` (screenshots / numbers / processes need a light background)
  - Cover, question pages → `hero dark`
  - Act dividers → alternate `hero dark` and `hero light`
- **Self-check after generating**: `grep 'class="slide' index.html` and visually confirm the rhythm alternates.

### 2c. chrome and kicker must not say the same thing

**Symptom**: the top-left `.chrome` says "Design First · 设计先行" while the same page's `.kicker` says "Phase 01 · 设计阶段": a synonymous translation that reeks of AI.

**What to do**:
- **chrome = magazine masthead / nav label**: it can stay the same across multiple pages (e.g. "Act II · Workflow", "Data · Result", "lukew.com · 2026.04").
- **kicker = the one-of-a-kind lead-in for this page**: short, with a hook, the "small prefix" above the headline (e.g. "BUT", "一个人,做了什么。", "The Question").
- One describes the section, the other describes this single page: never translate one into the other.

### 3. Headline size must not exceed the screen width / character count

**Symptom**: a Chinese headline set too large (say 13vw) ends up fitting only 1 character per line, forcing very ugly line breaks.

**What to do**:
- `h-hero` (largest): 10vw, **and the title must be ≤ 5 characters**
- `h-xl` (next largest): 6vw–7vw
- For long titles, break lines manually with `<br>`; do not rely on automatic wrapping
- Add `white-space:nowrap` when needed

**Example**: `我不是程序员。` (6 characters) uses `h-xl` at 7.2vw + nowrap, laid out on one line.

### 4. Type division of labor: serif for headlines, sans-serif for body

**What to do**:
- Big headlines, key quotes, large numerals → **serif** (Noto Serif SC + Playfair Display + Source Serif)
- Body, descriptions, pipeline step names → **sans-serif** (Noto Sans SC + Inter)
- Metadata, code, labels → **monospace** (IBM Plex Mono + JetBrains Mono)

All fonts are loaded via Google Fonts CDN, already preset in the template.

### 4b. Do not pin images to the bottom with `align-self:end`

**Symptom**: in a lead-image-and-text layout, to align the bottom of the right-column image with the left-column callout, you add `align-self:end` to the `<figure>`. The result:
- If the parent is not a grid (e.g. the class isn't defined), `align-self` has no effect at all and the image falls to the very bottom of the document flow, hidden by the browser's bottom bar.
- Even in a grid, the image sits at the bottom of the cell and on low-resolution screens is still covered by `.foot` and the `#nav` dots.

**What to do**:
- Image + text mixes **must use `.frame.grid-2-7-5`** (or `.grid-2-6-6` / `.grid-2-8-4`).
- The right-column `<figure class="frame-img">` uses a **standard ratio 16/10 or 4/3 + max-height:56vh** and naturally sits at the top.
- To make the left-column callout look "bottom-aligned," give the **left column** flex column + `justify-content:space-between`; do not touch the right column.

### 4c. Do not use the original image's odd ratio

**Symptom**: a ratio copied from the source image like `aspect-ratio: 2592/1798` stretches out odd whitespace or overflows on different screens.

**What to do**: whatever the source ratio, the placeholder uses a fixed standard ratio **16/10 / 4/3 / 3/2 / 1/1 / 16/9**. The image automatically gets `object-fit:cover + object-position:top`; the top is not cropped, and trimming a bit from the bottom is harmless.

### 5. Do not add heavy borders / shadows to images

**Symptom**: adding a strong shadow or black frame for a "premium" feel instantly turns it into a corporate slide deck.

**What to do**: at most a 1–4px micro radius + **a very faint base noise** (already in the template). Do not add `box-shadow`, do not add `border` (unless a 1px very faint gray).

---

## 🟡 P1 · Layout rhythm

### 6. Hero pages and non-hero pages should alternate

**Recommended rhythm** (25–30 pages):
```
Hero Cover → Act Divider (hero) → 3-4 pages non-hero → Act Divider (hero)
→ 4-5 pages non-hero → Hero Question → ... → Hero Close
```

2+ consecutive hero pages fatigues the viewer; 4+ consecutive non-hero pages kills the rhythm.

### 7. Big-number pages and dense pages should alternate

Big-number pages (big numbers / hero question) and dense pages (pipeline / image grid) should alternate so the audience's eyes don't tire.

### 8. English/Chinese usage for the same concept must be consistent

**Symptom**: sometimes you write "Skills", sometimes "技能", sometimes "薄承载厚技能": inconsistent throughout.

**What to do**:
- Prefer the **English word** for terms (Skills / Harness / Pipeline / Workflow); these are familiar in-circle terms.
- **Don't force a translation**: a forced translation reads stiff.
- One spelling for the same word across the whole deck.

### 9. The page number in the bottom chrome must be consistent

Use the format `XX / total pages` (e.g. `05 / 27`). **Do not add a dynamic page number in the top-right corner** (it would duplicate `.chrome`).

---

## 🟢 P2 · Visual polish

### 10. The WebGL background's overlay opacity

**dark hero**: overlay 12–15% (WebGL clearly shows through)
**light hero**: overlay 16–20% (WebGL faintly visible, not competing with the text)
**ordinary light/dark pages**: overlay 92–95% (almost opaque)

If a page has very little text (hero question), the overlay can be thinner; if the body is dense, you must thicken the overlay to keep it readable.

### 11. A light hero's shader must not have a strong center point

**Symptom**: Spiral Vortex and radial ripples are too conspicuous under a light theme, like a Windows 98 screensaver.

**What to do**: a light hero uses FBM domain-warp-driven flow with no center; keep the base color silver/paper (close to #F0F0F0 / #FBF8F3) and keep the rainbow tint subtle (under 0.05).

### 12. A dark hero can take more visual impact

A dark hero can use shaders with a center structure like Holographic Dispersion (titanium dispersion), because a black base can hold more visual information.

### 13. Alignment for lead image + text

- The left column's text group uses `justify-content:space-between`: title at the top, callout at the bottom.
- The right column's image uses `align-self:end`: aligned with the bottom element of the left column.
- The grid as a whole uses `align-items:start` (not `center` / `end`).

### 14. The slight radius on images

All `.frame-img` and `.frame-img img` get `border-radius:4px` to look "soft" but not mushy. **Do not exceed 8px**, or it looks like a consumer-app UI.

---

## 🔵 P3 · Operational details

### 15. Use relative paths for images

Put images in the `images/` folder and reference them in HTML with relative paths `images/xxx.png`; do not use absolute paths.

### 16. The page number is hard-coded in `.chrome`

The JS dynamically computes the total page count and expands the bottom nav dots, but the `XX / N` in `.chrome` is hard-coded. Update N manually when adding or removing pages.

### 17. Keep the navigation controls

The template supports by default: ← → / scroll wheel / touch swipe / bottom dots / Home·End. Do not delete the navigation logic in the JS.

### 18. Don't hard-set `height:100vh`; use `min-height:80vh`

`100vh` makes content fit exactly to the screen, but the browser toolbar and tab bar eat part of the height, causing overflow. `min-height:80vh + align-content:center` is more reliable.

---

## 🧪 Final self-check list

After generating the deck, go through this checklist item by item (tick each):

```
Pre-flight (before generating)
  □ Read template.html's <style>; confirmed all needed classes exist
  □ Decided which Layout (1-10) each page uses
  □ Drew the "theme rhythm table": each page has a clear hero dark / hero light / light / dark
  □ The rhythm table meets the hard rules: no 3 consecutive same-theme pages / ≥1 hero dark + ≥1 hero light (8+ pages) / at least 1 dark body page
  □ `<title>` updated to the actual deck title (grep "[必填]" should return nothing)

Content
  □ Each act has a reasonable page proportion (not top-heavy)
  □ No emoji used as icons
  □ Terms like Skills / Harness used consistently
  □ Each page's kicker + title + body three-level information is clear

Layout
  □ No headline shows a 1-character-per-line break
  □ Image grids use height:Nvh, not aspect-ratio
  □ Images cropped only at the bottom; top and sides intact
  □ Serif/sans-serif division matches the template
  □ Clear separation between pipeline groups

Visual
  □ Hero pages and non-hero pages alternate
  □ WebGL background visible on hero pages
  □ Images have a slight radius
  □ No heavy shadows or borders

Interaction
  □ ← → paging works
  □ The number of bottom dots matches the total page count
  □ The page number in chrome matches the actual page number
  □ ESC triggers the index view (if kept)
```

Only when every box is ticked is the deck up to standard.
