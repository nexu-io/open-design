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
| `beta-s` | `release-beta-s` / `betas` | Self-hosted or internal-network beta lane | Build through the self-hosted/internal-network lane | Independent beta-s lane; not a stable gate | Do not inherit stable artifact policy | Nexu S3 / `betas` metadata and platform artifacts | Unsupported or default-disabled platforms skip by lane policy | Self-hosted constraints and default-parameter validation |
| `preview` | `release-preview` / `preview` | Independent early-access with stable-like rigor | Build preview artifacts directly | Not a stable gate | None; preview is R2-internal for this migration | R2-only preview metadata, feeds, platform manifests, payloads, and reports | Follows stable platform policy, including optional Linux enablement | Stable-like release flow without GitHub Release publication |
| `prerelease` | `release-prerelease` / `prerelease` | Stable delivery validation | Build prerelease artifacts directly | The only stable promotion gate | No final stable GitHub Release semantics | Prerelease metadata, feeds, platform manifests, payloads, and reports | Follows stable platform policy, including optional Linux enablement | Complete materials that a future stable release can promote |
| `stable` | `release-stable` / `stable` | Formal public release | Promote from a validated `vX.Y.Z` prerelease, with prepublish validation when requested | Must detect available prerelease artifacts for the exact `vX.Y.Z` target | Installers/packages and matching SHA files only | All other platform artifacts, launcher payloads, manifests, metadata, feeds, and reports | Follows stable platform policy, including optional Linux enablement | `metadata` validates promotion inputs and plan; `prepublish` covers build, smoke, reports, and final publish plan without side effects |

## Stable Quick Check

- Stable must verify an available, usable `vX.Y.Z` prerelease artifact set before
  publication.
- Non-stable channels publish counted versions with a `-<channel>.N` suffix, for
  example `-beta.N`, `-betas.N`, `-preview.N`, and `-prerelease.N`; stable
  promotion checks must match the prerelease suffix while deriving the stable
  `vX.Y.Z` target.
- Stable promotion depends on prerelease only; preview must not become a stable
  gate.
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
