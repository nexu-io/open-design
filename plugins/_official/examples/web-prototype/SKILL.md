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

### Step 1 — Prepare the artifact from the seed

Choose one kebab-case artifact slug before composing the page. Use `assets/template.html` as the seed for the final artifact HTML.

Do not write a project-root HTML draft with file-write before emitting the final `<artifact>`. The live-artifact output is the canonical HTML file for this generation turn; an extra `index.html`, `cast.html`, or brief-derived draft can be stranded beside it as an orphan.

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

For each chosen layout, copy the `<section>` block from `layouts.md` into `<main id="content">` of the artifact HTML. Replace bracketed `[REPLACE]` strings with real, specific copy from the user's brief. **No filler** — if a slot is empty, the section is the wrong choice; pick a different layout.

### Step 4 — Self-check

Run through `references/checklist.md` top to bottom. Every P0 item must pass before you move on. P1 items should pass; P2 are bonus.

### Step 5 — Emit the artifact

Wrap the completed HTML in `<artifact>` tags using the artifact slug as the `identifier`. One sentence before describing what's there. Stop after `</artifact>`.

## Hard rules (the seed protects most of these — don't fight it)

- **Single accent, used at most twice per screen.** Eyebrow + primary CTA is the default budget.
- **Display font is serif** (Iowan Old Style / Charter / Georgia in the seed). Sans for body. Mono for numerics, captions, eyebrows.
- **Image placeholders, not external URLs.** Use the `.ph-img` class — never link to a stock photo CDN.
- **Mobile reflow already works** via the seed's media query at 920px. Don't break it by adding fixed widths.
- **`data-od-id` on every `<section>`** so comment mode can target it.

## Output contract

```
<artifact identifier="kebab-case-slug" type="text/html" title="Human Title">
<!doctype html>
<html>...</html>
</artifact>
```

Open Design derives the canonical HTML artifact from this identifier. Do not also write another root HTML file for the same generation turn.

One sentence before the artifact. Nothing after.
