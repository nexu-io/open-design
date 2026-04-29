# Design System Inspired by Xiaohongshu

> Category: Media & Consumer
> Lifestyle UGC social platform. Singular brand red, generous radius, content-first.

## 1. Visual Theme & Atmosphere

Xiaohongshu (小红书 / RED) is the visual opposite of a SaaS console. Open the app and you do not see "Xiaohongshu" — you see other people's breakfasts, hotel sofas, the lipstick they bought on the third try. That is by design. The entire UI tries to act as a transparent picture frame: white surfaces, low-noise components, no shadow stacks competing for attention. Everything yields to the user-uploaded image.

The palette is brutally restrained. A near-white canvas (`#FFFFFF` / `#F5F5F5`) covers the majority of every page. Neutrals are built from translucent overlays (`rgba(48,48,52, 0.05~0.20)`) rather than discrete grey steps — the same fill drops onto white for hover, onto a card for divider, onto a button for disabled. The brand red `#FF2442` is the only saturated color the system permits, and it shows up only on tab indicators, the heart-active state, and primary CTAs. Semantic colors (success green, warning orange, info blue) exist as tokens but are nearly invisible in the consumer flow — danger is not a separate color, it just reuses brand red.

Form is soft. Cards round at 12–16px. Buttons round all the way to pills (`border-radius: 9999px`). Shadows are essentially absent — depth comes from spacing and rounding, not elevation. The signature layout is a two-column (mobile) or 5-column (PC) waterfall masonry where rows do not align — image height drives card height, and that misalignment *is* the realism.

Type is PingFang SC at medium weight throughout. There is no thin-light heroic display, no all-caps Latin headline. Hierarchy is compact (`H1: 32/600`, body: `14-16/400`), tracking is `0`, and digits use a custom `RED Number` family so counts on like buttons line up. The voice of the writing matches the visual: second person, conversational, never enterprise. "你的生活兴趣社区" — *your* lifestyle interest community, not "the platform".

The result reads like a slightly worn lifestyle magazine with a few handwritten Post-its tucked between the pages. Not Apple-store cold-minimal. Not Lark efficiency-console. Definitely not any SaaS dashboard. The design baseline is *daily-ness* — the user should not feel they are using software, only flipping through someone else's life.

**Key Characteristics:**
- Singular brand red (`#FF2442` token, `#FF2E4D` at the component layer) — never two saturated colors at once
- Translucent neutrals (`rgba(48,48,52, .05/.10/.20)`) instead of discrete grey steps
- Generous rounding everywhere: cards 12–16px, buttons fully pill, sheets 16px top-only
- Near-zero shadow — flat by default
- PingFang SC at 400/500/600 only; no thin display weights
- Content (user photos) is the color source — UI yields
- Bottom sheet for secondary actions on mobile, never modal
- Voice: second person, lifestyle, never SaaS-enterprise

## 2. Color Palette & Roles

All values below are sampled from production CSS at `https://www.xiaohongshu.com/explore` (inline `<style>` blocks for `:root, .force-light` and `:root[dark], .force-dark`).

### Primary Brand
- **Brand Red — Token** (`#FF2442`): `--primary` and `--color-red`. The design-system source of truth. Use for accents, active tabs, hearts, primary CTAs.
- **Brand Red — Component** (`#FF2E4D`): hard-coded on `.reds-button-new.primary`, `.active-bar`, outlined-button border. Slightly pinker and marginally lighter — same red channel (`FF`), with `+10` on green (`24` → `2E`) and `+11` on blue (`42` → `4D`). The lifted green/blue raises overall lightness while the proportionally larger blue lift nudges the hue a touch toward pink, the net effect of which likely reduces visual sting on large button fills. Whether this divergence from `--primary` is intentional (accessibility / large-fill ergonomics) or historical drift (a hard-coded override that should eventually merge back to the token) is undocumented upstream. Use when emitting actual buttons or active-bar UI; see §9 *Brand Red Disambiguation* for the per-surface rule.
- **Star Yellow** (`#FDBC5F`): bookmark / collect-active icon fill (sampled from `<symbol id="collected">` SVG). Only place yellow is allowed.

