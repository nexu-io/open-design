---
name: 3d-creator-portfolio
description: "Use this plugin when the user wants a dark, premium 3D-creator / designer portfolio landing page: a full-viewport hero with a gradient-text headline and a mouse-following magnetic 3D portrait, a scroll-driven horizontal image marquee, an About section with corner 3D decorations and character-by-character scroll-reveal text, a white Services list, and sticky-stacking project cards. Invoke for '3D creator portfolio', 'designer landing page', 'creative portfolio with magnetic hero', or when the user references the Jack 3D Creator template."
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

# Jack — 3D Creator Portfolio

Produce a dark, premium **3D-creator portfolio landing page**. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, gradient text, magnetic-hover portrait, scroll marquee, char-reveal text, sticky-stacking cards, and responsive behavior described below.

This is the authoritative build brief. Follow it exactly — the named colors, gradients, fonts, sizes, image URLs, and animations are locked.

**Inlined images (critical):** `example.html` ships the hero portrait and the four About-section 3D decorations as **inlined `data:image/webp;base64,…` URIs** — keep those exactly as they are. Do **not** swap them back for the original `shrug-person-78902957.figma.site/...` URLs: that host rate-limits / 403s inside the preview sandbox and renders as broken images. When you copy the seed, the inlined images come with it; only replace one if the user supplies their own asset, and prefer a data URI over a remote URL. The 21 motionsites marquee GIFs and the 9 higgs/cloudfront project images stay as remote URLs (large stable CDNs).

## Stack

- Default output: a single self-contained HTML file (the `example.html` seed) using vanilla CSS + JS. It already includes everything inline.
- If the user explicitly asks for the React project: port the seed faithfully to **React 18 + TypeScript + Vite + Tailwind CSS + Framer Motion + lucide-react**. Same tokens, same markup structure, same animations. Section order: `HeroSection → MarqueeSection → AboutSection → ServicesSection → ProjectsSection → ContactSection (footer)`. Do not change the design while porting.
- **Motion loading (locked).** If you emit a single self-contained inline-JSX file instead of the Vite project, Motion's React hooks (`useScroll`, `useTransform`, `useAnimationFrame`, …) exist only in the **React** UMD build: load `<script src="https://unpkg.com/framer-motion@11.11.13/dist/framer-motion.js"></script>` and read them off `window.Motion` — never the vanilla `https://unpkg.com/motion@.../dist/motion.js` DOM bundle, which lacks `useScroll` and renders a blank page. (The Vite project imports from npm and is unaffected.)

## Global styles — locked

- Background `#0C0C0C` on `html, body, #root`, and the main wrapper.
- Font: **Kanit** (Google Fonts, weights 300–900), `'Kanit', sans-serif`.
- Page title: `Jack — 3D Creator`.
- Global reset: `box-sizing: border-box; margin: 0; padding: 0`.
- Main wrapper: `overflow-x: clip`.
- `.hero-heading` gradient text: `background: linear-gradient(180deg, #646973 0%, #BBCCD7 100%)` with `-webkit-background-clip: text` and `-webkit-text-fill-color: transparent`.

## 1. Hero Section (`h-screen`, flex column, `overflow-x: clip`)

- **Navbar:** flex `justify-between`, 4 links — "About", "Price", "Projects", "Contact". Color `#D7E2EA`, font-medium, uppercase, `tracking-wider`. Sizes `text-sm md:text-lg lg:text-[1.4rem]`. Padding `px-6 md:px-10 pt-6 md:pt-8`. Hover: opacity 70%, 200ms. The four links map to anchors that must ALL resolve: "About" → `#about`, "Price" → the Services section (`id="price"`), "Projects" → `#projects`, "Contact" → the Contact footer (`id="contact"`). No dead anchors.
- **Hero heading:** massive `<h1>` "Hi, i'm jack" (lowercase "i", curly apostrophe `&apos;`). `.hero-heading` gradient, font-black, uppercase, tracking-tight, leading-none, whitespace-nowrap, `w-full`. Sizes `text-[14vw] sm:text-[15vw] md:text-[16vw] lg:text-[17.5vw]`. Margin top `mt-6 sm:mt-4 md:-mt-5`. Wrapped in an `overflow-hidden` container.
- **Bottom bar:** flex `justify-between items-end`, `pb-7 sm:pb-8 md:pb-10`.
  - Left: paragraph "a 3d creator driven by crafting striking and unforgettable projects", color `#D7E2EA`, font-light, uppercase, tracking-wide, leading-snug, `font-size: clamp(0.75rem, 1.4vw, 1.5rem)`, `max-w-[160px] sm:max-w-[220px] md:max-w-[260px]`.
  - Right: **ContactButton** (see Reusable components).
