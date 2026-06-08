---
name: ai-automation
description: "Use this plugin when the user wants a premium dark, video-backed AI-agency landing page (brand 'COGNITRA'): fixed fullscreen background video, transparent navbar, a half-gray-panel hero, a word-by-word fade-in statement section over the video, and a 3-card services grid with looping video thumbnails. Invoke for 'AI automation landing page', 'AI agency site', 'COGNITRA', or when the user references the AI Automation template."
version: 0.1.0
od:
  mode: prototype
  surface: web
  scenario: design
  preview:
    type: html
    entry: example.html
  design_system:
    requires: false
---

# AI Automation — COGNITRA Landing Page

Produce a premium **AI-agency landing page** for a brand called **COGNITRA** with a dark, video-backed editorial aesthetic. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do **not** rewrite the CSS or invent a new visual language. The seed already encodes the exact font, tokens, scroll-reveal animation, layout, section structure, video sources, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named fonts, colors, padding, video URLs, and animation curves are locked.

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed). It already includes everything inline; videos are remote on a stable CloudFront CDN.
- If the user explicitly asks for a **React + Vite + Tailwind** project, port the seed faithfully: same tokens, same markup structure and section order, `framer-motion` for the FadeUp animation, `lucide-react` for the repost icon, the Helvetica Now Var font. Do not change the design while porting.

## Font (locked)

Import via CSS:
```
@import url('https://db.onlinewebfonts.com/c/e66905e07608167a84e6ad52f638c3c6?family=Helvetica+Now+Var');
```
Apply globally:
```
font-family: 'Helvetica Now Var', 'Helvetica Neue', Helvetica, Arial, sans-serif;
```

## FadeUp animation (framer-motion → vanilla)

The reusable `FadeUp` component maps down to a CSS `.fade` class + one `IntersectionObserver`:
- React props: `children`, `delay` (default 0), `duration` (default 0.7), `y` (default 24), `className`, `style`, `as` (polymorphic div/section/span/h1/h2/h3/p/nav), `once` (default true).
- `initial={{ opacity: 0, y }}` → `.fade { opacity:0; transform:translateY(var(--fy,24px)); }`
- `whileInView={{ opacity: 1, y: 0 }}` → `.fade.in-view { opacity:1; transform:translateY(0); }`
- `viewport={{ once, amount: 0.2 }}` → `IntersectionObserver` with `threshold: 0.2`, `unobserve` on first intersect.
- `transition={{ duration, delay, ease: [0.22, 1, 0.36, 1] }}` → CSS transition with `cubic-bezier(0.22, 1, 0.36, 1)`, per-element `--fd` (duration) and `--fdelay` (delay) custom properties.

Above-the-fold navbar `.fade` elements are revealed on load (`requestAnimationFrame`) so they animate in immediately instead of waiting for scroll.

## Layout structure (z-index order)

A single relative root containing:
- A **fixed full-viewport background video** (z-index 0).
- A **fixed transparent navbar** (z-index 10).
- **Section 1 — Hero** (100vh, z-index 1).
- **Section 2 — Statement** (100vh, z-index 1, transparent over video).
- **Section 3 — Services** (auto height, z-index 2, `#C5C5C5` bg).
- **Fixed scroll indicator** (bottom center, z-index 5).
- **Fixed repost button** (bottom right, z-index 5).

## Fixed background video

`position:fixed; top:0; left:0; width:100%; height:100vh; object-fit:cover; z-index:0`, attributes `autoplay muted loop playsinline`. Source:
`https://plugin-assets.open-design.ai/plugins/ai-automation/hf_20260514_135830_bb6491d1-9b66-4aec-9722-13b4dfe3fb46-350788.mp4`

## Navbar (fixed, transparent)

`position:fixed; top:0; left:0; right:0; z-index:10; background:transparent; border-bottom:1px solid rgba(0,0,0,0.18); display:flex; align-items:center; justify-content:space-between; padding:20px 32px`.
- Left: brand **COGNITRA** — FadeUp delay 0; 13px, weight 700, letter-spacing 0.12em, uppercase, color `#1a1a1a`.
- Center: links `['MAIN','OFFERING','CASE','RATES']` in a flex row gap 48px; each FadeUp delay `0.05 + i*0.05`; 11px, letter-spacing 0.06em, color `#1a1a1a`, weight 400.
- Right (secondary): links `['CREW','CONNECT']` same style, FadeUp delay `0.3 + i*0.05`.
- Hover on all links: opacity 0.6.

