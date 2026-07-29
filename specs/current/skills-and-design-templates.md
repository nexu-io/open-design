# Skills & Design Templates Refactor

## Purpose

Today the repo's `skills/` directory mixes two unrelated concepts:

- **Design templates** — packaged "shapes" the agent renders into a project artifact (decks, prototypes, image/video/audio templates, …). ~104 of the 112 entries today.
- **Functional skills** — capabilities the agent invokes mid-task (utilities, asset packagers, design briefs, …). The remaining ~6 entries.

Settings → "Skills & Design Systems" surfaces the union of those two, plus the design-systems registry, in one big sub-tabbed dialog. The result is an
overcrowded settings tab that buries the small set of *truly skill-like* entries
under 100+ rendering templates, and a top-level "Examples" tab whose contents
are actually templates.

This spec splits the two concerns at every layer (filesystem, daemon, web) and
turns Settings → Skills into a real CRUD surface for functional skills, on par
with what Multica/LobeHub ship.

References:

- Multica docs: <https://multica.ai/docs/skills>
- LobeHub: <https://github.com/lobehub/lobehub>

## Target shape

| Layer | Today | After |
|---|---|---|
| Repo dir | `skills/` (mixed) | `skills/` (functional) + `design-templates/` (rendering templates) |
| Daemon root | `SKILLS_DIR`, `USER_SKILLS_DIR` | `SKILLS_DIR`, `USER_SKILLS_DIR` (functional) + `DESIGN_TEMPLATES_DIR`, `USER_DESIGN_TEMPLATES_DIR` |
| Daemon API | `/api/skills*` (mixed) | `/api/skills*` (functional only) + `/api/design-templates*` |
| Entry top tab | `Designs / Examples / Design systems / Image templates / Video templates` | `Designs / Templates / Design systems / Image templates / Video templates` |
| Settings nav | `… / Skills & Design Systems / …` | `… / Skills / Design Systems / …` |

Functional vs. design-template classification rule:

- A skill whose `od.mode` is one of `prototype | deck | template` is a **design template**.
- A skill whose primary output is an `image | video | audio` *artifact* is a **design template** (`audio-jingle`, `image-poster`, `video-shortform`, `hyperframes`).
- A skill whose `od.mode` is `utility`, `design-system`, or whose role is to *do work* on user input (capture a brief, package a pet, audit a file, …) is a **functional skill** — stays under `skills/`.

## Phase 0 — Split + rename (MVP)

Goal: ship the architectural rename without regressing any user-visible flow.

1. Filesystem: `git mv skills design-templates`, then re-add a fresh
   `skills/` and move the small functional set back. Add `AGENTS.md` to
   each describing the contract.
2. Daemon: introduce `DESIGN_TEMPLATES_DIR` + `USER_DESIGN_TEMPLATES_DIR`.
   Mirror today's `/api/skills*` routes onto `/api/design-templates*`.
   Keep `/api/skills*` pointed at the slimmed-down `SKILLS_DIR`.
3. Web `EntryView`: rename top tab `Examples → Templates`. New
   `TemplatesTab.tsx` (file-renamed from `ExamplesTab.tsx`) sources from
   `/api/design-templates`. The "From template" picker on the New project
   panel keeps working off the same data.
4. Web Settings: rename `LibrarySection → SkillsSection`, drop the design-systems
   sub-tab. Promote design systems to a sibling Settings entry (`DesignSystemsSection`).
5. Tests, locales, packaged-resource manifests, AGENTS.md.

Acceptance: top tab reads "Templates" with ~104 cards; Settings → Skills
shows ~6 functional entries; Settings → Design Systems shows ~142 systems;
no regression in the New-project-from-template flow.

## Phase 1 — Skills CRUD basics

Goal: the new Settings → Skills tab feels like a real management surface.

1. Two-column layout (list + detail). Search + source/mode filters.
2. "New skill" panel writes a `SKILL.md` under `USER_SKILLS_DIR/<slug>/`
   via `POST /api/skills`. Editing a built-in clones it into
   `USER_SKILLS_DIR` (existing shadowing pattern).
3. Detail panel: rendered SKILL.md, file tree (`GET /api/skills/:id/files`),
   raw view toggle, copy-link.
4. Replace `window.confirm` delete with inline confirm.

## Phase 2 — Folder & zip import

1. `Import → From folder` (`<input type=file webkitdirectory>`) →
   `POST /api/skills/import-folder` with a JSON manifest.
2. `Import → From zip` (`.zip` upload) → `POST /api/skills/import-zip`
   (multipart). Daemon unzips, validates a top-level `SKILL.md` (allow
   one-level nesting for GitHub-style layouts).
3. Size guards: total ≤10 MB, single file ≤1 MB. Path safety: no `..`,
   no symlinks.

## Phase 3 — URL imports (GitHub / ClawHub / skills.sh)

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
- Drag-and-drop folder onto the Settings → Skills surface.
- Per-agent skill attachment (Multica pattern) once skills become agent-scoped.
- Move `prompt-templates/` (image/video) onto the same Settings → Skills CRUD
  surface as a separate sub-tab if the UX feels right.

## Out of scope (intentionally)

- Database schema changes. Skills remain on-disk artifacts; the IDs
  stored on projects stay valid because the split keeps slugs unique
  across both roots.
- `prompt-templates/` reorganization — that surface stays as today.
- Sidecar / tools-pack changes beyond updating the resource manifests.
