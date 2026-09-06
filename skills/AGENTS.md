# skills

This directory holds **functional skills** — capabilities the agent
invokes mid-task to do work on user input. Each skill is a folder with a
`SKILL.md` (frontmatter + body) and any side files (`assets/`,
`references/`, scripts, …) the workflow needs.

If the entry primarily *renders* a design artifact (deck, prototype,
image/video/audio template) it belongs under `../design-templates/`
instead. See `specs/current/skills-and-design-templates.md` for the
full split.

## Daemon plumbing

- Listed under `/api/skills` (functional only). User-imported skills
  shadow built-in entries with the same frontmatter `name`.
- Asset routes (`/api/skills/:id/example`, `/api/skills/:id/assets/*`)
  span both functional skills and design templates so existing
  `srcdoc`-rewritten URLs keep resolving after the split.
- Integrations → Skills surfaces this directory only. Renderable templates are
  read from the design-templates registry by the New project "Start from" rails;
  the redesigned home no longer has a top-level Templates tab.

## Adding a skill

1. Create `skills/<my-skill>/SKILL.md` with `name`, `description`,
   `triggers`, and `od.mode: utility` (or `design-system`) frontmatter.
2. Drop any side files alongside; reference them from the body using
   the relative-from-skill-root paths the daemon advertises in the
   skill preamble.
3. The daemon's lazy scanner picks the entry up on the next
   `/api/skills` request — no rebuild required during local dev.

## Routing validation catalogue

This branch intentionally ships no built-in functional Skill folders here.
The pinned template corpus lives under `design-templates/`; its provenance
and exact counts are recorded in `specs/current/skill-discovery-routing-catalog.md`.
Do not run the historical curated-skill seed script for this validation branch:
it would recreate retired candidates outside the pinned corpus.
