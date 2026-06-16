---
name: huasheng-design-system
description: Use this skill to generate well-branded interfaces and assets for 华昇影视 (Huasheng Studios) — a livestream-studio design & build-out company. Contains essential design guidelines, colors, type, spacing, components, brand assets, and a runnable React UI kit for prototyping marketing sites, Douyin covers, decks, and web surfaces.
user-invocable: true
---

# Huasheng Design System Skill

## What is inside

This is a complete Open Design design-system package for **华昇影视 (Huasheng Studios / 温州华昇影视文化传播有限公司)**, a professional livestream-studio solutions provider.

Key files to read before generating any artifact:

| Priority | File | Purpose |
|----------|------|---------|
| 1 | `README.md` | Package overview, product context, preview manifest, reuse workflow |
| 2 | `DESIGN.md` | Complete design rules (color, type, spacing, layout, components, motion, voice, anti-patterns) |
| 3 | `colors_and_type.css` | Reusable CSS token file with all `:root` variables and `@font-face` bindings |
| 4 | `preview/` | Reviewable HTML cards for colors, typography, spacing, radius, shadows, components, and brand assets |
| 5 | `assets/logos/` | Production logo/ mark assets (primary, white, red/white/black seal marks) |
| 6 | `build/` | Runtime build assets (brand book PDF, app icon, tray icon, logo) |
| 7 | `fonts/` | Brand typeface: Noto Sans SC (via Google Fonts CDN) |
| 8 | `source_examples/` | Preserved source evidence (original brand README + SKILL) |
| 9 | `ui_kits/app/index.html` | Runnable React UI kit with Sidebar, Hero, ServiceCard, SectionHeader, ContactForm |

## Source context

- **Company**: 温州华昇影视文化传播有限公司 — 直播间搭建解决方案
- **Brand Book**: `build/Huasheng-Brand-Book.pdf` (15-page VI guideline)
- **Brand Brief**: `source_examples/brand-kit-README.md` (one-page brand summary)
- **Assets**: `assets_华昇-Huasheng-Studios-Design-System.zip` → extracted to `context/brand-kit/`

Brand in one line: **Ink black + a single decisive 公司红 `#b90005` on a light gray page, with oversized 思源黑体 (Noto Sans SC) type and a calligraphic 华昇 logotype stamped by a red seal.** Slogan: 抱素怀光，昭及四方。

## When to use this skill

Use this skill when the user asks you to create artifacts for 华昇影视 (Huasheng Studios), including but not limited to:

- Marketing landing pages or studio websites
- Douyin (抖音) video covers or service/case covers
- Slide decks / presentations about livestream-studio design
- Web app prototypes for studio management or client portals
- Brand-consistent HTML artifacts with 华昇影视 visual identity

## How to use

1. **Read the sources first.** Before generating any design artifact, read `README.md`, `DESIGN.md`, and `colors_and_type.css` in full.
2. **Link `colors_and_type.css`** in your HTML artifact to inherit all tokens (colors, type, spacing, effects).
3. **Copy brand assets** from `assets/logos/` or `build/` as needed for logos, seals, and icons.
4. **Reference preview cards** in `preview/` to validate color, type, spacing, and component rendering.
5. **Reuse UI kit components** from `ui_kits/app/components/` — open `ui_kits/app/index.html` to preview the full kit in a browser.
6. **Follow DESIGN.md rules** strictly — especially the anti-patterns list (Section 9).
7. **Use the editorial section-header pattern** for all section headers: 2px vertical ink rule + eyebrow + large title + 56×3px red tick.

## Design system highlights

### Color
- **One accent only** — 公司红 `#b90005`. No purple, no gradient, no warm beige backgrounds.
- **Two background moods** — light (`#f0f0f0`) page or near-black (`#0a0a0a`) hero/cover.
- **Gray ramp** — `#f0f0f0` → `#dcdcdc` → `#c8c8c8` → `#969696` → `#505050` → `#1a1a1a`.

### Typography
- **Noto Sans SC** for all Chinese + Latin text.
- **Weights**: Light 300 / Regular 400 / Medium 500 / Bold 700 / Black 900.
- **Display**: Black 900 at 120px/72px/48px with tight leading (1.1–1.2).
- **Eyebrow**: Medium 500, 13px, letter-spacing 0.22em, UPPERCASE.

### Components
- **SectionHeader** — 2px ink rule + eyebrow + title + 56×3px red tick (the signature layout device).
- **Buttons** — Primary (red fill), Secondary (red outline), Ghost (transparent), Dark.
- **Cards** — White surface, 1px gray border, 8px radius, hover shadows (240ms ease-out).
- **Inputs** — 2px border-radius, red focus ring, 44px minimum height.

### Anti-patterns (do NOT do these)
- ❌ Any accent color other than `#b90005`
- ❌ Purple/violet gradients
- ❌ Emoji as icons or decoration
- ❌ Inter / Roboto / Arial as display faces
- ❌ Rounded cards with left colored border accents
- ❌ Warm beige / cream / peach / pink / orange-brown page backgrounds
- ❌ Bounce animations (max 360ms, no bounce)
- ❌ Recoloring the red seal stamp
