# Linux Client Parity Plan

## Purpose

Issue: https://github.com/nexu-io/open-design/issues/709

This plan defines the durable Linux packaged-client scope: bring Linux closer
to the macOS and Windows packaged lifecycle without claiming stable public Linux
downloads before release maintainers enable that lane.

## Status

Implemented in PR #1204:

- Linux headless lifecycle parity for install, start, stop, logs, uninstall,
  and cleanup.
- Linux `inspect` support:
  - AppImage mode supports status, eval, and screenshot.
  - Headless mode is status-only.
- Linux packaged e2e smoke coverage:
  - PR lane uses headless runtime smoke on Ubuntu.
  - Release lanes use AppImage smoke under Xvfb when Linux release jobs run.
- Linux release smoke report artifacts preserve build logs, build JSON, smoke
  logs, apt logs, manifest, and screenshots.
- Release Linux AppImage build uses the containerized glibc compatibility target.

## Ownership Boundaries

- `tools/pack` owns Linux packaged build, install, lifecycle, logs, cleanup,
  inspect, containerized build, and release-artifact command behavior.
- `apps/packaged` owns the packaged Electron/headless entrypoints used by
  `tools/pack`.
- `e2e/specs/linux.spec.ts` owns high-signal Linux packaged smoke coverage.
- Release workflows own beta/stable AppImage smoke and evidence upload.
- README and `tools/pack/README.md` own public contributor/operator guidance.

Do not move test logic into application packages to avoid e2e layout drift.
Reusable e2e helpers belong in `e2e/lib/`.

## Known Dependencies

- PR #560 identified that `electronuserland/builder:base` strips npm, npx, and
  corepack from PATH.
- PR #1204 adopts the same standalone `pnpm-linuxstatic-<arch>` bootstrap
  approach directly because its new Linux release smoke depends on the
  containerized build path.
- Merge order: PR #1204 no longer depends on PR #560 for the pnpm bootstrap.
  If PR #1204 merges first, PR #560 should be closed or rebased to avoid
  reintroducing a duplicate container bootstrap change.

## In Scope

- Headless runtime lifecycle parity for Linux.
- AppImage desktop lifecycle smoke in release lanes.
- Linux `inspect` command coverage.
- Build/test evidence preservation for Linux release jobs.
- Containerized Linux AppImage build compatibility using
  `electronuserland/builder:base`.
- Documentation that distinguishes supported behavior, release gates, and known
  Linux packaging caveats.

## Out Of Scope

- `.deb` and `.rpm` packages: require per-distro package metadata, maintainer
  scripts, signing/repository decisions, install/remove hook validation, and a
  release matrix that is larger than the first Linux lane needs.
- Snap: requires store/review ownership, confinement decisions, and a separate
  update/distribution path.
- Flatpak: requires manifest/runtime ownership, portal testing, sandbox file
  access validation, and distribution through Flathub or a custom remote.
- AppImage signing: deferred until there is GPG/signing-key infrastructure and
  a user-facing verification flow.
- AppImage auto-update feed: deferred until Linux publish metadata is wired to a
  real update endpoint.
- Full AppImage PR smoke: deferred because it needs display setup and is slower;
  PR validation uses headless smoke, while AppImage smoke runs in release lanes.

## Release Readiness

Do not flip `vars.ENABLE_STABLE_LINUX` until all checklist items are true:

- Owner: release maintainer responsible for the stable Linux lane is identified
  in the release issue or PR.
- Stable Linux workflow has completed successfully with
  `vars.ENABLE_STABLE_LINUX == 'true'`.
- Linux release artifact bundle contains the expected AppImage, metadata, and
  uploaded `open-design-release-linux-e2e-report`.
- The report artifact contains:
  - `tools-pack.json`
  - `tools-pack.log`
  - `manifest.json`
  - `vitest.log`
  - apt logs
  - screenshot output
- Smoke proves install, start, inspect status, inspect eval, inspect screenshot,
  logs, stop, uninstall, and cleanup.
- Public README download/status copy is updated only after the successful stable
  Linux release run.
- Follow-up checkpoint: review the first successful beta Linux release before
  enabling stable Linux, then review the first stable Linux run before promoting
  public download copy.

## Regression Risks

- PR Linux headless smoke adds one Ubuntu job only when packaged-relevant files
  change. Expected runtime target: under 10 minutes on GitHub-hosted Ubuntu.
- Release AppImage smoke adds one Linux job step behind existing beta/stable
  Linux gates. Expected additional runtime target: under 15 minutes for build
  plus smoke after dependencies are installed.
- AppImage runtime smoke uses Xvfb and can fail if Electron cannot acquire a
  display or if AppImage extraction/runtime startup exceeds the smoke timeout.
  Acceptable flake budget before stable enablement: zero repeated failures
  across the release-readiness checkpoint runs.
- Containerized build depends on Docker availability on GitHub-hosted Ubuntu and
  on `curl` plus `sha256sum` inside `electronuserland/builder:base`; the build
  command fails explicitly if either contract changes.
- The standalone pnpm asset is pinned to the root `packageManager` version and
  verified by SHA-256 before execution.

## Validation

Use the focused checks below after Linux packaged-client changes:

```bash
corepack pnpm guard
corepack pnpm --filter @open-design/tools-pack test -- linux.test.ts
corepack pnpm --filter @open-design/tools-pack typecheck
corepack pnpm --filter @open-design/e2e test -- tests/linux-helpers.test.ts tests/packaged-smoke-workflow.test.ts
corepack pnpm --filter @open-design/e2e typecheck
git diff --check
```

When changing release workflow YAML, also parse the affected workflows and
inspect the Linux release report artifact layout before requesting review.
