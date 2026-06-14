---
name: evergreen-finance
description: "Use this plugin when the user wants a premium 'Kova' fintech / banking landing page: a full-screen hero with a boomerang (forward/reverse) video background, animated FadeUp reveals, floating dashboard cards (savings line chart, spend bar charts), a split testimonial section with a square autoplay video, and a 4-up features grid with image cards and a donut spend chart. Invoke for 'fintech landing', 'banking app landing', 'Kova', 'finance hero with video', or when the user references the Evergreen Finance template."
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

# Evergreen Finance — Kova Fintech Landing

Produce a premium **"Kova" fintech landing page**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, fonts, colors, three sections, dashboard cards, donut chart, and animations described below.

This is the authoritative build brief. Follow it exactly — the named colors, fonts, video URLs, and animation curves are locked. **Do NOT use purple/indigo colors anywhere.**

## Stack

- Default output: the single self-contained `example.html` seed (vanilla HTML/CSS/JS). It already includes everything inline.
- If the user explicitly asks for a **React + TypeScript + Vite + Tailwind + Framer Motion** project, port the seed faithfully: same tokens, same markup structure, same section order. Use `lucide-react` for icons and `framer-motion` for the FadeUp reveals. Do not change the design while porting.
- **Motion loading (locked).** If you emit a single self-contained inline-JSX file instead of the Vite project, Motion's React hooks (`useScroll`, `useTransform`, `useAnimationFrame`, …) exist only in the **React** UMD build: load `<script src="https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js"></script>` and read them off `window.Motion` — never the vanilla `https://unpkg.com/motion@.../dist/motion.js` DOM bundle, which lacks `useScroll` and renders a blank page. (The Vite project imports from npm and is unaffected.)
- Dependencies for the React port: `framer-motion ^12.38.0`, `lucide-react ^0.344.0`, `react ^18.3.1`, `react-dom ^18.3.1`; dev: Vite, Tailwind CSS 3, TypeScript, PostCSS, Autoprefixer.

## Fonts (locked)

Load both Cooper BT W01 faces via `<link>` in the head:

- `https://db.onlinewebfonts.com/c/53077f9a3eee9c479d37d6af20394ded?family=Cooper+BT+W01+Light`
- `https://db.onlinewebfonts.com/c/5ade3423145f3b9f7031574333ca0b73?family=Cooper+BT+W01+Medium`

Utility classes:

```
.font-cooper { font-family: 'Cooper BT W01 Light', 'Georgia', serif; }
.font-cooper-medium { font-family: 'Cooper BT W01 Medium', 'Cooper BT W01 Light', 'Georgia', serif; font-weight: 500; }
```

Body text uses a neutral sans (Inter / system-ui).

## Color Palette (locked)

```
--dark-green:  #08150C   (primary dark green, buttons, brand)
--hover-green: #1a2e1f   (button hover)
--cream:       #FDF5EB   (warm cream — sections 2 & 3 background)
--beige-card:  #EBE4DC   (Spend Insights card)
--beige-inner: #F4F1EC   (inner container of Spend Insights)
```

Donut chart colors: `#C46B2D`, `#7A8C3E`, `#A8B87A`, `#B8AFA4`.
Body/text: stone-600/700/800. Accent greens: emerald-400/500 for the savings chart. Hero is white (video fills it); the lower two sections are `#FDF5EB`. **No purple/indigo.**

## Animations — FadeUp (locked)

A reusable reveal with two modes:

- `hidden`: `opacity: 0; translateY(24px); filter: blur(8px)`.
- `visible`: `opacity: 1; translateY(0); filter: blur(0)`.
- Transition: `duration 0.7s, ease cubic-bezier(0.25,0.1,0.25,1)`, per-element `delay`.
- **immediate** mode (Hero elements): fire on mount.
- **scroll-triggered** mode (Testimonial + Features): fire when entering the viewport, once, with a `-60px` margin.

Vanilla seed mapping: `immediate` → `setTimeout` on load; scroll-triggered → `IntersectionObserver` toggling a `.visible` class. In the React port use Framer Motion `animate="visible"` (immediate) and `whileInView="visible"` with `viewport={{ once: true, margin: '-60px' }}`.

## Section 1 — Hero (full viewport, `min-h-screen overflow-hidden`)

White background. `hero-inner` is `flex-1 flex flex-col justify-between` so the dashboard cards sit at the bottom.

