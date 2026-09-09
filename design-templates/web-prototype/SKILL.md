---
name: web-prototype
description: |
  General-purpose desktop web prototype. Single self-contained HTML file built
  by copying the seed `assets/template.html` and pasting section layouts from
  `references/layouts.md`. Default for any landing / marketing / docs / SaaS
  page when no more specific skill matches.
triggers:
  - "prototype"
  - "mockup"
  - "landing"
  - "single page"
  - "marketing page"
  - "homepage"
od:
  mode: prototype
  platform: desktop
  scenario: design
  preview:
    type: html
    entry: index.html
  design_system:
    requires: true
    sections: [color, typography, layout, components]
---

# Web Prototype Skill

Produce a single, self-contained HTML prototype using the bundled seed and layout library — **not** by writing CSS from scratch. The seed already encodes good defaults (typography, spacing, accent budget). Your job is to compose it.

## Resource map

```
web-prototype/
├── SKILL.md                ← you're reading this
├── assets/
│   └── template.html       ← seed: tokens + class system + chrome (READ FIRST)
└── references/
    ├── layouts.md          ← 8 paste-ready section skeletons
    └── checklist.md        ← P0/P1/P2 self-review
```

## Workflow

### Step 0 — Pre-flight (do this once before writing anything)

1. **Read `assets/template.html` end-to-end** — at minimum through the `<style>` block. The class inventory at the top of `references/layouts.md` lists every class that must be defined there; if one is missing, add it to `<style>` rather than re-defining it inline on every section.
2. **Read `references/layouts.md`** so you know which section skeletons exist. Don't write a section type that isn't covered — pick the closest layout and adapt.
3. **Read the active DESIGN.md** (already injected into your system prompt). Map its colors to the six `:root` variables in the seed; don't introduce new tokens.

### Step 1 — Prepare `index.html` from the seed

Use `assets/template.html` as the seed for the canonical project file, normally `index.html`.

Replace the six `:root` variables with the active design system's tokens. Replace the page `<title>` and the topnav brand.

### Step 2 — Plan the section list

**Pick layouts before writing copy.** Default rhythms (from `layouts.md`):

| Page kind | Default rhythm |
|---|---|
| Landing | 1 hero → 3 features → 4 stats *or* 5 quote → custom split → 6 cta |
| Marketing / editorial | 1 hero-center → 7 log list → 6 cta |
| Pricing | 1 hero-center → 8 comparison table → 6 cta |
| Docs index | 1 hero-center → 7 log list (sections of docs) → 6 cta |

State the chosen list in one sentence to the user *before* writing — they can redirect cheaply now and not after 200 lines of HTML.

### Step 3 — Paste and fill

For each chosen layout, copy the `<section>` block from `layouts.md` into `<main id="content">` of the project HTML. Replace bracketed `[REPLACE]` strings with real, specific copy from the user's brief. **No filler** — if a slot is empty, the section is the wrong choice; pick a different layout. Treat every `.ph-img` block as layout scaffolding and replace it when the section requires imagery, following the real-first rule below before self-checking.

### Step 4 — Self-check

Run through `references/checklist.md` top to bottom. Every P0 item must pass before you move on. P1 items should pass; P2 are bonus.

### Step 5 — Write the project file

Write the completed HTML to the canonical project file, normally `index.html`. Then send one short ordinary assistant summary naming the file and describing what's there. Do not output the full HTML source in chat.

## Hard rules (the seed protects most of these — don't fight it)

- **Single accent, used at most twice per screen.** Eyebrow + primary CTA is the default budget.
- **Display font is serif** (Iowan Old Style / Charter / Georgia in the seed). Sans for body. Mono for numerics, captions, eyebrows.
- **Real imagery, never remote hotlinks.** `.ph-img` is temporary layout scaffolding, not the default final treatment. For a named real-world referent, search/fetch the correct real image, copy it into the project, and reference it relatively; never generate, draw, or invent a substitute. For illustrative or atmospheric subjects, prefer suitable fetched real photography and use image generation only as a fallback. If no compliant asset can be acquired, keep an intentional labeled `.ph-img` and disclose the limitation in the delivery summary.
- **Preserve real-image geometry.** Inspect each acquired image's intrinsic width and height, replace the entire `.ph-img` scaffold with an `<img class="content-img">`, and set matching `width` and `height` attributes. Never copy `.ph-img`, `.wide`, `.portrait`, or `.square` onto a real image. Content images must show the full frame; `object-fit: cover` is only for intentionally croppable decorative fills. The seed's `.content-img` rule bounds unusually tall or wide images to the viewport while keeping the other axis automatic.
- **Mobile reflow already works** via the seed's media query at 920px. Don't break it by adding fixed widths.
- **`data-od-id` on every `<section>`** so comment mode can target it.

## Output contract

Filesystem runs use project files as the source of truth:

```
index.html
```

OpenDesign derives the preview from the written project file. Do not also emit a source-code `<artifact>` block for the same generation turn.

One short summary after writing the file. Nothing after.
