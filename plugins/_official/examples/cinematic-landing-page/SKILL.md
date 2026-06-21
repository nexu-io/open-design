---
name: cinematic-landing-page
description: "Use this plugin when the user wants a premium, GSAP-driven cinematic B2B landing page: a scroll-driven full-screen video slider hero with clip-path ellipse transitions, SplitText char-reveal headlines, a masonry product gallery, scroll-reveal about text, a partner marquee, Lottie-style feature cards, and a multi-office footer. Invoke for 'cinematic landing page', 'video hero landing', 'bakery / food-service landing', 'GSAP scroll site', or when the user references the Cinematic Landing Page template."
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

# Cinematic Landing Page — Bakery Facilities

Produce a single-page, scroll-cinematic B2B landing site for **"Bakery Facilities"**, a premium bakery-solutions company. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy/data and (if asked) port to the React stack; do **not** rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, fonts, layout, sections, and animations described below.

This is the authoritative build brief. Follow it exactly — named colors, fonts, video URLs, breakpoints, and animation params are locked.

## Stack

- Default output: the single self-contained `example.html` seed (vanilla HTML/CSS/JS). It includes everything inline; the only remote refs are the 3 CloudFront hero videos and `picsum.photos` gallery stills (stable CDNs — keep them).
- If the user explicitly asks for the project form, port faithfully to **React 18 + Vite + TypeScript + Tailwind + GSAP (ScrollTrigger + SplitText) + Lottie**. No Framer Motion — all motion is GSAP. Keep the design identical while porting. Map the vanilla ports back to their framework origin:
  - `IntersectionObserver` toggling `.in` → GSAP `ScrollTrigger` with `once: true`.
  - passive `scroll` listener writing inline `clip-path` / `transform` / word opacity → GSAP `useScroll`/`ScrollTrigger scrub`.
  - per-char `setTimeout` reveal → GSAP `SplitText` char stagger (30ms).

## Fonts (Google Fonts)

Import: `https://fonts.googleapis.com/css2?family=Luxurious+Script&family=Manrope:wght@500&family=Open+Sans:wght@300;400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap`

- `font-body`: 'Open Sans' — body, nav, buttons.
- `font-accent`: 'Instrument Serif' — hero h1, section titles, about body (uppercase).
- `font-manrope`: 'Manrope' (500) — labels, card text.
- `font-luxurious`: 'Luxurious Script' — "for Professionals" subtitle + "About us" title.

## Color System (CSS Variables) — locked

```
--background: 0 0% 9%;       --foreground: 0 0% 100%;
--primary: 0 0% 100%;        --primary-foreground: 0 0% 9%;
--secondary: 0 0% 97%;       --muted: 0 0% 20%;
--muted-foreground: 0 0% 75%; --accent: 0 0% 15%;
--border: 0 0% 20%;          --radius: 2px;
--hero-cta-bg: 0 0% 97.3%;   --hero-cta-text: 0 0% 9%;
```

Gold accent **`#CB9D06`** — every hover state (nav links, buttons, footer links, FABs). Border radius base **2px**. Container padding **5%**. No purple/indigo. The gold is the only chromatic accent; everything else is black/white/grey.

## Section 1 — Hero (scroll-driven video slider)

- Wrapper `height: calc(100vh + 300vh)`; inner `position: sticky; top: 0; height: 100vh; overflow: visible`.
- **3 stacked `<video>` slides** (`autoplay loop muted playsinline`, `object-fit: cover`), z-index 1/2/3. Locked URLs:
  - `https://plugin-assets.open-design.ai/plugins/cinematic-landing-page/hf_20260515_113235_88e0d62e-8103-40c1-948e-f0a4f886ffd1-e00afb.mp4`
  - `https://plugin-assets.open-design.ai/plugins/cinematic-landing-page/hf_20260515_114315_ee3663e6-bd79-41b4-9e5b-0fae62827eb9-b97001.mp4`
  - `https://plugin-assets.open-design.ai/plugins/cinematic-landing-page/hf_20260515_114559_dca18b14-90f5-47c4-8a84-3cbae9bd8a0c-62cb47.mp4`
