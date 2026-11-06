# Anti-patterns — the named tells

The `hallmark audit` verb flags these by name. Every one of these is a signature of AI-generated UI. Seeing one is a problem; seeing two in the same view is a confirmation.

Each entry: the tell, why it reads as AI-generated, and the fix.

---

## Critical (ships as slop)

### The purple-gradient hero

A hero section with a background gradient from purple to blue or purple to pink, often with white centred text. This is the single most-recognised AI aesthetic.

**Fix.** Pick a single anchor hue. One accent. No gradient backgrounds on heroes. If you want warmth, tint the neutrals.

### Inter-everywhere

Inter (or Roboto, or Open Sans) used as both display and body, with no pairing face. A one-font page is a template page.

**Fix.** Pair a distinctive display face with a refined body face. See [`typography.md`](typography.md).

### The 3-column feature grid

Three equal columns, each with an icon above a two-line heading above a three-line body. Usually spanned full-width with 24px gap. Every LLM emits this.

**Fix.** Break the grid. Vary column widths. Mix card heights. Remove one card and use negative space. Move the icons inline, not above. Or drop the cards entirely and use typographic rhythm.

### Card-in-card

A bordered container with cards inside it. Or: a card containing another card containing a small "micro-card". Visual nesting with no semantic reason.

**Fix.** Pick one containment layer. Usually the outer one is the wrong one.

### The gradient headline

A headline with `background-clip: text` fill set to a linear gradient (usually purple-to-pink or blue-to-cyan). Signals "AI generated" faster than almost anything else.

**Fix.** Solid ink. If you want the headline to feel alive, use weight or italic or a display face — not a gradient fill.

### The side-stripe card

A card with a thick coloured border on one edge (usually left, 4–6px, purple or green). Very recognisable; very 2018-SaaS-AI.

**Fix.** Use a hairline border all around, or no border, or a small accent square beside the heading. Never an asymmetric thick stripe.

### Full-viewport centred hero

`min-height: 100vh` (or `100dvh`), everything centred, one short sentence, one big CTA. The default LLM landing page.

**Fix.** Let the hero be the height of its content. Bias left or right. Put more than a sentence in it.

### Pure black, pure white

`#000000` background or `#ffffff` surface. Both read as flat and synthetic.

**Fix.** Tint toward your anchor hue. See [`color.md`](color.md).

### Default-attractor sameness

Two consecutive Hallmark outputs in the same project use the same macrostructure. The first emitted left-margin numbered labels + huge serif + asymmetric spans (Specimen); the second did exactly the same. The page looks redesigned only because copy changed.

**Why it fails.** Hallmark's whole point is that two pages for two briefs feel like *different sites*, not colour-swaps of one template. Repeating a macrostructure across outputs is the structural fingerprint of templating, which is the AI tell Hallmark exists to defeat.

**Fix.** Before writing code, look in the project's CSS for a `/* Hallmark · macrostructure: <name> · ... */` stamp. If one exists, your pick must be a different macrostructure — categorically different where possible (a serif-led editorial macrostructure paired with a sans-led grid one, not two editorial variants). See [`macrostructures.md`](macrostructures.md) for the twenty-one named choices.

### Specimen fall-through

Producing the Specimen macrostructure (numbered left-margin labels like `01 — HELLO.` + huge serif display + asymmetric spans + hairline rules + typographic-only CTA + sometimes a hand-drawn SVG accent) when the brief did not explicitly request editorial / foundry / specimen energy. This is the single most-repeated Hallmark output, and it's the reason the skill felt like it had one shape.

**Why it fails.** Specimen is a beautiful pattern when the brief is editorial. Applied to a SaaS pricing page, a developer tool, an e-commerce site, or a personal app, it looks like the AI defaulted — because it did.

