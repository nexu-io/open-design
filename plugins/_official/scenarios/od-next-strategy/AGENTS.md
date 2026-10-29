# `od-next-strategy` (OD Next V2 prompt assets)

Everything under `assets/` is sent to the model **verbatim** as part of the
prompt bundle. Never write repository-maintenance notes, TODOs, or
cross-references into those files — they reach the model as instructions.
Maintenance notes belong here instead: this file is not part of the asset
roster (`apps/daemon/src/plugins/strategy-package.ts:158`), so it is never read
or hashed at runtime.

This folder is one half of a two-sided prompt implementation. Before editing,
read [prompt maintenance](../../../../apps/daemon/src/prompts/AGENTS.md).
Host contracts also live in contracts TypeScript; inspect both paths.

Only files declared by the manifest/selected profile roster are read and hashed.
Maintenance AGENTS is outside that roster. A selected profile's resource change
moves its identity; undeclared files do not. Bump the task-profile version when
changing its body.

The motion-design task asset is generated from `skills/motion-design/SKILL.md`.
Edit the public skill and run `pnpm exec tsx scripts/sync-motion-design-skill.ts`
from the repository root. The integration test enforces byte equality.
