# FoldAR — Design Specification

A reference document for the FoldAR visual language. The brand is a Texas-based firearms manufacturer whose patented folding-barrel system lets full-capability rifles be carried discreetly and deployed in seconds. Audience: civilians, law enforcement, military.

The aesthetic is **engineered, restrained, accountable** — never flashy. Treat the system as the output of a manufacturer of precise tools, not a lifestyle brand.

---

## 1. Principles

1. **Restraint over decoration.** Black, white, one red, one grey. No gradients. No illustration. No emoji.
2. **Numbers are sacred.** Every number is monospaced and carries an explicit unit. Statistics earn their place; pad nothing.
3. **Sharp by default.** 0px corners on marketing, brochure, hero, and product cards. Radii only appear in transactional checkout UI.
4. **Red is rationed.** Accent red appears on at most one or two datapoints per view. Never as a background, never as decoration.
5. **The grid is visible.** 1px `#D9D9D9` dividers, measurement lines, and column rules are part of the language — they say *this thing was engineered*.
6. **Motion is functional.** Fade + translate, 180–240ms. No bounces, no parallax, no spring overshoot.

---

## 2. Color

### Palette (the only four colors that matter)

| Token | Hex | Role |
| ----- | --- | ---- |
| `--fa-black` | `#000000` | Dominant typography and backgrounds |
| `--fa-white` | `#FFFFFF` | Contrast surface, paper |
| `--fa-red` | `#F43139` | Accent — key numbers, CTAs, highlight lines |
| `--fa-fog` | `#D9D9D9` | Default divider, secondary text, thin borders |

### Supporting neutrals

| Token | Hex | Use |
| ----- | --- | --- |
| `--fa-ink` | `#272727` | Panel strokes on black |
| `--fa-coal` | `#444444` | Data-block borders, half-step on dark surfaces |
| `--fa-stone` | `#6C6C6C` | Secondary text |
| `--fa-ash` | `#868D96` | Quiet UI text, muted labels |
| `--fa-paper` | `#E3E7E9` | Large surfaces, disabled |

### Red, by alpha

| Token | Use |
| ----- | --- |
| `--fa-red-10` | CTA fill (with `backdrop-filter: blur(17.6px)`) |
| `--fa-red-20` | Highlight overlays |
| `--fa-red-40` | Press / focus states |

### Transactional UI palette (checkout only)

A separate, softer palette is permitted **only** in checkout/account chrome — `--fa-ui-bg`, `--fa-ui-subtle`, `--fa-ui-border`, `--fa-ui-success-*`, `--fa-ui-link` (`#016FD0`). It does not leak into marketing.

### Rules

- No gradients anywhere in the brand language.
- No tints of red beyond the four alpha steps above.
- No new accents. If you need to differentiate, vary type, weight, or position — not hue.
- Concrete texture (`assets/concrete.jpg` at 23% opacity) is the only acceptable surface treatment beyond solid black or white.

---

## 3. Typography

Three voices. Not four.

### Display — `DIN Condensed` / Oswald (substitute)

- ALL CAPS for every headline and label.
- Tracked `+0.06em` to `+0.08em`.
- Used for: hero copy, section titles, button labels, SKU codes.
- Substitute: **Oswald** (Google Fonts) until the licensed DIN file ships.

### Body — `SF Pro` / Inter (substitute)

- Sentence case.
- Used for: paragraphs, UI body, form labels, supporting copy.
- 14px web, 13px print, 1.5 line-height.
- Substitute: **Inter** (Google Fonts).

### Data — `Space Mono`

- Every number, price, measurement, SKU, counter, statistic.
- Always paired with its unit (`16.25"`, `300m`, `<1.5s`).
- `Space Mono Bold` for micro-labels.

### Type scale

| Token | Size | Use |
| ----- | ---- | --- |
| `--fa-text-hero` | `clamp(48, 6vw, 96)` | Brochure full-bleed |
| `--fa-text-display` | `40px` | Section eyebrows on black |
| `--fa-text-h1` | `36px` | Page title |
| `--fa-text-h2` | `24px` | Section headline |
| `--fa-text-h3` | `20px` | Sub-section |
| `--fa-text-label` | `16px` | ALL-CAPS label |
| `--fa-text-stat` | `46px` | Mono stat counter |
| `--fa-text-body-web` | `14px` | Web body |
| `--fa-text-body` | `13px` | Print body |
| `--fa-text-micro` | `10px` | Footnote / micro |

