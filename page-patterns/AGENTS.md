# page-patterns

This directory holds **page-level site patterns** — login, board list,
gallery, dashboard, profile, feed, and similar. Each entry is one
folder with a `SKILL.md` (same shape as `../design-templates/`) plus a
baked `example.html` the daemon serves to the gallery iframe.

Page patterns are the site-builder vocabulary: the future diagram
surface treats every pattern as a typed node, and the agent uses the
catalog when generating multi-page sites. Unlike `../design-templates/`
(decks, prototypes, image/video/audio renderers), every entry here is
a single web page and carries typed I/O metadata.

## Daemon plumbing

- Listed under `/api/page-patterns`. The shape mirrors
  `/api/design-templates` (same `SkillSummary`-derived response) and
  adds `pageType`, `pageInputs`, `pageOutputs` for downstream
  consumers.
- Asset and example routes (`/api/page-patterns/:id/example`,
  `/api/page-patterns/:id/assets/*`) are scoped to this root.
  Existing skill / design-template URLs are unchanged.
- Surfaced in the web app at `/page-patterns` and in the CLI as
  `od page-pattern list` / `od page-pattern show <id>`.

## Adding a page pattern

1. Create `page-patterns/<pattern-id>/SKILL.md` with:
   - Standard skill frontmatter (`name`, `description`, `triggers`).
   - `od.mode: prototype`
   - `od.scenario: page-pattern` (discriminator)
   - `od.page_type`: namespace.name (e.g. `auth.login`, `list.board`).
   - `od.page_inputs`: array of `{ name, kind, target_page_type? }`
     describing data this page consumes. Empty array is fine.
   - `od.page_outputs`: array of `{ name, kind, target_page_type? }`
     describing links/actions the page produces. `kind` ∈
     `navigation` | `data` | `action`.
   - `od.preview.entry`: usually `index.html`.
   - `od.design_system.requires: true` with the relevant token sections.
   - `od.example_prompt`: a short Korean or English starter prompt.
2. Ship a baked `example.html` (and any `assets/` side files) so the
   gallery has something to preview without invoking the agent.
3. The daemon's lazy scanner picks up the entry on the next
   `/api/page-patterns` request — no rebuild required during local dev.

## Page type taxonomy (Phase 1)

Reserved namespaces and the seed entries each owns:

| Namespace   | Entries                                  |
| ----------- | ---------------------------------------- |
| `auth`      | `login`, `signup`, `password-reset`      |
| `list`      | `board`, `gallery`, `feed`               |
| `detail`    | `post`                                   |
| `dashboard` | `metrics`                                |
| `profile`   | `user`                                   |
| `landing`   | `marketing`, `pricing`                   |
| `form`      | `settings`, `contact`                    |
| `error`     | `not-found`                              |

New namespaces require an explicit code change to
`packages/contracts/src/api/page-patterns.ts` (the enum kept there
is the public taxonomy contract).