### Neutrals (translucent overlay system)
- **Surface** (`#FFFFFF`) — `--bg`. Cards, modals.
- **Canvas** (`#F5F5F5`) — `--bg0`. Page background behind cards.
- **Subtle** (`#FAFAFA`) — `--bg0-lighter` / `--color-information-background`. Information backgrounds.
- **Fill 1** (`rgba(48,48,52,0.05)`) — `--fill1`. Lightest hover, group lines.
- **Fill 2** (`rgba(48,48,52,0.10)`) — `--fill2`. Hover surface, disabled button bg, the "following" follow-button state.
- **Fill 3** (`rgba(48,48,52,0.20)`) — `--fill3`. Pressed.
- **Separator** (`rgba(0,0,0,0.08)`) — `--separator`. Hairline border.
- **Separator Strong** (`rgba(0,0,0,0.20)`) — `--separator2`.
- **Opaque Separator** (`#EAEAEA`) — `--opaque-separator`. When a real solid border is needed.

### Text
- **Title / Primary** (`rgba(0,0,0,0.80)`) — `--title`. Headings and titles. Soft black, never pure black.
- **Paragraph / Secondary** (`rgba(0,0,0,0.62)`) — `--paragraph`. Body, secondary text.
- **Description** (`rgba(0,0,0,0.45)`) — `--description`. Auxiliary captions.
- **Disabled / Placeholder** (`rgba(0,0,0,0.27)`) — `--disabled` / `--placeholder`.

### Semantic (token-level only — rarely visible in consumer UI)
- **Success** (`#02B940`) — `--success`. Background variant `#EAF8EF` (`--success2`).
- **Warning** (`#FF7D03`) — `--warning`. Background variant `#FFF2E6` (`--warning2`).
- **Info** (`#3D8AF5`) — `--info` / `--color-blue`. Almost never appears in consumer flow.
- **Link** (`#133667`) — `--link`. Deep navy, not a typical link blue. In practice, brand red is used for emphasis instead.
- **Danger / Error**: no independent token — danger reuses `--primary` (brand red). Heads-up for skill authors: an emitted destructive action and an emitted primary CTA will therefore be visually identical out of the box (a "Delete account" button reads exactly like a "Follow" button). RED's production destructive treatment is not directly observable in this snapshot, so as a defensive default, differentiate destructive intent via outline-style + brand-red text, or a leading destructive icon, when the difference matters.

### Functional Gradients (the only gradients allowed)
Brand red itself is **never gradient**. The only gradients in the system are functional:
- **Search Hotspot Hint** (`linear-gradient(90deg, #FF2543 0%, #FF5225 100%)`) — `--search-hotspot-hint`. Trending-search badge only.
- **Video Player Mask** (`linear-gradient(180deg, rgba(0,0,0,0.25), rgba(0,0,0,0) 50%, rgba(0,0,0,0.75))`) — `--mask-video-player-mask`. Top + bottom gradient on video tiles.

### Dark Mode

Dark mode follows `prefers-color-scheme: dark` with a manual override; both the `:root[dark]` attribute and the `.force-dark` class are honored in source.

- **Surface** (`#19191E`) — purple-tinted near-black, not pure `#000`.
- **Canvas** (`#0E0E11`) — deepest layer.
- **Title** (`rgba(255,255,255,0.84)`).
- **Paragraph** (`rgba(255,255,255,0.56)`).
- **Brand Primary** (`#FF2E4D`) — slight pink shift vs. light mode (`#FF2442` → `#FF2E4D`) to lower visual sting in low light.
- **Separator** (`rgba(255,255,255,0.07)`).

## 3. Typography Rules

All values sampled from production CSS at `https://www.xiaohongshu.com/`.

### Font Family

**Chinese (display + body, all levels):**
```
PingFang SC
```
Every `--Typography-FontFamily-*` variable resolves to `PingFang SC`. There is no separate display face.

**Site-wide fallback chain:**
```
-apple-system, 'Helvetica Neue', 'PingFang SC', 'Hiragino Sans GB',
'Microsoft Yahei', Arial
```

**Numbers (custom):**
```
'RED Number' (Regular 400 / Medium 500 / Bold 700)
```
Used for like counts, follower counts, stat displays. Solves PingFang's non-tabular digit problem.

**Mobile app embedded:** 方正悠黑 (`FZ YouHei`) ships in the iOS / Android app; users can fall back to system PingFang SC / Noto Sans CJK SC.

### Hierarchy (PC web tokens)

