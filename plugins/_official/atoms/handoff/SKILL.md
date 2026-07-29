---
name: handoff
description: Push the run's accepted artifact to a downstream collaboration surface (cli, other code agents, cloud, desktop) and stamp the artifact manifest with the export target.
od:
  scenario: tune-collab
  mode: handoff
---

# Handoff

Spec §11.5.1 / §21.5: an OD run isn't done when the artifact
exists — it's done when the artifact reaches the surface the user
will keep iterating on. This atom is the "push it somewhere"
stage. It's the natural counterpart to `diff-review`.

## Inputs

- The accepted artifact set (after `diff-review` resolved with
  `decision: 'accept' | 'partial'`).
- The export target (one of the `surface` enum values from
  `ArtifactManifest.exportTargets[].surface`).

## Surfaces

| surface | typical follow-on |
| --- | --- |
| `cli` | the user runs `od files read` against the project; no extra push |
| `desktop` | open the project in the OD desktop app |
| `web` | publish to the public marketplace via spec §13's `od://` deep link |
| `docker` | wrap the artifact into a self-contained container (calls the §15.4 image) |
| `github` | open a PR via `od plugin publish --to <catalog>` |
| `figma` | round-trip back into the figma-migration source file |
| `code-agent` | hand off to Cursor / Claude Code / Codex sitting on top of the project cwd |

## Output

Updates `ArtifactManifest.exportTargets[]` with a row per push,
appending — never replacing — so the artifact's distribution
history stays append-only.

## Convergence

The atom completes when at least one `exportTargets[]` entry
matches the user's intent or the user explicitly skipped via the
`confirmation` GenUI surface.

## Anti-patterns the prompt fragment forbids

- Pushing the artifact to a surface that wasn't on the user's
  intent list.
- Mutating `sourcePluginSnapshotId` (it's immutable; the export
  trail is additive).
- Treating `figma` as a no-op when the user's source was a Figma
  file — round-trip is the whole point of the figma-migration
  scenario.

## Status

Reserved id, prompt-only fragment in v1.
