---
name: liquid-glass-agency
description: "Use this plugin when the user wants a dark, luxury single-page landing for an AI web-design agency: cinematic video backgrounds, editorial Instrument Serif italic headings, liquid-glass (glassmorphism) cards and CTAs, BlurText word-by-word reveals, and section-by-section storytelling. Invoke for 'liquid glass agency', 'glass landing page', 'AI agency site', or when the user references the Liquid Glass Agency template."
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

# Liquid Glass Agency — Cinematic AI Web-Design Landing

Produce a dark, premium, single-page landing page for an AI-powered web-design agency with a luxury editorial aesthetic: black backgrounds, white text, **liquid glass (glassmorphism)** effects, and cinematic video backgrounds. A complete, rendered reference implementation ships beside this skill at `example.html` — **start from it**. Copy `example.html`, then adjust copy and data; do not rewrite the CSS or invent a new visual language. The seed already encodes the exact tokens, glass utilities, section layout, video wiring, and reveal animations described below.

This is the authoritative build brief. Follow it exactly — the named CSS variables, fonts, media URLs, and animation patterns are locked.

**Assets (critical):** `example.html` ships the logo, hero poster, and the two feature-preview images as **inlined `data:image/svg+xml;base64,…` URIs** — keep those exactly as they are when you copy the seed. The large **CloudFront `.mp4`** background video and the **Mux HLS `.m3u8`** section videos are intentionally kept as **remote CDN URLs** — do not inline multi-MB video. Do NOT swap any inlined data URI for a remote avatar/image host (`i.pravatar.cc`, `api.dicebear.com`, `figma.site`, etc.): remote image hosts rate-limit / 403 inside the preview sandbox and render broken. Only replace an inlined asset if the user supplies a real image, and prefer a data URI.

## Stack

- Default output: the single self-contained `example.html` seed (vanilla HTML/CSS/JS). It already includes everything inline.
- If the user explicitly asks for a React + Vite + Tailwind + shadcn/ui + Framer Motion (`motion/react`) project, port the seed faithfully: same tokens, same section structure, `lucide-react` for icons, Instrument Serif + Barlow from Google Fonts. Do not change the design while porting. Key deps for the React port: `motion ^12.35.0`, `hls.js ^1.6.15` (for the Mux HLS section videos), `lucide-react ^0.462.0`, `react-router-dom ^6.30.1`.

## Fonts

Load from Google Fonts:
`https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Barlow:wght@300;400;500;600&display=swap`

- Headings: **Instrument Serif, italic** → `.font-heading` (`font-family:'Instrument Serif',serif; font-style:italic`).
- Body: **Barlow** (weights 300, 400, 500, 600) → `.font-body`. Body default weight is 300.

In a Tailwind port, extend `fontFamily`: `heading: ["'Instrument Serif'","serif"]`, `body: ["'Barlow'","sans-serif"]`.

## Color Theme — locked (CSS custom properties, HSL triplets)

```
:root {
  --background: 213 45% 67%;
  --foreground: 0 0% 100%;
  --card: 213 45% 62%;
  --card-foreground: 0 0% 100%;
  --primary: 0 0% 100%;
  --primary-foreground: 213 45% 67%;
  --secondary: 213 45% 72%;
  --secondary-foreground: 0 0% 100%;
  --muted: 213 35% 60%;
  --muted-foreground: 0 0% 100% / 0.7;
  --accent: 213 45% 72%;
  --accent-foreground: 0 0% 100%;
  --destructive: 0 84.2% 60.2%;
  --border: 0 0% 100% / 0.2;
  --input: 0 0% 100% / 0.2;
  --ring: 0 0% 100% / 0.3;
  --radius: 9999px;
  --glass-bg: rgba(255, 255, 255, 0.12);
  --glass-border: rgba(255, 255, 255, 0.25);
  --glass-shadow: 0 4px 30px rgba(0, 0, 0, 0.08);
  --glass-blur: 16px;
}
```