- **Hero portrait:** centered, wrapped in a **Magnet** component (mouse-following). Image is the inlined portrait `data:` URI (originally `Rectangle_40443.81459862.png`). Magnet: `padding 150, strength 3, activeTransition "transform 0.3s ease-out", inactiveTransition "transform 0.6s ease-in-out"`. Positioning `absolute left-1/2 -translate-x-1/2 z-10`. Width `w-[280px] sm:w-[360px] md:w-[440px] lg:w-[520px]`. On mobile: `top-1/2 -translate-y-1/2`; on `sm+`: `sm:top-auto sm:translate-y-0 sm:bottom-0`.
- **FadeIn delays:** Navbar `delay 0, y -20`. Heading `delay 0.15, y 40`. Left text `delay 0.35, y 20`. Contact button `delay 0.5, y 20`. Portrait `delay 0.6, y 30`.

## 2. Marquee Section

Two rows of images that scroll horizontally based on page scroll position. Background `#0C0C0C`. Padding `pt-24 sm:pt-32 md:pt-40 pb-10`.

- 21 GIFs from `motionsites.ai/assets/...` (exact URLs in the seed — keep them).
- **Row 1:** first 11 images, tripled for seamless scroll. Moves RIGHT: `translateX(offset - 200)`.
- **Row 2:** remaining 10 images, tripled. Moves LEFT: `translateX(-(offset - 200))`.
- Scroll offset: `(window.scrollY - sectionTop + window.innerHeight) * 0.3`.
- Each tile: 420×270px, `rounded-2xl`, `object-cover`, lazy-loaded. Gap `gap-3` between tiles and between rows.
- `will-change: transform`; scroll listener is **passive**.

## 3. About Section (`min-h-screen`, centered, `px-5 sm:px-8 md:px-10 py-20`)

Four decorative 3D images positioned absolutely in corners (all inlined `data:` URIs in the seed):

- **Top-left** — moon icon (`moon_icon.11395d36.png`): `w-[120px] sm:w-[160px] md:w-[210px]`, `top-[4%] left-[1%] sm:left-[2%] md:left-[4%]`. FadeIn `delay 0.1, x -80, dur 0.9`.
- **Bottom-left** — 3D object (`p59_1.4659672e.png`): `w-[100px] sm:w-[140px] md:w-[180px]`, `bottom-[8%] left-[3%] sm:left-[6%] md:left-[10%]`. FadeIn `delay 0.25, x -80, dur 0.9`.
- **Top-right** — lego icon (`lego_icon-1.703bb594.png`): `w-[120px] sm:w-[160px] md:w-[210px]`, `top-[4%] right-[1%] sm:right-[2%] md:right-[4%]`. FadeIn `delay 0.15, x 80, dur 0.9`.
- **Bottom-right** — 3D group (`Group_134-1.2e04f3ce.png`): `w-[130px] sm:w-[170px] md:w-[220px]`, `bottom-[8%] right-[3%] sm:right-[6%] md:right-[10%]`. FadeIn `delay 0.3, x 80, dur 0.9`.

- **Heading:** "About me", `.hero-heading` gradient, font-black, uppercase, leading-none, tracking-tight, centered, `font-size: clamp(3rem, 12vw, 160px)`. FadeIn `delay 0, y 40`.
- **Animated paragraph (AnimatedText):** char-by-char scroll-driven opacity (0.2 → 1) based on scroll progress, offset `['start 0.8', 'end 0.2']`. Text: "With more than five years of experience in design, i focus on branding, web design, and user experience, i truly enjoy working with businesses that aim to stand out and present their best image. Let's build something incredible together!" Color `#D7E2EA`, font-medium, centered, leading-relaxed, `max-w-[560px]`, `font-size: clamp(1rem, 2vw, 1.35rem)`.
- **ContactButton** below the text. Gap heading→text `gap-10 sm:gap-14 md:gap-16`; gap text→button `gap-16 sm:gap-20 md:gap-24`.

## 4. Services Section (white `#FFFFFF`, `rounded-t-[40px] sm:rounded-t-[50px] md:rounded-t-[60px]`)

Padding `px-5 sm:px-8 md:px-10 py-20 sm:py-24 md:py-32`.

- **Heading:** "Services" in `#0C0C0C`, font-black, uppercase, centered, `font-size: clamp(3rem, 12vw, 160px)`, `mb-16 sm:mb-20 md:mb-28`.
- 5 items, vertical list, `max-w-5xl`, centered. Each: number (font-black, `clamp(3rem, 10vw, 140px)`, `#0C0C0C`) on the left + name & description stacked on the right. Name: font-medium, uppercase, `clamp(1rem, 2.2vw, 2.1rem)`. Description: font-light, leading-relaxed, `max-w-2xl`, `clamp(0.85rem, 1.6vw, 1.25rem)`, opacity 0.6. 1px borders `rgba(12,12,12,0.15)`. Padding `py-8 sm:py-10 md:py-12`. Staggered FadeIn: each item `delay = i * 0.1`.
  - `01 — 3D Modeling`: "Creation of detailed objects, characters, or environments tailored to specific client needs, ideal for games, products, and visualizations."
  - `02 — Rendering`: "High-quality, photorealistic renders that showcase designs with custom lighting, textures, and materials to bring concepts to life."
  - `03 — Motion Design`: "Dynamic animations and motion graphics that add energy and storytelling to brands, products, and digital experiences."
  - `04 — Branding`: "Crafting cohesive visual identities — from logos to full brand systems — that communicate a clear and memorable presence."
  - `05 — Web Design`: "Designing clean, modern, and conversion-focused websites with attention to layout, typography, and user experience."

