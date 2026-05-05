# hatch-pet (vendored)

This directory is a **vendored copy** of the Codex `hatch-pet` skill. It is
checked into the Open Design repo (rather than pulled in as a Git submodule
or an npm package) so that:

- Any Open Design agent can run the skill end-to-end without a network
  fetch, an extra install step, or an out-of-tree clone.
- The packaged desktop build can ship the skill as inert static assets
  alongside the rest of `skills/`.
- Reviews of changes that touch pet generation can see the skill source in
  the same diff as the daemon / web wiring that consumes it.

The vendoring trade-off is: this copy will not auto-track upstream
revisions. If the upstream skill changes (atlas geometry, manifest shape,
script CLIs), this copy must be re-synced by hand. Treat it as a frozen
snapshot, not a live dependency.

## Provenance

- Skill: `hatch-pet`
- Pinned upstream reference (declared in `SKILL.md` frontmatter): see the
  `upstream:` field — at vendoring time this pointed to the Codex curated
  `skills/.curated/hatch-pet` tree. That URL was not publicly resolvable
  at the time this README was written; treat the vendored snapshot in this
  directory as the authoritative source-of-truth for Open Design and
  re-confirm the upstream pointer the next time a re-sync is performed.
- License: Apache License 2.0 (`LICENSE.txt` next to this README). The
  copyright line in the bundled `LICENSE.txt` is left unfilled because no
  separate copyright holder was identified at vendoring time. If a future
  re-sync confirms the upstream copyright holder, populate the standard
  Apache `Copyright [yyyy] [name of copyright owner]` line and add a
  `NOTICE` file mirroring upstream attribution.

## Re-syncing this skill

When the upstream skill changes:

1. Locate the upstream source (Codex `skills/.curated/hatch-pet` or the
   superseding location).
2. Replace the contents of this directory with the upstream snapshot,
   preserving only this `README.md` and any Open-Design-specific notes
   inside `SKILL.md`'s `> **Open Design integration.**` blockquote.
3. Update the `upstream:` field in `SKILL.md` frontmatter with the exact
   commit SHA / tag of the snapshot.
4. Update `LICENSE.txt` and add a `NOTICE` file if upstream now ships
   attribution metadata.

## Where outputs land

The skill packages each pet under
`${CODEX_HOME:-$HOME/.codex}/pets/<pet-id>/` with `pet.json` and
`spritesheet.{webp,png,gif}`. The daemon scans that directory in
`apps/daemon/src/codex-pets.ts`; the web pet settings list and one-click
adopt pets from there. See `docs/codex-pets.md` for the end-user setup
flow (including how Open Design behaves when Codex is not installed).
