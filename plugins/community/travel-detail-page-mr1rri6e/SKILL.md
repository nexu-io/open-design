---
name: travel-detail-page
description: Build, adapt, audit, or refactor Aurora-style travel itinerary/detail pages. Use when the user asks to preserve this website's current travel-detail format, motion, interactions, color system, brand assets, typography, bilingual behavior, image carousels, itinerary timeline, accommodation cards, activity tabs, pricing blocks, parent-experience section, or static Netlify-ready Vite/React implementation.
---

# Travel Detail Page

Create or modify polished travel detail pages using the current Aurora Chiang Mai camp website as the canonical pattern. Preserve the page's format, motion, interaction logic, color system, brand marks, typography, and image-handling behavior unless the user explicitly asks for a redesign.

Before visual or implementation work, read `references/current-aurora-system.md`.

## Core Rule

Treat this as an experiential travel detail page, not a generic landing page.

Keep the page image-led, itinerary-led, and brand-led:

- fixed pill header with Aurora mark, anchor navigation, CTA, and language toggle
- full-viewport hero with verified image rotation, dark green overlay, session strip, and two actions
- editorial sections for philosophy, camp context, accommodation, itinerary, activities, pricing, parent enjoyment, guidelines, final CTA, and footer
- deep forest green, red brick, mist, lichen, and sun-yellow palette
- self-hosted AuroraSheetSans font and Aurora Discovery brand assets
- bilingual typography, language switch, first-screen loading gate, verified galleries, and mobile smoothness standards from the France/Switzerland camp page
- GSAP reveal, parallax, route-line, and desktop pinned horizontal schedule motion
- safe image loading with preload, post-entry gallery warmup, pending state, failed-image fallback, thumbnail controls, and reduced-motion support

Do not replace this with template SaaS cards, generic hero gradients, purple AI visuals, stock-like decoration, or unrelated component systems.

## Workflow

1. Inspect the current files before editing:
   - `src/App.tsx` for structure, carousel state, motion, translation, and section components.
   - `src/styles.css` for tokens, layout, responsive rules, and animation states.
   - `src/data/camp.ts` for itinerary, activities, accommodation, pricing, parent routes, and contact data.
   - `public/assets/brand/` and `public/assets/photos/` for brand and image paths.
2. Change structured data first when the user asks for copy, schedule, pricing, activity, image, or contact updates.
3. Change components only when the existing data model cannot express the request.
4. Preserve verified-image behavior. Do not switch a visible image to a requested image until the new source has loaded successfully.
5. Preserve gallery overlays as fixed dialogs rendered outside scroll/visibility-optimized sections, preferably through a React portal.
6. Preserve post-entry gallery image warmup. Gallery images must not block first-screen loading, but should be silently prefetched through a throttled idle queue after the page is ready.
7. Preserve stable visual containers. Carousel windows and card image stages must keep a fixed aspect ratio and fill with `object-fit: cover`.
8. Preserve bilingual behavior. New visible copy should have a matching entry in `translations` or localized data if the page remains bilingual.
9. Run verification after edits:
   - `npm run typecheck`
   - `npm run build`
   - inspect generated `dist/index.html` for language/title/meta changes when relevant
   - verify key image assets exist and return successfully if deployed
10. Deploy only when requested. Use the existing Netlify static deploy path and verify the production URL after publish.

## Page Blueprint

Use this section order unless the user asks for a structural change:

1. `Header`: fixed pill header, collapses on scroll, expands by clicking brand mark.
2. `Hero`: image carousel, overlay, large title, summary, session strip, CTA buttons.
3. `Philosophy`: short manifesto and numbered principle rows.
4. `Camp`: site story, facts, large static image plus camp carousel.
5. `Stay`: accommodation grid with estate and room carousels.
6. `Schedule`: 7-day horizontal timeline on desktop, stacked cards on mobile.
7. `Activities`: horizontal tab index plus one active activity panel.
8. `Pricing`: plan cards with accordion include panels plus rules sidebar.
9. `ParentEnjoyment`: shorter playful parent route board with supplied icon assets.
10. `Guidelines`: safety and camp conduct list.
11. `FinalCta`: image-backed closing CTA.
12. `Footer`: brand mark, contact links, language toggle, disclaimer.

## Visual Guardrails

- Use the existing CSS custom properties from `src/styles.css`; do not introduce a second palette.
- Keep `--radius: 8px` for cards and framed image surfaces; use full pills only for header/buttons/round controls.
- Use AuroraSheetSans via `@font-face`; do not import external web fonts.
- Use real photos as primary visual assets. Do not replace photo-led sections with SVG illustrations.
- Use `lucide-react` because the project already depends on it. Do not add a second icon family.
- Keep text size responsive with `clamp()` and preserve mobile line wrapping.
- Keep the page quiet and editorial. Motion should support exploration, not behave like a game.

## Interaction Guardrails

- Carousels must pause on pointer/focus and resume on leave/blur.
- Use arrow buttons plus thumbnails for photo galleries.
- Start gallery-image prefetch only after the page has entered. Use an idle, throttled queue; never include gallery images in the first-screen loading gate.
- Disable failed thumbnails instead of endlessly retrying.
- Respect `prefers-reduced-motion` for GSAP and autoplay behavior.
- Keep `aria-busy`, `aria-pressed`, `aria-selected`, `aria-live`, and tab roles for interactive areas.
- Use smooth anchor navigation offset by the fixed header height.

## Reuse Pattern

For a new travel detail page, keep the component architecture and replace data:

- destination and product name
- hero slides
- sessions/dates
- daily itinerary
- activity tabs
- accommodation/gallery data
- pricing and rules
- parent route ideas
- contact links
- translations

Only redesign when the destination or brand has a different identity. If the user asks to keep the current look, treat the current Aurora visual system as locked.

## Provenance

Formalized by Open Design from candidate 847f1791-eec2-41a7-ab75-4e685d4c2727.