| Token | Size | Weight | Line-height | Role |
|---|---|---|---|---|
| `--h1` | 32px | 600 | 40px (125%) | Page hero title |
| `--h2` | 24px | 600 | 32px (133%) | Section heading |
| `--h3` | 20px | 600 | 28px (140%) | Card heading |
| `--t1` | 18px | 600 | 26px (144%) | Strong label |
| `--t2` | 16px | 500 | 24px (150%) | Medium label |
| `--t3` | 14px | 500 | 20px (143%) | Secondary label |
| `--b1` | 16px | 400 | 24px (150%) | Body large |
| `--b1-loose` | 16px | 400 | 26px (162%) | Long-form body |
| `--b2` | 14px | 400 | 20px (143%) | Body standard |
| `--b2-loose` | 14px | 400 | 22px (157%) | Body long-form |
| `--c1` | 13px | 400 | 20px (154%) | Caption |
| `--c2` | 12px | 400 | 18px (150%) | Small caption |
| `--c3` | 10px | 400 | 14px (140%) | Badge / smallest |

`*-emphasized` variants (e.g. `--c1-emphasized`) bump the same size to weight 500.

### Principles

- **Compact heading scale.** Max display is 32/600 — there is no 48px / 64px hero type. Density wins over visual jumps.
- **Three weights only.** 400 (Regular), 500 (Medium), 600 (Semibold). Weight 700 is reserved exclusively for `--number-emphasized-font-weight`. No thin / light.
- **Tracking is zero.** Every `--Typography-Spacing-*` token is `0`. Component-level overrides (cookie banner, category title) hand-tune `-0.3px`–`-0.64px`, but base tokens are flat.
- **Soft black, not pure black.** Title text is `rgba(0,0,0,0.80)`. Pure `#000` is never used for body or title text.
- **Dedicated digit face.** Counts, stats, and follow-numbers always use `RED Number` for tabular alignment.

## 4. Component Stylings

### Buttons

**Primary**
- Background: `#FF2442` (or `#FF2E4D` when matching the live `.reds-button-new.primary` class)
- Text: `#FFFFFF`, weight 500, 14px
- Radius: **pill — `border-radius: 9999px`**
- Padding: `8px 20px` small / `12px 32px` large
- No shadow

**Secondary (filled)**
- Background: `rgba(48,48,52,0.10)` (`--fill2`) — soft grey
- Text: `rgba(0,0,0,0.80)` (`--title`)
- Same pill radius

**Secondary (outlined)**
- Background: `#FFFFFF`
- Border: `1px solid #FF2E4D`
- Text: `#FF2E4D`
- Pill radius. Used for the unfollowed-state follow CTA on profile cards.

**Icon button (like / collect / comment)**
- Pure icon (24px) stacked over count (12px, `rgba(0,0,0,0.45)`)
- No background plate
- Active state: icon flips to `#FF2442` (heart) or `#FDBC5F` (star); count text matches

### Follow Button — three-state (highest-recognition component)

| State | Background | Label (Chinese / English) | Text | Shape |
|---|---|---|---|---|
| Not following | `#FF2442` | `+ 关注` (Follow) | white | pill |
| Following | `rgba(48,48,52,0.10)` | `已关注` (Following) | `rgba(0,0,0,0.45)` | pill |
| Mutual | `rgba(48,48,52,0.10)` | `互相关注` (Mutual) | `rgba(0,0,0,0.62)` | pill |

Feed-card variant: `6px 14px` padding, 12px text. Profile-page variant: `8px 20px`, 14px text.

### Cards (Feed / Note Card)

- Radius **12px** (16px for larger feature cards)
- **No box-shadow by default.** White card sits on `#F5F5F5` canvas — separation comes from the canvas color, not elevation.
- Structure: image fills top edge-to-edge → title (1–2 lines, 12px padding) → footer (32px round avatar + nickname + heart + count)
- Image clips to top corners only; bottom corners are square because the image fills to the bottom of the image region.
- PC hover: subtle `translateY(-2px)` plus a very light shadow (`0 4px 12px rgba(0,0,0,0.08)`). Mobile: no hover state.

### Inputs / Search

- Background: `#F5F5F5`
- Border: none (focus may add a `1px solid` of `--separator`)
- Radius: pill (or 20px for taller fields)
- Height: 36–40px
- Inline magnifier icon at the leading edge

### Tabs / Segmented Control

- Text-only tabs with a **2px underline bar** — never pill background, never colored chip.
- Active: text color shifts to `rgba(0,0,0,0.80)` and weight bumps to 600; underline bar uses `#FF2E4D`, width matches text width.
- Inactive: text `rgba(0,0,0,0.45)`, weight 400.
- Tab spacing: ~40px.

### Tags / Topics