The page `body` background is **pure black `#000`**; the desaturated-blue `--background` triplet shows through the cinematic video and glass surfaces. White text everywhere; muted text uses `rgba(255,255,255,0.6)` / `0.7`. `--radius: 9999px` ⇒ pills/round buttons by default.

## Liquid Glass CSS (the core visual effect) — locked

Two utility classes, defined under `@layer components` in a Tailwind build (inline `<style>` in the seed):

- `.liquid-glass` (subtle): `background: rgba(255,255,255,0.01); background-blend-mode: luminosity; backdrop-filter: blur(4px); border:none; box-shadow: inset 0 1px 1px rgba(255,255,255,0.1); position:relative; overflow:hidden;`
- `.liquid-glass-strong` (prominent, for CTA buttons): same recipe but `backdrop-filter: blur(50px)` and `box-shadow: 4px 4px 4px rgba(0,0,0,0.05), inset 0 1px 1px rgba(255,255,255,0.15);`

Both get a `::before` pseudo-element that paints a **thin glowing gradient border** via the `mask-composite` trick: `inset:0; border-radius:inherit; padding:1.4px;` with a vertical `linear-gradient(180deg, …)` that is bright (`rgba(255,255,255,0.45/0.5)`) at top and bottom and transparent in the middle, masked with `-webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0); -webkit-mask-composite: xor; mask-composite: exclude; pointer-events:none;`. Keep these recipes byte-for-byte.

## Assets & Media URLs — locked

- Hero background video (CloudFront MP4, kept remote): `https://plugin-assets.open-design.ai/plugins/liquid-glass-agency/hf_20260307_083826_e938b29f-a43a-41ec-a153-3d4730578ab8-b7258e.mp4`
- Hero poster: inlined `data:image/svg+xml` in the seed (desaturated-blue atmospheric still). In a fuller React build the original was `/images/hero_bg.jpeg`.
- StartSection video (Mux HLS): `https://stream.mux.com/9JXDljEVWYwWu01PUkAemafDugK89o01BR6zqJ3aS9u00A.m3u8`
- Stats section video (Mux HLS, rendered **desaturated** `filter: saturate(0)`): `https://stream.mux.com/NcU3HlHeF7CUL86azTTzpy3Tlb00d6iF3BmCdFslMJYM.m3u8`
- CTA/Footer video (Mux HLS): `https://stream.mux.com/8wrHPCX2dC3msyYU9ObwqNdm00u3ViXvOSHUMRYSEe5Q.m3u8`
- Feature GIFs (originals): `https://plugin-assets.open-design.ai/plugins/liquid-glass-agency/hero-finlytic-preview-CV9g0FHP-9d3cb6.gif` (row 1, right) and `https://plugin-assets.open-design.ai/plugins/liquid-glass-agency/hero-wealth-preview-B70idl_u-7969db.gif` (row 2, left). The seed ships inlined SVG mock previews in their place so the card never breaks; you may use the GIF URLs in a React port.
- Logo icon: inlined SVG data URI in the seed (`h-12 w-12` ⇒ 48×48).

**Note for the vanilla seed:** HLS `.m3u8` cannot play in `<video>` without `hls.js`. To keep the seed self-contained and dependency-free, every video-background section reuses the CloudFront MP4 (which plays natively) as a stand-in. In a React port, wire each section's Mux HLS URL through `hls.js`.

All video backgrounds: `autoPlay loop muted playsInline`, `object-fit: cover`, with **top + bottom black gradient fades** (`linear-gradient(to bottom/top, #000, transparent)`, ~200px each; hero bottom fade is 300px), `pointer-events: none`.

## Section-by-section layout

### Navbar (fixed, floating)
`position: fixed; top:16px; left:0; right:0; z-index:50; padding: 12px 32px` (lg `px-16`). Left: logo image (48×48). Center (desktop only, `hidden md:flex`): a `liquid-glass rounded-full` pill (`px-1.5 py-1`) of links **Home, Services, Work, Process, Pricing**, each `px-3 py-2 text-sm font-medium text-foreground/90`; last item is a solid white "Get Started" button (`bg-white text-black rounded-full px-3.5 py-1.5 text-sm`) with a lucide `ArrowUpRight` icon. Hide the pill below ~900px.

