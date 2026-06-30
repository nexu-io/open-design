# Style System

This skill extracts Guizang PPT visual principles for static social images. It does not depend on the original PPT templates.

## Shared Rules

- Content shape decides layout. Do not pick a pretty layout first and invent content to fit it.
- Use strong hierarchy: title, hook, evidence, caption, metadata.
- Use real images as evidence or atmosphere, not decoration.
- Avoid visible clutter: no random SVG circles, oval drops, blobs, bokeh, ornamental stickers, fake diagram decorations, or decorative gradients.
- Keep all pages in a package visually related through grid, typography, palette, and recurring metadata.
- Every page should have a clear focal point.

## Style ↔ content type are decoupled

The two modes below are **visual stances, not content categories**. Any topic can be rendered in either mode — what changes is the page's feel and which structural devices are available (ledger / marginalia / pull quote vs matrix / KPI tower / h-bar). Pick by editorial intent ("feature story" vs "release note" / "system explainer"), not by topic lookup. The lists below are *good fits*, not exhaustive.

## Mode A: Editorial Magazine x E-ink

Good fits: outdoor, lifestyle, reflective, humanistic, cultural, narrative — but also workplace essays, AI think-pieces, product retrospectives, anything that wants a slow magazine-feature pace.

Visual anchors:

- Serif or Songti-like display title plus quiet sans-serif body text.
- Warm paper, deep ink, refined greys, restrained color.
- WebGL or procedural ink/contour atmosphere, especially on covers, dividers, pull quotes, and sparse pages.
- Documentary photography, field-note captions, issue labels, page numbers.
- Large but purposeful whitespace.
- Fine rules, magazine columns, image captions, pull quotes, and editorial contrast.
- Subtle paper texture is allowed; it must not lower text readability.

Use one of the 6 magazine palettes in `theme-presets.md`. Do not improvise arbitrary warm paper colors. Five palettes are light (paper-and-ink); one — **Midnight Ink** — is the only sanctioned dark variant, reserved for content where the source imagery is already dark (game art, night photography, cinematic covers). Do not invent a second dark palette.

**Typography stance — "the larger, the lighter."** This rule is non-negotiable for Editorial. Display titles run at **weight 500** with **wide tracking** (`+.03em` to `+.04em`). Small text (kicker, meta, label) is the *only* place where weight 500 is paired with mono uppercase and wide letter-spacing (`+.20em` to `+.22em`). Body uses **serif-zh**, not sans. The anti-pattern — 700 to 900 weight display, sans body, negative tracking — collapses Editorial into a generic "infographic banner" look. If a page feels heavy or shouty, the title is too bold or the body switched to sans. See `local-tests/demo-showcase/editorial.html` for source-of-truth.

Layout patterns:

- Cover: big title top or left, large photo/image evidence, bottom checklist or issue-strip.
- Feature page: one large image plus a narrow column of compressed explanation.
- Checklist page: editorial header, numbered items, one supporting image crop or icon-free diagram.
- Quote/takeaway page: large pull quote with small source/context row.
- Comparison page: two-column tension, simple labels, one visual anchor.

Background rule:

- A flat paper color is not enough for this mode. Use a layered background from `background-systems.md`: paper base, subtle grain, ink wash or contour field, and optional WebGL canvas. The background should create atmosphere while keeping text readable.

## Mode B: Swiss International

Good fits: AI tools, product updates, engineering workflows, software explainers, release notes, comparison posts — but also travel ledgers, expense logs, fitness data, recipe step counts, anything that wants a engineered/quantified pace. Topic is not the gate; visual stance is.

Visual anchors:

- Inter, Helvetica Neue, Noto Sans SC feeling.
- Very light display weights for huge type; stronger weights for small labels.
- Strict 12/16-column grid, left alignment, asymmetric whitespace.
- White/off-white, black, refined greys, exactly one high-saturation accent.
- Straight modules, hairline rules, no rounded cards, no shadows, no glassmorphism.

Use one of the 4 Swiss accent palettes in `theme-presets.md`. One package gets exactly one accent.

Rules:

- Use one accent only. Do not mix blue, yellow, green, and orange.
- Avoid gradients. Use pure color blocks, hairline rules, and grid modules.
- Headings usually sit on the top-left content axis, not center, except special square covers or explicit poster compositions.
- Huge text should be lighter; small text should be heavier.
- Images are proof blocks. Use straight edges and stable aspect-ratio containers.

Typography guidance:

| Role | Size Guidance | Weight |
| --- | --- | --- |
| Main cover title | 84-128px on 1080x1440 | 200-400 |
| Page title | 52-82px | 300-500 |
| Body copy | 28-42px | 400-500 |
| Captions/meta | 20-28px | 500-650 |

Chinese titles are visually dense. Shorten first, then reduce size. Do not solve overflow by shrinking body text below readability.

## Image Rules

- Photos: crop with intent. Keep faces, hands, products, and main objects in safe areas.
- Product screenshots: preserve text; use `object-fit:contain` when detail matters.
- Hardware photos: make the object a first-viewport signal. The photo should be large enough to inspect.
- Generated images: generate only the image content, not the final poster with text.
- Do not make generated images include page chrome, titles, borders, captions, or fake UI unless required by the concept.

## Bad Smells

Revise if you see:

