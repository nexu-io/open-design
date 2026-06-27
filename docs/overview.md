# Open Design Resource Overview

`overview.html` is a local, static catalogue for the design resources bundled with this repository. It is useful when browsing the current library before adding a new design system, design template, or functional skill.

## Preview

The hosted catalogue is deployed from `main` with GitHub Pages:

```text
https://nexu-io.github.io/open-design/
```

The Pages workflow builds a static package from `overview.html`, copies it to
`index.html`, and includes the local iframe dependencies under `catalog/`,
`design-templates/`, `design-systems/`, and `skills/`.

Open the file directly for a quick look:

```bash
open ~/projects/open-design/overview.html
```

Run a local server when preview behavior depends on browser URL loading or iframe paths:

```bash
cd ~/projects/open-design && python3 -m http.server 8765
```

Then visit:

```text
http://127.0.0.1:8765/overview.html
```

Use the local server only when validating unmerged changes. Once changes land
on `main`, the hosted Pages preview should be the default way to browse the
latest overview.

## What It Covers

The page is an index over three resource families:

- `skills/`: functional skills the agent invokes mid-task to do work on user input.
- `design-templates/`: renderable artifact templates such as prototypes, decks, image/video/audio templates, and example HTML previews.
- `design-systems/`: portable `DESIGN.md`-based visual systems with optional tokens, manifests, components, preview pages, and source evidence.

It also includes one expanded case-library view:

- `Commercial Launches`: a dedicated overview section powered by
  `design-templates/commercial-product-launches/references/catalog.json`. It
  indexes commercial product websites and launch campaigns across five levels:
  brands, pages, modules, media assets, and motion patterns.
- `Product UI Projects`: a dedicated overview section powered by
  `design-templates/product-ui-projects/references/catalog.json`. It indexes
  SaaS consoles, dashboards, admin tools, CRM systems, AI workspaces, and other
  multi-surface software products across projects, surfaces, flows, states, and
  components.
- `Blog Projects`: a dedicated overview section powered by
  `design-templates/personal-blog-projects/references/catalog.json`. It
  indexes personal blogs, digital gardens, indie developer sites, and reusable
  blog-building projects across three levels: whole sites, individual pages,
  and reusable blocks.

Treat `overview.html` as a browseable catalogue, not the source of truth. New design knowledge should be added to the correct resource directory first, then surfaced through the overview.

## Adding Frontend Design Inspiration

When collecting a strong frontend design from another project, first capture the evidence:

- Source URL or local screenshot path.
- What makes it valuable: layout, component pattern, information density, typography, color, motion, interaction, or product context.
- Any constraints: licensing, attribution, brand specificity, responsive behavior, or accessibility considerations.

Then classify it:

- Use `design-systems/<slug>/` when the useful part is a reusable visual language, brand system, token set, typography system, or interaction rules.
- Use `design-templates/<slug>/` when the useful part is a reusable rendered shape, such as a dashboard, landing page, card set, mobile flow, deck, poster, or animated HTML artifact.
- Use `design-templates/product-ui-projects/` when the source is a software
  product or console whose value spans multiple product surfaces, flows, states,
  or reusable UI components. Do not reduce these captures to one dashboard or
  homepage screenshot.
- Use `design-templates/commercial-product-launches/` when the source is a
  commercial product launch page, premium product website, campaign-commerce
  page, or brand page whose value depends on modular page narrative, product
  media, motion, conversion paths, and responsive art direction. Do not reduce
  these captures to a single hero template.
- Use `skills/<slug>/` when the useful part is an agent workflow or method that helps produce, critique, transform, or package design work.

### Commercial Product Launches

Use `design-templates/commercial-product-launches/` when the source is a
business-grade product website or campaign page such as a hardware launch,
vehicle page, premium DTC product page, B2B platform homepage, or retail
campaign. These references should be captured as modular production systems,
not copied as brand assets.

For each captured commercial launch, update
`design-templates/commercial-product-launches/references/catalog.json` with:

