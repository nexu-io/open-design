# Frozen AMR harness evaluation bundle

This branch carries an immutable Vela test package for the Vela / Open Design / ODEval evaluation. It is not an npm or Open Design product release.

| Harness | Frozen version |
| --- | --- |
| OpenCode | 1.18.30-powerformer.g92ba6a3b82b5 (upstream 1.18.30 plus company patches) |
| Pi | 0.85.1 |
| Codex | 0.154.0 |
| Claude Code | 2.1.267 |
| DSH | 0.1.5-rc.1; DSH pi-ai transport 0.85.1 |
| none | Included in the Vela binary; no external CLI |

`manifest.json` records the exact Vela source, archive version, OpenCode source, binary hash and archive hashes. The supported execution platform is macOS Apple silicon (`darwin/arm64`). All other harness dependencies are locked in `pnpm-lock.yaml`; installation needs npm access.

The ODEval arm must select this Open Design source with its complete 40-character `env.commitSha`. A branch name alone is not a freeze. The node checks out that commit and runs `pnpm install --frozen-lockfile`; `tools/pack/package.json` and the root override resolve relative archives inside this repository. No workstation paths or external local archives are required.

Verify archives and install:

```sh
(cd vendor/vela && shasum -a 256 -c SHA256SUMS)
pnpm install --frozen-lockfile
```

Keep the meta-package version in the lockfile identical to the archive manifest. The native optional dependency snapshot must stay fully qualified (`@powerformer/vela-cli-darwin-arm64@file:vendor/vela/...tgz`), including when the package is platform-skipped on Linux. Do not overwrite these archives or refresh their dependencies during the evaluation. Any later change requires a new package version and a new evaluation configuration. Old results retain their original versions.

Six native CLI process replays with loopback provider responses establish local integration, tools where available, continuation, cancellation and model/usage evidence. They do not establish live-model quality or completed evaluation batches. The `none` runtime has no native tool loop and is not an OD Next tool-strategy capability claim. Nodes still need an ODEval Runner supporting the selected runtime; this branch does not upgrade the Runner.

The repository's normal dependency-spec guard rejects relative `file:` packages. This temporary evaluation distribution follows the existing portable test branch; the guard remains unchanged. A product release must use published immutable packages.
