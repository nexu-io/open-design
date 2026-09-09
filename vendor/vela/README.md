# Pi evaluation dependency bundle

This branch vendors the Vela dependency used by the Pi acceptance baseline so an Odeval node can install it from any checkout path. This is an internal evaluation bundle, not an npm or Open Design product release.

## Scope

- Supported node: macOS on Apple silicon (`darwin/arm64`). Other platforms need their own verified native package.
- Vela source and binary are unchanged from the baseline. `manifest.json` records the source commit, original binary version, new distribution metadata version, and archive hashes.
- Pi remains pinned to `0.85.1` and is downloaded with its dependencies from npm during installation. The bundle is not an offline installer.
- No model routing, AMR credentials, strategy, runtime capability gates, or evaluation results change. This branch does not install newer Odeval Runner fixes.

## Installation

Select this branch when creating a new Odeval Open Design branch evaluation, with `cli=amr` and `amrRuntime=pi`, on compatible nodes. The node checks out the committed archives and installs the dependencies automatically. Existing runs remain pinned to their original commit.

For a clean local checkout, use the repository Node/pnpm versions, then run:

```sh
(cd vendor/vela && shasum -a 256 -c SHA256SUMS)
pnpm install --frozen-lockfile
```

`tools/pack/package.json` points to the meta archive relative to that package. The root `pnpm.overrides` maps its exact native dependency to the tracked platform archive relative to the workspace root. Do not copy absolute workstation paths into either manifest or the lockfile.

The meta archive has a distinct `.portable.1` distribution version because its metadata was repacked. The native archive is byte-for-byte unchanged, so `vela --version` continues to report `0.0.1-test.pi.98057bb`. Do not replace archives in place; use a new distribution version and refresh hashes and the lockfile for later changes.

## Repository check limitation

The repository dependency-spec guard accepts only exact registry versions and `workspace:*`, so it rejects this intentional `file:` distribution (the acceptance baseline already used a rejected absolute `file:` dependency). The guard is unchanged. This branch is for temporary evaluation distribution and is not presented as a regular merge-ready release. Replace these dependencies with a published immutable package before normal release integration.