- Transition: `SCROLL_PER_SLIDE_VH = 150`. Per slide compute `localProgress` over its scroll window, ease with cubic in-out `p<0.5 ? 4p³ : 1-((-2p+2)³)/2`, then `clip-path: ellipse(${5+progress*150}% ${8+progress*150}% at 50% 50%)`.
- **H1** "THE SMART BAKERY SOLUTION": desktop `font-accent`, `font-size: 9.7vw`, `line-height: 1`, `white-space: nowrap`, `letter-spacing: -0.04em`, `bottom: -26px`. Mobile `40px`, `line-height 1.1`, wrap, centered, `bottom: 48px`, `px-4`. Animation: GSAP SplitText per char `{opacity:0,y:40}→{opacity:1,y:0}`, 0.8s, 30ms stagger, `power3.out`, autoStart on load.
- **Subtitle** "for Professionals" (Luxurious Script): desktop `3vw`, mobile `12vw`, `absolute inset-x-0 top-0`, `padding-top: calc(80px + 60px)`. Same SplitText params; fires after h1 completes (~600ms).

## Section 1 Navbar (fixed; transparent → black on scroll)

- `fixed top-0 left-0 right-0 z-20 flex items-center px-4 md:px-10`. `scrollY > 50` → `bg-black/90 backdrop-blur-[80px] shadow-md py-2`; else transparent `py-4`.
- Left: region dropdown (Globe + "Hong Kong / Macau"; options Mainland China / Hong Kong-Macau / Taiwan).
- Center: 4-leaf-clover logo SVG (`viewBox 0 0 305 304`, white, the 4 paths from the prompt), `h-[32px] md:h-[48px]` normal, `h-[24px] md:h-[32px]` scrolled, flanked by dropdowns.
  - Left menus: **About Us** (Our History / Food Service Experts / Creating unforgettable culinary experiences), **Partnering With Us** (Sourcing from trusted suppliers / Empowering Customer Operations / Our Experts).
  - Right menus: **Our Products** (Viennese Pastry / Bread / Dessert / Savory / Speciality Pastry / Culinary Aid / Ingredient), **Let's Connect!** (Contact / LinkedIn / WhatsApp / Newsletter / Brochure / Join Us).
- Right: language switch EN / 繁, active = `bg-[#CB9D06] text-white`.
- Dropdown: `bg-white shadow-lg py-2`, items `px-4 py-2.5 text-[13px]`, hover `bg-[#CB9D06] text-white`.
- Mobile: hamburger → full-screen overlay `bg-black/95 backdrop-blur-md`, accordion menus.

## Floating nav (right side, desktop only)

`fixed right-4 md:right-6 top-1/2 -translate-y-1/2 z-50 hidden md:flex flex-col gap-4`. 3 pill buttons (48px, `rounded-full`, `bg-black`, expand on hover): Download icon + "Download Brochure"; LinkedIn SVG (paths from prompt) + "LinkedIn"; MessageCircle + "Chat With Us". Hover `bg-[#CB9D06]`, label slides in via max-width 300ms.

## Section 2 — Product gallery (masonry)

- `bg-white py-8 md:py-16 flex justify-center`; inner `w-[90%] md:w-[65%]`.
- Grid: desktop ≥1000px = 4 cols (row 1: 4 equal; row 2: 3 cards, middle spans 2). Mobile = 2 cols. Aspect ratio 3:4, row gap 40px, item padding 4px.
- 7 items: Viennese Pastry, Bread, Dessert, Savory, Sweet Treats, Culinary Aid, Ingredient (Culinary Aid is the span-2 middle card). Backgrounds `https://picsum.photos/seed/bakery-<seed>/600/800`.
- Entry: ScrollTrigger `start "top 85%"`, `once`; `{opacity:0, y:+120, filter: blur(10px)} → {opacity:1, y:0, blur(0)}`, 0.8s, `power3.out`, 0.05s stagger.
- Hover: CSS `transform: scale(1.2)` on the bg image, `transition: transform 6s cubic-bezier(0.22,0.61,0.36,1)`.
- Labels: `text-left text-black text-sm mt-2 font-manrope font-medium`.

## Section 3 — About (scroll-reveal text)