**Fix.** The Specimen macrostructure is one of twenty-one in [`macrostructures.md`](macrostructures.md), not a default. If the brief is vague, pick from the first ten in that file (Bento Grid, Long Document, Marquee Hero, Stat-Led, Workbench, Conversational FAQ, Manifesto, Photographic, Quote-Led, then Specimen). Reach for Specimen only when the brief explicitly says "editorial", "specimen sheet", "type foundry", or names the Specimen theme.

### The AI nav

Wordmark hard-left, 4–5 inline text links (`Features · Pricing · Docs · Blog · About`) centred or right-grouped, a CTA button hard-right, full viewport width, sticky on scroll, white background, 1 px hairline border-bottom. This is the most-recognised AI nav fingerprint — every LLM emits it because every SaaS site that fed the training data shipped it.

**Why it fails.** The shape is genre-blind: it lands the same on a wedding photographer's portfolio, a bakery, a B2B SaaS, and a manifesto. When the nav can't tell you what kind of site you're on, the page is templated.

**Fix.** Pick from the routing table in [`component-cookbook.md`](component-cookbook.md) § Navigation. The genre routes you to one of N5–N9: Floating pill (modern-minimal / atmospheric), Newspaper masthead (editorial), Brutal slab (playful), Terminal command (CLI), Edge-aligned minimal (luxury / quiet). Reach for N1 *only* when the page genuinely has 2 destinations and the routing table allows it. State the rationale in a one-line comment.

### The AI footer

4 columns of links (Product · Company · Resources · Legal), social-icon row beneath, copyright line at the very bottom, faint 1 px top-border, neutral grey background. Standard SaaS footer, identical across thousands of pages.

**Why it fails.** Same as the AI nav — the shape is genre-blind. A bakery doesn't have a "Resources" column. An editorial page doesn't have a four-link "Legal". The footer should *close the page*, not catalogue its absent sitemap.

**Fix.** Pick from the routing table in [`component-cookbook.md`](component-cookbook.md) § Footers. Default to Ft1 Mast-headed, Ft2 Inline single line, Ft4 Dense colophon, Ft5 Statement, Ft6 Letter close, Ft7 Newsletter-first, or Ft8 Marquee scroll. Use Ft3 Index columns *only* on a genuine hub or docs root with a real sitemap — and even then, never with the social-icon row + tiny copyright tail.

### Aurora-blob background

Flowing organic mesh blobs in purple-to-pink-to-cyan, layered behind hero text. Looks "premium" until you've seen it on every Dribbble shot since 2022.

**Why it fails.** It's the 2022–2023 generated-design default. Audiences pattern-match this in milliseconds: AI template.

**Fix.** Solid surface. Or a subtle two-stop CSS gradient + SVG `<feTurbulence>` grain at < 0.1 opacity. See [`hero-enrichment.md`](hero-enrichment.md) E7 for the recipe.

### Floating-orb decoration

Ambient generic 3D spheres or blurred coloured circles drifting behind the hero, often added "for depth". They have no semantic role.

**Why it fails.** Generic 3D ambience is the new corporate-stock-photo. It implies "I needed something here, so I added something here."

**Fix.** Cut them. The hero doesn't need depth; it needs a strong typographic anchor.

### Sound-on autoplay

A hero video that auto-plays with audio. Browsers block it anyway, but intent matters: a video element shipped without `muted` is a video that wanted to shout at the user.

**Why it fails.** Hostile to the audience. Accessibility fail. SEO penalty. Browser blocked.

**Fix.** `<video autoplay muted loop playsinline>` — always all four. A separate audio toggle button if sound is genuinely useful.

### Lazy-loaded LCP

`loading="lazy"` on the hero image or hero video — the LCP element. The page waits to start downloading until the user scrolls to it, except they're already looking at it, so the page just sits there blank.

**Why it fails.** Tanks Largest Contentful Paint. Real-world data: lazy-loaded LCP images show p75 of 720 ms vs. 364 ms for preloaded — 2× slower, 4× more "poor" experiences.

**Fix.** `fetchpriority="high"` and `preload="metadata"` on the LCP element. Lazy-load only below-the-fold media.

