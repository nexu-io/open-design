---
name: od-next-strategy
description: Bundled OD Next V2 strategy entrypoint for route-locked planning and Build execution.
---

# OD Next Strategy V2

This bundled scenario packages the stable content used by the internal OD Next
planning and Build recipe. It is not a portable strategy selector and does not
activate itself.

When Open Design supplies a validated V2 binding, load the assets in this order:

1. `assets/core-system-prompt.md`
2. `assets/general-orchestration.md`
3. exactly one task profile selected through
   `references/task-profile-mapping.md`

A task profile may declare `resources` — non-prompt files such as the
prototype profile's handheld device shells under
`assets/task-profiles/prototype/device-frames/`. They enter the package
identity with their profile, are never concatenated into the prompt head, and
are staged by Open Design into the project directory (`.od-frames/`) for the
rule card to reference.

The runtime owns route selection, task-chain state, session continuation, and
machine-contract parsing. Content in this folder must not infer that those
runtime facts exist unless Open Design supplied them.