### Tracking

`--fa-track-tight` `-0.01em` · `--fa-track-wide` `+0.03em` · `--fa-track-wider` `+0.06em` · `--fa-track-widest` `+0.08em`.

---

## 4. Voice & content

**Person.** Third-person and second-person imperative. "The operator," "your rifle," "those entrusted with protecting others." `we` only appears in supporting paragraphs, never in hero copy.

**Casing.**
- ALL CAPS — headings, section labels, data labels.
- Sentence case — body paragraphs.
- lowercase — occasionally mixed into caps headlines as a deliberate accent (e.g. *"TRUSTED BY CIVILIANS, LAW ENFORCEMENT, AND military"*).
- Product names — `FoldAR®`, `Watchman`, `Shepherd`, `Sentinel`, `Remnant`, `nanoRemnant`. The word `rifle` is a common noun.

**SKUs** — all-caps dashed: `16-556-S-PR-PKG`.

**Tone references** (verbatim from the brochure):
- THE RIFLE THAT STAYS WITH YOU
- WHEN SECONDS MATTER, YOUR RIFLE MUST ALREADY BE WITH YOU
- ELIMINATING THE DELAY BETWEEN THREAT AND RESPONSE
- ONE RIFLE. MULTIPLE MISSIONS.
- BUILT FOR THOSE WHO PROTECT

**Numbers always carry units.** `Folded Length: 16.25"`. `Engagement Distance: 300m`. `Deployment Speed: <1.5s`.

**Never:** emoji, exclamation marks, marketing warmth, lifestyle adjectives.

---

## 5. Spacing & grid

8pt print rhythm, 4pt web rhythm. Tokens: `--fa-space-1` through `--fa-space-30` (`4px`–`120px`).

### Page grids

| Surface | Width | Side gutter | Columns / baseline |
| ------- | ----- | ----------- | ------------------ |
| Website | 1920 | 120px | 12 columns |
| Brochure | 612 × 792 (US Letter) | 58.75pt | 8pt baseline |

The grid is meant to be visible. Use 1px `#D9D9D9` rules and measurement annotations liberally — they read as engineering drawings, not decoration.

---

## 6. Corner radii

| Radius | Use |
| ------ | --- |
| `0px` | Marketing, brochure, hero, product cards — the default |
| `2px` | Tiny UI (payment chips) |
| `4–6px` | Checkout / transactional UI only |
| `100px` | PayPal-style payment pills only |

Never invent new radii. If a card needs to feel "softer," it's the wrong card.

---

## 7. Borders & dividers

- `1px solid #D9D9D9` — default hairline (`--fa-border-hairline`).
- `1px solid #444444` — half-step neutral on dark panels (`--fa-border-ink`).
- `1px solid #F43139` — the red CTA outline (`--fa-border-red`).
- `0.5px #D9D9D9` vertical rule — used to separate logo lockups from tagline paragraphs.

---

## 8. Elevation

Almost flat. One exception:

```
--fa-shadow-hero: 24px 24px 32px 0 rgba(0, 0, 0, 0.25);
```

Applied only to product hero renders sitting on the slider. Cards, buttons, panels, and inputs all stay flat.

The only blur in the system is `backdrop-filter: blur(17.6px)` on the red CTA fill when it sits over photography.

---

## 9. Components

### The signature CTA — cut-corner red outline button

The single most recognizable component in the system. Specs:

- 50px tall, 170px min-width, 24px horizontal padding.
- 1px red outline, 10% red fill, 17.6px backdrop blur.
- 12px triangular cut on the upper-left corner, filled solid red.
- Label: `DIN Condensed Bold 24px / 100%`, ALL CAPS, `+0.08em` tracking.
- **Hover:** 120ms — fill flips to solid red, text to white.
- **Press:** 80ms — `scale(0.98)`.

Class: `.fa-cta`. Do not replace this with a pill, a rounded button, or a flat fill — it is the brand.

### Data tile