- Pill rectangle, `padding: 4px 12px`, `font-size: 12px`
- Default: `rgba(48,48,52,0.10)` bg + `rgba(0,0,0,0.62)` text
- Trending / featured: `#FF2442` bg + white text

### Badges / Counts

- Numeric badge: `#FF2442` bg + white digit, min 16×16, pill
- Pure red dot: 8px diameter, offset `-4px / -4px` from icon corner
- HOT marker: small pill, `#FF6B35` or brand red, 10px white text

### Avatars

- Always circular (`border-radius: 50%`)
- Feed: 28–32px. Profile hero: 80–96px.
- No white stroke.
- Verification badges sit on the lower-right at ~25–30% of the avatar diameter:
  - Red V (creator)
  - Blue V (enterprise)

### Bottom Sheet (mobile only — replaces most modals)

- Slides from screen bottom over a `rgba(0,0,0,0.5)` scrim
- **Top-only radius `16px 16px 0 0`**
- Drag handle: `4px × 36px`, `#E0E0E0`, centered, ~6px below top edge
- Dismiss: drag-down past threshold, or tap scrim
- Used for: share, report, more-actions, comment-compose — almost everything that would be a modal on PC.

### PC Modal

- Centered, white background, 12px radius
- Light shadow (`0 8px 32px rgba(0,0,0,0.12)`) — the only place shadow is conspicuous

## 5. Layout Principles

### Spacing System (8pt grid)

Base unit 8px. Common stops: `4 / 8 / 12 / 16 / 20 / 24 / 32`. Section gaps jump to `48 / 64`.

### Responsive Waterfall (PC discover)

Five-column masonry at the standard desktop width, stepping down on narrower viewports.

| Viewport | Columns | Column gap |
|---|---|---|
| ≥ 960px | 5 | 10px |
| 690–960px | 4 | 10px |
| 500–690px | 3 | 10px |
| < 500px | 2 | 10px |

Implementation is JavaScript-positioned (`translate3d` + ResizeObserver), not CSS Grid, because card heights are unknown until images load. This also predates widespread CSS Masonry support (still behind flags in most browsers as of 2026); the JS approach buys cross-browser consistency at the cost of layout-shift risk on slow image loads. The masonry deliberately does not align rows — variable image height *is* the realism.

### Mobile Two-Column

- Two columns, each ~48.2% of viewport width
- Row gap ~7px
- Outer side margin `12rpx` per side (≈ 6px @ 375px)

### Note Detail (PC)

- Two-pane: left ~500px image carousel / right ~500px metadata + comments, total ~1100px
- Image aspect chosen at upload time — vertical 3:4 / square 1:1 / horizontal 4:3
- The carousel is the dominant visual; comments scroll independently on the right

### Profile

- 16:9 banner image at top
- Circular avatar (80–96px) overlaps banner / content edge
- Three-stat horizontal row (following / followers / likes-and-collects)
- Tab strip below: Notes / Saved / Liked (笔记 / 收藏 / 赞过)

### Creator / Ad Console (B2B)

Standard left-nav console: 200–240px sidebar + ~1000–1100px content area. Top of content is a row of stat cards (impressions, likes, follower delta), below is a list or chart region. **No left-border accent on cards.** Surfaces are white, separation is by spacing.

### Whitespace

- The discover grid is dense — *content* density is the value proposition.
- Section padding sits *between* feeds, not within them.
- Cards do not have internal vertical padding above the image — image is flush to the top of the card.

## 6. Depth & Elevation

Three levels, used sparingly.

| Level | Treatment | Use |
|---|---|---|
| Flat (0) | No shadow | Default — feed cards, tags, buttons (both modes) |
| Subtle (1) | `0 4px 12px rgba(0,0,0,0.08)` | PC card hover (light mode only) |
| Modal (2) | `0 8px 32px rgba(0,0,0,0.12)` | Centered modal on PC (light mode only) |
| Dark mode | Drop shadows or replace with a `1px` hairline (`rgba(255,255,255,0.07)`) | `rgba(0,0,0,*)` shadows are invisible on the `#19191E` canvas; the scrim alone provides modal separation, and the PC card-hover `translateY(-2px)` is dropped entirely (motion + shadow both read as no-ops against the dark surface) |

**Shadow is the exception, not the rule.** Depth comes from:
1. Background color contrast (`#F5F5F5` canvas under `#FFFFFF` cards)
2. Generous radius (cards visually float because corners are rounded)
3. Whitespace between elements

