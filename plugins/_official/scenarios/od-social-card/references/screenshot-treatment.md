# Screenshot Treatment

When the user supplies an app / web / code / dashboard screenshot, **do not** drop it raw into a `.frame-img`. The aspect ratio mismatch crops UI and the harsh edge looks SaaS-y. Use `.frame-shot` instead — a sibling class added to both seed templates.

## When to reach for it

- App / Web UI capture — anything with a status bar, tab bar, toolbar, or window chrome.
- Code / terminal screenshots.
- Dashboard / chart screenshots that need to keep every label readable.
- IDE captures where text density matters more than composition.

For **photographic** content (people, scenery, products) — keep using `.frame-img`. The treatments below assume a pixel-perfect UI source where contain-fit is non-negotiable.

## Subject Prep

Before framing, decide what the actual screenshot subject is. If the source capture contains a floating modal/card over an unrelated page, desktop chrome, cropped side text, cursor trails, notification fragments, or leftover background UI, crop to the foreground window/card first and then place that cleaned subject into the stage. Do not beautify the entire raw capture when it carries accidental text or partial UI behind the subject.

Screenshot beautification must not introduce perspective, skew, rotation, or 3D tilt unless the user explicitly asks for a mockup scene. A CleanShot-style treatment is orthographic: straight subject, equal scaling, quiet background, and clear safe padding.

## Anatomy

```
.frame-shot.r-{ratio}.corners-{sq|sm|md}.shadow-{none|soft|ed}.bg-{paper|grid|dot|grey-1|ink}.inset-{none|sub|bal}
  └─ <img src="…">         (object-fit: contain by default)
```

Optional wrapping:

```
.device-browser
  └─ .frame-shot.r-16x10.bg-paper
       └─ <img>

.device-phone
  └─ .frame-shot.r-3x4.bg-paper
       └─ <img>
```

## Parameters

Pick six values before writing the markup. Treat this like the M16 cover decision tree — pick once, don't fiddle mid-build.

### 1. `r-*` ratio (required, matches slot)

| Class      | Use                                                       |
| ---------- | --------------------------------------------------------- |
| `r-16x10`  | Default for app / web shots, looks like a real window     |
| `r-16x9`   | Landscape video / dashboard / wide chart                  |
| `r-4x3`    | Classic desktop window, legacy app                        |
| `r-3x2`    | DSLR-style — only if the source is photographic UI mockup |
| `r-1x1`    | App icon / square widget                                  |
| `r-3x4`    | Mobile portrait shot (pair with `.device-phone`)          |
| `r-21x9`   | Multi-monitor / ultra-wide / WeChat hero                  |

### 2. `corners-*` (style-locked default)

- **Swiss** default: `corners-sq`. Use `corners-sm` only if the slot has surrounding shadow or chrome.
- **Editorial** default: `corners-sm` (6 px). Bump to `corners-md` (14 px) for "cutout" feel on paper.

Never go above 14 px — anything bigger reads as iOS marketing.

### 3. `shadow-*` (style-locked default)

- Swiss → `shadow-none` 90% of the time. `shadow-soft` only on screenshots that float on `bg-grid` / `bg-dot`. `shadow-ed` adds a `1px` outline as part of the shadow — reserve for hero shots.
- Editorial → `shadow-soft` on `bg-paper-2` is the warm default. `shadow-ed` for hero shots.

### 4. `bg-*` (the screenshot "stage")

| Token        | Swiss role          | Editorial role         |
| ------------ | ------------------- | ---------------------- |
| `bg-paper`   | Default plain stage | Same                   |
| `bg-paper-2` | n/a                 | Default warm stage     |
| `bg-grey-1`  | Default plain stage | n/a                    |
| `bg-grid`    | Engineering / data  | Field-notes engineering |
| `bg-dot`     | Subtle structure    | Subtle structure       |
| `bg-ink`     | Dark-mode UI shot   | Dark-mode UI shot      |

Backgrounds are **never** accent-coloured. If the screenshot needs an accent emphasis, add a `.t-cat` chip or `.kicker` next to it — don't tint the stage.

#### Solid `bg-*` vs asset `bg-asset-*`

The tokens above are **CSS-generated solids** — flat tones, fast, no asset dependency. They work, but for code / IDE / dashboard / dense-UI captures they can feel undersold. Ported from the PPT skill, both seed templates also ship 9 **real texture WebP** backgrounds under `assets/screenshot-backgrounds/`. Reach for these when the screenshot is the page's hero, when a solid stage feels too thin, or when you need the warmth/grain of a printed magazine.

Editorial assets (`assets/screenshot-backgrounds/style-a/`):

| Class                       | Tone               | Best for                                          |
| --------------------------- | ------------------ | ------------------------------------------------- |
| `bg-asset-dune`             | Warm sand          | Travel / outdoor app shots, lifestyle products    |
| `bg-asset-forest-ink`       | Deep forest green  | Dark-mode UI on Editorial — pairs with `ink-classic` |
| `bg-asset-indigo-porcelain` | Cool porcelain     | Reading / writing apps, design tools              |
| `bg-asset-kraft-paper`      | Kraft brown        | Notes / journaling / handwritten apps             |
| `bg-asset-monocle-classic`  | Cream paper        | Default warm hero — most magazine-like            |