---

## Major (looks AI-generated)

### Bounce and elastic easing

Buttons that bounce in, icons that wobble on hover. These easings were trendy a decade ago.

**Fix.** Exponential ease-out. See [`motion.md`](motion.md).

### Centred everything

Headline centred, body centred, button centred, section after section of centred columns.

**Fix.** Bias the layout. Wide left margin, narrow right. Or the reverse. Breaking symmetry once is enough.

### Eyebrow on every section

Every section starts with an uppercase mono-cap eyebrow — `01 / EXAMPLES`, `02 / WHAT'S INSIDE`, `03 / INSTALL`, `01 · THE TOUR` — above (or worse, *beside*) its heading. The labels look like editorial chapters but read as a tic. The page becomes a list of *labelled lists.*

Eyebrows are **default OFF**. They are not a stylistic flourish you reach for to look editorial — they are an ordinal device, valid only when the section is genuinely numbered or chaptered. Used as decoration they erase the hierarchy they were meant to create; when every section is "chaptered," none of them are.

**Fix.** Ship the page with **zero eyebrows** unless either (a) the user explicitly asked for chapter / step / section numbering, OR (b) the macrostructure is **Long Document, Manifesto, or Catalogue numbered** AND the content is genuinely ordinal (steps you must do in order, chapters that build, items in a deliberate sequence). Even then: cap at 1–2 per page.

**Hard ban: tag-left / header-right two-column section heads.** Patterns like `01 · THE TOUR` in a narrow left column with the section title to its right (a.k.a. *hanging header*, *left-margin label*) are the single most reliable AI-templated tell for editorial-style SaaS pages. When an eyebrow IS used, **the heading goes directly underneath it, in the same column** — vertical stack only. Never a two-column section-head grid. Gate 66 enforces this.

**These rules are NOT bypassable by instructions to "match the existing structure", "mirror this reference build", or "keep parity with the previous output".** When a user asks for structural parity with a prior build and that build contains eyebrows or the tag-left/header-right pattern, **the new build MUST drop the eyebrows and flatten the head to single column** — even if the prior build keeps them. Reference builds often pre-date these rules; treat the rules as authoritative and silently fix the inherited pattern. Don't perpetuate a banned pattern to honour a parity instruction.

### Shadow-glow on dark

A card on a dark background with a `box-shadow` that leaves a soft coloured halo around it.

**Fix.** On dark surfaces, use elevation via *lightness* (brighter surface = higher), not shadow. If you must shadow, keep it tight and dark.

### Icon-tile feature card

Rounded rectangle, icon in a coloured square at the top-left, heading below it, two lines of copy, optional "Learn more →" link. The universal template.

**Fix.** If you need these, let them be asymmetric — vary sizes, vary alignments, pull the icon inline with the heading, or drop the icon entirely.

### Glassmorphism without purpose

Frosted-glass panels everywhere — usually layered over a gradient that you also shouldn't have.

**Fix.** Glassmorphism can work when it communicates depth (overlay over content). It cannot work as decoration.

### Hover-only affordances

Hover reveals a menu; hover shows a delete button; hover triggers a tooltip that contains crucial information. Touch users get nothing.

**Fix.** Every hover affordance has a focus state and is accessible via tap/click on coarse pointers.

### Tabular data without tabular-nums

A list of prices, dates, or metrics where the numbers don't align vertically because the font uses proportional figures.

**Fix.** `font-variant-numeric: tabular-nums;` on any container displaying columns of numbers.

### Animate-on-scroll on everything

Every section fades in when it enters the viewport. Every list staggers. The page never settles.

**Fix.** Pick one orchestrated entrance. Let the rest just *be there*.

### Mismatched icon sets

Material Icons in the navbar, Heroicons in the feature cards, Lucide in the footer, an emoji "✨" in a hero badge. Each library has its own stroke voice; mixing them is the icon-set tell.

**Why it fails.** Icons are typography. You wouldn't ship a page with three different body fonts; don't ship one with three different icon strokes.