Outlined block (`1px #444` on black, `1px #D9D9D9` on white). Mono label up top, large mono number below, unit suffix in `--fa-stone`. One red number per tile maximum.

### Section eyebrow + headline pair

A `Space Mono 8/13, +0.5px` micro-cap label sits above a `DIN Condensed` headline. The eyebrow is always grey or red; the headline is always full-strength foreground.

### Spec row

Mono label (left) · 1px fog rule fill · mono value with unit (right). Used throughout brochure spreads and product detail.

### Surfaces

- `.fa-surface-paper` — white, black ink.
- `.fa-surface-ink` — black, white ink.
- `.fa-surface-concrete` — white with `assets/concrete.jpg` at 23% opacity. Reserved for premium marketing panels (e.g. product slider).

---

## 10. Iconography

A custom 24×24 line-icon set, stroke 1.5–1.67px, no fills, rounded joins. Style: close to **Hugeicons Pro (Stroke Rounded)**.

**Current substitute:** **Lucide** (MIT) at 1.5px stroke, served from `unpkg.com/lucide-static`. Swap to the proprietary FoldAR set when SVGs are dropped into `assets/icons/`.

Unicode-as-icon is permitted sparingly: `®`, `©`, `™`, `→`, `×`. Emoji never.

---

## 11. Imagery

Two acceptable modes:

1. **Studio product renders** — pure white background, neutral lighting, optional `--fa-shadow-hero` directional shadow.
2. **Training-environment photography** — black-and-grey, muted, desaturated. Cool tone only. Grain acceptable.

Never warm. Never lifestyle-soft. Never illustrated. Never AI-generated character art.

When real assets are missing, draw a placeholder — a 1px fog-bordered rectangle with a mono label like `[PRODUCT SHOT — WATCHMAN 16, FOLDED]`.

---

## 12. Logo & wordmarks

- Full FoldAR wordmark: `assets/logo.svg` (light) and `assets/logo-dark.svg` (dark).
- Product wordmarks: `wordmark-{watchman, shepherd, sentinel, remnant, nanoremnant}.webp`.
- Header lockup is a condensed monogram derived from scaling the full wordmark.

Do not invent new logos. Do not recolor the existing ones outside the four-color palette.

---

## 13. Motion

| State | Duration | Easing | Properties |
| ----- | -------- | ------ | ---------- |
| Hover | 120ms | `cubic-bezier(0.2, 0, 0, 1)` | color, opacity |
| Press | 80ms | same | `transform: scale(0.98)` |
| Page transition | 180–240ms | same | opacity + translateY(8px) |

No bounces, no springs, no parallax, no auto-playing video loops in hero.

### Hover affordances

- **Links:** color shifts `#141414` → `#F43139`.
- **Buttons:** outline → filled (red → white text).
- **Images:** no hover state.

---

## 14. Layout chrome

- **Header (marketing):** 128px tall, 48px logo, 42px menu gutter, fixed.
- **Section labels:** `Space Mono 8/13, +0.5px` micro-caps above large `DIN Condensed` headlines.
- **Data callouts:** 1px `#444` outlined blocks on black surfaces.
- **Footer:** spec-row layout, mono labels, fog dividers.

---

## 15. What to ask the user for

Production fidelity requires a few items not yet supplied:

- **Real font files** — DIN Condensed, Nimbus Mono PS, SF Pro (currently substituted with Oswald, JetBrains Mono, Inter). Drop into `fonts/`.
- **Proprietary icon set** — currently substituted with Lucide. Drop SVGs into `assets/icons/` and the substitution will be swapped.
- **Accurate product prices** if publishing customer-facing material; current prices are illustrative.

---

## 16. Source files in this project

| Path | Contents |
| ---- | -------- |
| `colors_and_type.css` | All tokens — palette, type scale, semantic utilities, the CTA |
| `fonts/` | Local webfont files |
| `assets/` | Logos, wordmarks, hero renders, photography |
| `preview/*.html` | Atomic reference cards (type, color, spacing, components, brand) |
| `ui_kits/website/` | React-style recreation of the marketing site |
| `ui_kits/brochure/` | Print brochure recreation |
| `README.md` | Full narrative — voice, foundations, font matrix |
| `SKILL.md` | Agent skill manifest for cross-project use |