Swiss assets (`assets/screenshot-backgrounds/style-b/`):

| Class                      | Accent            | Use only when current accent matches             |
| -------------------------- | ----------------- | ------------------------------------------------ |
| `bg-asset-ikb-dot`         | IKB Klein Blue    | `data-accent="ikb"` decks only                   |
| `bg-asset-lemon-green-dot` | Lemon-green       | `data-accent="lemon-green"` decks only           |
| `bg-asset-lemon-grid`      | Lemon-yellow      | `data-accent="lemon"` decks only                 |
| `bg-asset-safety-orange`   | Safety orange     | `data-accent="safety-orange"` decks only         |

**Rules of thumb**

- Don't mix accents — a `data-accent="ikb"` deck must not pull a `bg-asset-safety-orange` stage.
- Asset backgrounds already carry texture; don't stack `shadow-ed` on top (the `1px` outline will read as a SaaS frame). Use `shadow-soft` or `shadow-none`.
- Decide once per deck whether asset stages are part of the visual identity — don't sprinkle one asset background into a deck of solid stages, it looks like a sample card.
- These assets are crop-safe at 16:10 and 16:9. For tall `r-3x4` or square `r-1x1` slots, prefer solid `bg-*` — the texture pattern can read awkwardly when over-cropped.

**Path note**: the `.bg-asset-*` rules use `url("../assets/screenshot-backgrounds/...")` — this assumes your deck's `index.html` lives one directory below `assets/`. If you place the deck elsewhere, override these rules locally with the correct relative path.

### 5. `inset-*` (padding between shot and stage)

- `inset-none` — image fills the frame. Use when the screenshot itself already has window chrome.
- `inset-sub` (Swiss 20 px / Editorial 24 px) — default. Lets the stage breathe.
- `inset-bal` (Swiss 48 px / Editorial 56 px) — when the shot is busy and needs to feel calm.

### 6. `fit-cover` (override)

Default is `object-fit: contain` — this is the whole point of `.frame-shot`. **Only** add `.fit-cover` when:
- The slot is a hero where exact pixels of the source don't matter (e.g. a code shot used as a background pattern).
- The user explicitly says they want the shot cropped.

## Device chrome

Two wrapper classes ship with the seeds. They wrap a `.frame-shot`:

### `.device-browser`

Adds a 32–36 px chrome bar with traffic-light dots. Use for web / desktop app captures.

```html
<div class="device-browser">
  <div class="frame-shot r-16x10 bg-paper inset-none">
    <img src="assets/website.png" alt="Linear inbox">
  </div>
</div>
```

Pair with `shadow-soft` on the screenshot itself for a desk-photo feel.

### `.device-phone`

Wraps a 3:4 or 16:10 shot in an ink-coloured bezel with 18-24 px rounded inner corners. Use for mobile captures.

```html
<div class="device-phone">
  <div class="frame-shot r-3x4 bg-paper inset-none">
    <img src="assets/app.png" alt="WeChat detail">
  </div>
</div>
```

Don't stack `corners-md` on top of `.device-phone` — the bezel already rounds the inner shot.

## Safe-area cropping

When the user delivers a full-screen capture (1290×2796 iOS / 1080×2400 Android / 1920×1080 desktop), do **not** show the status bar, dock, or browser tab strip unless that chrome is the subject. Crop before importing:

1. Trim the iOS / Android status bar (top 47-59 px on retina).
2. Trim the home indicator / nav gesture bar (bottom 34 px on iOS).
3. For desktop: trim everything above the page content unless wrapped in `.device-browser`.

If you can't crop ahead of time, use `object-position: center 6%` to bias the visible region downward — but this is a workaround, not the preferred path.

## Style cheat-sheet

Two recipes that cover 80% of cases.

**Swiss product demo** — pure stage, no shadow:
```
.frame-shot.r-16x10.corners-sq.shadow-none.bg-grey-1.inset-bal
```

**Editorial deep-dive** — desk-photo warmth:
```
.frame-shot.r-16x10.corners-sm.shadow-soft.bg-paper-2.inset-sub
```

**Editorial hero with real texture** — magazine-grade stage:
```
.frame-shot.r-16x10.corners-sm.shadow-soft.bg-asset-monocle-classic.inset-bal
```

**Swiss hero with brand-aligned stage** — only when accent matches asset:
```
.frame-shot.r-16x10.corners-sq.shadow-none.bg-asset-ikb-dot.inset-bal
```

For comparison shots (before / after), use **the same parameters** on both — different treatment between cells reads as inconsistency, not contrast.

## Validator

`validate-social-deck.mjs` doesn't have a screenshot-specific rule (yet). The existing R1 / R2 / R5 still apply: a `.frame-shot` that overflows or pushes the footer is still a fail.

If a deck mixes `.frame-img` and `.frame-shot` on the same poster, that's usually a smell — pick one approach per poster.
