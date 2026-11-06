# Assets — sourcing canon for icons, logos, illustrations, photography, video

This file is loaded when an enrichment archetype actually needs an external asset (load-on-demand). It catalogues the *3–5 canonical sources per category*, the licence terms, the import patterns, the rules for using them, and the sources to avoid.

**The reflex.** Before reaching here, ask two questions in order: (1) Does the brief actually need imagery at all? See [`hero-enrichment.md` § Image-need detection](hero-enrichment.md). (2) If yes, can it be hand-built? See [`custom-craft.md`](custom-craft.md). The assets in this file are for the moments when both answers send you here.

---

## Placeholder strategy

When imagery is needed *and* the user hasn't supplied real assets, pick from this canon — in order. Skipping tiers is the slop move.

| # | Source | When |
| --- | --- | --- |
| 1 | **Hallmark imagery kit** ([`imagery-kit.md`](imagery-kit.md)) | Brief allows non-photographic imagery: SaaS landings, manifestos, agency / studio splash, type-led portfolio, editorial-led marketing. **Always preferred** when the kit's register fits. |
| 2 | **Hand-built SVG composition** (Tier B from custom-craft.md) | Editorial-typographic brief where "imagery" can be a stamp / wordmark / colour-blocked composition. Use when the kit doesn't carry the register. |
| 3 | **Picsum** — `https://picsum.photos/seed/<seed>/<w>/<h>` | Generic photo slot, keyword anchoring not critical. Use a deterministic seed (brand-name + slot-name) so the same render produces the same image. |
| 4 | **Unsplash Source** — `https://source.unsplash.com/<w>x<h>/?<keywords>` | Keyword-anchored photo slot — food, travel, portrait, real product. Pass 1–2 specific keywords, never zero. |
| 5 | **Local `public/placeholder-<type>.{jpg,svg}`** | Self-contained projects with no third-party deps. Single neutral grey-block SVG checked into the repo. |

**Swappability — non-negotiable:**

- Every placeholder image carries an HTML comment immediately above it: `<!-- TODO: Replace with real <thing>, target size: <WxH> -->`.
- All placeholder URLs reference a single constant — a `--placeholder-base` CSS variable or `PLACEHOLDER_BASE` config constant. User edits one place to swap the entire site.
- Alt text describes the **intended** subject ("Hand-thrown ceramic mug, top-down on linen") not the placeholder ("Picsum image"). When the user swaps in the real photo, alt is already correct.

**Remote asset safety:**

- Treat third-party image, logo, video, icon, and font URLs as prototype defaults, not production defaults. Before shipping production code, prefer vendored or self-hosted assets unless the user explicitly wants third-party hosting.
- Do not add a third-party script, tracking pixel, widget, or API dependency as an asset shortcut. Asset sources provide files; they do not get to execute code in the page.
- When remote assets remain in production, state the privacy and availability tradeoff in the handoff: visitors will request those third-party hosts, and the page depends on their uptime and integrity.
- For user-supplied brand or customer logos, prefer official asset pages or checked-in files. Do not hotlink a logo from an unrelated site.

**Anti-patterns:**

- Never inline base64 placeholder images (bloats CSS).
- Never call random Unsplash without keywords (returns un-curated stock-photo-ish results).
- Never use kittens / lorempixel / "tiger.jpg" / cute-default services. The placeholder must read as an obvious slot, not as content.
- Never ship a kit image where the brief actually calls for a real product photo (e.g. abstract bottle for an actual coffee-shop hero). The kit is for atmosphere; photos are for subject.

---

## Icons

### Canon

