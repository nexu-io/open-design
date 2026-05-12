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
- The Settings → Skills panel surfaces this directory only; the
  EntryView Templates tab reads the design-templates registry instead.

## Adding a skill

1. Create `skills/<my-skill>/SKILL.md` with `name`, `description`,
   `triggers`, and `od.mode: utility` (or `design-system`) frontmatter.
2. Drop any side files alongside; reference them from the body using
   the relative-from-skill-root paths the daemon advertises in the
   skill preamble.
3. The daemon's lazy scanner picks the entry up on the next
   `/api/skills` request — no rebuild required during local dev.

## Curated design / creative catalogue

This directory also ships a curated catalogue of design and creative
skills hand-picked from `VoltAgent/awesome-agent-skills` and
`ComposioHQ/awesome-claude-skills`. Each entry is a lightweight stub —
frontmatter + a short body that points at the upstream repo — so the
Settings → Skills tab surfaces a rich, filterable list out of the box
without vendoring every upstream workflow.

- `od.category` on these stubs powers the new category filter row in
  Settings → Skills (e.g. `image-generation`, `video-generation`,
  `audio-music`, `slides`, `documents`, `design-systems`, `figma`,
  `animation-motion`, `3d-shaders`, `diagrams`, `creative-direction`,
  `marketing-creative`, `screenshots`, `web-artifacts`).
- The seed script lives at `scripts/seed-curated-design-skills.ts` and
  is **idempotent**: running it again only creates folders that don't
  already exist, so a hand-edited stub is never overwritten. Delete the
  folder under `skills/` and re-run the script to refresh an entry.
- Stubs intentionally do not vendor upstream assets. To run an upstream
  workflow with its original scripts and references, copy the upstream
  folder into your active agent's skills directory (Claude Code, Codex,
  Cursor, etc.) — the body of each stub explains how.
