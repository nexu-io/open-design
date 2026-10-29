# Tools Release

`tools-release` owns release metadata, storage publishing, release reports, and
notification-facing data contracts. Packaged artifact build, cache, installer,
payload, and smoke work stays in `tools-pack`; release workflows compose the two
tools through CLI and file contracts.

## Channel Architecture Snapshot

This matrix is a quick check before changing or validating the stable lane.

| Channel | Workflow / lane | Role | Build source | Publish gate | GitHub Release surface | R2 / storage surface | Linux policy | Dry-run focus |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `beta` | `release-beta` / `beta` | Daily R&D and fast validation | Build the current beta lane artifacts directly | No stable promotion gate | Beta artifacts according to beta policy | Beta channel metadata, feeds, platform manifests, payloads, and reports | Default-disabled in the current validation round | Fast build, cache, updater, and metadata validation |
| `prerelease` | `release-prerelease` / `prerelease` | Stable delivery validation | Build prerelease artifacts directly | The only stable promotion gate | No final stable GitHub Release semantics | Prerelease metadata, feeds, platform manifests, payloads, and reports | Follows stable platform policy, including optional Linux enablement | Complete materials that a future stable release can promote |
| `stable` | `release-stable` / `stable` | Formal public release | Promote from a validated `vX.Y.Z` prerelease, with prepublish validation when requested | Must detect available prerelease artifacts for the exact `vX.Y.Z` target | Installers/packages and matching SHA files only | All other platform artifacts, launcher payloads, manifests, metadata, feeds, and reports | Follows stable platform policy, including optional Linux enablement | `metadata` validates promotion inputs and plan; `prepublish` covers build, smoke, reports, and final publish plan without side effects |

## Stable Quick Check

- Stable must verify an available, usable `vX.Y.Z` prerelease artifact set before
  publication.
- Non-stable channels publish counted versions with a `-<channel>.N` suffix, for
  example `-beta.N` and `-prerelease.N`; stable
  promotion checks must match the prerelease suffix while deriving the stable
  `vX.Y.Z` target.
- Stable promotion depends on prerelease only.
- `--dry-run=metadata` should validate prerelease metadata, materials, and the
  stable publish plan without triggering build or smoke work.
- `--dry-run=prepublish` should run all pre-publication build, smoke, payload or
  installer validation, report, artifact selection, and publish-plan work, while
  stopping before final external publishing side effects.
- Stable GitHub Release assets should contain only user-facing installers or
  packages and matching SHA files.
- R2 remains the complete release/update storage surface for payloads, manifests,
  metadata, feeds, platform reports, and non-GitHub artifacts.
- The stable workflow should stay isomorphic with the other `release-*` lanes.
  Stable-specific policy belongs behind scripts, CLI options, and file
  contracts, not as leaked tool internals in workflow YAML.

## Channel policy and workflow contracts

- `preview` is an independent early-access channel with stable-like release rigor. Use `X.Y.Z-preview.N`, the `preview` storage channel, and `preview/latest` updater feeds. Stable promotion depends on prerelease only.
- Public app identities remain channel-distinct: `Open Design`, `Open Design Beta`, `Open Design Prerelease`, and `Open Design Preview`. Non-stable DMGs must not contain a stable-named `Open Design.app` drag-install bundle.
- A prerelease promoted to stable must include signed macOS arm64 and Intel artifacts. `validateStablePrereleaseMetadata` in `src/metadata/prepare-stable.ts` enforces signed metadata and versioned dmg/zip URLs for both. Linux remains optional. Notarization is a pre-stable requirement but has no metadata gate.
- Prerelease inputs default `enable_mac_x64`, `enable_smoke`, and `enable_tests` to true; `mac_sign_mode` defaults to `sign-only`. Disabling Intel or signing makes that prerelease ineligible for stable promotion. `notarize` is the pre-stable signing setting; `win_x64_smoke_mode` applies when smoke is enabled.
- Automated tests do not gate prerelease delivery. Do not put tests in build/publish dependencies without an explicit channel-policy decision. The release workflow owns `metadata → build_* → publish`; tests and smoke run in separate dispatched workflows so validation does not hold the repository-wide prerelease concurrency group. Keep dispatcher failures visible and non-blocking.
- `release-prerelease-tests.yml` runs functional/e2e/daemon/verify checks. `release-prerelease-smoke.yml` validates published installer artifacts and checksums through `.github/scripts/release/smoke-artifacts.ts` and `tools-pack`; opt-in Linux smoke remains in its build lane. Dispatch uses `.github/scripts/release/dispatch-validation.sh` with built-branch then default-branch fallback.
- `release-prerelease-card.yml` is the sole prerelease notification writer. It polls build/tests/smoke state and updates one card from its first poll through terminal or timeout state. `src/notifications/prerelease-card.ts` owns rendering; `feishu-app.ts` owns transport. Do not add a second prerelease notifier. The webhook transport/secrets remain shared by beta and other workflow notifications.
- Published, verified version metadata is the authoritative package-shipped signal; a workflow conclusion may include failures after publication. `VERSION_METADATA_URL` outranks `BUILD_STATE` where supplied. Notification state must reflect per-platform failures, total failure, and watcher timeout.
- Default-on workflow-dispatch booleans forwarded from push/dispatch entrypoints use `${{ github.event_name != 'workflow_dispatch' || inputs.<flag> }}`. Do not use `${{ inputs.<flag> || true }}`, which overrides an explicit false. Default-off inputs use `${{ inputs.<flag> || false }}` to supply a boolean on push.
- Windows beta updater acceptance uses the real `release-beta-win` namespace to verify installer registry identity; follow [`tools/pack/AGENTS.md`](../pack/AGENTS.md) for the harness.