## Section 1 — Hero (100vh)

`position:relative; z-index:1; height:100vh`.
- Top overlay div: absolute top/left/right, `height:48%`, `background:#C5C5C5`, flex column, `padding-top:70px`.
- Inner content area: `flex:1; display:flex; align-items:flex-end; padding:0 32px 24px 32px`.
- Hero row: flex, stretch, full width, gap 48px.
  - Left column (`width:32%`, flex column, justify space-between, gap 80px):
    - `<h1>` FadeUp delay 0.1 — `"SCALING\nFASTER USING AI"` — `clamp(26px,3vw,42px)`, weight 700, line-height 1.05, letter-spacing -0.01em, uppercase, color `#1a1a1a` (preserve the line break).
    - Slide counter FadeUp delay 0.5 — `"001 / 005"` — 11px, letter-spacing 0.08em, color `#666`.
  - Right column (`flex:1`, flex column, justify space-between, gap 80px):
    - `<p>` FadeUp delay 0.25 — `"We engineer custom automation flows and personalized AI products for ambitious modern businesses."` — 18px, line-height 1.6, color `#5a5a5a`, max-width 340px.
    - Buttons row (flex, gap 10px) FadeUp delay 0.4:
      - **BOOK A CALL!** primary: bg `#1a1a1a`, color `#fff`, border `1px solid #1a1a1a`, radius 9999px, padding 12px 36px, 11px, weight 500, letter-spacing 0.08em, uppercase.
      - **OUR PRODUCTS** secondary: bg transparent, color `#1a1a1a`, same border/radius/padding/size/weight/spacing; hover bg `#1a1a1a`, color `#fff`.
- Bottom-left text (absolute, `top:74%`, `translateY(-50%)`, `left:32px`, max-width 260px) FadeUp delay 0.6: `"Guiding future-minded companies forward with bespoke AI products and streamlined workflows."` — 14px, line-height 1.65, color `rgba(255,255,255,0.9)`.

## Section 2 — Statement (100vh, transparent over video)

`position:relative; z-index:1; height:100vh; display:flex; flex-direction:column; justify-content:center; padding:70px 32px 32px 32px`.
- Inner div: flex column, align flex-start, max-width 720px, padding 80px 0.
- `<h2>` — `clamp(26px,3vw,42px)`, weight 700, line-height 1.08, letter-spacing -0.01em, uppercase, color `#fff`, `display:flex; flex-wrap:wrap; gap:0.25em`.
  - Text `"WE BUILD END-TO-END AI AUTOMATION SYSTEMS."` split by space; each word a FadeUp span, delay `0.15 + i*0.08`, `y=32`.
- `<p>` FadeUp delay 0.9 — `"We provide all-in-one AI automation services in one place."` — margin-top 24px, 14px, line-height 1.65, color `rgba(255,255,255,0.85)`, max-width 260px.

## Section 3 — Services (gray bg)

`position:relative; z-index:2; background:#C5C5C5; display:flex; flex-direction:column; padding:70px 32px 80px 32px; min-height:auto`.
- Counter: FadeUp delay 0 — `"003 / 005"` — 11px, letter-spacing 0.08em, color `#666`, margin-bottom 20px.
- Head row (flex, gap 48px, align flex-start, margin-bottom 32px):
  - Left col (`width:32%`): `<h2>` `"EXPLORE WHAT WE OFFER"` — `clamp(26px,3vw,42px)`, weight 700, line-height 1.05, letter-spacing -0.01em, uppercase, color `#1a1a1a`, max-width 320px, `display:flex; flex-wrap:wrap; gap:0.25em`. Each word FadeUp span delay `0.1 + i*0.1`, `y=28`.
  - Right col (`flex:1`, padding-top 8px): `<p>` FadeUp delay 0.25 — `"We provide all-in-one AI automation services in one place."` — 14px, line-height 1.65, color `#3a3a3a`, max-width 320px.
