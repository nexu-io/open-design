# macOS product lifecycle specs

Follow `e2e/AGENTS.md` first. This directory owns macOS product behavior across
installation, first launch, update, recovery, restart, and clean exit. Command
drivers such as tools-pack are replaceable mechanics and must not define
scenario names or product success.

## Shape

- Keep spec entrypoints focused on scenarios. Put reusable platform actions in
  the local `lib/` and deterministic state preparation in `fixtures/`.
- Split long workflows by product behavior: `core`, `update`, and `lifecycle`.
  Keep files below 800 lines where practical; do not add helpers to the legacy
  monolithic entry while extraction is in progress.
- Use shared lifecycle contracts for scenario IDs, proof declarations, terminal
  oracles, and report shape. Keep LaunchServices, bundle, process, focus, and
  filesystem behavior local to macOS.

## Execution

- Default to headless execution and prove that the app never becomes frontmost.
  A test may show a window only when its explicit purpose requires human-visible
  behavior and the invocation opts into it.
- Install into the suite's isolated Applications root. Never mutate a user's
  ordinary app installation, data root, channel state, or running instance.
- External accounts and agent services are synthetic by default. Declare every
  synthetic boundary and keep the response deterministic.
- Run local saturation through `pnpm smoke:mac:local`. It builds a non-portable
  `local` channel package so both tools-pack and a real LaunchServices restart
  stay inside the run's isolated root. Release acceptance remains portable and
  proves the ordinary system data root on an isolated runner. Never combine
  those two root models in one local run.
- Use pinned immutable released artifacts and digests for predecessor behavior.
  Do not label current parser or launcher code as historical through fixture
  data alone.

## Terminal evidence

Successful lifecycle scenarios prove the intended product surface, `/api/health`,
the actual Shell/Standalone/resource projection, inspect output, and a curated
screenshot. Stop must leave no process, lease, or transition residue. Update and
recovery scenarios also perform a second installed-outer start.

Preserve logs, state snapshots, screenshots, and resolved artifact identities on
failure. Successful runs may clean scratch after their report is committed.
