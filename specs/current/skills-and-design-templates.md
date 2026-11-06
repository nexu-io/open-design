# Skills & Design Templates Refactor

## Purpose and current status

When this refactor was proposed, the repo's `skills/` directory mixed two
unrelated concepts:

- **Design templates** — packaged "shapes" the agent renders into a project artifact (decks, prototypes, image/video/audio templates, …). ~104 of the 112 entries today.
- **Functional skills** — capabilities the agent invokes mid-task (utilities, asset packagers, design briefs, …). The remaining ~6 entries.

Settings → "Skills & Design Systems" surfaced the union of those two, plus the
design-systems registry, in one big sub-tabbed dialog. The result was an
overcrowded settings tab that buried the small set of *truly skill-like*
entries under 100+ rendering templates, and a top-level "Examples" tab whose
contents were actually templates.

The filesystem and daemon split shipped. The web surface then evolved again:
the redesigned home removed the top-level Examples/Templates gallery, design
templates now feed the new-project "Start from" rails, and functional skill
management lives under Integrations → Skills. Design systems remain a separate
settings surface. The later import ideas below remain roadmap items unless
explicitly marked shipped.

References:

- Multica docs: <https://multica.ai/docs/skills>
- LobeHub: <https://github.com/lobehub/lobehub>

## Target shape

| Layer | Before this refactor | Current state |
|---|---|---|
| Repo dir | `skills/` (mixed) | `skills/` (functional) + `design-templates/` (rendering templates) |
| Daemon root | `SKILLS_DIR`, `USER_SKILLS_DIR` | `SKILLS_DIR`, `USER_SKILLS_DIR` (functional) + `DESIGN_TEMPLATES_DIR`, `USER_DESIGN_TEMPLATES_DIR` |
| Daemon API | `/api/skills*` (mixed) | `/api/skills*` (functional only) + `/api/design-templates*` |
| Template discovery | Top-level `Examples` tab | New-project "Start from" rails backed by `/api/design-templates`; no top-level Templates tab |
| Management nav | Settings → `Skills & Design Systems` | Integrations → Skills, plus the separate Settings → Design Systems surface |

Functional vs. design-template classification rule:

- A skill whose `od.mode` is one of `prototype | deck | template` is a **design template**.
- A skill whose primary output is an `image | video | audio` *artifact* is a **design template** (`audio-jingle`, `image-poster`, `video-shortform`, `hyperframes`).
- A skill whose `od.mode` is `utility`, `design-system`, or whose role is to *do work* on user input (capture a brief, package a pet, audit a file, …) is a **functional skill** — stays under `skills/`.

## Phase 0 — Split + rename (shipped, then evolved)

Goal: ship the architectural rename without regressing any user-visible flow.

1. Filesystem: `git mv skills design-templates`, then re-add a fresh
   `skills/` and move the small functional set back. Add `AGENTS.md` to
   each describing the contract.
2. Daemon: introduce `DESIGN_TEMPLATES_DIR` + `USER_DESIGN_TEMPLATES_DIR`.
   Mirror today's `/api/skills*` routes onto `/api/design-templates*`.
   Keep `/api/skills*` pointed at the slimmed-down `SKILLS_DIR`.
3. Web `EntryView` initially renamed `Examples → Templates` and sourced it
   from `/api/design-templates`. A later home-navigation redesign removed that
   top-level gallery; the New project panel still consumes the same registry
   through its "Start from" rails.
4. Web Settings initially renamed `LibrarySection → SkillsSection`, dropped the
   design-systems sub-tab, and promoted design systems to a sibling Settings
   entry (`DesignSystemsSection`). Skills later moved to Integrations → Skills.
5. Tests, locales, packaged-resource manifests, AGENTS.md.

Current acceptance: `/api/skills` contains functional entries only;
`/api/design-templates` contains renderable templates; Integrations → Skills
shows the functional entries; Settings → Design Systems shows the bundled
systems; and the new-project template flow remains backed by the design-template
registry.

## Phase 1 — Skills CRUD basics (shipped with a revised layout)

The CRUD capability shipped under Integrations → Skills. The final UI uses a
single stack of expandable rows rather than the proposed two-column workspace.

1. Expandable skill rows with search plus source, mode, and category filters.
2. "New skill" panel writes a `SKILL.md` under `USER_SKILLS_DIR/<slug>/`
   via `POST /api/skills`. Editing a built-in clones it into
   `USER_SKILLS_DIR` (existing shadowing pattern).
3. Expanded rows expose the SKILL.md body, file tree
   (`GET /api/skills/:id/files`), and inline editing.
4. Replace `window.confirm` delete with inline confirm.

## Phase 2 — Folder & zip import (not implemented)

1. `Import → From folder` (`<input type=file webkitdirectory>`) →
   `POST /api/skills/import-folder` with a JSON manifest.
2. `Import → From zip` (`.zip` upload) → `POST /api/skills/import-zip`
   (multipart). Daemon unzips, validates a top-level `SKILL.md` (allow
   one-level nesting for GitHub-style layouts).
3. Size guards: total ≤10 MB, single file ≤1 MB. Path safety: no `..`,
   no symlinks.

## Phase 3 — URL imports (partially implemented)

The shared install backend can currently install a skill from a supported Git
target or local path through `POST /api/skills/install`. The provider-specific
resolution, persisted source revision, update detection, and dedicated UI
described below have not shipped.

1. Resolve `https://github.com/<owner>/<repo>[/tree/<ref>/<path>]` and
   `clawhub.io/...` and `skills.sh/...` URLs to a GitHub directory; walk
   the GitHub Contents API (anonymous, optional `GITHUB_TOKEN` for higher
   rate limits) and import.
2. Persist the source URL + commit SHA in skill metadata; show a
   "View source" link and an "Update available" pill when remote SHA
   changes.
3. One-time disclaimer in the import dialog ("scripts are not sandboxed —
   review before importing"), per Multica's "ClawHavoc" guidance.

## Phase 4 — Later

- Markdown preview with the skill body inline.
- Drag-and-drop folder onto the Integrations → Skills surface.
- Per-agent skill attachment (Multica pattern) once skills become agent-scoped.
- Move `prompt-templates/` (image/video) onto the same Integrations → Skills CRUD
  surface as a separate sub-tab if the UX feels right.

## Out of scope (intentionally)

- Database schema changes. Skills remain on-disk artifacts; the IDs
  stored on projects stay valid because the split keeps slugs unique
  across both roots.
- `prompt-templates/` reorganization — that surface stays as today.
- Sidecar / tools-pack changes beyond updating the resource manifests.
