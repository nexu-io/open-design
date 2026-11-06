# Codex file preview compatibility and validation

OD consumes the official `item/fileChange/patchUpdated` notification from the
installed Codex CLI's built-in app-server. It does not require a companion
binary. Configuration is passed on `thread/start` and `thread/resume`, without
rewriting the user's persistent Codex configuration.

## Version boundary

- **0.123.0** is the first stable release with app-server forwarding:
  [release changelog](https://github.com/openai/codex/releases/tag/rust-v0.123.0),
  [upstream #18289](https://github.com/openai/codex/pull/18289).
- **0.122.0** contains an internal patch event but does not forward it to
  app-server clients. Enabling the internal flag alone cannot provide OD previews.
- OD reads the server version from the first token of `initialize.userAgent`.
  Stable versions >= 0.123.0 receive
  `config: { "features.apply_patch_streaming_events": true }`.
  Older, unrecognized, and prerelease builds receive no override and retain
  completion-only file events. Other versions in the user-agent string are
  not treated as the server version.
- Patch streaming does not require `experimentalApi`. The existing thread-visibility
  policy independently enables that capability for owned paginated histories.
  Missing preview notifications preserve the existing final-file behavior.
- This feature only covers structured `apply_patch` input. It does not expose
  incremental arguments of `exec_command` or shell heredocs.

## Automated acceptance

Run from the repository root with an ordinary installed Codex binary:

```sh
OD_E2E_CODEX_BIN="$(command -v codex)" corepack pnpm --filter @open-design/e2e test tests/dialog/codex-patch-stream.test.ts
```

The test is explicitly skipped without `OD_E2E_CODEX_BIN`. It starts the shared
tools-dev harness with an isolated Codex configuration and a local Responses
fixture; no provider account is required. It holds back the second half of a
roughly 125 KB patch until OD reports the real file target. Delaying command
stdout would not test this requirement. Assertions cover:

- The actual provider user-agent matches the requested CLI version.
- A Write preview arrives while patch arguments are still incomplete.
- The written file exactly matches the expected content.
- The final tool call and result share the preview's identity, with no duplicates.
- The run succeeds and a follow-up resumes the same Codex session.

Focused daemon tests cover the 0.122/0.123 feature boundary, unknown/prerelease
versions, start/resume configuration, relative versus absolute paths, changing
file order, repeated snapshots, failed execution, cancellation, late events,
legacy fallback, and bounded preview payloads:

```sh
corepack pnpm --filter @open-design/daemon exec vitest run tests/codex-app-server-patch-stream.test.ts tests/codex-app-server-session.test.ts tests/codex-app-server-normalize.test.ts tests/codex-app-server-parity.test.ts tests/codex-app-server-command-output-stream.test.ts tests/codex-app-server-transport-switch.test.ts tests/codex-app-server-protocol-contract.test.ts
```

## Local validation on 2026-09-11

- Ordinary CLI **0.149.1** and installed **0.153.4** passed the automated
  acceptance, including file integrity, matching tool identities, and resume.
- A separate browser check with 0.153.4 streamed **124,764 bytes in 40 chunks
  over 40.097 seconds**. OD emitted its first file preview 7 ms after the first
  argument chunk. At 15 seconds the browser already displayed the file row
  while the arguments remained incomplete. The final file matched exactly.
  These timings use a controlled local provider, not a live model benchmark.
- The downloaded official 0.123.0 macOS binaries exited with code 137 even for
  `--version` on this machine. The version boundary is verified by the release
  and tagged source, not by a successful 0.123.0 runtime test. This remains a
  validation gap; the 0.149.1 result must not be relabeled as a 0.123.0 pass.