| Library | URL | Count | Best for |
| --- | --- | --- | --- |
| **[Lucide](https://lucide.dev)** | `lucide.dev` | 1,600+ | Modern SaaS / dev-tool default. The 2026 baseline. Active maintenance. |
| **[Phosphor Icons](https://phosphoricons.com)** | `phosphoricons.com` | 9,000+ across 6 weights (thin / light / regular / bold / fill / duotone) | Tonal variants without mixing sets. The right pick when you need different *weights* of the same icon for emphasis. |
| **[Heroicons](https://heroicons.com)** | `heroicons.com` | ~300 | Tailwind / shadcn projects. Tightly curated, opinionated. |
| **[Tabler Icons](https://tabler-icons.io)** | `tabler-icons.io` | 5,900+ on a 24×24 grid | Breadth — when neither Lucide nor Heroicons covers the symbol you need. |
| **[Iconoir](https://iconoir.com)** | `iconoir.com` | ~1,500 | Hand-drawn character with a generous free tier. |

### The rules

1. **Pick one library per project.** Mixing Material + Heroicons + Lucide on the same page is the icon-set tell. The skill's audit verb catches this.
2. **Sizes 16 / 20 / 24 / 32 only.** Snap to grid. 18-px icons don't exist in this canon.
3. **Stroke 2 px default** (most libraries' regular weight). Switch to bold (2.5 px) only for icons under 20 px or as emphasis.
4. **Monochrome with `currentColor`.** Icons inherit text colour. Brand-coloured icons only on the singular primary CTA — not as decoration.
5. **No emoji-as-icon.** Emoji break alignment, accessibility, and brand consistency. Use a real icon library.

### Import patterns

```jsx
// Lucide — React (most common)
import { ArrowRight, Check, X } from "lucide-react";
<ArrowRight size={20} strokeWidth={2} />

// Phosphor — React, with weight prop
import { ArrowRight } from "@phosphor-icons/react";
<ArrowRight size={20} weight="regular" />

// Heroicons — React or static HTML
import { ArrowRightIcon } from "@heroicons/react/24/outline";

// Tabler — vanilla HTML via CDN
<svg width="20" height="20"><use href="https://cdn.jsdelivr.net/npm/@tabler/icons@latest/icons/arrow-right.svg" /></svg>
```

### Avoid

- **Font Awesome free** — bloated, dated. The 2018-SaaS look; 600+ generic glyphs that all read as "I picked the icons before designing the page".
- **Material Icons in a non-Material project** — gives a Google look that doesn't match anything else.
- **Icon packs with inconsistent stroke widths** — pick a library whose icons share weight; eclectic mixes read as random.
- **Emoji as semantic icons** — colour, size, weight, alignment all uncontrolled.

---

## Brand / company logos

### Canon

| Source | URL | Count | Best for |
| --- | --- | --- | --- |
| **[Simple Icons](https://simpleicons.org)** | `simpleicons.org` | 3,400+ | The industry standard. Monochrome SVG + official hex per brand. MIT licensed. The default for logo walls. |
| **[SVGL](https://svgl.app)** | `svgl.app` | 600+ | Curated, hand-picked, no spam. Higher quality bar than Simple Icons. |
| **[theSVG](https://thesvg.org)** | `thesvg.org` | 4,000+ with dark/light/mono/wordmark variants | npm + MCP server for AI. Superset over Simple Icons if your stack supports it. |
| **[Brandfetch](https://brandfetch.com)** | `brandfetch.com` | 22M+ brands | Paid API. Logo + colours + fonts + guardrails. Useful when building a CMS / form that asks "what's your domain?" and back-fills the brand. |
| **Official brand asset pages** | Per company | — | Always check first if accuracy matters. Most brands ship a media-kit page (e.g., `vercel.com/design`). |

### The rules

1. **Logo walls: monochrome only.** Use Simple Icons' default colour or the official monochrome variant. Mixed full-colour logos read as 2018-SaaS.
2. **Height-aligned, not width-aligned.** Pick a baseline (typically 32–48 px height) and let the width float. Brand proportions matter; stretching is a tell.
3. **2–3× height as gutter.** Logos need breathing room. A wall with 32-px logos wants 64–96-px gutters.
4. **No hairline borders, no glow halos.** Just the marks on the page.

### Import patterns

```html
<!-- Simple Icons via CDN — easiest -->
<img src="https://cdn.simpleicons.org/github" alt="GitHub" height="32">
<img src="https://cdn.simpleicons.org/figma/aaaaaa" alt="Figma" height="32"> <!-- monochrome override -->

<!-- npm -->
<!-- npm install simple-icons -->
import { siGithub } from 'simple-icons/icons';
<svg viewBox="0 0 24 24"><path d={siGithub.path} fill="currentColor" /></svg>

<!-- SVGL via API -->
<img src="https://api.svgl.app/?slug=vercel" alt="Vercel">
```

### Avoid

- **Full-colour logo grids.** Visual chaos; reads as 2018.
- **Stretched / squished marks.** Always preserve aspect ratio.
- **Placeholder customer logos from template kits** ("ACME", "Initech", "Hooli"). Use real customer logos, or skip the wall entirely — fake social proof is worse than no social proof.
- **Mixing wordmarks with marks.** Pick a treatment (all-monogram or all-wordmark) for any single wall.

---

## Generated illustration (Tier C in the enrichment hierarchy)

When characters or specific scenes can't be hand-built economically. **Always post-process.** See [`custom-craft.md`](custom-craft.md) Tier E for full discipline.

### Canon

| Model | URL | Cost | Best for | Output |
| --- | --- | --- | --- | --- |
| **[Nanobanana 2 / Gemini 2.5 Flash Image](https://ai.google.dev/gemini-api/docs/image-generation)** | Google AI | $0.039 / image | Character consistency across panels, fast iteration, brand-style adherence via reference images, infographics with text | PNG (transparent supported) |
| **[Recraft V4](https://www.recraft.ai/)** | recraft.ai | ~$0.04 / image | **The only model with production-grade SVG output.** Logos, icons, illustrations that need to scale. | SVG + PNG |
| **[Midjourney v8](https://www.midjourney.com)** | midjourney.com | ~$0.14 / image | Aesthetic beauty, atmospheric stills, artistic direction | PNG |
| **[Flux 2](https://blackforestlabs.ai/)** | blackforestlabs.ai | ~$0.03 / image | Photorealism — skin, fabric, product detail, hands | PNG |

### The rules

1. **Always post-process.** Add grain, asymmetric crop, hand-drawn overlays, colour grading. Raw model output reads as AI 100 % of the time.
2. **Use reference images** for brand consistency. Nanobanana 2's character-consistency feature is its differentiator vs. Midjourney; feed it your brand assets so generations stay on-style.
3. **Stamp the model in the macrostructure comment** (`generated: nanobanana-2 · post-processed`). Provenance matters.
4. **Verify SynthID watermark** is present on Google-generated images.
5. **No animation.** None of these models output multi-frame; assemble via custom-craft if motion is needed.

### Avoid

- **Symmetrical compositions** — algorithmic; the AI tell. Always crop asymmetrically.
- **Smooth-mesh-blob faces** — the 2024 generic AI character look.
- **Default lighting + blue-tinted backgrounds** — the generic AI aesthetic. Specify brand-anchored colour and unusual lighting in the prompt.
- **Six fingers / doubled furniture / impossible rooms** — less common in 2026 but still lurking. Inspect.
- **Shipping unmodified output** — see rule 1.

### Prompting recipe (Nanobanana 2)

```
Subject: <one specific concrete subject> in <one specific concrete pose>.
Style: <named style — "risograph print", "1960s editorial illustration",
        "ink-on-paper line drawing", NOT "modern flat" or "clean illustration">.
Composition: asymmetric, <off-centre subject>, <unusual crop>.
Lighting: <named lighting — "side-lit, late afternoon", "overcast diffuse">.
Reference: <attach brand asset / mood board for character consistency>.
Constraints: no smooth mesh-gradient, no aurora background, no symmetric layout,
             no smiling people-on-laptops poses.
```

A specific prompt produces a specific image. A generic prompt produces the AI tell.

---

## Library illustrations (Tier D — not first choice)

When budget and timeline force a shortcut and even Tier C is overkill.

### Canon

| Source | URL | Licence | Best for |
| --- | --- | --- | --- |
| **[Storyset](https://storyset.com)** | storyset.com (Freepik) | Free with attribution; paid removes | Animated SVG illustrations with toggleable element animation and on-site colour customisation. Onboarding flows, feature explanations. |
| **[Humaaans](https://www.humaaans.com)** | humaaans.com (Pablo Stanley) | CC0 | Mix-and-match characters with diverse poses / outfits / skin tones. Hero sections that need humans without stock-photo territory. |
| **[unDraw](https://undraw.co)** | undraw.co | MIT | Open SVG illustrations with on-export colour swap. Still respected if customised — saturated and instantly recognisable if not. |
| **[IRA Design](https://www.iradesign.io)** | iradesign.io (Creative Tim) | Free / paid | Moody, sophisticated, isometric scenes for B2B / enterprise. |
| **[Open Peeps](https://www.openpeeps.com)** | openpeeps.com | CC0 | Hand-drawn character library, naive style. Sits between photography and illustration. |

### The rules

1. **Always customise colour to your brand anchor hue.** The library default colour is the library look. Swap it.
2. **Crop or recompose** if you can. The unmodified illustration is on a hundred competitor sites; even a crop change differentiates.
3. **One library per project.** Mixing Storyset + Humaaans + unDraw = visual chaos. Pick one, stick to it.
4. **Avoid the giveaway poses** — guy on laptop with floating speech bubble, woman in headset on cloud, character holding giant phone. Whatever you saw on Dribbble in 2021, audiences saw too.
5. **Commission custom for >3 uses.** If the illustration appears in the hero, a feature block, AND promotional material, the per-piece commission cost ($200–$600 freelancer, $399–$999/month subscription for unlimited) wins on brand consistency over libraries.

### Avoid

- **Open Doodles** — dated. The 2019 hand-drawn aesthetic that's been displaced by 2026's tactile rebellion.
- **"Modern flat" generic poses** — that whole aesthetic is the AI training-distribution default.
- **AI-generated illustrations** put through library filters — the worst of both worlds.
- **Stock photography with character cutouts pasted on top** — fights physics, looks haunted.

---

## App mockups / device frames

### Canon

| Source | URL | Best for |
| --- | --- | --- |
| **[Browserframe](https://browserframe.com)** | browserframe.com | Browser + mobile device frames with annotation. Built for SaaS demo screenshots. |
| **[Ray.so](https://ray.so)** | ray.so | Code snippets in macOS window frames. Perfect for developer-tool landing pages. |
| **[Cleanmock](https://cleanmock.com)** | cleanmock.com | Mobile device frames; minimalist; good for app-store-listing-style heroes. |
| **[Mockup.style](https://mockup.style)** | mockup.style | Versatile device + browser builder, Figma-friendly export. |
| **[Device Shots](https://deviceshots.com)** | deviceshots.com | Free device generator with multiple frame styles, fast turnaround. |

### The rules

1. **Browser frame for SaaS / web apps.** Communicates "this is real, on the web". Use Browserframe or hand-build (a 1-px hairline + three macOS dots is enough).
2. **Floating-no-frame for clean splits.** When the screenshot is beautiful enough to stand naked. Demands a high-quality screenshot.
3. **Device frame (iPhone / iPad) sparingly.** One hero mockup max — beyond that it reads as generic template work.
4. **Tilt 1–3°.** Adds life. 0° reads as flat; 5°+ reads as drunk.
5. **Numbered-pin annotations only.** Numbered circles (1, 2, 3) with a corresponding callout legend below. No arrow-and-label callouts (dated 2018 UX). Label only the *novel* features, not the obvious.

### Avoid

- **Glossy plastic device bezels** — looks 2015. Use minimalist frames or no frame.
- **Annotation chaos** — more pins than pixels. Three numbered pins is a lot; five is too many.
- **Stretched aspect ratios** — never resize a mockup beyond its natural ratio.
- **Visible Figma prototyping artifacts** in the screenshot (ghost-out frames, "hover" indicators). Clean the export.

---

## Hero / demo video

### Canon (when you don't have your own footage)

| Source | URL | Licence | Best for |
| --- | --- | --- | --- |
| **[Mixkit](https://mixkit.co)** | mixkit.co (Envato) | No registration, no attribution required, 1080p+ HD | The quality-to-effort sweet spot. |
| **[Coverr](https://coverr.co)** | coverr.co | Free commercial use | Optimised for hero-section backgrounds and ambient loops. |
| **[Pexels Videos](https://www.pexels.com/videos/)** | pexels.com/videos | CC0 | Largest free library; 4K available. Volume play. |
| **[Videvo](https://www.videvo.net)** | videvo.net | Tiered (free + pro) | Community footage + motion graphics. |

### The rules

1. **Codec chain in the `<source>` order: AV1 → WebM VP9 → MP4 H.264.** Browsers pick the first they support. AV1 is 30–50 % smaller than H.264 at equivalent quality; H.264 is the universal fallback.
2. **Always autoplay-muted-loop-playsinline.**
   ```html
   <video autoplay muted loop playsinline preload="metadata"
          poster="/hero-poster.webp" fetchpriority="high">
     <source src="/hero.av1.mp4"  type='video/mp4; codecs="av01.0.05M.08"'>
     <source src="/hero.vp9.webm" type="video/webm">
     <source src="/hero.h264.mp4" type="video/mp4">
   </video>
   ```
3. **Always include a `poster=""`** — prevents layout shift, gives reduced-motion users a static fallback.
4. **`fetchpriority="high"` on the LCP element.** **Never `loading="lazy"`** on the hero — that kills LCP.
5. **VTT captions for accessibility.** Even on muted demo loops; people may unmute.
6. **No sound on autoplay.** Browsers block it anyway, but the principle is firm.

### Compression

- **[ffmpeg](https://ffmpeg.org)** for control:
  - VP9: `ffmpeg -i input.mp4 -c:v libvpx-vp9 -b:v 0 -crf 30 -c:a libopus -b:a 128k output.webm`
  - AV1: `ffmpeg -i input.mp4 -c:v libaom-av1 -crf 30 -c:a aac output.mp4`
  - H.264: `ffmpeg -i input.mp4 -c:v libx264 -preset slow -crf 23 -c:a aac output.mp4`
- **[HandBrake](https://handbrake.fr)** for GUI / batch: start with the "Vimeo YouTube HQ 1080p" preset, drop bitrate to 3–4 Mbps for web.

### Avoid

- **Watermarked stock** — visible "Pexels.com" stamps in the corner.
- **30 fps labelled as 60 fps** — reveals itself on modern displays.
- **Music-heavy demos without a mute toggle** — alienates accessibility users and noisy environments.
- **`loading="lazy"` on hero video** — kills LCP, tanks Core Web Vitals.

---

## Photography

### Canon

| Source | URL | Licence | Best for |
| --- | --- | --- | --- |
| **[Unsplash](https://unsplash.com)** | unsplash.com | CC0 | Largest free collection, moody / cinematic, weekly community uploads. The starting point. |
| **[Pexels](https://www.pexels.com)** | pexels.com | CC0 | 3.5M+ free photos, diverse photographers. |
| **[Nappy.co](https://www.nappy.co)** | nappy.co | Free + paid | Curated for diversity and representation. Premium visual direction. |
| **[Shotstash](https://www.shotstash.com)** | shotstash.com | Free | Lifestyle / minimal aesthetic. Smaller but carefully curated. |
| **[Open Peeps](https://www.openpeeps.com)** | openpeeps.com | CC0 | Illustrated character library when you want diversity without the photo-stock look. |

### The rules

1. **Always tweak the source.** Gradient overlay, crop, desaturation, blur, or brand-colour wash. The unmodified Unsplash photo is on a hundred competitor sites; even a crop change differentiates.
2. **Match tone to brief.** Enterprise / B2B: neutral palettes, natural lighting, real workspaces. Consumer / lifestyle: warm lighting, human emotion. Tech / startup: minimal backgrounds, hands-on interaction.
3. **Diverse representation.** Nappy.co is the best free source for intentional curation; Unsplash and Pexels carry diversity but require search effort.
4. **Aspect ratios that fit.** Hero photography typically wants 16/9 desktop, 4/3 or 9/16 mobile.

### Avoid

- **Photos with visible logos / trademarks** — copyright risk.
- **Over-processed HDR** — looks dated, unrealistic.
- **Staged "team photo" shots** — generic, reads as stock.
- **Unmodified Unsplash** — a hundred competitor sites used the same photo this week.

---

## Abstract backgrounds

### Canon

| Source | URL | Output | Best for |
| --- | --- | --- | --- |
| **CSS gradients (native)** | n/a — write them | Zero bytes, GPU-composited | The default. Linear or radial; 2–3 colour stops max. |
| **[Mesh Gradient Generator](https://www.learnui.design/tools/mesh-gradient-generator.html)** | learnui.design tools | Figma / SVG export | Apple-style mesh gradients; export carries organic noise. |
| **[fffuel.co](https://www.fffuel.co/)** | fffuel.co | SVG | `gggrain` for grain noise; `ffflux` for fluid gradients; `uuunion` for wavy meshes. Composable. |
| **[CSS Gradient](https://cssgradient.io)** | cssgradient.io | CSS strings | Quick gradient picker; copy-paste ready. |

### The rules

1. **CSS gradients first.** Zero bytes; scale infinitely; animate smoothly with `@property`. If a CSS gradient does the job, never reach for SVG or images.
2. **Two to three colour stops.** More than three reads as generated. Pick stops that share hue and step in lightness.
3. **Grain via SVG `<feTurbulence>`** at < 0.1 opacity, `mix-blend-mode: multiply`. Cheap, no asset, looks like paper.
4. **Hero or accent card only — never page-wide.** A 100-vh gradient is a tell; a 40-vh hero gradient with the rest of the page on flat paper is intentional.
5. **No animation on whole-page gradients.** A subtle 30-s drift on a hero accent is allowed; a slowly-rotating mesh-gradient on the entire page is the new aurora-blob anti-pattern.

### Recipe (CSS gradient + SVG grain)

```css
.hero {
  background:
    linear-gradient(135deg,
      color-mix(in oklch, var(--color-paper) 100%, var(--color-accent) 4%),
      color-mix(in oklch, var(--color-paper) 100%, var(--color-paper-2) 50%));
  position: relative;
}

.hero::after {
  content: "";
  position: absolute; inset: 0;
  background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>");
  opacity: 0.06;
  mix-blend-mode: multiply;
  pointer-events: none;
}
```

### Avoid

- **Aurora blobs** — the 2022 Dribbble look. Critical anti-pattern.
- **Purple-to-cyan mesh** — the 2023 default. Critical anti-pattern.
- **Floating orbs / spheres** — generic 3D ambient. Critical anti-pattern.
- **Particle / starfield** — 2010s nostalgia, distracting.
- **Animated mesh-gradient on the whole page** — modern equivalent of the rotating gradient banner.

---

## Lottie / Rive (Tier F — last resort)

### Canon

| Source | URL | Best for |
| --- | --- | --- |
| **[LottieFiles](https://lottiefiles.com)** | lottiefiles.com | The Lottie ecosystem. Free + pro tiers; npm + CDN; Figma plugin; AI creator. |
| **[Rive](https://rive.app)** | rive.app | Interactive real-time animations with state machines. Native runtime; better for app UI micro-interactions than Lottie. |

### The rules

1. **Lottie is last resort.** Reach for it only when complex character motion can't be hand-built. See [`custom-craft.md`](custom-craft.md) Tier F.
2. **Custom-commissioned over library pulls.** A LottieFiles community animation that fits your brand exists; one that fits *and* doesn't look like every other LottieFiles community animation is rare. Commission ($100–$300 on Upwork; $1,000+ from a studio) for hero work.
3. **< 2 MB file size.** Anything heavier loses to its own loading state.
4. **Pause / resume support.** Required for accessibility (motion-sensitive users need control).
5. **Reduced-motion fallback** to a static keyframe. Required.
6. **Don't use Lottie for what CSS can do.** Spinning logos, checkmark draws, loading spinners, hover micro-interactions — all CSS territory. The skill catches the "Lottie shortcut" anti-pattern in its slop test.

### Avoid

- **2019-era over-smooth animations.** Looks dated, lacks character.
- **Animations heavier than the page itself** — 5 MB Lottie files for a 200 KB page.
- **Animations without pause / resume** — accessibility fail.
- **LottieFiles community pulls used unmodified** — reads as "I picked this from a library".

---

## Quick-reference: which source for which job

| Need | First reach | Second reach |
| --- | --- | --- |
| UI icon (chevron, check, X) | Lucide | Phosphor / Heroicons |
| Brand logo for a wall | Simple Icons | SVGL / theSVG |
| A hero illustration the brand owns | Hand-build (Tier A or B) | Commission custom |
| A hero illustration that's character-driven | Nanobanana 2 (Tier C) | Commission, then library |
| An SVG-format illustration that needs to scale | Recraft V4 | Hand-build in Figma → SVG |
| A photograph with diversity | Nappy.co | Unsplash with manual tone-tweak |
| A demo video of your product | Custom screen recording | (skip; no stock fits) |
| A textured background | CSS gradient + SVG grain | Mesh Gradient Generator |
| A character animation | Custom Lottie commission | LottieFiles community + customise |
| A loading spinner | CSS conic-gradient | (don't reach for Lottie) |
| A checkmark draw on confirm | SVG `stroke-dasharray` | (don't reach for Lottie) |

When in doubt: build it. The path of least resistance and the path of least-AI-tell are the same path in 2026.