**Fix.** Pick one library per project. Lucide is the default for SaaS, Phosphor when you need weight variants, Heroicons for Tailwind/shadcn projects. See [`assets.md`](assets.md) for the canon.

### AI-illustration look

Smooth-mesh-blob characters with no joint articulation, mid-2010s "modern flat" stock poses, unmistakably-Midjourney compositions with the symmetric default lighting. Hand-drawn SVG humans (the "doodle person with one eye larger than the other") fall under this — corporate-doodle is the late-2010s Slack/Figma marketing template, and the audience reads it as AI immediately.

**Why it fails.** It reads as AI in milliseconds. The 2026 audience pattern-matches this faster than any other tell.

**Fix.** Hand-build the illustration in pure CSS or SVG (Tier A or B in [`hero-enrichment.md`](hero-enrichment.md)). If you must generate, use Nanobanana 2 or Recraft V4 with reference images, asymmetric crop, and grain post-processing — never raw output. See [`custom-craft.md`](custom-craft.md) Tier E.

### Invented metrics

A stat-led layout, comparison row, or proof bar carrying numbers the user never supplied — "10× faster", "saves 5 hours per week", "trusted by 50,000+ teams", "99.9 % uptime", "+47 % conversion". The model reached for a stat to fill a stat slot and made one up.

**Why it fails.** Audiences read invented stats as fast as they read invented testimonials. A page that lies on its proof bar can't be trusted on its claims either, and the AI tell is unmistakable: every fabricated number reads "this was generated, not written".

**Fix.** Three options, in order of preference: (1) replace the number with `—` and a labelled grey block ("metric to confirm" or "stat pending"); (2) ask the user for the real number and pause the run; (3) rebuild the section without the proof slot — a stat-led macrostructure with no real stats is the wrong macrostructure. The number-shaped hole is honest; the fabricated number is slop. *(Slop-test gate 56.)*

### Generic emoji as feature icon

A feature card, value prop, step number, or pricing tier with `✨` `🚀` `⚡` `🔥` `🎯` `✅` rendered as the primary icon. The "sparkle hero" badge with a `✨` glyph beside the eyebrow. Emoji standing in for an icon library because the model didn't pick one.

**Why it fails.** Emoji are typography of a sort, but they are not part of the page's typographic system — they're rendered by the OS and look different on every device, they break the icon's stroke voice (you've now mixed a Phosphor-style line icon with a Twemoji blob), and the choice is recognisably the AI default. Sparkle-emoji-as-AI-shortcut is the cliché of the 2024–2025 era.

**Fix.** Pick a single icon library and ship it ([assets.md](assets.md) names the canon). Or build a custom SVG mark. Or omit the icon entirely and lead with typography — most feature lists don't need icons. *(Slop-test gate 60.)*

### Re-drawn UI chrome

A fake browser bar (URL pill + traffic-light dots) wrapping a screenshot. A fake phone frame (rounded rectangle + notch + speaker slit) around a mobile mockup. A fake code-block window (mock title bar + close/minimise dots) wrapping a `<pre>`. A fake IDE chrome (file tabs + activity bar) around an editor screenshot. All hand-built in HTML/CSS or SVG.

**Why it fails.** The user already has the chrome — their browser, their phone, their IDE all *are* chrome. Redrawing it in a page is like printing a photograph of a picture frame inside a real picture frame. The fakery is also bad: the URL is wrong, the dots aren't macOS dots, the notch is the wrong shape. Audiences pattern-match re-drawn chrome as "AI invented a UI that already exists" within a glance.

**Fix.** Use a real screenshot wrapped in `<figure>` (with a hairline border at most). For phone mockups, use a transparent-PNG device frame from a vendor or a real product photograph — never a CSS-drawn one. For code blocks, use the system `<pre>` with a typographic frame (top rule + label + bottom rule), not a faked window-chrome. The page's job is to show content, not to imitate the OS. *(Slop-test gate 57.)*