No neumorphism. No glassmorphism. No coloured shadows. Bottom sheet has no shadow at all — the scrim provides the separation. In dark mode, drop the PC card-hover effect (`translateY(-2px)` + alpha-on-black shadow) entirely; both motion and shadow read as no-ops against the dark canvas.

## 7. Do's and Don'ts

### Do
- ✅ Treat brand red as singular. One CTA accent per screen, no second saturated color competing.
- ✅ Use translucent fill overlays (`rgba(48,48,52,0.05/.10/.20)`) for hover / disabled / pressed — not separate grey shades.
- ✅ Round generously: 12–16px on cards, full pill on buttons.
- ✅ Set body text at `rgba(0,0,0,0.80)` for titles and `rgba(0,0,0,0.62)` for paragraphs — soft black always.
- ✅ Use `RED Number` (or any tabular-numerals stack) for stats and counts.
- ✅ Let user-uploaded images carry the color story. The UI is the picture frame.
- ✅ Default to bottom-sheet for secondary actions on mobile; reserve centered modal for PC and confirmations only.
- ✅ Tabs are text + 2px underline. Always.
- ✅ Speak in second person, conversational. "what you just scrolled past" is more RED than "Discover trending content".

### Don't
- ❌ Don't use purple, deep blue, or black-gold as a primary color. Tech / fintech / luxury vocabulary is the wrong genre — RED is lifestyle.
- ❌ Don't gradient the brand red itself. The only gradients are functional (search-hotspot badge, video mask).
- ❌ Don't fill an entire hero with a brand-color background. Brand red is accent-only; a red-bordered hero reads as a sale poster, not a feed.
- ❌ Don't fabricate the `小红书` wordmark or the RED logotype as artifact output. Tokens are not protectable; the wordmark is — that is the part of the brand identity with actual IP risk. When a logo placeholder is needed, emit a labelled grey block (e.g. an empty pill with `LOGO` in `rgba(0,0,0,0.45)`) and let the user drop in a licensed asset.
- ❌ Don't use Inter, Helvetica, or Roboto as the Chinese display face. PingFang SC is the system — Latin fallback chains use `-apple-system` first.
- ❌ Don't reference the `RED Number` family standalone in generated CSS. End users do not have it installed; without the PingFang fallback chain it silently falls back to whatever the OS picks, which breaks digit alignment. Always emit it inside a stack, e.g. `font-family: 'RED Number', PingFang SC, -apple-system, 'Helvetica Neue', Arial, sans-serif;`.
- ❌ Don't ship light / thin weights at body sizes. Notes carry dense Chinese text; light weights destroy mobile legibility.
- ❌ Don't add a left-border colored accent stripe to cards (the SaaS / dashboard tell). Cards separate via canvas color and radius, not colored chrome.
- ❌ Don't drop heavy shadows. Concrete threshold: avoid alpha darker than `rgba(0,0,0,0.15)` or spread greater than `16px`. If the shadow is visible at arm's length on a phone, it is too strong for this system.
- ❌ Don't pile glassmorphism, neumorphism, or 2020-era trend effects. The visual era reference is "lifestyle magazine", not "tech demo".
- ❌ Don't write a "Trusted by 10,000+ teams" enterprise social-proof block. UGC trust comes from real people, not logo walls.
- ❌ Don't write hero CTAs in all-caps Latin. Sentence-case Chinese, sentence-case Latin, no exceptions.
- ❌ Don't use stock business photography (handshakes, laptop close-ups, conference rooms). Use real-life UGC-style imagery.
- ❌ Don't use 3D isometric / blob / abstract-network illustrations. They are SaaS-marketing tells. RED uses real photos or hand-drawn editorial illustrations.
- ❌ Don't write copy in third person ("the platform provides…"). Always second person ("what you want to see").
- ❌ Don't surface unverifiable stat claims ("10× faster", "save N hours"). RED's brand voice is emotional resonance, not metric promises.
- ❌ Don't use orange / yellow as a Toast emphasis color. Emphasis in this system is brand red, period.
- ❌ Don't hard-pin every card to the same height. Variable card height across columns is the realism — don't "fix" it.

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Discover columns | Notes |
|---|---|---|---|
| Mobile | < 500px | 2 | App-like density, edge-to-edge waterfall |
| Tablet | 500–690px | 3 | Padding eases, tap targets stay 44px+ |
| Small Desktop | 690–960px | 4 | Standard reading width |
| Desktop | ≥ 960px | 5 | Full waterfall, sidebar visible |

### Collapsing Strategy

