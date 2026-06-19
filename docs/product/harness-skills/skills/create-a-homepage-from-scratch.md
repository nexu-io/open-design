# Create a Homepage from Scratch

Description: Build a production homepage from scratch while establishing the site's design system — brand theme tokens plus reusable, registered sections — so every later page can reuse it. Picks a visual direction from the lookbook or a reference the user already has.
URL: https://ploy.ai/workspaces/9f4992d3-b3ea-4bad-9520-910846dd91e3/ploybooks/create-homepage

Build a homepage from scratch AND establish the site's design system as you go. A from-scratch homepage is the first consumer of a design system you are creating now: brand theme tokens, plus reusable section components registered as `@ployComponent` entries. Build that way from the first file so the next page can reuse it — never a single monolithic `index.astro`. Work top to bottom; after a couple of early check-ins, if the user gives "just go" energy, build the rest continuously instead of stopping after every section.

## 1. Visual direction

The aesthetic comes first — everything flows from it. Establish it from one of two sources, and offer both:

- **A design the user already has.** If they describe an aesthetic, share an image/mockup, or give a URL, that is the primary target. Clone/extract a URL for direction; build a mockup faithfully (replace placeholder copy with real copy via the `copywrite` skill). A user-provided reference always wins over lookbook picks.
- **The lookbook.** Otherwise load `lookbook`, `search` → `peek`, and present 4 strong candidates to the user as an `askUser` gallery. In that **same** ask, include a fallback option inviting their own reference — "or do you have an existing design you'd like to use as inspiration? Describe it, share an image, or paste a URL" — as a custom input. Don't `read` every candidate; only after the user converges, `read` the chosen entry and `lookAt` its full-resolution screenshot.

Lock the chosen direction into the brand-guidelines doc and site `AGENTS.md`(reference ID/URL + the aesthetic rules to preserve). Re-view the reference screenshot immediately before any visual code — stored notes don't replace seeing it. If you'll deviate from the reference's composition, say so first; silent drift to generic defaults is a failure.

## 2. Establish the design system (before building sections)

- **Theme.** Set brand colors, light/dark, and a tasteful heading/body font pairing as Ploy theme tokens — `code` `apply-theme`, or edit `src/styles/globals.css` (`@theme inline`). Install fonts via `@fontsource`.
- **Reusable sections.** Build every section as its own component in a `sections/` directory, content-driven (props / typed content objects / arrays), and register it with complete `@ployComponent` JSDoc so it enters the design-system inventory. This is what makes the site reusable rather than a one-off page. Register the page shell too.

## 3. Build the page

- **Nav first** — desktop and mobile together, links rendered from one array, logo always visible. It frames the page.
- **Hero next — it sets the DNA.** Match the reference's structure: typography scale, CTA count/placement, imagery, whitespace, alignment. Real or generated imagery only — never fake imagery (skies, scenes, products, textures) with CSS/SVG/gradients. Screenshot-review the hero, present it once for approval, then carry its palette/type/rhythm forward.
- **Remaining sections** — write the full section list from the reference and the request, then build each as a registered reusable component with real copy (`copywrite` skill), consistent theme and spacing. Screenshot-review as you go.
- **Footer** — links, branding, dynamic copyright year (`new Date().getFullYear()`).

## 4. Imagery, motion, SEO, QA

- **Imagery** — stable placeholder frames first, then generated/real assets that match the hero's visual language; a distinct image per slot.
- **Motion** — one consistent reveal applied to section *contents* (not the section containers).
- **SEO** — single H1, logical heading hierarchy, title/description/OG/canonical; read the `seo-aeo-strategy-system` ploybook.
- **Final QA** — full-page screenshot review, remove dev artifacts, `bun run build`to confirm stability, then present.

## Done when

- Brand theme tokens are applied; sections are reusable `@ployComponent`components (not a monolithic `index.astro`); the homepage renders complete — nav, hero, offer/value, social proof, CTA, footer — on desktop and mobile; the build passes.