- `brand`: name, sector, and public URL.
- `page`: title, URL, and page type.
- `why`: why the page is worth keeping as a commercial design reference.
- `chapters`: narrative beats and what each section proves.
- `modules`: reusable page modules such as hero, comparison, proof,
  category grid, solution grid, commerce, support, or FAQ.
- `mediaAssets`: required asset types such as product renders, macro details,
  UI mockups, lifestyle photos, category images, videos, and mobile crops.
- `motionPatterns`: scroll chapters, sticky media, carousels, reveals, and
  reduced-motion fallback notes.
- `commercePatterns`: buy CTAs, compare links, trade-in, financing, shipping,
  returns, support, expert help, or guided selling.
- `responsiveNotes`: breakpoint-specific layout and art-direction notes.
- `implementation`: performance, accessibility, and complexity notes.
- `capture`: date, source links, attribution, reuse policy, and capture depth.

Commercial examples are inspiration-only unless explicitly licensed otherwise.
Record source URLs and reusable principles; do not vendor product imagery,
brand marks, campaign videos, or source code.

### Product UI Projects

Use `design-templates/product-ui-projects/` when the source is a SaaS console,
dashboard, admin tool, CRM, AI workspace, or other software product whose
design value depends on more than one screen.

For each captured product UI project, update
`design-templates/product-ui-projects/references/catalog.json` with:

- `project`: name, sector, public URL when available, and project type.
- `why`: why the project is worth keeping as a product UI reference.
- `surfaces`: concrete pages or screens such as dashboard, detail, settings,
  create/edit, analytics, billing, and mobile. Use exact URLs for external
  references and local preview paths for bundled examples.
- `flows`: cross-page task paths such as onboarding, create, review, configure,
  checkout, and team administration.
- `states`: empty, loading, error, permission, success, dense-data, and other
  product states that should not disappear from the design reference.
- `components`: reusable UI parts such as nav, table, filters, command palette,
  chart panel, and activity feed.
- `capture`: date, source links, attribution, reuse policy, and capture depth.

If fewer than three concrete surfaces were inspected, set
`capture.captureDepth` to `single-page-lead` and keep the entry in the backfill
queue. Only use `surface-suite`, `flow-suite`, or `full-product-reference` when
the source evidence supports that depth.

### Personal Blog Projects

Use `design-templates/personal-blog-projects/` when the source is a personal
blog, digital garden, independent developer site, newsletter archive, or
blog-building theme/starter. Do not reduce these captures to a homepage
template. Personal-blog value often lives in the article page, archive, tags,
project index, reading list, digital garden graph, sidenotes, search, RSS,
comments, weekly issue list, and other small page-level blocks.

For each captured blog project, update
`design-templates/personal-blog-projects/references/catalog.json` with:

- `site`: name, author, primary URL, language, region, site type, feed URL,
  source URL, and license status.
- `why`: the reason the blog is worth keeping as a design reference.
- `pages`: concrete page-level references with exact URLs and reusable design
  notes. Valid page types include `home`, `post`, `archive`, `tags`,
  `project`, `about`, `now`, `garden`, `newsletter`, `reading-list`,
  `library`, `interactive-essay`, `search`, and `404`.
- `blocks`: smaller reusable patterns with exact reference URLs, such as
  sidenotes, hover previews, code playgrounds, weekly lists, project cards,
  backlinks, graph navigation, RSS prompts, comments, sponsorship, and table
  of contents.
- `implementation`: framework/theme, content format, search, RSS, SEO, dark
  mode, comments, deployment, and complexity when known.
- `capture`: date, source links, attribution, reuse policy, and capture depth.

If only the homepage was inspected, set `capture.captureDepth` to
`homepage-only`. Do not infer full-site page or block patterns from one page.
Keep external sites as source links and structured observations unless their
license explicitly allows copying code or assets.

## Recommended Asset Shape

For a design system, prefer the project shape documented in `design-systems/README.md`:

```text
design-systems/<slug>/
|-- manifest.json
|-- USAGE.md
|-- DESIGN.md
|-- tokens.css
|-- components.html
|-- components.manifest.json
|-- assets/
|-- fonts/
|-- preview/
`-- source/
```

For a design template, prefer:

```text
design-templates/<slug>/
|-- SKILL.md
|-- example.html
|-- assets/
`-- examples/
```