- A page that looks like a generic template with the article pasted in.
- Large empty lower area across multiple pages.
- Decorative shapes that do not explain anything.
- Screenshots too small to read.
- Inconsistent margins between pages.
- Blue text on black or dark photo with poor contrast.
- A 1:1 cover that is a cramped crop of a 21:9 cover.

## Style Identity Test

A poster compiles cleanly long before its style identity is right. Run this test on every page before delivering.

### Swiss identity test

A poster is Swiss only if **all four** hold:

1. Every large display title (>=72px on 1080x1440) uses a typed class from `components.md` (`.h-hero` / `.h-statement` / `.h-xl` / `.num-mega`). Its computed `font-weight` is `<=300`.
2. No serif family is loaded in the document head. No element uses `font-family: serif` or `Noto Serif SC` / `Playfair Display`.
3. Section separators are hairline rules (1-2px) or grid gutters, not card borders + drop shadows.
4. Exactly one accent palette is in use. No mixed accents across pages.

If any one of these fails, the poster is not Swiss — it is generic editorial or "Swiss-flavored card". Fix it or relabel the package.

### Editorial identity test

A poster is Editorial only if **all three** hold:

1. The background has at least one atmosphere layer beyond a flat fill: paper grain, ink wash, frozen WebGL canvas, or contour field (see `background-systems.md`). A page-wide solid `#f3f0e8` with nothing on top is not Editorial.
2. The display title uses a serif-zh / serif-en family (`Noto Serif SC` / `Songti SC` / `Playfair Display`).
3. The poster contains at least one of: a large photo well, a serif pull-quote with em-italic English, a left/right marginalia column, or a ledger with real magazine row hierarchy.

If a poster has a serif title, mono labels everywhere, structured pill grids, and a flat paper background — it is **Swiss-with-a-serif**, not Editorial. Either add atmosphere + magazine structure, or switch the package to Swiss honestly.

## Anti-Patterns From Real Demos

These all rendered without errors and looked plausible in isolation, but failed once compared against a clean reference.

### Anti-pattern A: thick big title in Swiss

```html
<!-- WRONG: inline 700-800 weight on a huge title -->
<h1 style="font-size: 92px; font-weight: 800">如果只能留 5 个,我留这些。</h1>

<!-- RIGHT: typed class, automatic 200-300 weight -->
<h1 class="h-statement">如果只能<br>留 <em>5 个</em>,<br>我留这些。</h1>
```

"The larger, the lighter" is a hard rule. A 90px h1 at weight 700+ instantly downgrades the design from Swiss International to generic landing-page editorial. Always reach for `.h-hero` / `.h-statement` / `.h-xl` / `.num-mega`. Do not bypass them with inline `font-size` + `font-weight`.

### Anti-pattern B: Editorial without atmosphere

A page with all of the following looks Swiss-in-disguise even if you intended Editorial:

- Single flat paper color, no grain, no ink wash, no WebGL,
- Mono labels (`IBM Plex Mono uppercase`) on every kicker, foot, pill, and row label,
- A serif headline floating alone with no large image, pull quote, or marginalia column.

Fix by **one** of:

- Add the paper grain + ink-wash background per `background-systems.md`.
- Replace mono labels with serif / italic micro copy.
- Introduce a large photo or serif pull quote with column structure.
- Switch the package to Swiss honestly — the content might want Swiss.

### Anti-pattern C: footer overlap (closing essay collides with `.foot`)

When `.foot` or `.issue-strip` is positioned with `position: absolute; bottom: ...`, any content above that grows past its expected height crashes through the footer. Use one of these safe patterns instead:

```css
/* Pattern A — flex column. Foot is the last child, pushed by margin-top: auto. */
.poster .pad { display: flex; flex-direction: column; height: 100%; }
.poster .foot { margin-top: auto; }

/* Pattern B — grid with fixed footer row. */
.poster .pad { display: grid; grid-template-rows: auto 1fr auto; height: 100%; }
```

Both seed templates already use Pattern A. Preserve it. If a recipe truly needs an absolutely-positioned foot, reserve `padding-bottom: <foot-height + 24px>` on the content container.

### Anti-pattern D: full-bleed photo with title crossing the subject

The poster looks dramatic at 100% zoom and unreadable at thumbnail size. Two common subfailures:

- A hero photo covers the entire poster, the title sits directly on whatever pixel happens to be behind it. The image's own brightness varies across the canvas, so the title is legible in some bands and invisible in others.
- A mask layer is present but only on one band (bottom), while the subject's face was pushed to the top by `object-position: center top`. The display title lands across the face.

Both pass HTML linting; both fail the thumbnail readability test.

Fix by following `image-overlay.md`:

1. **Qualify the photo first.** It needs a low-detail quiet zone and restrained light. If it fails, switch to a framed-photo recipe instead of forcing text on top.
2. **Map the subject before placing the title.** Read the image, describe in plain language where the face/focal feature sits, record the subject map as an HTML comment next to the hero block. Place text only in documented safe zones.
3. **Match `object-position` to subject location** — see the table in `image-overlay.md`. Never leave it at default for face / hero shots.
4. **Thumbnail test** — render the PNG, downscale to 360 px wide, and look at the title. If it fights the photo, add a localized, image-toned tint only around the title area; if the photo looks dead, the tint is too heavy or the photo is wrong.

This anti-pattern survives almost every other check because the HTML is valid, the image loads, and the title renders. The only way to catch it is to look at the rendered output at the size readers will actually see it.
