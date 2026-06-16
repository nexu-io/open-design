---
name: magazine-web-ppt
description: Generates an "editorial magazine × electronic ink" style horizontal-swipe web deck (a single HTML file), with a WebGL fluid background, serif headlines + sans-serif body, act dividers, big-number data pages, image grids, and more templates. Use when the user wants to make a talk / share / launch-style web deck, or mentions "magazine-style PPT", "horizontal swipe deck", "editorial magazine", or "e-ink presentation".
triggers:
  - "ppt"
  - "deck"
  - "slides"
  - "presentation"
  - "magazine"
  - "magazine style"
  - "magazine-style PPT"
  - "horizontal swipe"
  - "horizontal swipe deck"
  - "editorial magazine"
  - "e-ink presentation"
  - "web deck"
  - "launch event"
  - "talk deck"
od:
  mode: deck
  scenario: marketing
  default_for: deck
  upstream: "https://github.com/op7418/guizang-ppt-skill"
  preview:
    type: html
    entry: index.html
  design_system:
    requires: false
  example_prompt: "Make me a magazine-style deck about 'One-person company · the organization folded by AI', a 25-minute talk for an audience of designers and founders. First recommend one direction (Monocle / WIRED / Kinfolk / Domus / Lab) for me to choose from."
---

# Magazine Web Ppt

## What this skill does

Generates a **single-file HTML** horizontal-swipe deck with a visual tone of:

- A **electronic magazine + electronic ink** hybrid style
- A **WebGL fluid / contour / dispersion background** (visible on hero pages)
- **Serif headlines (Noto Serif SC + Playfair Display) + sans-serif body (Noto Sans SC + Inter) + monospace metadata (IBM Plex Mono)**
- **Lucide line icons** (no emoji)
- **Horizontal left/right paging** (keyboard ← →, scroll wheel, touch swipe, bottom dots, ESC index)
- **Smooth theme interpolation**: when you flip to a hero page, the colors and shader transition softly

This skill's aesthetic is not "corporate PPT," nor "consumer-internet UI": it looks like *Monocle* magazine after code was stitched onto it.

## When to use

**Suitable scenarios**:
- Offline talks / internal industry talks / private salons
- AI new-product launches / demo day
- Talks with a strong personal style
- A web version of slides that you "make once, with no paging tool needed"

**Unsuitable scenarios**:
- Long stretches of tabular data, stacked charts (use a regular PPT)
- Training courseware (information density too low)
- Multi-person collaborative editing (this is static HTML)

## Workflow

### Step 0 · Pick a direction (Direction · the mandatory first step)

**Before asking the 6 clarifying questions, first let the user pick one of the 5 magazine directions**. Each direction packages up its "theme color / recommended layouts / chrome style / recommended slide count," and picking a direction answers half the clarifying questions.

Open `references/styles.md`, **copy the whole section over** to show the user the 1-line summary of the 5 directions, then let them choose:

```
1. Monocle Editorial · International magazine style ✦ default
2. WIRED Tech · Data + engineering
3. Kinfolk Slow · Slow living / humanist
4. Domus Architectural · Architecture / sense of space
5. Lab / Reference · Academic + craft manual
```

If the user says "I don't know, you recommend": **default to Monocle Editorial**, because it has the lowest failure probability. If the user mentions "AI / benchmark / technical launch": recommend WIRED; "reading / private / social circle": recommend Kinfolk; "design / architecture / portfolio": recommend Domus; "research / academic / methodology": recommend Lab.

After picking a direction, create or update `项目记录.md` (Project Record) in the project folder, with the first line clearly stating direction + theme color + audience + duration (see the template at the end of `styles.md`). **Do not change direction at any point**: switching midway = everything before is wasted.

### Step 1 · Clarify intent (**do before starting**)

**If the user has already given a complete outline + images**, you can skip straight to Step 2.

**If the user only gave a topic or a vague idea**, align on these 6 questions one by one before starting. Don't begin writing slides based on guesses: once the structure is wrong, later rework is very costly:

#### 6-question clarifying checklist

> Question 5 is already answered when you pick a direction in Step 0 (direction → theme color). In the 5 questions below, just leave question 5 blank.