- **Discover**: 5 → 4 → 3 → 2 columns; column gap stays at 10px throughout.
- **Note detail**: two-pane PC layout collapses to single-column stack on mobile (image carousel on top, body + comments below).
- **Profile**: stat row stays horizontal at 3 columns down to mobile; tab strip remains horizontal with overflow scroll.
- **Console (creator / ad)**: sidebar collapses to a hamburger drawer below ~768px; stat-card row wraps to 2-up.

### Touch Targets

- Minimum tap target 44×44px on mobile. Icon buttons render at 24px icon inside a 44×44 hit zone.
- Pill buttons keep 36–40px height on mobile to honor this without growing radius.

### Type at Mobile

- Body sizes do not shrink below 14px. Small captions stay at 12px to preserve density without becoming illegible on Chinese characters.

## 9. Agent Prompt Guide

### Brand Red Disambiguation

Two reds ship in the live system. They split by **surface**, not by mood — the wrong surface choice is the most common artifact-level slop in this design system, so the rule is explicit:

- **Default — emit `#FF2442`** (`--primary` / `--color-red`) for everything that is *not* a pixel-for-pixel replica of an existing component: new CTAs, hearts, accent fills, tag-on-trending, page-token references.
- **Pixel-replica — emit `#FF2E4D`** *only* when reproducing the live `.reds-button-new.primary` button fill, the `.active-bar` tab indicator, or the outlined follow-button border. Treat this as the production-fidelity value; do not generalize it to other components.
- **Never mix the two on one component.** `background: #FF2442` next to `border: 1px solid #FF2E4D` on the same element is the failure mode this rule prevents — pick one surface category, then stay in it.

The Component One-Liners block below is intentional: the primary CTA uses `#FF2442` (token red, default) while the tab indicator uses `#FF2E4D` (component red, pixel-replica). They are different surfaces, so they get different reds.

### Quick Color Reference

- Brand: `#FF2442` (token, default) / `#FF2E4D` (component layer, pixel-replica only — see disambiguation above)
- Star (collect): `#FDBC5F`
- Surface: `#FFFFFF`
- Canvas: `#F5F5F5`
- Title text: `rgba(0,0,0,0.80)`
- Paragraph: `rgba(0,0,0,0.62)`
- Description: `rgba(0,0,0,0.45)`
- Hover / disabled fill: `rgba(48,48,52,0.10)`
- Hairline: `rgba(0,0,0,0.08)`

### Quick Type Reference

- Family: `PingFang SC, -apple-system, 'Helvetica Neue', 'Hiragino Sans GB', 'Microsoft Yahei', Arial`
- Stat / digit family: `RED Number`
- Heading: 20–32px, weight 600, line-height 125–140%
- Body: 14–16px, weight 400, line-height 143–150%
- Tracking: 0

### Component One-Liners

- Primary CTA: `background: #FF2442; color: #FFF; border-radius: 9999px; padding: 8px 20px; font-weight: 500;`
- Follow button (idle): same as primary CTA, label `+ 关注` (Follow)
- Follow button (following): `background: rgba(48,48,52,0.10); color: rgba(0,0,0,0.45); border-radius: 9999px;` label `已关注` (Following)
- Feed card: `background: #FFF; border-radius: 12px; box-shadow: none;` image flush to top
- Tab indicator: 2px underline `#FF2E4D` matched to text width; active text `rgba(0,0,0,0.80)` weight 600
- Search input: `background: #F5F5F5; border-radius: 9999px; padding: 8px 16px; height: 36–40px; border: none;`
- Bottom sheet: `border-radius: 16px 16px 0 0; background: #FFF;` 4×36px drag handle `#E0E0E0` centered

### Iteration Guide

1. **Start from the picture, not the chrome.** Drop a generous photographic hero or pin grid first; build UI around it as quietly as possible.
2. **One accent.** If you have used `#FF2442` once on a screen, you have used it enough.
3. **Translucent neutrals.** Reach for `rgba(48,48,52, .10)` before reaching for a fresh grey hex.
4. **Pill everything that's tappable.** If it looks like a square button, it is wrong.
5. **No shadow until a hover or modal demands it.** Default elevation is flat.
6. **Second person Chinese voice.** Even Latin copy should read like a friend talking, not a vendor pitching.
7. **Variable card heights.** A 3:4 image next to a 4:5 image is the look — do not pad both to the same height.
8. **Mobile-first density.** Two-column waterfall is the canonical layout; everything else is a response to a wider viewport.
