# Windows product lifecycle specs

Follow `e2e/AGENTS.md` first. This directory mirrors the macOS product scenario
contract where useful, while retaining native Windows installer, process-tree,
registry, file-locking, replacement, and cleanup behavior.

## Shape

- Organize product behavior as `core`, `update`, and `lifecycle`; command-driver
  details stay in local `lib/` and must not leak into scenario names.
- Reuse shared scenario IDs, proof declarations, terminal oracles, and report
  shape. Do not force mechanical code sharing with macOS platform operations.
- Keep files below 800 lines where practical. Add shared mechanics to the
  local `lib/`; keep scenario files centered on one product behavior.

## Execution and evidence

- Every run uses an isolated short namespace and the matching channel identity.
- External login and agent services are deterministic synthetic boundaries by
  default and must be declared by the scenario.
- Historical migration and launcher behavior use pinned immutable released
  bytes, never current implementation code dressed as an old fixture.
- A terminal scenario proves the product surface, daemon health, persisted
  lifecycle state, inspect/screenshot artifacts, clean process-tree shutdown,
  and second start when required.

Mac coverage may mature first. Record an intentionally pending Windows peer in
the shared scenario plan rather than copying an unstable implementation or
weakening the shared outcome.
