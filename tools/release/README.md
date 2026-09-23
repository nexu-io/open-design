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
| `prerelease` | `release-prerelease` / `prerelease` | Stable delivery validation | Build prerelease artifacts directly | The only stable promotion gate | No final stable GitHub Release semantics | Prerelease metadata, feeds, platform manifests, payloads, and reports | macOS arm64/x64 and Windows only; no Linux workflow entry | Complete materials that a future stable release can promote |
| `stable` | `release-stable` / `stable` | Formal public release | Promote from a validated `vX.Y.Z` prerelease; reuse explicit formal prerelease Plan recipes and rebuild stable packaging | Must detect available prerelease artifacts for the exact `vX.Y.Z` target | Installers/packages and matching SHA files only | All other platform artifacts, launcher payloads, manifests, metadata, feeds, and reports | macOS arm64/x64 and Windows only; no Linux workflow entry | `publish=false` by default and covers build, signing, notarization, smoke, reports, and the final publish plan without public side effects; `metadata_only=true` stops after promotion metadata |

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
