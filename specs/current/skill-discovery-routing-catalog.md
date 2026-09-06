# Skill Discovery routing validation catalogue

This branch imports the template folders introduced by
`7d44e4062d922ba2154f6bf7e42de6c44429bf51` from
`mason/od-next-phase0-skill-metadata`. It does not import unrelated source-branch
code or later commits. The 153 imported files, including binary previews,
match the source commit byte-for-byte.

## Counts and ownership

| Content | Count | Location |
| --- | ---: | --- |
| Prototype templates | 30 | `design-templates/` |
| Presentation templates | 17 | `design-templates/` |
| Document templates | 8 | `design-templates/` |
| Image templates | 5 | `design-templates/` |
| Primary task profiles | 4 | OD Next `agent-discovery/task-profiles/` |
| Shared ordinary orchestration | 1 | OD Next `agent-discovery/ordinary-orchestration.md` |

The source commit adds **60**, not 65, template Skills. There are **64 selectable
candidates**: 60 auxiliary templates plus `prototype`, `ppt`, `marketing`, and
`hyperframes`. Counting the shared orchestration as content gives 65; it is
loaded with task profiles and is not an independently selectable candidate.
The Discovery bootstrap is also control instructions rather than a candidate.

The old built-in `skills/` catalogue and old rendering templates are removed.
Runtime scenarios, atoms, and brand resources remain infrastructure, excluded
from the Discovery candidate pool. User-installed resources are not read by
this official-only provider. Existing projects may still refer to retired
templates; use a fresh project for this routing validation.

## Metadata and loading

`agent-discovery/functional-catalog.json` declares the exact template folder,
canonical ID, source root, role, output kinds, examples, and complete resource
roster. Each entry has `source: "design-templates"`. The daemon reads bilingual
names/descriptions and task/category/platform/scenario metadata directly from
the pinned `SKILL.md` frontmatter. Full bodies and reference assets load only
after the Agent chooses a candidate.

No new `document` or `image` primary profile is introduced. The Agent may load
a matching template as auxiliary and resolve `none` for the primary. This is a
valid template selection, not a routing miss.

## Verification in a client run

1. Start the updated branch, create a fresh Design project from Home, leave
   task type/Skill/Plugin unselected, and send the unmodified evaluation query.
2. Confirm the run's `skillDiscoveryLifecycle` section carries this catalogue
   revision and 64 candidates.
3. Read `od tools skills status --json` in the run context, or inspect the
   conversation state and `skill_discovery_events` through read-only diagnostics.
4. Score the primary ID and active auxiliary IDs separately. Require successful
   `load`/`reuse`/`replace` evidence tied to the evaluated run; Agent prose and
   optional `search` calls are not a load receipt. `resolved_none` can coexist
   with a correctly loaded template in `activeAuxiliaries`.

Catalogue integrity and load tests verify availability, metadata, hashes, and
materialization. They do not measure real-model semantic routing accuracy.