### Boomerang video background (locked)
`<BoomerangVideoBg>` wrapped in `absolute inset-0 w-full h-full scale-[1.08] origin-center`:
- Loads (muted, playsInline, crossOrigin="anonymous"): `https://plugin-assets.open-design.ai/plugins/evergreen-finance/hf_20260517_070729_32a7eb4e-d6e2-4571-badc-91b4dab1ecbe-2db9b1.mp4`
- Captures every frame into offscreen canvases (max width 960px) while the video plays once, via `requestVideoFrameCallback` (with `requestAnimationFrame` fallback).
- After `ended`, swaps the `<video>` for a visible `<canvas>` and plays the captured frames forward/reverse (boomerang) at 30fps. The `scale-[1.08]` hides edge gaps.
- If frame capture fails (cross-origin taint), it gracefully keeps showing the looping `<video>` — keep this fallback.

### Navbar (FadeUp immediate, delay 0)
- Flex row, `justify-between`, padding `px-5 sm:px-10 lg:px-16 py-5`.
- Left: brand "Kova" in `font-cooper text-xl sm:text-2xl text-[#08150C] tracking-tight`.
- Center (`hidden md:flex`): links "Explore", "Pricing" (active, with a `h-0.5 bg-[#08150C] rounded-full` underline bar `-bottom-1`), "Perks", "Reach" — `text-sm text-stone-700`, hover `text-[#08150C]`; active is `font-medium text-[#08150C]`.
- Right desktop: "Get Started" — `bg-[#08150C] text-white text-sm font-medium px-5 py-2.5 rounded-xl hover:bg-[#1a2e1f]`.
- Right mobile: hamburger (Lucide `Menu`/`X`, size 22) toggling a `bg-white/95 backdrop-blur-md shadow-lg` dropdown with the same links + button.

### Hero content (centered, `flex-col items-center text-center`, `px-5 sm:px-10 pt-8 sm:pt-14 pb-8 sm:pb-14`)
- Heading (FadeUp immediate, delay 0.1): `font-cooper text-[2.2rem] sm:text-5xl md:text-6xl lg:text-7xl text-[#08150C] leading-tight max-w-5xl tracking-tight` — "Own your money and build the wealth you deserve".
- Subtext (delay 0.25): `mt-4 sm:mt-5 text-sm sm:text-base text-stone-600 max-w-sm sm:max-w-md leading-relaxed` — "Step into a smarter way to bank, right from your pocket. Kova gives you instant control over your money, wherever you are."
- CTAs (delay 0.4), `flex-col sm:flex-row gap-3`:
  - "Watch 30s Demo" — `white/80 backdrop-blur`, border stone-200, Lucide `Play` (size 14, fill stone-800), `rounded-xl`.
  - "Get the App" — `bg-[#08150C] text-white`, Lucide `Download` (size 14), `rounded-xl`.

### Dashboard cards (bottom of hero, FadeUp immediate)
Flex row `items-end justify-center gap-2 sm:gap-4`; the two outer cards are `hidden sm:block`. All cards `bg-white/95 backdrop-blur rounded-2xl` with a soft shadow.
- **SavingsCard** (delay 0.55, `w-44 sm:w-64`): "Savings" label + "+25%" and "+12%" green badges; an SVG line chart (green polyline `#10b981` + gradient fill); month labels Jan–Apr.
- **OthersCard** (delay 0.65, `w-44 sm:w-72`): "Others" header + "Monthly" dropdown pill; three stats (78% Groceries, 43% Entertain., 23% Transport); bar chart of **12 bars**, the **5th bar orange `#f97316`**, rest gray `#d1d5db`.
- **BillPayCard** (delay 0.75, `w-44 sm:w-64`): "Bill Pay" header + "Monthly" dropdown pill; "-8%" red badge; bar chart of **12 bars**, the **7th bar dark `#08150C`**, rest light gray `#e5e7eb`; month labels.

## Section 2 — Testimonial

`bg-[#FDF5EB] py-14 sm:py-20 px-5 sm:px-10 lg:px-20`. Inner: `max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-[3fr_2fr] gap-10 md:gap-16 items-center`.

Left column (scroll FadeUp, staggered delays 0 → 0.4):
- Heading (0): `font-cooper-medium text-2xl sm:text-3xl text-[#08150C] leading-snug mb-6 sm:mb-8` — "Trusted by ambitious, fast-moving teams".
- Company badge (0.1): `w-7 h-7 rounded-md bg-[#08150C]` square with "A" + "Arcvex".
- Quote (0.2): `font-cooper text-stone-700 text-lg sm:text-xl md:text-2xl leading-relaxed mb-5 sm:mb-6` — "With Kova, I have full visibility into our team's spending in real time. It feels like having a sharp financial advisor available at every hour, helping us stay on budget and make wiser calls."
- Attribution (0.3): "Maya Reeves" (`text-sm font-semibold`) + "Director, Arcvex" (`text-xs text-stone-500`).
- Button (0.4): "All Stories" + arrow icon, dark button style.

