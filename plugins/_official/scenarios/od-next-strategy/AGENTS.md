# `od-next-strategy` (OD Next V2 prompt assets)

Everything under `assets/` is sent to the model **verbatim** as part of the
prompt bundle. Never write repository-maintenance notes, TODOs, or
cross-references into those files — they reach the model as instructions.
Maintenance notes belong here instead: this file is not part of the asset
roster (`apps/daemon/src/plugins/strategy-package.ts:158`), so it is never read
or hashed at runtime.

This folder is one half of a two-sided prompt implementation, and not all of OD
Next's content lives here — host runtime contracts such as the deck framework
are carried in TypeScript, not in these task profiles. Before changing anything
here, read [`docs/prompt-composition.md`](../../../../docs/prompt-composition.md):
the fork point, the variant axes, the host contract table, the asset roster and
package-hash rules, and the known gaps.

## Prototype runtime resources

`assets/task-profiles/prototype/runtime/` ships the behaviour runtime the
prototype profile's rule card refers to: `vue.global.prod.js` (vendored Vue 3
global build, MIT — the version is recorded as the resource `version` in
`open-design.json`; refresh it by replacing the file and bumping that field),
`od-proto.js` (the OD thin layer: hash router, overlays, store with scenarios,
toasts, fake requests, list motion), and `example.html` (a worked example).
They are declared as profile `resources`, so they enter the prototype package
hash and are staged by the daemon into `<project>/.od-frames/runtime/`; they
are never concatenated into the prompt. The rule card in `prototype.md` is the
only prompt-facing description of the API — keep the two in step when the
runtime's surface changes.
