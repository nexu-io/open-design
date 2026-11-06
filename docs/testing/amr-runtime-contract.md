# AMR prerelease runtime contract validation

This is the regression entry point for OPEND-2886. It distinguishes package
identity, the Vela/ACP bridge contract, and actual OpenCode execution. Passing
one does not establish the others.

## Evidence boundaries

| Check | Real component | Synthetic component | What it establishes |
| --- | --- | --- | --- |
| `tools-pack verify-runtime` | Selected package's Vela and OpenCode executables | None | Exact versions, byte hashes, app/version/platform agreement with the supplied release manifest |
| E2E `tests/amr/vela-contract.test.ts` | Pinned Vela binary and current daemon ACP consumer | OpenCode HTTP/SSE server, Link model catalog | Complete/incomplete handling, unknown-tool evidence, cancellation, conservative failure |
| `scripts/vela-contract.ts` | Explicitly selected Vela binary | Same local HTTP/SSE fixtures | Cross-version error/capability/continuation and Write abort ordering |
| Full package acceptance | Installed app, Vela, OpenCode, daemon, provider | Only deliberate fault injection | Actual compaction, durable session state, side effects, UI/CLI, telemetry and release behavior |

The bridge fixtures never call a model provider. The reported model context
budget is 128,000 because Vela 0.0.35 rejects smaller catalog budgets. Synthetic
SSE compaction events are **not** evidence of forcing the real compaction loop.
Reports set `realCompactionRuns: 0` and `packageAcceptance: not-performed`.
The POSIX fixture launcher runs on macOS/Linux; Windows bridge acceptance is
still pending. The identity command supports matching macOS, Windows and Linux
release manifests, but only macOS arm64 has been exercised against a real package.

## Verify package identity