Every visual design template should expose a local preview that the overview can
embed. Use `example.html` for the primary sample. If the template is a suite,
put alternate baked samples under `examples/*.html`; the overview and asset
catalog may use the first stable HTML sample when `example.html` is absent.
Do not use external URLs as embedded iframe previews.

For a functional skill, prefer:

```text
skills/<slug>/
|-- SKILL.md
|-- assets/
|-- references/
`-- scripts/
```

Only create the optional folders that the entry actually needs.

## Maintenance Loop

1. Collect the design evidence.
2. Decide whether it belongs in `design-systems/`, `design-templates/`, or `skills/`.
3. Add the smallest useful asset shape.
4. Include a local preview when the asset is visual.
5. If `overview.html` is refreshed, generate the `CARDS` data with a structured serializer such as `JSON.stringify`; do not hand-concatenate JavaScript object literals. Normalize free-text fields so embedded newlines, quotes, bullets, and copied font names cannot break the script.
6. Validate the refreshed page script before opening it:

```bash
perl -0777 -ne 'print $1 if /<script>([\s\S]*)<\/script>/' overview.html > /tmp/overview-script.js
node --check /tmp/overview-script.js
```

7. Reopen `overview.html` to confirm the entry is discoverable and the card grids render, not only that the search inputs appear.
8. Run `node --import tsx scripts/build-github-pages-site.ts` when changing the
   hosted overview package shape. The generated site root lives in
   `.tmp/github-pages-site` by default and should contain `index.html`,
   `overview.html`, `.nojekyll`, and the static resource roots used by iframe
   previews.
9. When the asset is ready for upstream contribution, use the `od-contribute` skill to validate, package, and open a PR.

## Updating `overview.html` Safely

`overview.html` is a static browseable catalogue with an inline `CARDS` dataset. The most common failure mode is a copied field that inserts a raw newline into a JavaScript string, which stops all rendering and leaves only the static search boxes visible.

When adding new materials:

- Treat `overview.html` as generated catalogue output.
- Build card data as plain objects first, then serialize with `JSON.stringify(cards, null, 2)`.
- Collapse or escape raw newlines in `name`, `desc`, `cat`, `preview`, `colors`, and `fonts`.
- Keep search as a secondary control; the default view must remain a browseable grid for users who do not know what exists.
- A valid refresh must pass `node --check` on the extracted inline script and show nonzero cards in `#grid-skills`, `#grid-templates`, `#grid-ds`, and the Blog Projects grids (`#grid-blog-sites`, `#grid-blog-pages`, `#grid-blog-blocks`) when the personal-blog catalog is present.
- When the product UI catalog is present, the Product UI Projects grids
  (`#grid-product-ui-projects`, `#grid-product-ui-surfaces`,
  `#grid-product-ui-flows`, `#grid-product-ui-states`, and
  `#grid-product-ui-components`) must render from generated data.
- When the commercial launch catalog is present, the Commercial Launches grids
  (`#grid-commercial-brands`, `#grid-commercial-pages`,
  `#grid-commercial-modules`, `#grid-commercial-assets`, and
  `#grid-commercial-motion`) must also render from generated data.
- Visual resource cards should embed only local previews. Templates, design
  systems, and product UI project surfaces may use lazy iframe previews inside
  cards; pure workflow skills and external source URLs should remain links or
  modal-only previews.
- Template preview coverage is a maintained invariant: every
  `design-templates/<slug>/SKILL.md` entry that appears in the Templates page
  should have a local `preview` path in generated `CARDS`. Missing local preview
  paths should go into the daily backfill queue before adding more adjacent
  visual templates.

## Reuse From Other Projects

Other projects can use this repository as a design knowledge base by asking an agent to inspect:

- `docs/overview.md` for the catalogue workflow.
- `overview.html` for browsing the available resource set.
- `design-systems/` for reusable visual systems.
- `design-templates/` for renderable design shapes.
- `skills/` for agent workflows and design production methods.
