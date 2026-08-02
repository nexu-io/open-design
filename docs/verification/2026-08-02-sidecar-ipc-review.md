# Sidecar IPC bounded-frame review — 2026-08-02

The sidecar transport changes on `codex/kaizen-sidecar-invalid-response` were reviewed at
`4ee2a6527`. The JSON IPC server and client reject oversized, malformed, and unexpectedly framed
messages before unbounded buffering or handler re-entry; the existing response and timeout
contracts remain covered by the package fixtures.

Verification:

- `pnpm --filter @open-design/sidecar test` — 14 passed.
- `pnpm --filter @open-design/sidecar typecheck` — passed for source and tests.
- `pnpm --filter @open-design/sidecar-proto test` — 16 passed.
- `pnpm --filter @open-design/sidecar-proto typecheck` — passed for source and tests.
- `git diff --check` — clean.

The unrelated untracked `.od-mcp-config-backups-2026-06-27/` directory was preserved. No runtime
service, packaged app, or operator backup was changed.