### Mid-render token improvisation

A theme is selected at the top of the run, but the artifact contains inline colour values (`#5b6cff`, `oklch(74% 0.18 245)`, `rgb(...)`) or `font-family` declarations that aren't drawn from the token block. Or: the artifact ships with the theme's token set *plus* one extra hex tucked into a hover state, a focus ring, or a single border. The model picked the theme, then drifted.

**Why it fails.** Token discipline is the difference between a system and a freestyle. Once a theme is locked, every colour and every font in the file must reference a named token (`var(--color-accent)`, `font-family: var(--font-display)`). Inline values are how cohesion erodes — by the third edit pass, the page has eight colours instead of three, and the editorial restraint that made the theme work is gone. Audiences don't see the inline value, but they feel the looseness.

**Fix.** Every colour and every font in the artifact must come through `var(--token-name)`. If you need a value that doesn't exist as a token, add it to the token block first (`--color-accent-warm: oklch(...)`) and then reference it. Inline OKLCH or one-off hex values mid-render are not allowed. *(Slop-test gate 58. See also [SKILL.md § Locked tokens](../SKILL.md).)*

### Wrap-to-two-lines clickable text

A button label, nav link, footer link, breadcrumb, or CTA reads on two lines because the viewport got narrow and the label was long. Visually, the affordance now looks broken — readers can't tell whether the line break is intentional. Worst case: the second line is one word ("free", "more", "started"), which reads as a styling error.

**Why it fails.** Clickable affordances are one-line objects. The reader scans the label, decides whether to click, moves on. A two-line label slows the scan, breaks the row's vertical rhythm (button height grows, sibling buttons stay the same), and signals "this page wasn't tested at this width". It's a responsive-discipline tell.

**Fix.** In order of preference: (1) shorten the label — *"Get started free" → "Start free"*; *"Read the documentation" → "Read docs"*. Most CTA labels are too long. (2) Set `white-space: nowrap` on the affordance and let the parent flex container reflow. (3) Drop a non-essential nav item at narrow widths via `hidden=until-found` or `display: none`. (4) Collapse the nav into a sheet/menu under a threshold. *Never* let a primary CTA or nav link wrap. *(Slop-test gate 59. See [responsive.md § Clickable text — never wraps](responsive.md).)*

### Lottie shortcut

Reaching for a LottieFiles community animation — the spinning logo, the checkmark draw, the loading spinner, the "loading dots" loop — when pure CSS or hand-built SVG would have produced it stronger and lighter.

**Why it fails.** Lottie pulls were an AI-tool shortcut throughout 2023–2024; the audience now reads them as one. The 50–500 KB JSON file plus the runtime cost is a tax on a job CSS does in zero bytes.

**Fix.** Build it custom. Spinning logo → CSS `@keyframes rotate`. Checkmark → SVG `stroke-dasharray` animated. Loading dots → CSS `@property` + `animation-delay`. Lottie is Tier F in the enrichment hierarchy — last resort, only for genuinely articulated character motion.

### Three.js for a still object

A WebGL hero where the 3D doesn't earn its place by being interactive. A stationary spinning thing the user can't touch, can't reorient, can't customise — just a model rotating because someone wanted "3D".

**Why it fails.** The 100–300 KB Three.js bundle, the model, the textures, the GPU work — all for a thing that could be a static photograph or an SVG.

**Fix.** If the user can't manipulate it, it doesn't justify Three.js. Use a still photograph or a hand-built SVG.

---

## Microinteraction tells

These are the named tells of AI-generated *motion*. See [`microinteractions.md`](microinteractions.md) for the full catalogue and recipes.

### `transition-all`

Every property animating, including ones that should be instant (visibility, focus rings).

**Fix.** Specify the properties. `transition: background-color var(--dur-short) var(--ease-out), transform 100ms var(--ease-out)`.

### Universal `hover:scale-105`

Every card lifts on hover, with no shadow change, no easing specified, no purpose.