- `bg-white py-16 md:py-32 flex flex-col items-center justify-center px-6 md:px-[18%]`.
- Title "About us": `font-luxurious text-[32px] text-center text-black mb-[20px]`.
- Body: uppercase `font-accent text-[24px] leading-[36px] md:text-[40px] md:leading-[56px] text-center text-black` (1976 Louis Le Duff founding story copy — swap freely, keep tone/length).
- Scroll reveal (GSAP scrub): container rotation `3deg → 0`; per-word opacity `0.1 → 1` (stagger 0.05); per-word blur `4px → 0`. Triggers tied to section top→bottom crossing the viewport.
- Button "Read more": `px-8 py-3 bg-black text-white font-manrope text-sm tracking-wide hover:bg-[#CB9D06] transition-colors duration-300`.
- Partner marquee (below, `mt-16 md:mt-[140px]`): infinite left scroll, `@keyframes marquee` translateX(0)→translateX(-50%) 60s linear, pause on hover, white gradient fade edges 80px. 12 partners as `font-body text-[14px] tracking-[0.2em] uppercase text-black/40`: Bridor de France, Traiteur de Paris, Panidor, Boncolac, Mademoiselle Desserts, Mountry, Pfalzgraf, Dolceria Alba, St Michel, Poppies Bakeries, Alysse Food, Les Delices du Chef.

## Section 4 — Partnering With Us

- Full-width dark background image with overlay. Title "Partnering With Us": `font-accent uppercase text-[28px] md:text-[40px] leading-[1.4] text-primary`, SplitText chars (same hero params, on view).
- 4 cards `grid-cols-2 md:grid-cols-4 gap-2 md:gap-[8px]`, container `w-[90%] md:w-[64%]`. Each `bg-black px-4 md:px-6 py-6 md:py-8 flex flex-col items-center text-center gap-3 md:gap-4`: a Lottie loop icon (`w-10 h-10 md:w-12 md:h-12`, gold), label `text-primary font-body text-[12px] md:text-[14px] tracking-wide capitalize`. Cards: Trusted Sourcing, Food Safety Standards, Operational Efficiency, Expert Support. Entry: GSAP `y:80→0`, 0.7s, `power3.out`, stagger `i*0.15`, ScrollTrigger `start "top 90%"`, once. (Seed substitutes Lottie with a small SVG that has a subtle scale-pulse keyframe; in the React port use real `lottie-react`.)

## Section 5 — Footer

- `bg-white`. Top (`px-6 md:px-10 lg:px-16 pt-12 md:pt-20 pb-10 md:pb-16`): left phone `+852 2407 8840` (`text-[13px] text-black/40 uppercase tracking-wider`) + email `orders@bakeryfacilities.com` (`text-[14px] font-bold`, hover gold); right "Navigate" column (About Us / Partnering With Us / Our Products / Let's Connect!) + "Social" column (WhatsApp / LinkedIn / Newsletter). Links `text-[15px] text-black font-medium hover:text-[#CB9D06]`.
- Offices row (4 across desktop, stacked mobile): Head Office (Hong Kong), Mainland China (Shanghai), Taiwan (New Taipei City), Macau. Each: region title (12px uppercase tracking-wider black/40), company name (13px semibold), address (12px black/60), phone + email.
- Bottom bar `bg-black px-6 md:px-10 lg:px-16 py-4`: left copyright `text-[12px] text-white/40`, right Privacy Policy + Terms of Service `text-[12px] text-white/40 hover:text-white`.

## SplitText / global CSS

SplitText config `type: chars, smartWrap: true, charsClass: "split-char font-accent"`, char stagger 30ms. Global:
```
.split-char { padding-top: 0 !important; padding-bottom: 0 !important; line-height: 1 !important; }
```

## Tailwind specifics

Border radius 2px base; container padding 5%; custom keyframe `marquee` (translateX(0) → translateX(-50%), 60s linear infinite); `tailwindcss-animate` plugin.

## Responsive breakpoints

Mobile-first. `md:` = 768px, `lg:` = 1024px. Gallery columns: 1 (<400px), 2 (400–1000px), 4 (≥1000px). Hero h1 switches to the 40px mobile treatment, subtitle to 12vw, floating nav hides, navbar collapses to hamburger at ≤767px.

## Hard rules

- All motion is **GSAP** (ScrollTrigger + SplitText) + **Lottie** — never Framer Motion.
- Gold `#CB9D06` is the only accent; no purple/indigo/teal/green substitutes.
- Keep the 3 CloudFront hero video URLs and the `picsum.photos` gallery stills exactly; do not swap to other hosts.
- Do not use remote avatar hosts (`i.pravatar.cc`, dicebear, etc.) — they 403 in the sandbox. Any generated decoration is an inline SVG data URI.
- Start from `example.html`; only swap copy/data and (if requested) port to React. Do not redesign.