## 5. Projects Section (dark `#0C0C0C`, `rounded-t-[40px] sm:rounded-t-[50px] md:rounded-t-[60px]`, `-mt-10 sm:-mt-12 md:-mt-14`, `z-10`)

- **Heading:** "Project" (singular), `.hero-heading` gradient, same styling as other headings.
- **3 sticky-stacking project cards** that scale down as you scroll past them (Framer Motion `useScroll` + `useTransform`). Each card is `sticky top-24 md:top-32` inside an `h-[85vh]` container.
- Scale: `targetScale = 1 - (totalCards - 1 - index) * 0.03`. Each card offset `top: ${index * 28}px`.
- Card: `rounded-[40px] sm:rounded-[50px] md:rounded-[60px]`, `border-2 border-[#D7E2EA]`, background `#0C0C0C`, padding `p-4 sm:p-6 md:p-8`.
  - **Top row:** number (huge, same style as services), category label, project name, and a **LiveProjectButton** ("Live Project" ghost pill).
  - **Bottom row:** two-column image grid — left column (40%) has 2 stacked images, right column (60%) has 1 tall image. All `rounded-[40px] sm:rounded-[50px] md:rounded-[60px]`. Left-top height `clamp(130px, 16vw, 230px)`; left-bottom height `clamp(160px, 22vw, 340px)`.
- Project data (higgs/cloudfront URLs are in the seed — keep them):
  - `01 — Nextlevel Studio` (Client)
  - `02 — Aura Brand Identity` (Personal)
  - `03 — Solaris Digital` (Client)

## 6. Contact Section (footer)

A closing `<footer id="contact">` so the navbar's **Contact** link resolves to a real target. Dark background `#0C0C0C`, centered column, generous padding (e.g. `80px 24px 120px`, `gap` ~32px). Contains a large gradient headline using `.hero-heading` (e.g. "Let's talk") and a **ContactButton** ("Contact Me"). Keep it minimal — its job is to be a real, scrollable anchor target consistent with the bundled `example.html`.

## Reusable Components

- **ContactButton:** rounded-full pill. Background `linear-gradient(123deg, #18011F 7%, #B600A8 37%, #7621B0 72%, #BE4C00 100%)`. Box-shadow `0px 4px 4px rgba(181,1,167,0.25), 4px 4px 12px #7721B1 inset`. White 2px outline with `-3px` offset. Text: white, font-medium, uppercase, tracking-widest. Sizes `px-8 py-3 sm:px-10 sm:py-3.5 md:px-12 md:py-4`, `text-xs sm:text-sm md:text-base`. Label "Contact Me".
- **LiveProjectButton:** ghost/outline pill. Rounded-full, `border-2 border-[#D7E2EA]`, text `#D7E2EA`, font-medium, uppercase, tracking-widest. Sizes `px-8 py-3 sm:px-10 sm:py-3.5`, `text-sm sm:text-base`. Hover `bg-[#D7E2EA]/10`. Label "Live Project".
- **FadeIn:** Framer Motion wrapper, `whileInView` with `viewport={{ once: true, margin: "50px", amount: 0 }}`. Props: `delay`, `duration` (default 0.7), `x` (default 0), `y` (default 30). Easing `[0.25, 0.1, 0.25, 1]`. Use `motion.create()` for dynamic element types. (In the vanilla seed this is an `IntersectionObserver` + CSS transition.)
- **Magnet:** mouse-following magnetic hover. Track mouse position relative to element center; apply `translate3d` divided by `strength`. Activates when cursor is within `padding` distance of the element edge. Transition-in `0.3s ease-out`, out `0.6s ease-in-out`. `will-change: transform`.
- **AnimatedText:** char-by-char scroll reveal. Each character goes opacity 0.2 → 1 based on its position relative to scroll progress. Framer Motion `useScroll` on the paragraph, offset `['start 0.8', 'end 0.2']`. Each char uses an invisible placeholder + an absolutely-positioned animated span. (In the seed, a scroll listener lights up character spans progressively.)

## Key Dependencies (React port)

`react`, `react-dom` (^18.3.1), `framer-motion` (^12.38.0), `lucide-react` (^0.344.0), `tailwindcss` (^3.4.1), `vite`, `typescript`.

## Responsive

Tailwind default breakpoints (sm 640, md 768, lg 1024), mobile-first. Heavy use of `clamp()` for fluid typography. The design must scale gracefully from mobile to ultra-wide.

## Color Rules — hard

Dark theme anchored on `#0C0C0C` background and `#D7E2EA` foreground text. Hero/heading gradient `#646973 → #BBCCD7` is locked. ContactButton multi-stop gradient (`#18011F → #B600A8 → #7621B0 → #BE4C00`) is locked — do not flatten it to a single color. Services section is the only light (`#FFFFFF`) block.
