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