### Hero
`relative; height: 1000px; overflow: visible`. Background `<video>` absolutely positioned `left-0 w-full h-auto object-contain z-0` with `top: 20%`, CloudFront MP4 source, poster = inlined still. Dark overlay `absolute inset-0 bg-black/5 z-0`. Bottom gradient fade 300px (`to bottom, transparent, #000`). Content (`z-10`, centered, `paddingTop: 150px`):
- Badge pill: `liquid-glass rounded-full px-1 py-1` with inner white "New" badge (`bg-white text-black rounded-full px-3 py-1 text-xs font-semibold`) + text "Introducing AI-powered web design."
- Heading (**BlurText**): "The Website Your Brand Deserves" — `text-6xl md:text-7xl lg:text-[5.5rem] font-heading italic leading-[0.8] max-w-2xl tracking-[-4px]`, animated word-by-word from bottom with blur, 100ms stagger.
- Subtext (`motion.p`): "Stunning design. Blazing performance. Built by AI, refined by experts. This is web design, wildly reimagined." — blur-in, `text-sm md:text-base text-white font-light`.
- CTAs: "Get Started" (`liquid-glass-strong rounded-full px-5 py-2.5` + `ArrowUpRight`) and "Watch the Film" (text-only with filled `Play`).
- Partners bar (`mt-auto pb-8 pt-16`): a `liquid-glass` pill "Trusted by the teams behind", then 5 partner names in `text-2xl md:text-3xl font-heading italic text-white`, `gap-12 md:gap-16`: **Stripe, Vercel, Linear, Notion, Figma**.

### Start ("How It Works")
Full-width video-background section (StartSection Mux HLS). Content centered, `minHeight: 500px`: badge "How It Works" (`liquid-glass rounded-full px-3.5 py-1`); heading "You dream it. We ship it." (`text-4xl md:text-5xl lg:text-6xl font-heading italic tracking-tight leading-[0.9]`); subtext "Share your vision. Our AI handles the rest—wireframes, design, code, launch. All in days, not quarters." (`text-white/60 font-light`); CTA "Get Started" (`liquid-glass-strong rounded-full px-6 py-3`).

### Features Chess (alternating rows)
Header: "Capabilities" badge + "Pro features. Zero complexity." heading. Row 1 (content left / image right): title "Designed to convert. Built to perform.", body "Every pixel is intentional. Our AI studies what works across thousands of top sites—then builds yours to outperform them all.", button "Learn more" (`liquid-glass-strong`), media = feature-1 GIF inside `liquid-glass rounded-2xl overflow-hidden`. Row 2 (`flex-row-reverse`, content right / image left): title "It gets smarter. Automatically.", body "Your site evolves on its own. AI monitors every click, scroll, and conversion—then optimizes in real time. No manual updates. Ever.", button "See how it works", media = feature-2 GIF in `liquid-glass rounded-2xl`.