- Cards grid (CSS grid, 3 columns 1fr, gap 20px, `grid-auto-rows:1fr`):
  - 3 cards, each FadeUp delay `0.4 + idx*0.15`.
  - Card container: bg transparent, border `1px solid rgba(0,0,0,0.18)`, border-radius 20px, overflow hidden, flex column, padding-top 16px.
  - Video area: `width:100%; aspect-ratio:4/3; position:relative; overflow:hidden`; inner video absolute inset 0, object-fit cover, `autoplay muted loop playsinline`.
  - Text area: padding 24px 28px 28px 28px. `<h3>` 18px, weight 600, color `#1a1a1a`, margin-bottom 14px. `<p>` 13px, line-height 1.6, color `#3a3a3a`.
  - Card data (locked):
    1. video `https://plugin-assets.open-design.ai/plugins/ai-automation/hf_20260513_220333_48163edc-995f-4513-9f44-48dbb07a7329-327964.mp4`, title **"Process Streamlining"**, text "We automate your processes by linking together the daily tools you rely upon. Lifting throughput and improving overall output."
    2. video `https://plugin-assets.open-design.ai/plugins/ai-automation/hf_20260513_221040_e6ba7c5a-864e-46e9-871e-341a176a7e3e-2c404d.mp4`, title **"Strategic advisory"**, text "We craft intelligent assistants that are adaptive, grasp context, and are skilled enough to handle highly intricate customer requests."
    3. video `https://plugin-assets.open-design.ai/plugins/ai-automation/hf_20260513_221104_fb538584-5b87-495f-952e-09ddd5a1792a-7be906.mp4`, title **"Assistant engineering"**, text "Through our knowledge, we explore deep into your business and advise you on how AI powered automations may transform your operations."

## Fixed scroll indicator (bottom center)

`position:fixed; bottom:32px; left:50%; transform:translateX(-50%); z-index:5`. CSS animation `scrollBounce` 2s ease-in-out infinite: `0%,100%{translateY(0)} 50%{translateY(6px)}` (compose with the `translateX(-50%)` so it stays centered). Pill: width 22px, height 36px, border `1.5px solid rgba(0,0,0,0.75)`, border-radius 11px, flex, justify center, padding-top 6px. Inner dot: width 3px, height 8px, background `rgba(0,0,0,0.85)`, border-radius 2px.

## Fixed repost button (bottom right)

`position:fixed; bottom:32px; right:32px; z-index:5; display:flex; align-items:center; gap:6px; color:rgba(0,0,0,0.8); font-size:11px; letter-spacing:0.08em; text-transform:uppercase; cursor:pointer`. Inline SVG share icon (`width:14 height:14 viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`):
```
<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
```
Text: "REPOST".

## Assets

- All four videos (1 hero background + 3 service cards) are **large stable CloudFront media — keep them as remote URLs**; do not inline. There are no avatars or placeholder images in this template, so no data-URI inlining is required. Do not introduce remote avatar hosts (`i.pravatar.cc`, `api.dicebear.com`) — this template has none.

## Responsive breakpoints

`@media (max-width: 900px)`:
- nav padding `16px 18px`; nav-links gap 18px; hide `.nav-links-secondary`.
- hero-row flex-direction column, gap 24px; hero left/right columns `width:100%`, gap 24px.
- section pad `90px 18px 32px 18px`; services pad `90px 18px 60px 18px`.
- services head row column, gap 16px, margin-bottom 24px; head col `width:100%`.
- cards grid 1 column, gap 16px.
- section 3 `min-height:100vh`.
- hero bottom text: `top:auto; bottom:80px; transform:none; left:18px; right:18px; max-width:none`.
- buttons: padding `11px 22px`, font-size 10px.

`@media (max-width: 600px)`:
- nav-links gap 14px; nav-brand font-size 12px.
- hero overlay height 56%, padding-top 64px.
- hero buttons flex-wrap wrap.

## Color rules — hard

Monochrome editorial palette only: ink `#1a1a1a`, gray panel `#C5C5C5`, muted text `#5a5a5a` / `#3a3a3a` / `#666`, white `#fff` over the video. No accent hue — do **not** add blue/purple/teal/gradient brand colors. The contrast comes from the gray panel vs the dark video, not from a colored accent.