Obtain the immutable platform manifest and payload/installer from the selected
release. Verify the archive against its published SHA-256 before extraction or
installation. Select the actual package's Resources directory, not a source
checkout or a developer CLI path. Daemon data directory handling follows the
[root contract](../../AGENTS.md#daemon-data-directory-contract).

```sh
corepack pnpm tools-pack verify-runtime \
  --resources "$PACKAGE_RESOURCES" \
  --manifest "$RELEASE_PLATFORM_MANIFEST" \
  --expected-vela "$REVIEWED_VELA_VERSION" \
  --expected-opencode "$REVIEWED_OPENCODE_VERSION" \
  --json
```

The command reads `open-design-config.json`, then executes only the Vela and
OpenCode paths below `open-design/bin`. Missing companions, paths escaping the
package, version/platform mismatches and binaries changing during verification
fail the command. No PATH fallback is used. Expected binary versions must come
from the reviewed Vela package pin and its published runtime provenance and
expected self-reported OpenCode version, independently of the binary being checked. Current release manifests do not contain those
binary versions/hashes; the command records them alongside the manifest hash,
not as values purportedly supplied by that manifest.

## Run bridge contracts

The normal E2E suite resolves the exact optional dependency owned by
`tools/pack/package.json`, without using a developer PATH binary:

```sh
corepack pnpm --filter @open-design/e2e test tests/amr/vela-contract.test.ts
```

Both `ci.yml`'s `e2e_vitest` lane and `release-prerelease-tests.yml` already run
the full E2E Vitest suite. The planner selects `e2e_vitest` for a Vela dependency
bump touching `tools/pack/package.json` and `pnpm-lock.yaml`; no routing omission
or new workflow is introduced. The legacy error assertion intentionally names
the current 0.0.35 contract: a changed protocol requires a reviewed update.

Use the standalone entry point to compare package bytes with a candidate build:

```sh
corepack pnpm -C e2e exec tsx scripts/vela-contract.ts \
  --binary "$EXACT_VELA_BINARY" \
  --expected-version "$EXACT_VELA_VERSION" \
  --out "$CONTRACT_REPORT_DIR" \
  --require-write-abort --require-continuation
```

The two target flags are independent while OPEND-2884 and OPEND-2885 are separate
branches. Omit a flag only when recording a baseline or testing the other
isolated fix; the report records which requirements were enabled. For the
combined candidate, enable **both**. Do not publish a dependency bump based on a
baseline-only pass.

Each scenario records the raw ACP transcript and a local OpenCode request/response
ledger. `--require-write-abort` requires exactly one abort response to finish
before the ACP terminal response (monotonic timestamps), not cleanup after the
fact. Both the outstanding Write and completed-Write/missing-terminal scenarios
must remain unsuccessful and must submit only one prompt.

`--require-continuation` requires the negotiated
`com.open-design.nativeSessionContinue` v1 capability and structured
`OPENCODE_COMPACTION_CONTINUATION_INCOMPLETE` error, with explicit committed-tool
evidence. It starts a fresh Vela process, loads the same durable session ID and
uses `_session/continue` with the original cursor. There must be no new session
or prompt replay, one continue request and one terminal response. A parallel
outstanding tool must report `toolResultsCommitted: false`. These are bridge
contract checks; the fixture does not prove OpenCode's persisted cursor validation
or real tool execution. OPEND-2884 owns those production tests and the host's
cancellation/attempt-limit policy.

## Verified baseline, 2026-09-09

Host: macOS Darwin 24.6.0, arm64, Node 24.16.0. OpenDesign test source baseline:
`d54f5cf07d35261dce3c8c2e7fc187c6cc9efb86`.

The immutable [0.22.1-prerelease.13 macOS manifest](https://releases.open-design.ai/prerelease/versions/0.22.1-prerelease.13/platforms/mac_arm64.json)
identifies app commit `ee76e93c75c5235bbb7a3464e832cff987d80c91`. Its downloaded
payload passed the published archive checksum. Selected executables were
extracted from that verified payload; the full app was not installed/launched.

| Artifact | Version | SHA-256 |
| --- | --- | --- |
| macOS arm64 payload | 0.22.1-prerelease.13 | `6b6e0ac16e4f3ed4c54011ea771f73f81305c7a51d24b808dde6aa8732a9bdb7` |
| Package Vela | 0.0.35 | `5a2449f368b95cb15b29694906b4abd1abf7fe4afd71bde75f05db48708a323c` |
| Package OpenCode | 0.0.0--202609020336 | `30fc9f9f687460db9cb340df183b926973df554fb7f98aea6a43b5e6e765d704` |

The [Vela 0.0.35 runtime manifest](https://github.com/powerformer/vela/releases/download/vela-cli/v0.0.35/vela-cli-runtime-manifest.json)
records `powerformer/opencode@powerformer-v1.18.1`, commit
`595fa8ec01bdec67546c3c0f79744dce598f85cf`. Its darwin-arm64 member hash
`c1dec4a2f722191c0e5c31c0414c348e3ef4d9a68e844194a549ca536d148f9e`
matches the npm companion exactly. The app package re-signs that companion.
After removing signatures from **copies only**, the npm and package binaries
have identical bytes except the Mach-O `__LINKEDIT.vmsize` field. Normalizing
that field makes them byte-identical. The repository's fallback OpenCode lock
(`anomalyco/opencode` 1.15.10) is therefore not the provenance of this release.
The fork tag and self-reported `--version` string are separate identifiers.

- Package Vela: complete continuation, incomplete protection, cancellation and
  unknown-error checks passed. Both Write failure/abort requirements failed,
  the native continuation capability is absent, and the new structured
  unknown-tool evidence requirement fails. This is an expected RED
  against the target contract, not a passed package acceptance.
- [Vela PR #1951](https://github.com/powerformer/vela/pull/1951), commit
  `43f35e29e50dad790d2c697f127c9c137ce05abd`: locally built `0.0.1-test`, SHA-256
  `6cf45efc55509138bd415cc6ad818532bc713ec1c5a58c3e1fc931aee33c0ca3`, passed
  all seven baseline/Write scenarios, including both Write abort-order checks.
  This is an unpublished development build, not an upgrade target.
  The final PR head `28b5733f5d1b558d8966e76a094b65b74ef95e7e` adds only
  ACP timeout/cancellation fixture tests; production source is unchanged from
  the measured commit above. The seven-scenario result remains tied to that
  measured binary, rather than claiming a new combined-package validation.
  The host cancellation notification companion is
  [OpenDesign #7959](https://github.com/nexu-io/open-design/pull/7959), commit
  `65fa5dced1`; it has not been included in this PR's combined-package acceptance.
- [Vela PR #1952](https://github.com/powerformer/vela/pull/1952), commit
  `1acdf79feaf88837763eb3afeb291421603ab76f`: locally built `0.0.1-test`, SHA-256
  `487a9cb1882aa0cc9badb170a51ecf7a86f14c40e0de19694ac57e665cf95cc1`, passed
  all eight continuation-profile scenarios. Related production changes are
  [OpenDesign #7958](https://github.com/nexu-io/open-design/pull/7958) and
  [OpenCode #16](https://github.com/powerformer/opencode/pull/16). This is still
  an unpublished, separate candidate; a combined version needs verification.

## Remaining release acceptance

The foundation does not finish OPEND-2886. Record each remaining item separately:

1. Review and integrate the final OPEND-2884/2885 PRs, publish through the normal
   authorized release process, and pin the actual published Vela/OpenCode versions.
   Run both target flags against the same candidate and update the daemon consumer
   tests for the negotiated protocol. Do not invent an unreleased npm version.
2. Build/install the real prerelease app and repeat identity verification. Run
   actual compaction 100 consecutive times at a fixed, recorded provider/context
   configuration. Retain machine, app/Vela/OpenCode versions, run IDs, final model
   steps, durable-session identity, actual tool side-effect counts, cancellation,
   unknown-state rejection and continuation attempt-limit evidence.
3. Separately test Write completion, stall, missing completion, cancellation and
   daemon reconnect. Establish process quiescence and absence of duplicate writes;
   bridge error return alone is insufficient.
4. Reconcile the real run cohort against existing PostHog project 420348
   `run_created`, `run_finished`, `run_retry_finished` and recovery fields. Filter
   prerelease by app version/channel: `env=production` does not mean stable.
   Keep the run denominator and mature unfinished-run policy unchanged. Synthetic
   contract invocations are not product runs and have no PostHog run IDs.
5. Inspect current prerelease alert coverage and sample real runs after release.
   Neither alert inspection nor post-release sampling has been performed by these
   local contracts. The four original incident run IDs remain evidence, not new
   acceptance runs: `6aa26b33-968a-4d5e-846a-2dbad009a3dc`,
   `9ff005b6-f1d1-489f-b102-ac8af75fc078`,
   `a5a5afc5-c37d-400d-a402-a68026a8718b`, and
   `500540ac-6b4d-4c5f-83b8-23e41e27a17b`.