| # | Question | Why ask it |
|---|------|-----------|
| 1 | **Who is the audience? Sharing scenario?** (internal industry / commercial launch / demo day / private salon) | determines the language style and depth |
| 2 | **Talk duration?** | 15 min ≈ 10 pages, 30 min ≈ 20 pages, 45 min ≈ 25-30 pages (see each direction's recommended range in `styles.md`) |
| 3 | **Any source material?** (documents / data / old PPT / article links) | with material, build on it; without, help them build |
| 4 | **Any images? Where are they?** | see the "Image convention" below |
| 5 | ~~**Which theme color do you want?**~~ | ✓ already decided by the direction in Step 0 |
| 6 | **Any hard constraints?** (must include XX data / must not show YY) | avoids rework |

#### Outline assistance (if the user has no outline)

Use the "narrative arc" template to build the skeleton, then fill in content:

```
Hook       → 1 page   : throw out a contrast / question / hard number that makes people stop
Context    → 1-2 pages : explain the background / who you are / why this topic
Core       → 3-5 pages : the core content, interleaving Layouts 4/5/6/9/10
Shift      → 1 page    : break the expectation / propose a new view
Takeaway   → 1-2 pages : a punchline / a suspenseful question / a call to action
```

Narrative arc + page-count plan + theme rhythm table (see `layouts.md`); **align all three tables** before moving to Step 2.

It's best to save the outline as `项目记录.md` (Project Record) or `大纲-v1.md` (Outline v1) for later iteration.

#### Image convention (tell the user)

Make these clear to the user before starting:

- **Folder location**: under `项目/XXX/ppt/images/` (sibling to `index.html`)
- **Naming convention**: `{page number}-{semantic}.{ext}`, e.g. `01-cover.jpg` / `03-figma.jpg` / `05-dashboard.png`
  - Pad the page number with zeros for easy sorting
  - Use English for the semantic part, short, specific, matching the content
- **Spec recommendations**:
  - Each image ≥ 1600px wide (avoid blur on large screens)
  - JPG for photos/screenshots, PNG for transparent UI/charts
  - Keep total size under 10MB (affects paging smoothness)
- **How to replace**: **same-name overwrite** is the most stable (no need to change the path in the HTML); if the filename changes, remember to globally search `images/oldname` and change it to the new name
- **What if there are no images**: align with the user; you can generate the structure with placeholder color blocks first and fill in the images later, but tell them that image-text mix pages like layouts 4/5/10 can't have their visuals verified without images

### Step 2 · Copy the template

Copy `assets/template.html` to the target location (usually `项目/XXX/ppt/index.html`), and create an `images/` folder as a sibling, ready to receive images.

```bash
mkdir -p "项目/XXX/ppt/images"
cp "<SKILL_ROOT>/assets/template.html" "项目/XXX/ppt/index.html"
```

`template.html` is a **complete, runnable** file: CSS, WebGL shader, paging JS, font/icon CDNs are all preset; only inside `<main id="deck">` are there 3 example slides (cover, act divider, blank filler page).

#### 2.1 · Placeholders you must change (**easy to miss**)

Right after copying, change the placeholders below, or the browser tab will show awkward text like "[必填] replace with the PPT title":

| Location | Original | Change to |
|------|------|--------|
| `<title>` | `[必填] 替换为 PPT 标题 · Deck Title` | the actual deck title (e.g. `一种新的工作方式 · Luke Wroblewski`) |

The first thing to do every time you finish copying template.html: grep for "[必填]" to confirm everything is replaced.

#### 2.2 · Choose the theme color (5 presets · no customization allowed)

This skill **only allows picking one of 5 carefully tuned presets**; it does not accept user-defined hex values: a wrong color pairing makes the visuals ugly in an instant, and protecting the aesthetic matters more than offering freedom.

| # | Theme | Best for |
|---|------|------|
| 1 | 🖋 Ink Classic | general / commercial launch / the default when you don't know what to pick |
| 2 | 🌊 Indigo Porcelain | tech / research / data / technical keynotes |
| 3 | 🌿 Forest Ink | nature / sustainability / culture / non-fiction |
| 4 | 🍂 Kraft Paper | nostalgic / humanist / literary / indie magazines |
| 5 | 🌙 Dune | art / design / creative / gallery |

**How to do it**:
1. Recommend one based on the content theme, or just ask the user which one to pick
2. Open `references/themes.md` and find the `:root` block for the corresponding theme
3. **Replace as a whole** the lines marked with the "theme color" comment in the opening `:root{` block of `assets/template.html` (the copied version): `--ink` / `--ink-rgb` / `--paper` / `--paper-rgb` / `--paper-tint` / `--ink-tint`
4. All other CSS flows through `var(--...)`, no other changes needed

**Hard rules**:
- A deck uses only one theme, don't change colors midway
- Don't accept an arbitrary hex value from the user: gently decline and show the 5 presets to pick from
- Don't mix and match (e.g. take ink from Ink Classic and paper from Dune): it clashes completely

### Step 3 · Fill in content

#### 3.0 · Pre-check: class names must be defined in template.html (**most important**)

**This is the source of all generation problems**. The layouts.md skeletons use many class names (`h-hero` / `h-xl` / `stat-card` / `pipeline` / `grid-2-7-5`, etc.); if `assets/template.html`'s `<style>` has no corresponding definition, the browser falls back to default styles: the big title turns sans-serif, the data cards squeeze into a clump, the pipeline mushes into one line, the images pile up at the bottom of the page.

**Before writing any slide code:**

1. **First Read `assets/template.html`** (at least through the end of the `<style>` block)
2. **Against layouts.md's Pre-flight list**, confirm that every class you're going to use exists in the `<style>`
3. If a class is missing: **add it to template.html's `<style>`**, don't rewrite it inline on every slide
4. **template.html is the single source of class names**: don't invent new class names; if you need a custom one, use `style="..."` inline

Classes commonly missed (must be confirmed to exist in advance):
`h-hero` / `h-xl` / `h-sub` / `h-md` / `lead` / `kicker` / `meta-row` / `stat-card` / `stat-label` / `stat-nb` / `stat-unit` / `stat-note` / `pipeline-section` / `pipeline-label` / `pipeline` / `step` / `step-nb` / `step-title` / `step-desc` / `grid-2-7-5` / `grid-2-6-6` / `grid-2-8-4` / `grid-3-3` / `grid-6` / `grid-3` / `grid-4` / `frame` / `frame-img` / `img-cap` / `callout` / `callout-src` / `chrome` / `foot`

#### 3.0.5 · Plan the theme rhythm (**equally important as the class pre-check**)

**Before picking layouts**, you must first list the theme class for each page (`hero dark` / `hero light` / `light` / `dark`) and write it to a document or draft to align. For detailed rules, see the "Theme rhythm planning" section at the top of `references/layouts.md`.

**Mandatory rules**:

- Every page section must carry one of `light` / `dark` / `hero light` / `hero dark`; don't write just `hero`
- 3+ consecutive pages on the same theme = visual fatigue, not allowed
- 8+ pages must have ≥1 `hero dark` + ≥1 `hero light`
- The whole deck cannot have only `light` body pages; it must have a `dark` body page to create breathing room
- Insert 1 hero page (cover/divider/question/big quote) every 3-4 pages

**Self-check after generating**: `grep 'class="slide' index.html` lists all themes; manually confirm the rhythm is reasonable before delivering.

#### 3.1 · Pick a layout

**Don't write slides from scratch**. Open `references/layouts.md`; it has 10 ready-made layout skeletons, each a complete, paste-ready `<section>` code block:

| Layout | Use |
|---|---|
| 1. Cover | page 1 |
| 2. Act divider | each act's opening |
| 3. Big numbers | throw out hard data |
| 4. Lead image + text (Quote + Image) | identity contrast / story |
| 5. Image grid | multi-image comparison / screenshot evidence |
| 6. Two-column pipeline (Pipeline) | workflow process |
| 7. Suspenseful close / question page | act close / wrap-up |
| 8. Big quote page (Big Quote) | serif punchline / takeaway |
| 9. Side-by-side comparison (Before / After) | old model vs new model |
| 10. Image + text mix (Lead Image + Side Text) | information-dense image-text pages |

Pick the corresponding layout, paste it in, change the copy and image paths. **Be sure to complete the 3.0 pre-check first**.

#### 3.2 · Image ratio rules

Always use a **standard ratio**, never the source image's odd ratio (like `2592/1798`):

| Scenario | Recommended ratio |
|------|---------|
| Lead image + text, main image | 16:10 or 4:3 + `max-height:56vh` |
| Image grid (multi-image comparison) | **fixed `height:26vh`**, not aspect-ratio |
| Small image left + text right | 1:1 or 3:2 |
| Full-screen hero visual | 16:9 + `max-height:64vh` |
| Image + text mix, small inset | 3:2 or 3:4 |

**Never use `align-self:end` on an image**: it slides to the bottom of the cell, hidden by the browser toolbar. Use a grid container + `align-items:start` (already preset in the template) so the image sticks to the top; if you want the left column to stick to the bottom, use flex column + `justify-content:space-between`.

Component details (fonts, colors, grids, icons, callout, stat-card, etc.) are in `references/components.md`.

### Step 4 · Self-check against the checklist

After generating, always open `references/checklist.md` and check item by item. It summarizes **every pitfall stepped on during real iteration**; the P0-level issues (emoji, images breaking out, title wrapping, type division of labor) must all pass.

A few items to watch especially:

1. **Big titles must be serif**: if it shows as sans-serif, 99% of the time the Step 3.0 pre-check wasn't done and the `h-hero` class is missing from template.html
2. **In image grids use only `height:Nvh`, not `aspect-ratio`** (it breaks out)
3. **Images must not pile up at the bottom of the page**: don't use `align-self:end`, use grid + `align-items:start` (see Step 3.2)
4. **Images may only use standard ratios** (16:10 / 4:3 / 3:2 / 1:1 / 16:9), don't copy the source image's odd ratio
5. **Chinese big titles ≤ 5 characters and `nowrap`** (avoid 1 character per line)
6. **Use Lucide, not emoji**
7. **Serif for titles, sans-serif for body, mono for metadata**

### Step 5 · Local preview

Just open `index.html` directly in the browser. On macOS:

```bash
open "项目/XXX/ppt/index.html"
```

No local server needed. Images use the relative path `images/xxx.png`.

### Step 6 · Iterate

Modify based on user feedback: the template's CSS is highly parameterized, and 90% of adjustments are changing inline styles (font size `font-size:Xvw` / height `height:Yvh` / spacing `gap:Zvh`).

---

## Resource file tour

```
magazine-web-ppt/
├── SKILL.md              ← you are reading this
├── assets/
│   ├── template.html     ← the complete runnable template (seed file)
│   └── example-slides.html ← a 9-page sample deck (for the Examples preview)
└── references/
    ├── styles.md         ← the 5 magazine directions (Monocle / WIRED / Kinfolk / Domus / Lab)
    ├── components.md     ← component handbook (fonts, color, grid, icons, callout, stat, pipeline...)
    ├── layouts.md        ← 10 page layout skeletons (paste-ready)
    ├── themes.md         ← 5 theme color presets (pick only, no customization)
    └── checklist.md      ← quality checklist (P0/P1/P2/P3 tiers)
```

**Recommended loading order**:
1. First read through `SKILL.md` (this file) to understand the whole
2. **When picking a direction in Step 0, read `styles.md`**: each of the 5 directions packages up theme color + recommended layouts + chrome style
3. After clarifying intent in Step 1, if the direction needs confirmation, read `themes.md` for palette details
4. **Before starting, Read the `<style>` block of `assets/template.html`**: this is the single source of class names; missing classes crash the whole page's styling
5. Read `layouts.md` to pick a layout (the top has the Pre-flight class-name list and theme rhythm planning)
6. When tuning details, read `components.md` to look up components
7. After generating, read `checklist.md` to self-check (the top P0-0 rule enforces the pre-check)

## Core design principles (philosophy)

> These principles are distilled from 5 rounds of iteration on the "one-person company" talk deck. Violating any one of them makes the visual feel collapse.

1. **Restraint over flash**: the WebGL background only shows through on hero pages, barely visible on ordinary pages
2. **Structure over decoration**: no shadows, no floating cards, no padding boxes; all information relies on **large type + typeface contrast + grid whitespace**
3. **Content hierarchy is defined jointly by type size and typeface**: largest serif = main title, medium serif = subtitle, large sans = lead, small sans = body, mono = metadata
4. **Images are first-class citizens**: images are cropped only at the bottom, keeping the top and sides intact; grids use a fixed `height:Nvh`, not `aspect-ratio` stretching
5. **Rhythm relies on hero pages**: hero and non-hero alternate, so the eyes don't tire
6. **Consistent terminology**: Skills is just Skills, don't mix Chinese-English translation

## Reference works

This skill's visual tone references:

- Guizang's "One-Person Company: Organizations Folded by AI" talk (2026-04-22, 27 pages)
- The layout of *Monocle* magazine
- The demo from YC president Garry Tan's blog post "Thin Harness, Fat Skills"

You can treat these as style anchors.