Right column (FadeUp delay 0.15): a looping muted autoplay video `https://plugin-assets.open-design.ai/plugins/evergreen-finance/hf_20260517_074029_c7a854bd-2d6e-4b62-96b3-ae8c16311e44-59f9be.mp4`, styled `w-full rounded-2xl object-cover aspect-square` inside `max-w-xs sm:max-w-sm`.

## Section 3 — Features

`bg-[#FDF5EB] py-14 sm:py-20 px-5 sm:px-10 lg:px-20`. Inner `max-w-7xl mx-auto`.

Header row (scroll-animated):
- Heading (FadeUp 0): `font-cooper-medium text-2xl sm:text-3xl md:text-4xl text-[#08150C] leading-snug` — "Designed to sharpen every decision".
- Button (0.1): "Watch Demo" + Lucide `Play` (size 13, fill white), dark button style.

Cards grid: `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4`. Each card `aspect-[3/4] rounded-2xl overflow-hidden`, scroll FadeUp with staggered delays 0.05 / 0.15 / 0.25 / 0.35.

- **Card 1 — Smart Budgeting** (0.05): absolute object-cover bg image; gradient overlay `bg-gradient-to-t from-[#08150C]/80 via-[#08150C]/20 to-transparent`; top label Lucide `Sparkles` (16, white) + "Smart Budgeting"; bottom text "Let AI reshape how you plan your spending. Kova adapts to your…" (`text-white/80`).
  - Image: `https://plugin-assets.open-design.ai/plugins/evergreen-finance/hf_20260517_061249_f20dfeda-1033-45ce-a3ee-070965599cbf-6c6b7e.webp&w=1280&q=85`
- **Card 2 — Bank-Grade Security** (0.15): same overlay; Lucide `ShieldCheck` (16, white) + "Bank-Grade Security"; bottom text "Keep your money safe with end-to-end encryption, live fraud alerts, and two-factor auth…".
  - Image: `https://plugin-assets.open-design.ai/plugins/evergreen-finance/hf_20260517_061305_db631f5f-185f-4fda-a7a8-1dd7359ef2ea-4b7cdd.webp&w=1280&q=85`
- **Card 3 — Spend Insights** (0.25): **no bg image**. Solid `#EBE4DC`, `p-5`. Top label Lucide `PieChart` (16, `text-stone-700`) + "Spend Insights". Inner `rounded-2xl p-4` `#F4F1EC` centered: "Monthly Spend" + "1 Apr – 30 May 2026", then a donut SVG (`viewBox="0 0 36 36"`, `-rotate-90`, four circles r=14 strokeWidth=5) with arcs: `#C46B2D` (26.4/61.56, offset 0), `#7A8C3E` (22/65.96, offset -26.4), `#A8B87A` (17.6/70.36, offset -48.4), `#B8AFA4` (22/65.96, offset -66); center overlay "50%" bold + "of budget".
- **Card 4 — Wealth Building** (0.35): same overlay; Lucide `TrendingUp` (16, white) + "Wealth Building"; bottom text "Grow your net worth with tools that help you set targets, monitor gains, and act…".
  - Image: `https://plugin-assets.open-design.ai/plugins/evergreen-finance/hf_20260517_061316_50e651f8-02d0-4add-9ddb-7d81d15ac02e-24edde.webp&w=1280&q=85`

## Assets — keep remote (do not inline)

All hero/testimonial videos live on `d8j0ntlcm91z4.cloudfront.net` and the feature stills on `images.higgs.ai` — large, stable CDNs. **Keep these as remote URLs**; do not inline them. There are **no avatar images** in this template (Arcvex is a CSS square badge with the letter "A"), so there is no remote-avatar pitfall to avoid here. If you later add real avatars, prefer inline `data:` URIs over remote avatar hosts.

## Global CSS

```
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; overflow-x: hidden; }
```
Plus the two `.font-cooper*` utilities above.

## Responsive behavior

- Mobile-first. Feature cards: 1 col, 2 at `sm`, 4 at `lg`.
- Hero dashboard cards: the two outer cards `hidden` below `sm`.
- Nav links + CTA `hidden` below `md`, replaced by the hamburger menu.
- Text sizes step up at `sm` and `md`.
- Testimonial grid: single column on mobile, `3fr 2fr` at `md`.

## Hard rules

- Buttons use `rounded-xl` (not full pill).
- Hero is `min-h-screen overflow-hidden` with **no page scroll**; `hero-inner` uses `flex-1 flex flex-col justify-between` to push the cards down.
- Boomerang background must use `scale-[1.08]` to avoid edge gaps.
- **No purple/indigo anywhere.** The dark green `#08150C` and warm cream `#FDF5EB` are locked.
