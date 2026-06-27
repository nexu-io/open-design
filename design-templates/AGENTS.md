# design-templates

This directory holds **design templates** — packaged "shapes" the agent
renders into a project artifact (decks, prototypes, image/video/audio
templates, …). Each entry is a folder with a `SKILL.md` (same shape as
functional skills) plus rendering side files (`example.html`,
`assets/`, `references/`, …).

If the entry primarily *does work* on user input — utilities, briefs,
asset packagers, fidelity audits — it belongs under `../skills/`
instead. See `specs/current/skills-and-design-templates.md` for the
full split.

## Expanded case libraries

Some design-template entries are structured case libraries rather than a single
rendering template. Keep their source JSON as the durable data model and make
`example.html` an original lightweight preview.

- `personal-blog-projects/` captures personal blogs and digital gardens as
  sites, pages, and blocks.
- `commercial-product-launches/` captures business-grade product websites and
  launch campaigns as brands, pages, reusable modules, media asset needs,
  motion patterns, commerce paths, and responsive art-direction notes. Do not
  scatter these references into generic landing-page templates unless the
  source is only useful as one standalone page shape.
- `product-ui-projects/` captures SaaS consoles, dashboards, admin tools, CRM
  systems, AI workspaces, and other complex software products as project-level
  surface suites. Use it when the useful design value spans multiple product
  pages, flows, states, or components. If fewer than three concrete surfaces
  were inspected, keep the entry as `captureDepth: single-page-lead` and add it
  to the backfill queue instead of presenting it as a complete suite.

## Daemon plumbing

- Listed under `/api/design-templates`. The shape mirrors `/api/skills`
  (same `SkillSummary`/`SkillDetail` types) so the web client can
  reuse a single `SkillSummary[]` consumer for both surfaces.
- Asset and example routes (`/api/skills/:id/example`,
  `/api/skills/:id/assets/*`) intentionally span both registries — the
  example HTML rewrites to `/api/skills/<id>/...` regardless of which
  root owns the folder, so URLs keep resolving after the split.
- Surfaced in the EntryView Templates tab and in the New-project panel
  as the rendering catalogue.

## Adding a design template

1. Create `design-templates/<my-template>/SKILL.md` with `name`,
   `description`, `triggers`, and an explicit `od.mode` (one of
   `prototype`, `deck`, `template`, `image`, `video`, `audio`).
2. Ship a baked `example.html` (and any side files) so the EntryView
   gallery has something to preview.
3. Optionally drop additional baked samples under `examples/<key>.html`
   to surface them as derived `<parent>:<key>` cards.

For the local `overview.html` catalogue, every visual template should be
previewable inside a card with a local iframe. Prefer `example.html` for the
primary preview; when a template is a suite, `examples/*.html` may be used as
the embedded preview fallback. Do not use an external website URL as the
embedded template preview.

If you also refresh the root `overview.html` catalogue after adding a
template, generate card data with `JSON.stringify` or an equivalent
structured serializer. Do not hand-concatenate JavaScript strings from
descriptions or font names; copied newlines can break the whole static
catalogue. Validate that Templates has zero missing local preview paths, then
use the `overview.html` steps in `../docs/overview.md`.

## Deck preview navigation contract

Any template with `od.mode: deck` must make its baked `example.html`
usable inside the gallery iframe without relying on the host app to add
navigation. Use a shared deck runtime where one is available; otherwise
ship a tiny local runtime with the same minimum behavior.

- **Keyboard:** `ArrowRight` / `ArrowDown` / `PageDown` / `Space` move to
  the next slide; `ArrowLeft` / `ArrowUp` / `PageUp` move to the previous
  slide; `Home` and `End` jump to the first and last slide. Ignore events
  from inputs, selects, textareas, and editable regions.
- **Wheel / trackpad:** accumulated `deltaX + deltaY` past a small threshold
  moves exactly one slide, then resets quickly so a single gesture does not
  overshoot.
- **Touch:** a horizontal swipe of roughly 50px or more, greater than the
  vertical movement, moves previous / next.
- **Dots:** render one clickable button per slide, update the active dot on
  every navigation path, and mark it with `aria-current="true"`.
- **Active slide state:** keep the visible slide marked with
  `.slide.active`; adding `.is-active` as a compatibility alias is fine.
  Open Design's preview bridge reads this state for the host slide counter,
  so it must stay in sync with keyboard, wheel, touch, and dot navigation.
- **Iframe safety:** focus the deck on load / pointer interaction so keyboard
  navigation works after the gallery preview appears. Avoid
  `scrollIntoView()` because it can move the parent page instead of the deck.
- **Fallbacks:** no-script and print output should still expose every slide.
  Hide non-active slides only after the runtime has booted.