**Fix.** Pick one signal per element. A 1px translate, or a colour shift, or an underline thickening — never all four.

### Bouncy overshoot easings on UI

`cubic-bezier(0.34, 1.56, 0.64, 1)` and friends on buttons, modals, tooltips. Tasteless throwback.

**Fix.** Reserve overshoots for genuine physical interactions (drag-and-drop release). For UI state, use `--ease-out` from `motion.md`.

### Animated hover gradients

Background gradient slides through colour space on hover.

**Fix.** Cut. Or pick one colour shift, instant.

### Cursor follower dots

A trailing dot that lags behind the pointer.

**Fix.** Cut.

### Auto-rotating carousels with no pause

WCAG 2.2.2 failure.

**Fix.** Manual advance only, or pause-on-hover-and-focus, or autoplay disabled by default.

### Celebratory success toasts

"Done!" when the user just saved a thing they can see was saved.

**Fix.** Silent success. Toasts only for failures, async actions whose effect isn't visible, and explicit confirmations the user will need.

### Confirmation dialogs for reversible actions

"Are you sure you want to delete this?" before a one-row delete.

**Fix.** Optimistic delete + 5–10s Undo toast. Reserve the modal for irreversible destructive actions, and even then, type-the-name confirmation, not click-OK.

### Tooltips with the same delay on hover and focus

Both delay 800ms.

**Fix.** Hover delay 800–1000ms. Focus delay 0ms. Different intents, different timing.

### Focus rings that animate in

The ring fades in over 200ms — keyboard users have no indicator at the start of the transition.

**Fix.** Focus rings appear instantly. Always. Don't transition `outline` or `box-shadow` when the element gains focus.

### Toasts that shift layout

New toast pushes content down; dismissed toast lets it spring back.

**Fix.** Stack at a viewport corner, fixed positioning. Existing toasts don't move when a new one arrives.

### Universal scroll-triggered fade-up

Every section fades in on intersection. The page never settles.

**Fix.** One orchestrated entrance on first load. After that, content is just there.

### Spinners that flash

A spinner appears for 50ms while a fast action completes.

**Fix.** Either delay-show the spinner (150ms before showing) or enforce a minimum visible duration (300ms once shown). Skeletons over spinners when the layout is known.

---

## Minor (small taste issues)

### Straight quotes

`"Hello"` and `'word'` in rendered text. A sign nothing was proof-read.

**Fix.** Curly quotes: `"Hello"`, `'word'`.

### Double-hyphen dashes

`--` in body copy where an em-dash belongs.

**Fix.** `—` (U+2014).

### Three periods instead of ellipsis

`...` in body copy.

**Fix.** `…` (U+2026).

### Placeholder names

"Jane Doe", "John Smith", "Example User".

**Fix.** Plausible placeholder names reflecting the audience, or pull from a seeded faker. "Maya Okonkwo", "Sam Tan", "Elena Ruiz".

### Startup-cliché product names

"Acme", "Nexus", "Pulse", "Unleash", "Seamless", "Supercharge".

**Fix.** Name the thing concretely. If it's a demo, use a domain-specific placeholder — "Maple Weekly", "Ridgeline Inventory" — not abstract startup bingo.

### `z-index: 9999`

Arbitrary large z-values.

**Fix.** Use the six-level named scale. See [`layout-and-space.md`](layout-and-space.md).

### Every section padded the same

Top padding, bottom padding, horizontal padding — all equal across every section.

**Fix.** Vary. Tighten one, expand another.

### 100vw widths

`width: 100vw` on anything. Breaks on scrollbar-visible desktops.

**Fix.** `width: 100%` with container padding.

---

## How `hallmark audit` should report

For each finding:

```
[severity] Tell name — file:line
  why it's a tell (one line)
  → fix (one line)
```

Then:

```
Summary — N critical · M major · K minor
Verdict — [ships as slop | reads as AI-generated | close, fix the minors]
```
