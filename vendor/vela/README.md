# Frozen AMR harness evaluation bundle

This branch carries an immutable Vela test package for the Vela / Open Design / ODEval evaluation. It is not an npm or Open Design product release.

| Harness | Frozen version |
| --- | --- |
| OpenCode | 0.0.0--202609020336 (the companion shipped by vela-cli 0.0.35, identical to the build stable v0.22.x ships) |
| Pi | 0.85.1 |
| Codex | 0.154.0 |
| Claude Code | 2.1.267 |
| DSH | 0.1.5-rc.1; DSH pi-ai transport 0.85.1 |
| Oh My Pi | 18.2.5 (`omp` GitHub release binary; not carried by the Vela package, the ODEval Runner provisions it and injects `VELA_OHMYPI_BIN`) |
| none | Included in the Vela binary; no external CLI |

`manifest.json` records the exact Vela source, archive version, OpenCode source, binary hash and archive hashes.

OpenCode is the baseline runtime this evaluation compares against, so its companion is pinned to the binary real users run:
the `@powerformer/vela-cli@0.0.35` companion that stable `open-design-v0.22.0`/`v0.22.1`/`v0.22.2` ship
(sha256 `c1dec4a2f722191c0e5c31c0414c348e3ef4d9a68e844194a549ca536d148f9e`). The Vela binary itself stays at the
evaluation build `d23bd26`, because the other five harnesses need its adapters. Verified: that Vela drives this
companion over ACP, returning `agentInfo {name: "Vela OpenCode", version: "0.0.0"}` with `loadSession` advertised.
 The supported execution platform is macOS Apple silicon (`darwin/arm64`). All other harness dependencies are locked in `pnpm-lock.yaml`; installation needs npm access.

The ODEval arm must select this Open Design source with its complete 40-character `env.commitSha`. A branch name alone is not a freeze. The node checks out that commit and runs `pnpm install --frozen-lockfile`; `tools/pack/package.json` and the root override resolve relative archives inside this repository. No workstation paths or external local archives are required.

Verify archives and install:

```sh
(cd vendor/vela && shasum -a 256 -c SHA256SUMS)
pnpm install --frozen-lockfile
```

Keep the meta-package version in the lockfile identical to the archive manifest. The native optional dependency snapshot must stay fully qualified (`@powerformer/vela-cli-darwin-arm64@file:vendor/vela/...tgz`), including when the package is platform-skipped on Linux. Do not overwrite these archives or refresh their dependencies during the evaluation. Any later change requires a new package version and a new evaluation configuration. Old results retain their original versions.

Seven native CLI process replays with loopback provider responses establish local integration, tools where available, continuation, cancellation and model/usage evidence. They do not establish live-model quality or completed evaluation batches. The `none` runtime has no native tool loop and is not an OD Next tool-strategy capability claim. Nodes still need an ODEval Runner supporting the selected runtime; this branch does not upgrade the Runner.

The repository's normal dependency-spec guard rejects relative `file:` packages. This temporary evaluation distribution follows the existing portable test branch; the guard remains unchanged. A product release must use published immutable packages.
