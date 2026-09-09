# Multi-harness evaluation dependency bundle

This internal test branch carries the Vela native archive in Git, using the same relative-file distribution as the earlier Pi evaluation branch. It is not an npm or Open Design product release.

- Supported nodes: macOS Apple silicon (`darwin/arm64`).
- Runtimes: OpenCode, Pi, Codex, Claude Code, DSH, and AMR model-only (`none`).
- `manifest.json` records the original Vela source and binary version plus archive hashes. The `.portable.1` meta version only changes distribution metadata; native bytes are unchanged.
- Harness dependencies remain exact versions from the accepted lockfile. Installation requires npm access; this is not an offline bundle.
- The model-only runtime has no native tools. Its selection is not a claim of OD Next tool-strategy support.

The ODEval node checks out this branch and runs `pnpm install --frozen-lockfile`. `tools/pack/package.json` references the meta archive inside this repository. The root override resolves its native dependency to the matching tracked archive. No workstation paths, credentials, or external local files are needed.

Verify archives before installation:

```sh
(cd vendor/vela && shasum -a 256 -c SHA256SUMS)
pnpm install --frozen-lockfile
```

Use a new immutable archive version for changes; never replace a published branch's existing archive bytes in place. Nodes also need an ODEval Runner supporting these runtime selections. This branch does not upgrade the Runner.

The normal repository dependency-spec guard disallows `file:` dependencies. This intentionally temporary evaluation distribution follows the prior portable Pi branch; it is not a merge-ready product release. The guard is not relaxed. A normal product release must replace these references with published immutable packages.