### Features Grid ("Why Us")
Header: "Why Us" badge + "The difference is everything." heading. 4-column grid (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6`), each card `liquid-glass rounded-2xl p-6` with a lucide icon in a `liquid-glass-strong rounded-full w-10 h-10` circle:
- `Zap` — "Days, Not Months" — "Concept to launch at a pace that redefines fast. Because waiting isn't a strategy."
- `Palette` — "Obsessively Crafted" — "Every detail considered. Every element refined. Design so precise, it feels inevitable."
- `BarChart3` — "Built to Convert" — "Layouts informed by data. Decisions backed by performance. Results you can measure."
- `Shield` — "Secure by Default" — "Enterprise-grade protection comes standard. SSL, DDoS mitigation, compliance. All included."

### Stats
Video-background section (Stats Mux HLS, **`filter: saturate(0)`** desaturated B&W). Content: a `liquid-glass rounded-3xl p-12 md:p-16` card with a 4-column grid; values `text-4xl md:text-5xl lg:text-6xl font-heading italic`, labels `text-white/60 font-light text-sm`:
- "200+" / "Sites launched"
- "98%" / "Client satisfaction"
- "3.2x" / "More conversions"
- "5 days" / "Average delivery"

### Testimonials
Header: "What They Say" badge + "Don't take our word for it." heading. 3-column grid (`md:grid-cols-3 gap-6`), each card `liquid-glass rounded-2xl p-8`; quote `text-white/80 font-light text-sm italic`, name `text-white font-medium text-sm`, role `text-white/50 font-light text-xs`:
- "A complete rebuild in five days. The result outperformed everything we'd spent months building before." — Sarah Chen, CEO, Luminary
- "Conversions up 4x. That's not a typo. The design just works differently when it's built on real data." — Marcus Webb, Head of Growth, Arcline
- "They didn't just design our site. They defined our brand. World-class doesn't begin to cover it." — Elena Voss, Brand Director, Helix

### CTA + Footer
Video-background section (CTA Mux HLS). Heading "Your next website starts here." (`text-5xl md:text-6xl lg:text-7xl font-heading italic leading-[0.85]`); subtext "Book a free strategy call. See what AI-powered design can do. No commitment, no pressure. Just possibilities."; buttons "Book a Call" (`liquid-glass-strong rounded-full px-6 py-3`) and "View Pricing" (`bg-white text-black rounded-full px-6 py-3`). Footer bar (`mt-32 pt-8 border-t border-white/10`): left "© 2026 Studio. All rights reserved." (`text-white/40 text-xs`); right "Privacy", "Terms", "Contact" links (`text-white/40 text-xs`).

## Overall page structure

```
<div bg-black>
  <Navbar/>           // fixed floating nav
  <Hero/>             // 1000px tall, CloudFront MP4 bg
  <div bg-black>
    <StartSection/>   // HLS video bg, "How It Works"
    <FeaturesChess/>  // alternating text/gif rows
    <FeaturesGrid/>   // 4-card grid
    <Stats/>          // HLS video bg (desaturated), stats card
    <Testimonials/>   // 3-card grid
    <CtaFooter/>      // HLS video bg, CTA + footer
  </div>
</div>
```

## Animations (map Framer-Motion down to vanilla in the seed)

- **BlurText (hero heading):** split text by words; each word is a span animating from `{filter:blur(10px), opacity:0, y:50}` → `{filter:blur(0), opacity:1, y:0}`, staggered ~100ms per word, triggered by `IntersectionObserver`. In the seed, `[data-blur]` is split into `.blur-word` spans toggled via IO; in React, `motion.span` keyframes.
- **Reveal (subtext, CTAs, badges, cards, headings):** `whileInView` → in the seed an `IntersectionObserver` adds `.in` to `.reveal` (from `{opacity:0, translateY(28px), blur(10px)}` to settled). Hero subtext delay ~0.8s, CTAs ~1.1s in the React original.
- All video backgrounds autoplay/loop/muted/playsInline with top+bottom black gradient fades.
- Respect `prefers-reduced-motion`: force reveals visible.

## Icons (lucide / lucide-react)

`ArrowUpRight`, `Play` (filled), `Zap`, `Palette`, `BarChart3`, `Shield`. In the vanilla seed these are inline SVGs; in a React port use `lucide-react`.

## Color Rules — hard

Dark editorial palette only: black `#000` page, white text, desaturated-blue glass tint via the locked `--background`/`--card` HSL triplets. Muted text = `white/60`–`/80`. **Do not introduce a saturated accent hue** (no purple/indigo/teal/green) — the luxury look comes from monochrome white-on-black + glass, not a colored accent. Keep `--radius: 9999px` (pill geometry) and the two liquid-glass recipes intact.
