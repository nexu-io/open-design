# Electron to Tauri Migration

Last updated: 2026-05-20

## Objective

Replace the Electron desktop runtime with Tauri across dev and packaged flows while preserving the existing sidecar contract, daemon/web lifecycle entrypoints, desktop bridge trust boundaries, and namespace-scoped runtime paths.

The migration stays parallel until parity is proven. Electron remains the default runtime until every acceptance gate below passes on macOS, Windows, and Linux.

## Current State

- `apps/desktop/src-tauri` exists as an opt-in Tauri runtime.
- `apps/web` resolves desktop capabilities through `resolveDesktopBridge()` instead of directly calling `window.electronAPI`.
- `tools-dev start desktop --desktop-runtime tauri` starts the Rust runtime, discovers the web sidecar URL, exposes desktop status IPC, and passes macOS dev inspect smoke for `status`, generic `eval`, `click`, `console`, and `screenshot`.
- Tauri command IPC is permissioned through the generated app command manifest and confirmed from the remote web URL for `desktop_open_external`, `desktop_pick_and_import`, and `desktop_open_project_path`.
- `tools-pack` accepts `--desktop-runtime electron|tauri`; the Tauri path assembles the existing packaged Node app, resource tree, bundled Node, and packaged config into Tauri bundle resources.
- macOS Tauri `.app` and `.dmg` packaging now pass build/install where applicable/start/inspect eval/inspect screenshot/stop smoke.
- Windows NSIS and Linux AppImage Tauri packaging, lifecycle, and uninstall paths are wired and have readiness tests, but remain platform smoke gates.
- CI now has opt-in-by-change Tauri platform gates for Windows NSIS and Linux AppImage through `packaged_smoke_tauri_win` and `packaged_smoke_tauri_linux`; those jobs still need native runner evidence, including uninstall/removal evidence, before the M4 boxes below can close.
- `release-beta` has an explicit `desktop_runtime` workflow input, defaulting to `electron`, so maintainers can run beta packaging with `tauri` before the default flip without changing public defaults.
- MSI and Windows/Linux unpacked `--to dir` are not default-flip blockers. Tauri officially supports MSI via WiX, but this repository still needs a namespace-scoped MSI install/uninstall lifecycle before treating MSI as release-grade. Tauri's documented bundle targets are `deb`, `rpm`, `appimage`, `nsis`, `msi`, `app`, and `dmg`, with no `dir` target; Windows/Linux `--desktop-runtime tauri --to dir` now fails fast with guidance to use the installer target or the legacy Electron runtime. Reference: https://v2.tauri.app/reference/config/#bundletype
- Tauri versions are pinned to `tauri@2.11.2`, `@tauri-apps/cli@2.11.2`, and `@tauri-apps/api@2.11.0`.
- Electron remains the default runtime for `tools-dev` and `tools-pack`.

## Schedule

| Phase | Dates | Goal | Exit Criteria |
| --- | --- | --- | --- |
| M0 Runtime parity | 2026-05-20 to 2026-05-22 | Make the Tauri dev runtime inspectable and usable enough for daily smoke. | `status`, `eval`, `click`, `console`, and `screenshot` work through the existing desktop sidecar message shapes on macOS dev. |
| M1 Cross-platform IPC | 2026-05-25 to 2026-05-29 | Remove Unix-only assumptions from the Rust desktop runtime. | Windows named-pipe IPC and Linux/macOS Unix socket IPC pass the same status/eval/click tests. |
| M2 Bridge hardening | 2026-06-01 to 2026-06-03 | Prove renderer bridge parity. | `openExternal`, `pickAndImport`, `openProjectPath`, analytics desktop detection, and browser print fallback are covered by web + runtime smoke. |
| M3 Packaging parallel path | 2026-06-04 to 2026-06-10 | Add Tauri as an opt-in `tools-pack` runtime. | `tools-pack mac|win|linux build --desktop-runtime tauri` produces namespace-mapped artifacts and keeps existing install/start/stop/logs/inspect command shape. |
| M4 Platform package smoke | 2026-06-11 to 2026-06-17 | Validate installable Tauri artifacts. | mac `.app/.dmg`, Windows NSIS, and Linux AppImage/headless flows start daemon/web/desktop and pass inspect status/eval/screenshot; Windows/Linux also prove stop plus uninstall/removal evidence. MSI is tracked as a post-flip release follow-up unless release ownership makes it mandatory. |
| M5 Default flip | 2026-06-18 to 2026-06-19 | Make Tauri the default desktop runtime. | `tools-dev`, `tools-pack`, and `release-beta` default to Tauri; Electron remains available behind an explicit fallback flag for one release window. |
| M6 Electron removal | 2026-06-22 to 2026-06-24 | Remove Electron-only runtime code and dependencies. | Electron deps, builder hooks, packaged Electron entry glue, and Electron-only docs/tests are removed or replaced. |

## Continuation Cadence

Each continuation pass starts from current repository evidence, not from a remembered status:

```bash
git status --short --branch
pnpm exec tsx scripts/tauri-migration-status.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff \
  --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz \
  --remote origin \
  --report-dir /tmp/open-design-tauri-m4-reports
pnpm exec tsx scripts/continue-tauri-migration.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff \
  --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz \
  --remote origin \
  --report-dir /tmp/open-design-tauri-m4-reports \
  --dry-run
```

If the handoff is stale, regenerate it before attempting a remote push:

```bash
pnpm exec tsx scripts/verify-tauri-migration-handoff.ts \
  --output-dir /tmp/open-design-tauri-migration-handoff
pnpm exec tsx scripts/package-tauri-migration-handoff.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff
```

Do not write mutable handoff commit SHAs or archive hashes into this document as fixed requirements. The source of truth is the latest `tauri-migration-status` output plus the generated handoff manifest, archive checksum, command sidecar, and command-sidecar checksum. Once a write-capable credential has pushed the branch and native CI has produced matching Windows/Linux reports, continue with:

```bash
pnpm exec tsx scripts/continue-tauri-migration.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff \
  --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz \
  --remote origin \
  --report-dir /tmp/open-design-tauri-m4-reports \
  --wait-reports \
  --advance
```

If the push is still blocked, keep the archive, `.sha256`, `.commands.sh`, and `.commands.sh.sha256` sidecars current and retry the remote handoff on the next continuation pass.

### Sustained follow-up

The Codex thread should keep exactly one active heartbeat for this migration, named `Tauri migration follow-up` with id `tauri-migration-follow-up`, scheduled daily at 09:00 local thread time. The heartbeat prompt must start from this document and the current `tauri-migration-status` output using the handoff directory, handoff archive, remote, and report directory above, then use the matching `scripts/continue-tauri-migration.ts ... --dry-run` command before taking mutating action.

Do not create duplicate reminders for the same work. If the continuation sequence changes, update that heartbeat prompt instead. The heartbeat must keep the goal active until M4 native evidence, M5 default flip, and M6 Electron cleanup are all complete and verified.

## Work Breakdown

### M0 Runtime parity

- [x] Add Tauri runtime scaffold under `apps/desktop/src-tauri`.
- [x] Add status IPC using the existing `SIDECAR_MESSAGES.STATUS` shape.
- [x] Load the web sidecar URL after daemon/web startup.
- [x] Register daemon desktop-auth secret for folder import.
- [x] Implement generic `eval` callback path for arbitrary inspect expressions.
- [x] Implement `click` via the same eval callback path.
- [x] Implement `screenshot` for local runtime smoke.
- [x] Replace temporary special-cased `location.href` / `document.title` eval handling with the generic path once stable.

### M1 Cross-platform IPC

- [x] Implement Windows named-pipe server/client support in the Rust runtime.
- [x] Keep POSIX Unix socket behavior byte-compatible with `@open-design/sidecar`.
- [x] Add protocol drift tests covering Rust constants, stamp fields, message names, and IPC response envelopes.
- [x] Run two namespaces concurrently and verify stamps do not collide.

### M2 Bridge hardening

- [x] Add runtime-neutral web `desktop-bridge`.
- [x] Keep Electron adapter compatible with existing preload names.
- [x] Add Tauri adapter using command IPC.
- [x] Confirm Tauri command availability from the remote web URL, not only from static pending HTML.
- [x] Add runtime smoke for `desktop_open_external`.
- [x] Add runtime smoke for `desktop_pick_and_import` against a temp folder.
- [x] Add runtime smoke for `desktop_open_project_path`.
- [x] Keep Tauri PDF on browser print fallback until native print parity is explicitly scheduled.

### M3 Packaging parallel path

- [x] Add `--desktop-runtime electron|tauri` to `tools-pack` shared options.
- [x] Teach mac build/start/stop/inspect to use Tauri `.app` bundle outputs when selected.
- [x] Teach Windows build/start/stop/inspect to use Tauri NSIS outputs when selected.
- [x] Teach Linux build/start/stop/inspect to use Tauri AppImage outputs when selected.
- [x] Include the existing `open-design` resource tree, packaged config, bundled Node, daemon sidecar, and web sidecar entries as Tauri resources.
- [x] Preserve namespace-scoped runtime paths under `.tmp/tools-pack/runtime/...`.
- [x] Keep ports out of packaged runtime path decisions.
- [x] Make macOS, Windows, and Linux Tauri packaged starts wait for a running desktop status with a web URL before reporting readiness.
- [x] Decide Windows MSI is not a default-flip release requirement; keep it as a post-flip follow-up unless release ownership requires it.
- [x] Resolve Windows/Linux Tauri `--to dir` as an Electron-only legacy target; Tauri builds fail fast with installer-target guidance.

### M4 Platform package smoke

- [x] macOS `.app`: build, start, inspect status/eval/screenshot, stop.
- [x] macOS `.dmg`: build, install, start, inspect status/eval/screenshot, stop.
- [ ] Windows NSIS: build, install, start, inspect status/eval/screenshot, stop, uninstall, and verify no residue.
- [x] Windows MSI: out of scope for the default flip; reopen only if release ownership makes MSI mandatory.
- [ ] Linux: build AppImage, install, start, inspect status/eval/screenshot, stop, uninstall, and verify removal.
- [x] Linux headless path has non-GUI lifecycle regression coverage.
- [ ] Linux headless platform smoke remains supported and unaffected.
- [x] Run e2e `tests/tools-dev/inspect.test.ts` against Tauri where the host supports a GUI.

### M5 Default flip

- [ ] Change `tools-dev` default desktop runtime to Tauri.
- [ ] Change `tools-pack` default desktop runtime to Tauri.
- [ ] Change `release-beta` desktop runtime workflow default to Tauri.
- [ ] Keep Electron fallback explicit during the transition window.
- [ ] Update README, architecture docs, and directory guidance to describe Tauri as the primary runtime.

### M6 Electron removal

- [ ] Remove `electron`, `electron-builder`, `@electron/rebuild`, and Electron-only package scripts.
- [ ] Remove Electron preload/runtime code after Tauri bridge and packaging parity are complete.
- [ ] Remove Electron-only resources/hooks from `tools-pack` and release workflows.
- [ ] Delete or rewrite Electron-only tests.
- [ ] Update AGENTS guidance and PR checklist references from Electron to Tauri.

## Post-M4 Execution Runbook

Do not start this runbook until `scripts/advance-tauri-migration-m4-m5.ts` or `scripts/continue-tauri-migration.ts --wait-reports --advance` has verified the pushed remote migration branch head, verified the Windows/Linux reports with `scripts/verify-tauri-platform-gates.ts --update-migration-doc docs/electron-to-tauri-migration.md`, updated the three Windows/Linux M4 checkboxes, and appended both the native evidence and remote branch-head evidence log entries.

### M5 default flip procedure

1. If you already have extracted Windows/Linux report artifacts and have not yet updated M4, prefer the M4→M5 phase advance command:

```bash
pnpm exec tsx scripts/advance-tauri-migration-m4-m5.ts \
  --remote origin \
  --branch codex/electron-to-tauri-migration \
  --expected-head <migration-commit-sha> \
  --win-report /path/to/open-design-ci-win-tauri-e2e-report \
  --linux-report /path/to/open-design-ci-linux-tauri-e2e-report
```

This verifies the pushed migration branch head first, then verifies both native reports with `scripts/verify-tauri-platform-gates.ts --update-migration-doc`, updates the M4 evidence in this document, and runs the guarded M5 applicator.

2. If M4 has already been verified and both the native evidence and pushed remote branch-head evidence entries are recorded, run the guarded M5 applicator directly:

```bash
pnpm exec tsx scripts/apply-tauri-migration-m5.ts
```

The script refuses to run until the M4 Windows/Linux checkboxes, native evidence marker, and pushed remote branch-head evidence marker have been recorded. When allowed, it changes `DEFAULT_DESKTOP_RUNTIME` from `electron` to `tauri` in both `tools/dev/src/config.ts` and `tools/pack/src/config.ts`, keeps `DESKTOP_RUNTIME_KINDS` accepting both runtimes for the explicit Electron fallback, flips `.github/workflows/release-beta.yml` `desktop_runtime.default`, updates Tauri-primary wording in `README.md`, `apps/AGENTS.md`, and `docs/architecture.md`, and marks all five M5 checklist items together.

3. Review the applicator diff. If any surrounding docs have changed enough that an exact replacement fails, update the script and its fixture test rather than manually checking partial M5 lines.
4. Run:

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/tools-dev test
pnpm --filter @open-design/tools-pack test
```

### M6 Electron removal procedure

1. Print the current Electron cleanup plan:

```bash
pnpm exec tsx scripts/tauri-migration-inventory.ts --plan
```

The plan groups the exact M6 blockers by package manifest dependencies, Electron-only package scripts, `pnpm-lock.yaml` importers, Electron runtime files, Electron-only pack resources, Electron-specific release workflow references, Electron-referencing tests, and Electron-specific guidance, then prints the cleanup order and verification commands. Use it as the removal checklist before editing. Use `--json` when automation needs the same data as structured input.

2. Remove Electron packages and any Electron-only package scripts from `apps/desktop/package.json`, `apps/packaged/package.json`, and `tools/pack/package.json`; then run `pnpm install` so `pnpm-lock.yaml` importer entries are updated.
3. Remove or replace Electron runtime files under `apps/desktop/src/main/`, including `index.ts`, `preload.cts`, and `runtime.ts`. Keep any runtime-neutral code only if it has a Tauri caller.
4. Remove Electron-only pack resources such as `tools/pack/resources/web-standalone-after-pack.cjs`, any electron-builder hook wiring that becomes unreachable, and Electron-specific CI/release workflow steps in `.github/workflows/` or `.github/scripts/release/`.
5. Delete or rewrite Electron-only tests in `apps/desktop/tests`, `apps/packaged/tests`, and `tools/pack/tests`. Tests for Tauri behavior, headless Linux, and generic sidecar contracts should remain.
6. Update Electron-specific guidance in root/app/tool AGENTS files, `tools/pack/AGENTS.md`, `docs/code-review-guidelines.md`, and `.github/pull_request_template.md`.
7. Remove `electron` from `DESKTOP_RUNTIME_KINDS` in `tools/dev/src/config.ts` and `tools/pack/src/config.ts` only after the M6 cleanup checkboxes are ready to move together.
8. Mark all five M6 checklist items together. `pnpm guard` intentionally rejects M6 cleanup before M5 and rejects stale files, deps, package scripts, lockfile importers, release workflow references, tests, or guidance.
9. Run:

```bash
pnpm install
pnpm guard
pnpm typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/desktop test
pnpm --filter @open-design/packaged test
pnpm --filter @open-design/tools-dev test
pnpm --filter @open-design/tools-pack test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

## QA Plan

### Always-run checks

Run before marking any phase complete:

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/desktop test
pnpm --filter @open-design/packaged test
pnpm --filter @open-design/tools-dev test
pnpm --filter @open-design/tools-pack test
cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml
cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings
cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml
```

When running e2e from `e2e/`, make sure Node 24 is first on PATH. On this host, running without the PATH override used Node 22 and failed on the `better-sqlite3` native ABI:

```bash
PATH=/opt/homebrew/bin:$PATH pnpm test tests/tools-dev/inspect.test.ts
```

### Dev runtime smoke

Use an isolated namespace and explicit ports:

```bash
pnpm tools-dev start desktop --namespace tauri-smoke --daemon-port 18456 --web-port 18573 --desktop-runtime tauri --json
pnpm tools-dev inspect desktop status --namespace tauri-smoke --json
pnpm tools-dev inspect desktop eval --namespace tauri-smoke --expr "location.href" --json
pnpm tools-dev inspect desktop click --namespace tauri-smoke --selector "body" --json
pnpm tools-dev inspect desktop screenshot --namespace tauri-smoke --path /tmp/open-design-tauri.png --json
pnpm tools-dev stop --namespace tauri-smoke --json
```

### Packaged smoke

Run after M3:

```bash
pnpm tools-pack mac build --to all --desktop-runtime tauri
pnpm tools-pack mac install
pnpm tools-pack mac start
pnpm tools-pack mac inspect --expr "location.href"
pnpm tools-pack mac stop
```

The current verified macOS `.app` smoke uses an isolated output root and namespace:

```bash
pnpm tools-pack mac build --desktop-runtime tauri --to app --namespace tauri-pack-smoke --dir /tmp/open-design-tauri-pack-smoke --json
pnpm tools-pack mac start --desktop-runtime tauri --namespace tauri-pack-smoke --dir /tmp/open-design-tauri-pack-smoke --json
pnpm tools-pack mac inspect --desktop-runtime tauri --namespace tauri-pack-smoke --dir /tmp/open-design-tauri-pack-smoke --expr "location.href" --json
pnpm tools-pack mac inspect --desktop-runtime tauri --namespace tauri-pack-smoke --dir /tmp/open-design-tauri-pack-smoke --path /tmp/open-design-tauri-pack-smoke.png --json
pnpm tools-pack mac stop --desktop-runtime tauri --namespace tauri-pack-smoke --dir /tmp/open-design-tauri-pack-smoke --json
```

Equivalent Windows and Linux runs:

```bash
pnpm tools-pack win build --to nsis --desktop-runtime tauri
pnpm tools-pack win install
pnpm tools-pack win start
pnpm tools-pack win inspect --expr "location.href"
pnpm tools-pack win stop

pnpm tools-pack linux build --to appimage --desktop-runtime tauri
pnpm tools-pack linux install
pnpm tools-pack linux start
pnpm tools-pack linux inspect --expr "location.href"
pnpm tools-pack linux stop
```

### Release blockers

- Desktop bridge must never expose raw filesystem paths or import tokens to the renderer.
- Folder import must continue to require HMAC desktop auth when a desktop runtime is active.
- Namespace-scoped runtime paths must not include daemon/web ports.
- `SIDECAR_STAMP_FIELDS` remains exactly five fields: `app`, `mode`, `namespace`, `ipc`, `source`.
- Tauri AppImage must document or avoid the Electron-era FUSE/extract-and-run behavior where applicable.

## Open Platform Gates

These gates are intentionally not marked complete from macOS-only evidence. Run them on the named host type and paste the command output summary into the execution log.

| Gate | Host | Command Sequence | Required Evidence |
| --- | --- | --- | --- |
| Windows NSIS smoke | Windows 11 with Node 24, pnpm 10.33.2, Rust stable, Tauri Windows prerequisites | `pnpm tools-pack win build --to nsis --desktop-runtime tauri --namespace tauri-win-smoke --json`; `pnpm tools-pack win install --desktop-runtime tauri --namespace tauri-win-smoke --json`; `pnpm tools-pack win start --desktop-runtime tauri --namespace tauri-win-smoke --json`; `pnpm tools-pack win inspect --desktop-runtime tauri --namespace tauri-win-smoke --expr "location.href" --json`; `pnpm tools-pack win inspect --desktop-runtime tauri --namespace tauri-win-smoke --path %TEMP%\\open-design-tauri-win.png --json`; `pnpm tools-pack win stop --desktop-runtime tauri --namespace tauri-win-smoke --json`; `pnpm tools-pack win uninstall --desktop-runtime tauri --namespace tauri-win-smoke --remove-product-user-data --json` | Installer path, installed exe path, start status URL, eval URL with trailing slash, screenshot file path, `remainingPids: []` on stop, and uninstall residue showing no managed PIDs, namespace root, registry residue, installed exe, or uninstaller. |
| Linux AppImage smoke | Linux desktop host with Node 24, pnpm 10.33.2, Rust stable, Tauri Linux prerequisites | `pnpm tools-pack linux build --to appimage --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux install --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux start --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux inspect --desktop-runtime tauri --namespace tauri-linux-smoke --expr "location.href" --json`; `pnpm tools-pack linux inspect --desktop-runtime tauri --namespace tauri-linux-smoke --path /tmp/open-design-tauri-linux.png --json`; `pnpm tools-pack linux stop --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux uninstall --desktop-runtime tauri --namespace tauri-linux-smoke --json` | AppImage path, installed AppImage path, start status URL, eval URL with trailing slash, screenshot file path, `remainingPids: []` on stop, and uninstall removal values for AppImage, desktop file, and icon that are not `skipped-process-running`. |
| Linux headless regression | Linux host after a successful Tauri Linux build | `pnpm tools-pack linux install --headless --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux start --headless --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux stop --headless --desktop-runtime tauri --namespace tauri-linux-smoke --json` | Headless launcher path, status URL or marker, `remainingPids: []` on stop. |
| MSI follow-up | Windows host / release owner decision | MSI is not a default-flip blocker. If release ownership later makes MSI mandatory, add `--to msi` support plus a namespace-scoped install/uninstall lifecycle before running the same inspect smoke as NSIS. | Follow-up issue or code change and Windows smoke result. |

## Execution Log

- 2026-05-19: Added Tauri dev runtime MVP, web desktop bridge abstraction, `tools-dev --desktop-runtime tauri`, and regression tests.
- 2026-05-19: Verified `tools-dev` Tauri smoke for status and `location.href` in namespace `codex-tauri-mvp`.
- 2026-05-20: Created this migration execution plan and QA checklist.
- 2026-05-20: Completed M0 macOS dev parity in namespace `codex-tauri-m0`: generic `eval`, `click`, `console`, remote Tauri command availability, and PNG `screenshot` passed through existing desktop inspect message shapes.
- 2026-05-20: Added Windows named-pipe IPC code path and shared IPC response framing in Rust. macOS POSIX IPC was re-verified with concurrent namespaces `codex-tauri-m0` and `codex-tauri-m1b`; `cargo check --target x86_64-pc-windows-msvc` is blocked on this host by missing MSVC C headers in transitive `ring` build, so Windows runtime smoke remains a platform QA gate.
- 2026-05-20: Completed M2 command smoke from the remote web URL. `desktop_open_external` validation returned `false` for a non-http URL, `desktop_pick_and_import` imported `/tmp/open-design-tauri-import-smoke` through the HMAC desktop-auth flow, and `desktop_open_project_path` validated the imported trusted-picker project with dry-run open enabled.
- 2026-05-20: Added `tools-pack --desktop-runtime tauri`, Tauri bundle resource mapping for `app`, `open-design`, and `open-design-config.json`, and a packaged Tauri Node helper that starts daemon/web sidecars without importing Electron.
- 2026-05-20: Completed macOS Tauri `.app` package smoke in namespace `tauri-pack-smoke`. Build produced `/tmp/open-design-tauri-pack-smoke/out/mac/namespaces/tauri-pack-smoke/builder/mac-arm64/Open Design.app`; start returned `url: http://127.0.0.1:63687`; inspect eval returned `http://127.0.0.1:63687/`; screenshot wrote `/tmp/open-design-tauri-pack-smoke.png`; stop left no matching processes.
- 2026-05-20: Updated `tools-pack mac start` and the parallel Windows start path so Tauri waits for a running desktop status with a web URL before reporting readiness. Electron start behavior remains unchanged.
- 2026-05-20: Completed macOS Tauri `.dmg` install smoke in namespace `tauri-pack-dmg-smoke`. Build produced `/tmp/open-design-tauri-pack-dmg-smoke/out/mac/namespaces/tauri-pack-dmg-smoke/dmg/Open Design-tauri-pack-dmg-smoke.dmg`; install copied `Open Design.tauri-pack-dmg-smoke.app`; start returned `url: http://127.0.0.1:64293`; inspect eval returned `http://127.0.0.1:64293/`; screenshot wrote `/tmp/open-design-tauri-pack-dmg-smoke.png`; stop left no matching processes.
- 2026-05-20: Added e2e coverage for `tools-dev start desktop --desktop-runtime tauri` and desktop inspect status/eval/screenshot. `PATH=/opt/homebrew/bin:$PATH pnpm test tests/tools-dev/inspect.test.ts` passed both the existing web/daemon smoke and the new Tauri desktop inspect smoke.
- 2026-05-20: Locked Tauri PDF fallback behavior with `apps/web/tests/runtime/exports.test.ts`: when `__TAURI_INTERNALS__` is present without `printPdf`, `exportAsPdf` opens the browser print popup and injects `window.print()` instead of using a native desktop print bridge.
- 2026-05-20: Hardened the Windows packaged start path for Tauri by writing a namespace-scoped `OD_PACKAGED_CONFIG_PATH` launch override, matching the macOS lifecycle behavior and preventing installed apps from relying only on baked packaged config paths. `tools/pack/tests/win-lifecycle.test.ts` covers the installed-app override.
- 2026-05-20: Hardened the Linux packaged start path for Tauri so AppImage launches wait for desktop status with a web URL instead of returning after only `desktop-root.json`. `tools/pack/tests/linux-lifecycle.test.ts`, `pnpm --filter @open-design/tools-pack typecheck`, `pnpm --filter @open-design/tools-pack build`, and `pnpm --filter @open-design/tools-pack test -- linux-lifecycle` passed.
- 2026-05-20: Added `tools-pack linux inspect` so Linux now exposes the same status/eval/screenshot inspection command shape as macOS and Windows. `tools/pack/tests/linux-lifecycle.test.ts` locks the sidecar message shapes; `pnpm --filter @open-design/tools-pack typecheck`, `pnpm --filter @open-design/tools-pack build`, and `pnpm --filter @open-design/tools-pack test -- linux-lifecycle` passed.
- 2026-05-20: Added non-GUI regression coverage for Linux headless start against the same assembled app and resource tree used by the Tauri Linux build path. `tools/pack/tests/linux-lifecycle.test.ts` now covers AppImage start readiness, Linux inspect message shapes, and headless lifecycle path resolution.
- 2026-05-20: Closed the conditional MSI and win/linux `--to dir` decisions for the default flip. MSI is a post-flip follow-up unless release ownership requires it; win/linux `dir` is an M6 command-shape resolution because Tauri's official bundle targets are `deb`, `rpm`, `appimage`, `nsis`, `msi`, `app`, and `dmg`, not `dir`.
- 2026-05-20: Confirmed this host cannot close Windows/Linux platform smoke directly: current host is macOS arm64, Docker is not installed, and Windows/Linux Tauri package smoke remains assigned to native platform hosts.
- 2026-05-20: Added `e2e/specs/linux.spec.ts` as the executable Linux Tauri platform gate. On a Linux host with `OD_PACKAGED_E2E_LINUX=1`, it runs AppImage build/install/start/inspect eval/screenshot/logs/stop/uninstall and then verifies `--headless` install/start/stop. `e2e/scripts/release-smoke.ts` and packaged e2e reports now accept the `linux` platform. On this macOS host, `pnpm test specs/linux.spec.ts` skips as intended and `pnpm typecheck` in `e2e/` passes.
- 2026-05-20: Added `e2e/specs/win-tauri.spec.ts` as the executable Windows Tauri NSIS platform gate. It builds with `--desktop-runtime tauri`, installs the NSIS artifact, waits for HTTP web health through desktop eval, captures a screenshot, validates logs, stops, and uninstalls without reusing Electron-specific NSIS direct-reinstall assertions. On this macOS host, `PATH=/opt/homebrew/bin:$PATH pnpm test specs/linux.spec.ts specs/win-tauri.spec.ts` skips both platform-gated specs as intended and `PATH=/opt/homebrew/bin:$PATH pnpm typecheck` in `e2e/` passes.
- 2026-05-20: Updated `e2e/scripts/release-smoke.ts` so self-building platform specs can emit manifest/suite-result reports with `OD_PACKAGED_E2E_BUILD_JSON_REQUIRED=0`. The default remains strict: if the flag is not disabled, `OD_PACKAGED_E2E_BUILD_JSON_PATH` must be provided and must point to an existing file. Verified skip-mode report generation for `linux specs/linux.spec.ts` and `win specs/win-tauri.spec.ts` on this macOS host.
- 2026-05-20: Added CI jobs `packaged_smoke_tauri_win` and `packaged_smoke_tauri_linux` to run the executable Windows/Linux Tauri platform gates when packaging-relevant files change. The Linux job installs the Tauri v2 WebKitGTK 4.1 prerequisites plus AppImage runtime support and runs under `xvfb`; both jobs publish release-smoke reports as artifacts. CI scope detection also treats the Tauri platform specs and release-smoke report wrapper as tools-pack validation triggers. The Tauri platform jobs depend only on change detection so native M4 evidence can run in parallel with general workspace validation. Local YAML parsing, root `pnpm guard`, root `pnpm typecheck`, and macOS skip-mode release-smoke checks passed.
- 2026-05-20: Committed the migration implementation locally on branch `codex/electron-to-tauri-migration`; use `git rev-parse codex/electron-to-tauri-migration` for the current handoff commit. Unrelated local files were left unstaged. Attempted `git push -u origin codex/electron-to-tauri-migration`, but the configured Git credential (`sunseol`) lacks write permission to `nexu-io/open-design` and GitHub returned 403. The GitHub connector also returned 403 for creating the same branch. Native Windows/Linux M4 evidence is therefore still pending a push/PR from a credential with repository write access or an equivalent native-host run.
- 2026-05-20: Added `scripts/verify-tauri-platform-gates.ts` to mechanically validate extracted Windows/Linux release-smoke artifacts before closing M4. It rejects skipped reports, missing `summary.json`, missing screenshots, wrong specs, failed suite results, bad health evals, non-empty stop PID lists, missing executable paths, Windows uninstall residue, and Linux headless regressions. Verified a synthetic passing report pair and confirmed the current macOS skip report fails with a missing `summary.json` error.
- 2026-05-20: Added `scripts/verify-tauri-platform-gates.test.ts` and wired it into `pnpm guard`, so the report verifier is now part of the repository policy gate. The tests cover a complete Windows+Linux evidence pair, a skipped report with no runtime summary, and Windows stop residue. `pnpm guard` and `pnpm typecheck` passed after the wiring change.
- 2026-05-20: Added `OD_PACKAGED_E2E_REUSE_BUILD=1` support to `e2e/specs/win-tauri.spec.ts` and `e2e/specs/linux.spec.ts`, allowing release workflows to smoke the artifact built in an earlier tools-pack step instead of rebuilding. `release-beta` now has a `desktop_runtime: electron|tauri` input, keeps Electron as the default, and wires Tauri beta runs through the runtime-specific tools-pack build flags, Rust/Tauri Linux prerequisites, Windows Tauri smoke, Linux Tauri smoke, and the existing mac packaged smoke with `OD_PACKAGED_E2E_DESKTOP_RUNTIME`.
- 2026-05-20: Wired `scripts/verify-tauri-platform-gates.ts` into the PR CI Tauri platform jobs and the `release-beta desktop_runtime=tauri` Windows/Linux smoke paths. Native Windows/Linux jobs now fail if the release-smoke wrapper exits successfully but the report artifact lacks the M4 evidence needed for signoff.
- 2026-05-20: Re-ran the local QA plan after the CI verifier wiring. `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, `pnpm --filter @open-design/desktop test`, `pnpm --filter @open-design/packaged test`, `pnpm --filter @open-design/tools-dev test`, `pnpm --filter @open-design/tools-pack test`, `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`, `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`, and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` passed locally. The platform e2e specs `specs/mac.spec.ts`, `specs/linux.spec.ts`, and `specs/win-tauri.spec.ts` also load successfully on macOS and skip when their host gates are not enabled.
- 2026-05-20: Repeated `git push -u origin codex/electron-to-tauri-migration` attempts from the configured `sunseol` credential continue to fail with `Permission to nexu-io/open-design.git denied` and HTTP 403.
- 2026-05-20: Resolved the Windows/Linux Tauri `--to dir` command-shape decision by making CLI help label `dir` as Electron-only and locking the Tauri path to fail fast with installer-target guidance. `pnpm --filter @open-design/tools-pack test -- tauri-targets`, `pnpm --filter @open-design/tools-pack typecheck`, and `pnpm guard` passed.
- 2026-05-20: Added the Tauri platform report verifier and verifier test files to CI packaging scope detection. PRs that change `scripts/verify-tauri-platform-gates.ts` or its test now rerun the Windows/Linux Tauri smoke jobs instead of only validating the script locally.
- 2026-05-20: Strengthened `scripts/verify-tauri-platform-gates.ts` success output so passing native reports print the exact M4 evidence summary: installer/AppImage paths, installed executable path, loopback URL, health URL, screenshot, stop residue, uninstall residue, and Linux headless launcher/start/stop evidence. The verifier now also rejects missing `start.executablePath`. `node --import tsx --test scripts/verify-tauri-platform-gates.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added a guarded `--update-migration-doc` mode to `scripts/verify-tauri-platform-gates.ts`. It requires both Windows and Linux reports to pass, then marks the three remaining M4 platform checkboxes complete and appends an execution-log entry. `node --import tsx --test scripts/verify-tauri-platform-gates.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Centralized the current Electron default desktop runtime for `tools-dev` and `tools-pack` behind `DEFAULT_DESKTOP_RUNTIME` constants without flipping behavior. This keeps M5 as an explicit constant change after M4 evidence lands and keeps CLI help/tests tied to the same value. `pnpm --filter @open-design/tools-dev test`, `pnpm --filter @open-design/tools-dev typecheck`, `pnpm --filter @open-design/tools-pack test -- config tauri-targets`, `pnpm --filter @open-design/tools-pack typecheck`, and `pnpm guard` passed.
- 2026-05-20: Added a `pnpm guard` migration-order check that blocks `DEFAULT_DESKTOP_RUNTIME=tauri` until all three M4 Windows/Linux platform checkboxes are complete, and requires the M5 checklist lines to move with the tools-dev/tools-pack constants. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard to include the `release-beta` `desktop_runtime` workflow default. The beta workflow default now has to stay on Electron until M4 is complete, then move with the `tools-dev` and `tools-pack` M5 default flip. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Updated README, app ownership guidance, code-review ownership guidance, packaged headless comments, and architecture notes so they describe the current parallel state: Electron remains the default desktop runtime, while Tauri is the explicit migration runtime. The M5 "Tauri primary" docs checkbox remains open until the default flip. `pnpm guard` and `pnpm --filter @open-design/packaged typecheck` passed.
- 2026-05-20: Extended the migration-order guard to bind the M6 Electron cleanup checkboxes to actual package manifest dependencies, Electron runtime entry files, and the Electron-only `tools-pack` after-pack resource hook. This prevents checking M6 cleanup before the corresponding Electron artifacts are removed, and prevents removing those artifacts without updating the migration checklist. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard so checked M4 platform gates also require the verifier-applied native evidence log marker from `scripts/verify-tauri-platform-gates.ts --update-migration-doc`. This keeps manual checkbox edits from opening the M5 default flip without the recorded Windows/Linux evidence. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard so the M5 Tauri-primary documentation checkbox moves with the `tools-dev`, `tools-pack`, and `release-beta` default runtime flip. If that checkbox is checked while README/app/architecture docs still say Electron is the default, `pnpm guard` now fails. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard so the M6 Electron-only test cleanup checkbox moves with actual test cleanup. `pnpm guard` now scans `apps/desktop/tests`, `apps/packaged/tests`, and `tools/pack/tests` for Electron-specific references and fails if the checkbox is checked while those references remain, or if the references disappear without the checklist being updated. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard so the M6 AGENTS/PR guidance cleanup checkbox moves with actual guidance cleanup. `pnpm guard` now scans root/app/tool AGENTS files, `tools/pack/AGENTS.md`, `docs/code-review-guidelines.md`, and `.github/pull_request_template.md` for Electron-specific guidance references and fails if the checkbox is checked while those references remain, or if the references disappear without the checklist being updated. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard so the three M4 Windows/Linux platform checkboxes cannot be partially checked. They must move together through `scripts/verify-tauri-platform-gates.ts --update-migration-doc`, which requires verified Windows and Linux reports before it marks the Windows NSIS, Linux AppImage, and Linux headless platform gates complete. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Refined the migration-order guard so M6 Electron cleanup cannot be checked before the M5 Tauri default flip is complete. During the M5 fallback window, `tools-dev` and `tools-pack` must still accept `electron`; once all M6 cleanup boxes are checked, those tools must no longer accept the Electron desktop runtime. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard so M6 Electron dependency cleanup also verifies `pnpm-lock.yaml` importer entries for `apps/desktop`, `apps/packaged`, and `tools/pack`. This catches removing Electron deps from manifests without running `pnpm install` to refresh the lockfile. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Extended the migration-order guard so `tools-dev` and `tools-pack` `DEFAULT_DESKTOP_RUNTIME` values cannot diverge during M5. The default desktop runtime now has to flip from Electron to Tauri as one tools surface change, with `release-beta` moving through its existing synchronized check. `tsc -p scripts/tsconfig.json --noEmit` and `pnpm guard` passed.
- 2026-05-20: Split the Tauri migration-order policy into a pure evaluator and added `scripts/tauri-migration-policy.test.ts` so M4 partial closure, missing native evidence, premature M5 default flips, divergent tools defaults, premature M6 cleanup, stale Electron fallback, and stale lockfile importer cases are locked by tests. `tsc -p scripts/tsconfig.json --noEmit`, `node --import tsx --test scripts/tauri-migration-policy.test.ts`, and `pnpm guard` passed.
- 2026-05-20: Added `scripts/tauri-migration-policy.ts` and its test to CI packaging scope detection. PRs that change the M4/M5/M6 ordering policy now rerun tools-pack validation and the native Windows/Linux Tauri package smoke jobs instead of only running local guard tests.
- 2026-05-20: Added verifier coverage proving `--update-migration-doc` refuses to modify the migration checklist unless both Windows and Linux Tauri platform reports are supplied. `node --import tsx --test scripts/verify-tauri-platform-gates.test.ts` passed.
- 2026-05-20: Added a positive migration-order policy test for the final post-M6 state: Tauri defaults are set, Electron dependencies/runtime/resources/tests/guidance are removed, lockfile importers are clean, and tools no longer accept the Electron runtime. This proves the guard blocks premature cleanup without making the intended final state impossible. `node --import tsx --test scripts/tauri-migration-policy.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added positive migration-order policy tests for the two required intermediate states: verified M4 before the default flip, and post-M5 with Tauri defaults plus explicit Electron fallback before M6 cleanup. This proves the guard permits the intended phase-by-phase path instead of only the current and final states. `node --import tsx --test scripts/tauri-migration-policy.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Made the migration-order guard parse `DESKTOP_RUNTIME_KINDS` instead of relying on an exact formatted string. The M5 Electron fallback window now tolerates order/whitespace-only formatting changes while still requiring both tools to accept `electron` and `tauri`. `node --import tsx --test scripts/tauri-migration-policy.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Relaxed the migration-order parser for `DEFAULT_DESKTOP_RUNTIME` and `release-beta` `desktop_runtime.default` formatting. M5 now keys on the actual `electron|tauri` values across common TypeScript/YAML quote and whitespace variants, reducing false failures during the default flip. `node --import tsx --test scripts/tauri-migration-policy.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added a post-M4 execution runbook that maps M5 and M6 checklist items to the concrete files and verification commands required after native Windows/Linux evidence lands. This keeps default flip and Electron removal execution tied to the guard policy instead of relying on checklist memory. `pnpm guard` passed.
- 2026-05-20: Added a git-bundle fallback to the remote CI handoff so the branch can be transferred to a write-capable machine even when the configured local GitHub credential cannot push. This keeps native Windows/Linux evidence collection unblocked by the current `sunseol` 403. `pnpm guard` passed.
- 2026-05-20: Added `scripts/create-tauri-migration-bundle.ts` to make the branch handoff repeatable. The script rejects tracked dirty worktrees, creates the bundle from the migration branch against `origin/main`, verifies it, and prints the bundled heads plus bundle size and SHA-256 for the receiving machine. `node --import tsx --test scripts/create-tauri-migration-bundle.test.ts` and `pnpm guard` passed.
- 2026-05-20: Added `scripts/tauri-migration-status.ts` so maintainers can print the current phase, default runtime values, open M4/M5/M6 checklist items, git head/base, and next action list before each handoff or phase transition. `node --import tsx --test scripts/tauri-migration-status.test.ts` and `pnpm guard` passed.
- 2026-05-20: Added `scripts/import-tauri-migration-bundle.ts` so the receiving machine verifies bundle SHA-256, `git bundle verify`, and bundled heads before fetching the migration branch. `node --import tsx --test scripts/import-tauri-migration-bundle.test.ts` and `pnpm guard` passed.
- 2026-05-20: Added `scripts/verify-tauri-migration-handoff.ts` to locally prove the bundle handoff round-trip before asking a write-capable machine to push. It creates the bundle, seeds a temporary receiving checkout with the base commit, imports the bundle through the receiving-side script, and verifies the imported branch head. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts` and `pnpm guard` passed.
- 2026-05-20: Added the Tauri migration handoff/status scripts to CI packaging scope detection so changes to bundle creation, bundle import, status reporting, phase-order policy, or platform report verification rerun the Windows/Linux Tauri smoke jobs. The workflow test now requires each migration evidence script to appear in both the `required=true` packaging scope and the `tools_pack_tests_required=true` scope. `cd e2e && pnpm test tests/packaged-smoke-workflow.test.ts` and `pnpm guard` passed.
- 2026-05-20: Added `scripts/tauri-ci-scope.test.ts` to root `pnpm guard` so Tauri migration evidence scripts must remain in both the CI packaging `required=true` pattern list and the explicit `tools_pack_tests_required=true` condition. `node --import tsx --test scripts/tauri-ci-scope.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Updated `scripts/verify-tauri-migration-handoff.ts` so the verified handoff output includes the receiving-side import command with the current SHA-256 and branch already filled in. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added `--manifest` support to `scripts/verify-tauri-migration-handoff.ts`, producing a JSON sidecar with schema version, branch/base heads, bundle path, bundle SHA-256, and the receiving-side import command. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added `--note` support to `scripts/verify-tauri-migration-handoff.ts`, producing a Markdown handoff note beside the bundle and manifest. The note includes the import command, remote verification command, and M4→M5 advance command so the write-capable receiving machine does not need to reconstruct the sequence from this document. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `pnpm exec tsx scripts/tauri-migration-status.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added `--output-dir` support to `scripts/verify-tauri-migration-handoff.ts`, deriving standard bundle, manifest, and Markdown note paths from one directory. This makes the transferable handoff set a single directory instead of three manually coordinated paths. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `pnpm exec tsx scripts/tauri-migration-status.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Made handoff manifests relocatable by recording the bundle path relative to the manifest and documenting that behavior in the generated Markdown note. A copied handoff directory can now be imported from its new location without manually overriding the bundle path. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts scripts/import-tauri-migration-bundle.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Strengthened `scripts/verify-tauri-migration-handoff.ts` so manifest-based handoffs are copied to a separate temp directory and imported from that copied location before the handoff is considered verified. This proves the write-capable receiving machine can consume the transferred directory, not just the source machine's original `/tmp` paths. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts scripts/import-tauri-migration-bundle.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added `--handoff-dir` to `scripts/tauri-migration-status.ts` so M4 status can report whether a generated handoff manifest is present, matches the current branch head, and still has a bundle file matching the manifest SHA-256. When the handoff is current, the M4 next action changes from regeneration to copying the verified directory to a write-capable machine. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `pnpm exec tsx scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added optional remote branch checking to `scripts/tauri-migration-status.ts`. With `--handoff-dir ... --remote origin`, status now reports whether the remote migration branch exists and matches the handoff manifest head, separating the current push blocker from the later Windows/Linux CI evidence blocker. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `pnpm exec tsx scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --remote origin`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added optional platform report checking to `scripts/tauri-migration-status.ts`. With `--win-report ... --linux-report ...`, status invokes the authoritative M4 verifier and reports whether the downloaded Windows/Linux artifacts are ready for `scripts/advance-tauri-migration-m4-m5.ts`, keeping handoff, remote, and native evidence readiness in one view. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `pnpm exec tsx scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --remote origin`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added `scripts/push-tauri-migration-handoff.ts` so the write-capable receiving machine can import the handoff manifest, push the migration branch, and verify the remote branch head in one command. This replaces the manual three-command receiving sequence while still reusing the existing import and remote verifier scripts, and it accepts `--bundle` when the bundle is copied outside the manifest directory. `node --import tsx --test scripts/push-tauri-migration-handoff.test.ts scripts/verify-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Extended `scripts/push-tauri-migration-handoff.ts` with `--archive`, so the receiving machine can verify the tarball checksum sidecar, reject unsafe archive entries, extract the handoff, import the bundled branch, push it, and verify the remote head in one command. `node --import tsx --test scripts/push-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Added `--manifest` support to `scripts/import-tauri-migration-bundle.ts` so the receiving machine can import the handoff JSON directly instead of manually copying the branch and SHA-256 arguments. The handoff verifier now round-trips through the same manifest import command it prints, while CLI `--bundle`, `--branch`, and `--expected-sha256` still override the manifest for copied bundle paths. `node --import tsx --test scripts/import-tauri-migration-bundle.test.ts scripts/verify-tauri-migration-handoff.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added `scripts/verify-tauri-migration-remote.ts` so the write-capable receiving machine can confirm the pushed remote branch exactly matches the handoff manifest `branchHead` before waiting on native Windows/Linux CI. The remote verifier and test are part of root `pnpm guard` and CI packaging scope detection. `node --import tsx --test scripts/verify-tauri-migration-remote.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `cd e2e && pnpm test tests/packaged-smoke-workflow.test.ts`, and `pnpm guard` passed.
- 2026-05-20: Added `scripts/apply-tauri-migration-m5.ts` so the default flip after native M4 evidence is a guarded one-command edit instead of a manual multi-file checklist update. The script refuses to run before the verifier-applied M4 marker, then flips the tools-dev/tools-pack/release-beta defaults, preserves explicit Electron fallback support, updates Tauri-primary docs, and checks all M5 lines together. `node --import tsx --test scripts/apply-tauri-migration-m5.test.ts scripts/tauri-ci-scope.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `cd e2e && pnpm test tests/packaged-smoke-workflow.test.ts`, `pnpm guard`, `pnpm install`, and a current-state `--dry-run` rejection check passed.
- 2026-05-20: Added `scripts/advance-tauri-migration-m4-m5.ts` so extracted native platform reports can move the migration through M4 evidence recording and M5 default flip in one guarded command. It runs the platform verifier with `--update-migration-doc`, then invokes the M5 applicator; if platform verification fails, M5 defaults remain untouched. `node --import tsx --test scripts/advance-tauri-migration-m4-m5.test.ts scripts/tauri-ci-scope.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `cd e2e && pnpm test tests/packaged-smoke-workflow.test.ts`, `pnpm guard`, and `pnpm install` passed.
- 2026-05-20: Added `scripts/download-tauri-m4-reports.ts` so the post-push CI handoff can download the Windows/Linux Tauri report artifacts through `gh`, verify them with `scripts/verify-tauri-platform-gates.ts`, and print the exact M4→M5 advance command. `node --import tsx --test scripts/download-tauri-m4-reports.test.ts scripts/tauri-ci-scope.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Extended `scripts/download-tauri-m4-reports.ts` with `--advance`, allowing a write-capable receiver to download native CI artifacts, verify them, update M4 evidence, and apply the guarded M5 default flip in one command after the Windows/Linux reports pass. The default remains verify-only unless `--advance` is set.
- 2026-05-20: Added `scripts/tauri-migration-inventory.ts` so M6 Electron cleanup starts from a machine-readable inventory of remaining Electron dependencies, lockfile importers, runtime files, pack resources, tests, and guidance references. Current inventory reports 3 package manifests, 3 lockfile importers, 3 runtime files, 1 pack resource, 18 test files, and 6 guidance files still blocking M6. `node --import tsx --test scripts/tauri-migration-inventory.test.ts scripts/tauri-migration-status.test.ts scripts/tauri-ci-scope.test.ts`, `pnpm exec tsx scripts/tauri-migration-inventory.ts --json`, `tsc -p scripts/tsconfig.json --noEmit`, `cd e2e && pnpm test tests/packaged-smoke-workflow.test.ts`, `pnpm guard`, and `pnpm install` passed.
- 2026-05-20: Extended `scripts/tauri-migration-inventory.ts --plan` so M6 Electron cleanup has a generated execution plan with dependency removal commands, runtime/resource/test/guidance blockers, checklist steps, and required verification commands.
- 2026-05-20: Updated `scripts/tauri-migration-status.ts` next actions so M4 points at the current verified handoff, remote verification, native smoke, and M4→M5 advance commands, while M5 points at the guarded applicator instead of stale manual default-flip prose. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `pnpm exec tsx scripts/tauri-migration-status.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `pnpm guard` passed.
- 2026-05-20: Added `scripts/package-tauri-migration-handoff.ts` so a verified handoff directory is revalidated and packaged as a tarball with a `.sha256` sidecar before transfer. The status output now points at this packaging step before asking a write-capable machine to extract and run `scripts/push-tauri-migration-handoff.ts`. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-ci-scope.test.ts scripts/tauri-migration-status.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Updated the generated handoff Markdown note from the older manifest-first receiver instructions to the current package/archive push, CI report download, and M4→M5 advance flow. `node --import tsx --test scripts/verify-tauri-migration-handoff.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Extended `scripts/tauri-migration-status.ts` to validate the packaged handoff archive, checksum sidecar, executable `.commands.sh` sidecar, and command-script checksum sidecar. With a current archive, M4 next actions now start at copying the complete transferable handoff file set instead of re-running package generation. `node --import tsx --test scripts/tauri-migration-status.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Extended `scripts/tauri-migration-status.ts` with platform report directory discovery. Status now auto-checks `/tmp/open-design-tauri-m4-reports` when default report artifacts exist, and `--report-dir <dir>` verifies the same `open-design-ci-win-tauri-e2e-report` / `open-design-ci-linux-tauri-e2e-report` layout from a non-default download directory.
- 2026-05-20: Extended `scripts/package-tauri-migration-handoff.ts` output with the receiver archive push command, the post-CI report download command with `--advance`, and the status check command. It also writes an executable `.commands.sh` sidecar beside the tarball so the receiver can verify/import/push the archive without first having the migration branch checked out, then run report download/advance with `GITHUB_RUN_ID=<run-id>`.
- 2026-05-20: Tightened the remote CI handoff instructions so the receiving machine explicitly triggers native CI after the verified branch push. `ci.yml` does not run on arbitrary feature-branch pushes, so the generated handoff output and `.commands.sh` sidecar now point at `gh workflow run ci.yml --ref codex/electron-to-tauri-migration` or opening a draft PR before downloading Windows/Linux M4 reports.
- 2026-05-20: Extended the `.commands.sh` sidecar so a write-capable receiver automatically attempts `gh workflow run ci.yml --ref codex/electron-to-tauri-migration` after the verified branch push when `gh` is available. If dispatch is disabled with `TAURI_NATIVE_CI_TRIGGER=0` or `gh` is unavailable, the same script prints the manual workflow dispatch and draft PR commands.
- 2026-05-20: Added branch-head-aware CI report waiting to `scripts/download-tauri-m4-reports.ts`. Receivers can now pass `--expected-head <sha> --wait` so post-dispatch report download waits for the matching migration commit instead of accidentally consuming an older completed branch run. Explicit `--run-id` downloads also verify `--expected-head` before consuming artifacts, and the generated handoff command sidecar passes the manifest branch head for `GITHUB_RUN_ID=<id>` reruns.
- 2026-05-20: Updated the draft PR fallback in the handoff command sidecar to write and reference a template-complete `.tmp/tauri-migration-pr-body.md`, so using PR creation to trigger native CI still follows the repository PR body requirements.
- 2026-05-20: Aligned the generated handoff Markdown note and this runbook with the executable `.commands.sh` receiver flow: checksum verification, import, push, remote-head verification, optional workflow dispatch, template PR body generation, branch-head-aware report waiting, and guarded M4→M5 advance.
- 2026-05-20: Added `scripts/continue-tauri-migration.ts` as the repo-local continuation runner. It reads `scripts/tauri-migration-status.ts`, refreshes stale handoff artifacts, pushes/verifies the migration branch when credentials allow, optionally waits for matching native M4 reports, and only advances through the existing guarded scripts.
- 2026-05-20: Updated `scripts/package-tauri-migration-handoff.ts` so the printed post-CI report command uses the manifest branch and exact branch head instead of the `<migration-branch-head>` placeholder, and added the continuation runner command to the package output. Regenerate the handoff after any new local commit; the package output and `scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --remote origin` are the source of truth for the current branch head and SHA-256 values. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Rechecked M4 continuation after the package-output update. `scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --remote origin` reports the handoff and archive current for the last regenerated local head, but `origin/codex/electron-to-tauri-migration` is still missing. `git push -u origin codex/electron-to-tauri-migration` fails with HTTP 403 for the configured `sunseol` credential, and the GitHub connector create-branch call fails with `Resource not accessible by integration`. After a write-capable push and native CI dispatch, run `pnpm exec tsx scripts/download-tauri-m4-reports.ts --branch codex/electron-to-tauri-migration --expected-head <current-handoff-head> --remote origin --wait --output-dir /tmp/open-design-tauri-m4-reports --advance`; the generated package output prints the exact `<current-handoff-head>`.
- 2026-05-20: Hardened `scripts/continue-tauri-migration.ts` for no-write-access environments. If the packaged handoff push fails, it now preserves the original command failure and prints the transferable archive, `.sha256`, `.commands.sh`, `.commands.sh.sha256`, and push-only fallback command in the same error. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Fixed `scripts/import-tauri-migration-bundle.ts` so the TypeScript handoff path can refresh the migration branch even when that branch is currently checked out. It now fetches into a temp ref, detaches only when necessary, updates the branch, cleans the temp ref, and restores the checked-out branch. This matches the `.commands.sh` sidecar behavior and lets `scripts/continue-tauri-migration.ts` reach the real remote push step from this local branch. `node --import tsx --test scripts/import-tauri-migration-bundle.test.ts scripts/push-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Hardened `scripts/download-tauri-m4-reports.ts` for receiving machines without `gh`. GitHub CLI failures now include the exact failed command, missing-CLI guidance, `--gh <path-to-gh>`, and the local verifier/advance fallback when report artifacts are already present. `node --import tsx --test scripts/download-tauri-m4-reports.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Tightened explicit-run report downloads so `scripts/download-tauri-m4-reports.ts --run-id <id> --expected-head <sha>` calls `gh run view` and rejects stale, wrong-branch, or incomplete runs before downloading artifacts. `scripts/package-tauri-migration-handoff.ts` now passes the manifest branch head on the `GITHUB_RUN_ID=<id>` sidecar path as well. `node --import tsx --test scripts/download-tauri-m4-reports.test.ts scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `pnpm guard`, `pnpm typecheck`, and `git diff --check` passed.
- 2026-05-20: Extended M6 cleanup evidence to package scripts. `scripts/tauri-migration-inventory.ts` now reports Electron-only package script references separately from dependency manifests, and `scripts/guard.ts` / `scripts/tauri-migration-policy.ts` reject checking the M6 dependency/script cleanup line while any package script still references Electron. The current repo inventory reports `electronPackageScriptReferences: 0`, so this adds a guardrail without changing the active M4 blocker. `node --import tsx --test scripts/tauri-migration-policy.test.ts scripts/tauri-migration-inventory.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `pnpm exec tsx scripts/tauri-migration-inventory.ts --json`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Tightened M4 CI report downloads to require the native Tauri smoke jobs themselves to pass before artifacts are consumed. `scripts/download-tauri-m4-reports.ts` now checks `gh run view --json jobs` and rejects runs missing `Packaged windows Tauri smoke` or `Packaged linux Tauri smoke`, or where either job is not `completed/success`. The report verifier still validates the downloaded artifacts afterward. `node --import tsx --test scripts/download-tauri-m4-reports.test.ts scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Required `--expected-head` whenever `scripts/download-tauri-m4-reports.ts --advance` is used. Verify-only downloads can still inspect a known run, but the mutating M4→M5 path now refuses to run unless the selected CI evidence is tied to the exact migration branch head. `node --import tsx --test scripts/download-tauri-m4-reports.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Bound the packaged handoff `GITHUB_RUN_ID=<id>` fast path to the manifest branch as well as the manifest head. The generated `.commands.sh` now calls `scripts/download-tauri-m4-reports.ts --run-id "$GITHUB_RUN_ID" --branch "$branch" --expected-head "$expected_head" ... --advance`, and `scripts/tauri-migration-status.ts` rejects stale command sidecars that omit the branch-bound explicit run guidance. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Reconfirmed the continuation state after the branch-bound handoff change. `scripts/tauri-migration-status.ts --handoff-dir /tmp/open-design-tauri-migration-handoff --remote origin --json` reports phase M4, current handoff/archive artifacts for the local branch head, and no matching `origin/codex/electron-to-tauri-migration` branch. `git ls-remote --heads origin codex/electron-to-tauri-migration` returned no branch, `git push -u origin codex/electron-to-tauri-migration` still failed with HTTP 403 for the configured credential, and `scripts/continue-tauri-migration.ts --dry-run` printed the expected push, CI dispatch, and branch-head-aware report download sequence. Updated the single active Codex heartbeat `tauri-migration-follow-up` to keep retrying from this document and the status runner without flipping M5 or starting M6 before verified M4 native evidence.
- 2026-05-20: Tightened `scripts/tauri-migration-status.ts --report-dir` output for missing M4 artifacts. When the Windows/Linux report directories are not present yet, status now reports the missing `manifest.json` paths directly instead of embedding the verifier stack trace, making the continuation blocker readable in JSON and text status output. `node --import tsx --test scripts/tauri-migration-status.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Added tracked-worktree guards to the mutating post-M4 scripts. Direct `scripts/apply-tauri-migration-m5.ts` and `scripts/advance-tauri-migration-m4-m5.ts` now refuse to edit when tracked changes are present; the advance script performs the clean check before recording M4 evidence, then calls the M5 applicator through an internal skip-clean path so the verifier-applied document change does not block the intended one-command M4→M5 transition. `node --import tsx --test scripts/apply-tauri-migration-m5.test.ts scripts/advance-tauri-migration-m4-m5.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Improved the packaged handoff command sidecar for write-capable receivers. After importing and pushing the branch, the sidecar now prints `scripts/tauri-migration-status.ts --handoff-dir ... --remote ... --report-dir ...` so the receiver sees remote and report readiness immediately, and all generated follow-up download commands honor `TAURI_M4_REPORT_DIR` instead of hardcoding `/tmp/open-design-tauri-m4-reports`. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Hardened the repo-local continuation runner after a successful remote handoff. `scripts/continue-tauri-migration.ts` now treats `gh workflow run ci.yml --ref ...` failures as actionable manual-dispatch blockers instead of aborting the whole continuation, so a branch push with insufficient GitHub Actions dispatch permission still prints the branch-head-aware report download command. `node --import tsx --test scripts/tauri-migration-status.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Moved the `scripts/download-tauri-m4-reports.ts --advance` clean-worktree guard ahead of all GitHub artifact reads. If tracked changes are present, the downloader now fails before calling `gh run view` or downloading Windows/Linux reports, keeping native M4 evidence consumption from mixing with unrelated tracked edits. `node --import tsx --test scripts/download-tauri-m4-reports.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Added a SHA-256 sidecar for the generated handoff command script. `scripts/package-tauri-migration-handoff.ts` now writes `<archive>.commands.sh.sha256`, the generated `.commands.sh` verifies that sidecar and filename target before running, and `scripts/tauri-migration-status.ts` rejects current-archive claims when that checksum is missing, malformed, filename-mismatched, or stale. This keeps the executable receiver flow covered by the same transfer-integrity checks as the handoff tarball.
- 2026-05-20: Tightened `scripts/tauri-migration-status.ts` so a packaged handoff archive is not current unless the executable `.commands.sh` sidecar includes checksum target-name validation for both the command script and archive sidecars. This keeps status from accepting an older command sidecar that predates the receiver-side filename checks.
- 2026-05-20: Aligned `scripts/tauri-migration-status.ts` with the receiver push path for archive checksum sidecars. Status now rejects a packaged handoff archive when `<archive>.sha256` names a different file, matching `scripts/push-tauri-migration-handoff.ts` and the generated command sidecar.
- 2026-05-20: Tightened `scripts/continue-tauri-migration.ts --dry-run` for stale handoff states. A dry-run now stops after printing the handoff refresh commands and asks for a second dry-run from refreshed status, instead of also printing stale push/report actions from the pre-refresh status. This keeps the continuation cadence safe when the local branch moves but the handoff artifacts have not yet been regenerated.
- 2026-05-20: Tightened `scripts/continue-tauri-migration.ts --dry-run` for hosts without `gh`. The dry-run now reports the manual `gh workflow run ci.yml --ref codex/electron-to-tauri-migration` dispatch requirement when the configured `--gh` command is unavailable, instead of saying it would request native CI dispatch from a host that cannot run the command.
- 2026-05-20: Tightened packaged handoff portability. `scripts/package-tauri-migration-handoff.ts` now rejects a handoff manifest whose `bundlePath` is absolute or parent-relative, so the tarball cannot encode a sender-machine-only bundle location that would break on the write-capable receiver.
- 2026-05-20: Aligned `scripts/tauri-migration-status.ts` with the packaged handoff portability policy. Status now rejects both the active handoff directory and extracted packaged archive when the manifest `bundlePath` is absolute or parent-relative, so old non-relocatable transfer artifacts cannot be reported as current.
- 2026-05-20: Added a tracked-worktree guard to the packaged handoff command sidecar. The generated `.commands.sh` now refuses to import and move the migration branch when the receiving checkout has tracked changes, and status rejects older command sidecars that lack that guard.
- 2026-05-20: Aligned the TypeScript bundle importer with the packaged command sidecar's clean-worktree rule. `scripts/import-tauri-migration-bundle.ts` now refuses to update migration branch refs while tracked receiver changes are present, even when it is not checking out the branch afterward.
- 2026-05-20: Added heartbeat visibility to `scripts/tauri-migration-status.ts`. The status runner now reports whether the single `tauri-migration-follow-up` heartbeat is active, daily at 09:00, and prompts the continuation sequence from this document plus `scripts/continue-tauri-migration.ts --dry-run`.
- 2026-05-20: Connected heartbeat visibility to `scripts/continue-tauri-migration.ts`. The continuation runner now prints heartbeat repair problems before planning M4 push/report work, so a paused, duplicate, or stale follow-up cannot be missed during the daily continuation pass.
- 2026-05-20: Tightened `scripts/continue-tauri-migration.ts --dry-run --skip-push` so it stops at the missing-remote blocker instead of printing native CI dispatch or report-download steps that require a pushed migration branch.
- 2026-05-20: Bound `scripts/continue-tauri-migration.ts --branch` to handoff generation and status. Branch overrides now flow into `scripts/verify-tauri-migration-handoff.ts`, and the continuation runner refuses to proceed when an existing handoff/status branch differs from the requested CI/report branch.
- 2026-05-20: Hardened the packaged handoff command sidecar to validate extracted manifest fields and re-hash the extracted git bundle before import. `scripts/tauri-migration-status.ts` now rejects older command sidecars that lack bundle SHA-256 or manifest field validation.
- 2026-05-20: Added receiver-side `schemaVersion` validation to the packaged handoff command sidecar, keeping the executable archive path aligned with the TypeScript manifest readers before a write-capable receiver imports or pushes the migration branch.
- 2026-05-20: Required `--expected-head` for all explicit `scripts/download-tauri-m4-reports.ts --run-id <id>` downloads. Known-run evidence now rejects before any `gh` call unless the receiver supplies the migration branch head, so both verify-only and `--advance` flows stay branch-head bound. `node --import tsx --test scripts/download-tauri-m4-reports.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Tightened `scripts/package-tauri-migration-handoff.ts` so standalone package generation refuses stale handoff manifests and tracked source changes by default. A tarball now requires the manifest branch head to match the current local migration branch before it can be handed to a write-capable receiver. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Tightened `scripts/tauri-migration-status.ts` next actions for missing remote branches. When `--remote` is checked and the migration branch is absent or stale, status now keeps native CI collection and M4→M5 advance behind the remote-head blocker instead of printing generic Windows/Linux smoke and advance steps.
- 2026-05-20: Extended the M6 cleanup inventory and guard to include Electron-specific CI/release workflow references alongside `tools-pack` resources, so Electron-specific CI/release cache wiring cannot survive behind a checked resources box. `scripts/tauri-migration-inventory.ts --plan` now lists `.github/workflows/ci.yml`, `.github/workflows/release-beta.yml`, `.github/workflows/release-stable.yml`, and `.github/scripts/release/cache/win.ps1`. `node --import tsx --test scripts/tauri-migration-policy.test.ts scripts/tauri-migration-inventory.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Tightened `scripts/continue-tauri-migration.ts` so verified local report directories cannot bypass remote branch-head verification. Even when Windows/Linux reports are present, the continuation runner now refuses to record M4 evidence or apply M5 until the checked remote branch matches the handoff head. `node --import tsx --test scripts/tauri-migration-status.test.ts` and `tsc -p scripts/tsconfig.json --noEmit` passed.
- 2026-05-20: Tightened the direct M4→M5 phase advance path so `scripts/advance-tauri-migration-m4-m5.ts` verifies the pushed remote migration branch before consuming local Windows/Linux report directories. The downloader, continuation runner, status next actions, and packaged handoff sidecar now pass the same `--remote`, `--branch`, and `--expected-head` contract into the mutating advance command.
- 2026-05-20: Updated the generated handoff Markdown note and status checker for the same remote-bound M4 advance contract. `scripts/tauri-migration-status.ts` now rejects stale handoff notes whose report download or direct advance command omits `--remote origin`, the migration branch, or the exact expected head.
- 2026-05-20: Moved `scripts/download-tauri-m4-reports.ts --advance` remote-head verification ahead of all GitHub artifact reads. A receiver that asks the downloader to mutate M4/M5 now proves the configured remote branch matches `--expected-head` before `gh run view`, `gh run list`, or artifact download can consume native report evidence.
- 2026-05-20: Tightened the receiver-side bundle import before remote push. `scripts/import-tauri-migration-bundle.ts` now requires manifest `branchHead` to match the bundle's `refs/heads/<migration-branch>` head before updating refs, and `scripts/push-tauri-migration-handoff.ts` now has regression coverage proving stale manifest heads fail before the remote branch is pushed.
- 2026-05-20: Applied the same branch-head check to the executable handoff sidecar. The generated `.commands.sh` now compares the fetched bundle temp ref with manifest `branchHead` before moving the local branch or pushing the remote, and `scripts/tauri-migration-status.ts` rejects older command sidecars missing that validation.
- 2026-05-20: Added bundle prerequisite preflight to the executable handoff sidecar. Before importing the branch, the generated `.commands.sh` now runs `git bundle verify` and checks `git bundle list-heads` for the manifest branch/head, so a write-capable checkout that lacks the required base commit fails before any local branch movement, PR-body write, or remote push.
- 2026-05-20: Improved the push-only receiver path. After `scripts/push-tauri-migration-handoff.ts` imports, pushes, and verifies the migration branch, it now prints the exact native CI dispatch command and branch-head-bound `scripts/download-tauri-m4-reports.ts --advance` command so receivers who do not use the executable `.commands.sh` sidecar still get the guarded M4→M5 continuation sequence.
- 2026-05-20: Aligned the push-only receiver path with the draft-PR fallback. `scripts/push-tauri-migration-handoff.ts` now writes `.tmp/tauri-migration-pr-body.md` after verified remote push and prints the matching `gh pr create --draft --body-file ...` command, so receivers without workflow-dispatch permission can still open a template-complete PR to trigger native Windows/Linux evidence.
- 2026-05-20: Added receiver environment overrides to the push-only handoff path. `scripts/push-tauri-migration-handoff.ts` now accepts `--workflow`, `--report-dir`, and `--pr-body-path` and honors `GITHUB_WORKFLOW`, `TAURI_M4_REPORT_DIR`, and `TAURI_PR_BODY_PATH`, keeping custom CI/report locations branch-head-bound in the printed continuation commands.
- 2026-05-20: Tightened `scripts/continue-tauri-migration.ts --dry-run` for no-write-access senders. When the non-mutating push preflight fails, the continuation runner now stops at the remote-branch blocker after printing the transferable handoff set, instead of printing native CI dispatch or report-download steps that cannot work before the branch exists. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Hardened the packaged handoff command sidecar for receiver push failures. When the receiver is already on the migration branch, the sidecar now restores that checked-out branch if import succeeds but the remote push fails, and `scripts/tauri-migration-status.ts` rejects older command sidecars that lack this restoration guard. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Aligned the packaged handoff command sidecar with the other continuation scripts' GitHub CLI override. Receivers can now set `GH_BIN=<path-to-gh>` before running the `.commands.sh` sidecar, and `scripts/tauri-migration-status.ts` rejects older command sidecars that hardcode `gh` for workflow dispatch. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Propagated the same GitHub CLI override through the push-only receiver and repo-local continuation fallbacks. `scripts/push-tauri-migration-handoff.ts` now accepts `--gh` and honors `GH_BIN`, generated handoff notes and package output print `${GH_BIN:-gh}` workflow/PR fallback commands, and `scripts/continue-tauri-migration.ts --dry-run` carries custom `--gh` paths into transferable push commands and manual dispatch guidance. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts scripts/push-tauri-migration-handoff.test.ts scripts/verify-tauri-migration-handoff.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Tightened the executable handoff sidecar's post-push status output. The generated `.commands.sh` now passes `--handoff-archive "$archive"` into `scripts/tauri-migration-status.ts`, so a receiver that just verified the archive does not get a misleading "Handoff archive: missing" status for the temporary extraction directory; status rejects older command sidecars that omit the source archive path. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Tightened the executable handoff sidecar's `GITHUB_RUN_ID` rerun guidance. After a receiver pushes the branch and later gets a native run id, the generated `.commands.sh` now prints a shell-quoted rerun command with the full sidecar path and source archive path instead of `./<script-name>`, so reruns work even when the sidecar lives outside the receiving checkout. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Tightened the rest of the executable handoff sidecar's receiver-facing commands. Manual workflow dispatch, draft PR fallback, and branch-head report download guidance now use one shell-quoting helper, so receiver overrides such as `GITHUB_WORKFLOW="release beta.yml"`, `GH_BIN=/path/with spaces/gh`, or `TAURI_M4_REPORT_DIR=/path/with spaces/reports` remain copy-pasteable. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Kept `scripts/tauri-migration-status.ts` report-download next actions aligned with the configured platform report directory. Status now records the resolved `--report-dir` in `platformReports` and reuses it in remote-ready `scripts/download-tauri-m4-reports.ts --output-dir ...` guidance, so receiver-side custom report paths are not replaced by `/tmp/open-design-tauri-m4-reports`. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Added `--handoff-archive` to `scripts/continue-tauri-migration.ts` so the continuation runner can rely on the same non-default archive that `scripts/tauri-migration-status.ts --handoff-archive` has already verified. Stale handoff refreshes now package to that explicit archive path, and current custom archives are passed through to the push-only handoff path instead of falling back to `<handoff-dir>.tar.gz`. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Tightened `scripts/tauri-migration-status.ts` next actions so the first continuation command includes the verified `--handoff-dir`, `--handoff-archive`, `--remote`, and `--report-dir` values. A receiver using copied, renamed, or space-containing transfer paths can now run the exact status-printed continuation dry-run without accidentally falling back to default paths. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Tightened `scripts/package-tauri-migration-handoff.ts` output so the printed continuation runner and status check include the generated `--handoff-archive` path, plus the handoff directory, remote, and report directory. This keeps package output aligned with status output and avoids dropping a custom or copied archive path when a receiver follows the printed commands. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Centralized the generated Tauri migration draft PR body in `scripts/tauri-migration-pr-body.ts` so the push-only helper and executable handoff sidecar produce the same template-complete PR body. The shared body keeps the receiver PR aligned with the repository template sections and records the concrete local validation plus pending native M4 evidence. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/push-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Documented `scripts/continue-tauri-migration.ts --gh <path>` and the `GH_BIN` environment default in the continuation runner help output, so receivers without a `gh` binary on `PATH` can discover the supported override before trying native CI dispatch. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Aligned receiver remote overrides across the executable handoff sidecar, push-only helper, and repo-local continuation runner. `scripts/push-tauri-migration-handoff.ts` and `scripts/continue-tauri-migration.ts` now honor `REMOTE=<remote>` when `--remote` is omitted, matching the command sidecar behavior for write-capable checkouts whose push remote is not named `origin`. `node --import tsx --test scripts/tauri-migration-status.test.ts scripts/push-tauri-migration-handoff.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Tightened the push-only packaged handoff receiver path so `scripts/push-tauri-migration-handoff.ts --archive` now verifies the archive checksum, executable `.commands.sh` sidecar, `.commands.sh.sha256` sidecar, and current command-sidecar safety markers before extracting or pushing. This keeps the push-only fallback aligned with the status checker and executable sidecar requirement that all four transfer files stay together. `node --import tsx --test scripts/push-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Centralized the `.commands.sh` safety-marker requirements in `scripts/tauri-migration-command-sidecar.ts` so `scripts/tauri-migration-status.ts` and `scripts/push-tauri-migration-handoff.ts` reject stale packaged handoff command sidecars from the same requirement list. This prevents the status archive-current check and push-only receiver fallback from drifting as new receiver safeguards are added. `node --import tsx --test scripts/push-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Tightened the continuation cadence and heartbeat validation so the daily follow-up must run `scripts/tauri-migration-status.ts` and `scripts/continue-tauri-migration.ts --dry-run` with the current handoff directory, handoff archive, remote, and report directory. This keeps future continuation passes from silently falling back to default archive/report paths after the packaged handoff has already been verified. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Aligned the remaining documented `scripts/continue-tauri-migration.ts` command blocks with the verified handoff archive/report-directory contract, including the post-push `--wait-reports --advance` examples. `scripts/tauri-migration-status.test.ts` now reads this document and fails if a continuation bash block omits `--handoff-dir`, `--handoff-archive`, `--remote origin`, or `--report-dir`. `node --import tsx --test scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Added bash syntax validation for generated `.commands.sh` handoff sidecars. `scripts/package-tauri-migration-handoff.ts` marks generated command sidecars, and both `scripts/tauri-migration-status.ts` and `scripts/push-tauri-migration-handoff.ts` run `bash -n` when that marker is present, so a checksum-valid but syntactically broken receiver script is no longer reported as current or accepted by the push-only archive path. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/push-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Required the generated command-sidecar marker as part of packaged handoff currentness, so older unmarked `.commands.sh` sidecars cannot bypass bash syntax validation while still matching the receiver safety snippets. `node --import tsx --test scripts/package-tauri-migration-handoff.test.ts scripts/push-tauri-migration-handoff.test.ts scripts/tauri-migration-status.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, `git diff --check`, `pnpm guard`, and `pnpm typecheck` passed.
- 2026-05-20: Aligned the manual Open Platform Gates table with the native report verifier's uninstall evidence contract. Windows NSIS and Linux AppImage smoke instructions now include uninstall commands and the residue/removal evidence that `scripts/verify-tauri-platform-gates.ts` requires before M4 can close. `node --import tsx --test scripts/tauri-migration-status.test.ts scripts/verify-tauri-platform-gates.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Promoted the same uninstall evidence into the M4 checklist and policy labels. `scripts/tauri-migration-status.ts`, `scripts/tauri-migration-policy.ts`, and `scripts/verify-tauri-platform-gates.ts --update-migration-doc` now all treat Windows no-residue uninstall and Linux AppImage removal as part of closing M4, not just as verifier side conditions. `node --import tsx --test scripts/tauri-migration-status.test.ts scripts/verify-tauri-platform-gates.test.ts scripts/tauri-migration-policy.test.ts scripts/apply-tauri-migration-m5.test.ts scripts/advance-tauri-migration-m4-m5.test.ts scripts/download-tauri-m4-reports.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Aligned the M4 schedule row and current-state summary with the same uninstall/removal evidence contract, so the top-level timeline no longer reads as weaker than the checklist and verifier. `node --import tsx --test scripts/tauri-migration-status.test.ts scripts/verify-tauri-platform-gates.test.ts scripts/tauri-migration-policy.test.ts`, `tsc -p scripts/tsconfig.json --noEmit`, and `git diff --check` passed.
- 2026-05-20: Tightened stale-handoff continuation for receiver checkouts. When `scripts/continue-tauri-migration.ts --root <repo>` has to regenerate and package handoff artifacts, it now passes the requested root through to `scripts/package-tauri-migration-handoff.ts` instead of validating the package against the script checkout. `scripts/tauri-migration-status.test.ts` now covers a real stale-handoff refresh, package, push, and remote-head verification from a fixture root.
- 2026-05-20: Kept custom receiver roots in printed post-push commands. `scripts/tauri-migration-status.ts`, `scripts/continue-tauri-migration.ts`, and `scripts/download-tauri-m4-reports.ts` now preserve non-default `--root` values in follow-up download, advance, M5, and inventory guidance instead of printing commands that would fall back to the script checkout.
- 2026-05-20: Tightened the push-only receiver PR fallback path. `scripts/push-tauri-migration-handoff.ts --pr-body-path <relative>` now resolves that path from the receiving checkout `--cwd`, so fallback draft PR bodies are written beside the imported branch instead of whichever checkout launched the helper.
- 2026-05-20: Aligned the repo-local continuation runner with the receiver PR fallback. When `scripts/continue-tauri-migration.ts` reaches a pushed branch but GitHub workflow dispatch is unavailable or denied, it now writes the shared template-complete `.tmp/tauri-migration-pr-body.md` before printing the draft PR fallback command; dry-runs report the target path without writing the file.
- 2026-05-20: Tightened the M5 default-flip precondition so checked M4 platform gates require both the native Windows/Linux verifier marker and a pushed remote branch-head marker. `scripts/advance-tauri-migration-m4-m5.ts` now records the remote-head evidence after remote verification and before applying M5, while direct `scripts/apply-tauri-migration-m5.ts` refuses to run if that evidence is missing.
- 2026-05-20: Surfaced missing M4 evidence markers directly in both `scripts/tauri-migration-status.ts` and `scripts/continue-tauri-migration.ts`. If the Windows/Linux M4 checkboxes are closed but the native verifier marker or pushed remote branch-head marker is absent, status remains in M4 and the continuation runner prints the exact missing marker before planning push, dispatch, report, or advance work.
- 2026-05-20: Aligned `scripts/download-tauri-m4-reports.ts` with the other receiver-side handoff tools by honoring `REMOTE=<remote>` when `--remote` is omitted. This keeps the downloader's `--advance` remote-head verification on the same write-capable remote selected by the command sidecar, push helper, and continuation runner.
- 2026-05-20: Aligned generated receiver-facing handoff commands with the same remote override contract. `scripts/package-tauri-migration-handoff.ts` output and the generated Markdown handoff note now print `--remote "${REMOTE:-origin}"` for push, remote verification, report download, continuation, and status commands, so copy-pasted receiver commands can use a non-`origin` write remote without editing every line.
- 2026-05-20: Tightened the no-write-access continuation output so `scripts/continue-tauri-migration.ts --dry-run` now prints the exact executable `.commands.sh <archive>` receiver command before the push-only fallback. This keeps the safest checksum-verified receiver path copy-pasteable when the local host can package the handoff but cannot push the branch.
- 2026-05-20: Aligned the remaining status and package output with that receiver command contract. `scripts/tauri-migration-status.ts` next actions and `scripts/package-tauri-migration-handoff.ts` output now print the exact `.commands.sh <archive>` invocation, so the checksum-verified path is copy-pasteable from every handoff surface before falling back to push-only helper commands.
- 2026-05-20: Quoted the `scripts/tauri-migration-status.ts` push-only fallback command for custom archive paths and remote names. This keeps status next actions copy-pasteable when the write-capable receiver uses paths or remotes containing spaces.
- 2026-05-20: Preserved the configured platform report directory in `scripts/tauri-migration-status.ts` push-only fallback commands. A receiver following status output now keeps custom `--report-dir` values through the push helper, so the helper's post-push report download and advance guidance stays aligned with the status-verified report location.
- 2026-05-20: Made `scripts/package-tauri-migration-handoff.ts` print the same explicit `--report-dir /tmp/open-design-tauri-m4-reports` on its receiver push command. This keeps package output, status output, and continuation output aligned about where native M4 reports should be downloaded and verified.
- 2026-05-20: Extended `scripts/download-tauri-m4-reports.ts` to honor `TAURI_M4_REPORT_DIR` when `--output-dir` is omitted, matching the report-directory override contract already used by status, continuation, package, and push handoff paths.

### Platform Gate Runners

Use the direct command sequence above for quick manual validation. For evidence collection with report artifacts, run the platform e2e gate:

```bash
cd e2e
OD_PACKAGED_E2E_WIN_TAURI=1 \
OD_PACKAGED_E2E_BUILD_JSON_REQUIRED=0 \
OD_PACKAGED_E2E_NAMESPACE=tauri-win-smoke \
OD_PACKAGED_E2E_TOOLS_PACK_DIR=C:\\tmp\\open-design-tauri-win-pack \
pnpm exec tsx scripts/release-smoke.ts win specs/win-tauri.spec.ts
```

```bash
cd e2e
OD_PACKAGED_E2E_LINUX=1 \
OD_PACKAGED_E2E_BUILD_JSON_REQUIRED=0 \
OD_PACKAGED_E2E_NAMESPACE=tauri-linux-smoke \
OD_PACKAGED_E2E_DESKTOP_RUNTIME=tauri \
OD_PACKAGED_E2E_TOOLS_PACK_DIR=/tmp/open-design-tauri-linux-pack \
pnpm exec tsx scripts/release-smoke.ts linux specs/linux.spec.ts
```

Reports are written under `.tmp/release-report/<platform>` by default, or `OD_PACKAGED_E2E_REPORT_DIR` when set. The same release-smoke wrapper supports `mac`, `win`, and `linux`; the Tauri migration gates use `specs/win-tauri.spec.ts` for Windows and `specs/linux.spec.ts` for Linux. `OD_PACKAGED_E2E_BUILD_JSON_REQUIRED=0` is only for these self-building platform specs; release workflows that build in an earlier step should keep the default strict build JSON requirement.

When a workflow has already built the artifact and saved the tools-pack JSON, set `OD_PACKAGED_E2E_REUSE_BUILD=1` and `OD_PACKAGED_E2E_BUILD_JSON_PATH=<path>` so the Windows/Linux Tauri specs validate the existing artifact instead of rebuilding it. This is the mode used by the `release-beta` Tauri runtime option.

CI equivalents live in `.github/workflows/ci.yml`:

- `packaged_smoke_tauri_win` runs `scripts/release-smoke.ts win specs/win-tauri.spec.ts` on `windows-latest` with Rust stable, Node 24, pnpm 10.33.2, and NSIS.
- `packaged_smoke_tauri_linux` runs `scripts/release-smoke.ts linux specs/linux.spec.ts` on `ubuntu-latest` with Rust stable, Node 24, pnpm 10.33.2, Tauri Linux prerequisites, AppImage runtime support, and `xvfb`.

Both jobs run `scripts/verify-tauri-platform-gates.ts` against the generated report before uploading the artifact. Changes to the verifier script, migration-order policy, handoff/status scripts, or their tests are packaging-scope changes, so CI reruns the native Tauri smoke jobs when the M4 evidence contract, handoff path, or phase-ordering contract changes.

Do not close the Windows/Linux M4 checkboxes from CI wiring alone. Close them only after the native CI jobs or equivalent host commands produce the required eval/screenshot/stop/uninstall evidence.

### Remote CI Handoff

The local branch `codex/electron-to-tauri-migration` contains the current migration state:

```bash
git rev-parse codex/electron-to-tauri-migration
```

Before handing off or changing phases, print the current migration status:

```bash
pnpm exec tsx scripts/tauri-migration-status.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff \
  --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz \
  --remote origin \
  --report-dir /tmp/open-design-tauri-m4-reports
```

When `--handoff-dir` is provided, status also checks the default handoff archive at `<handoff-dir>.tar.gz`, its `.sha256` sidecar, its `.commands.sh` sidecar, and the `.commands.sh.sha256` sidecar. If the archive was written elsewhere, add `--handoff-archive /path/to/open-design-tauri-migration-handoff.tar.gz` so the next-action list reflects the actual transferable artifact. Status also auto-detects verified platform reports in `/tmp/open-design-tauri-m4-reports` when that default download directory exists. If reports were downloaded elsewhere with `scripts/download-tauri-m4-reports.ts --output-dir <dir>`, pass `--report-dir <dir>` instead of spelling out both report artifact paths.

For the current machine, use the continuation runner to print or execute the next safe step without bypassing the M4/M5/M6 guards:

```bash
pnpm exec tsx scripts/continue-tauri-migration.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff \
  --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz \
  --remote origin \
  --report-dir /tmp/open-design-tauri-m4-reports \
  --dry-run
```

If the remote branch is already current but workflow dispatch is unavailable from the current host, the continuation runner writes the same template-complete draft PR body used by the packaged receiver flow before printing the `gh pr create --draft --body-file ...` fallback. In `--dry-run` mode it reports the body path without creating the file.

When the branch can be pushed and the native CI artifacts are expected to become available, the same runner can wait for the matching branch-head reports and apply the guarded M4→M5 advance:

```bash
pnpm exec tsx scripts/continue-tauri-migration.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff \
  --handoff-archive /tmp/open-design-tauri-migration-handoff.tar.gz \
  --remote origin \
  --report-dir /tmp/open-design-tauri-m4-reports \
  --wait-reports \
  --advance
```

To collect native M4 evidence, push that branch with a credential that can write to `nexu-io/open-design`, open a draft PR against `main`, and wait for these CI jobs:

- `Packaged windows Tauri smoke`
- `Packaged linux Tauri smoke`

If direct push is blocked by credentials, create a verified git bundle from this machine, prove the bundle imports into a clean receiving checkout, and then import it on a machine or account that can push to the repository:

```bash
pnpm exec tsx scripts/verify-tauri-migration-handoff.ts \
  --output-dir /tmp/open-design-tauri-migration-handoff
```

Package the verified handoff directory before copying it to another machine:

```bash
pnpm exec tsx scripts/package-tauri-migration-handoff.ts \
  --handoff-dir /tmp/open-design-tauri-migration-handoff
```

The package step refuses to run if tracked source changes are present or if the handoff manifest branch head no longer matches the current local migration branch. Regenerate the handoff instead of packaging a stale manifest.

Keep the script output, JSON manifest, Markdown handoff note, tarball, `.sha256` sidecar, `.commands.sh` sidecar, and `.commands.sh.sha256` sidecar together. They record the migration branch head, `origin/main` base, bundle byte size, SHA-256, `git bundle verify` result, bundled heads, receiving-side import command, remote verification command, M4→M5 advance command, and the receiver command sequence printed by `scripts/package-tauri-migration-handoff.ts`. The manifest records the bundle path relative to itself, so the extracted handoff directory remains relocatable.

On the receiving checkout, copy the tarball plus its `.sha256`, `.commands.sh`, and `.commands.sh.sha256` sidecars, then verify the checksum, extract the handoff, import the bundle, push the branch, verify the remote head, and attempt native CI dispatch in one command:

```bash
/path/to/open-design-tauri-migration-handoff.tar.gz.commands.sh
```

The command script still accepts the archive path as an explicit argument if the sidecars are copied to another location without renaming the files. The archive and command-script checksum sidecars name their target files, so renaming a handoff file requires regenerating the package:

```bash
/path/to/open-design-tauri-migration-handoff.tar.gz.commands.sh \
  /path/to/open-design-tauri-migration-handoff.tar.gz
```

If you need push-only behavior without the `gh` dispatch attempt, run the TypeScript helper directly:

```bash
pnpm exec tsx scripts/push-tauri-migration-handoff.ts \
  --archive /path/to/open-design-tauri-migration-handoff.tar.gz \
  --remote "${REMOTE:-origin}"
```

Set `REMOTE=<remote>` instead of `--remote origin` if the receiving checkout uses a differently named write-capable remote. The command sidecar, push helper, continuation runner, and report downloader all honor that environment default. Add `--gh /path/to-gh` or set `GH_BIN=<path-to-gh>` if the receiving machine uses a non-default GitHub CLI binary and you want the printed workflow-dispatch and draft-PR fallback commands to use that binary.

That branch push alone does not trigger `ci.yml`, because this repository runs CI on pull requests, `main` pushes, and manual dispatches. The command script attempts the workflow dispatch automatically when `GH_BIN` or `gh` is available. If it cannot dispatch, either open a draft PR or manually dispatch the workflow for the migration branch:

```bash
${GH_BIN:-gh} workflow run ci.yml --ref codex/electron-to-tauri-migration
```

or:

```bash
${GH_BIN:-gh} pr create --draft \
  --base main \
  --head codex/electron-to-tauri-migration \
  --title "Migrate desktop runtime to Tauri" \
  --body-file .tmp/tauri-migration-pr-body.md
```

The command script writes `.tmp/tauri-migration-pr-body.md` before printing that fallback. Set `GH_BIN=<path-to-gh>` if the GitHub CLI is not named `gh` on the receiving machine. Set `TAURI_PR_BODY_PATH=<path>` if the receiving checkout should write the template-complete draft PR body somewhere else. Set `TAURI_NATIVE_CI_TRIGGER=0` to skip automatic workflow dispatch, or `TAURI_NATIVE_CI_WAIT=1` to let the command script wait for matching native CI reports and run the guarded M4→M5 advance after dispatch.

If the bundle is copied outside the extracted handoff directory, use the manifest form instead and add `--bundle /path/to/open-design-tauri-migration.bundle` to override only the file location.

Do not wait on platform CI until the remote verifier prints the same branch head recorded in the manifest. If it fails, re-push or regenerate the handoff before treating CI results as M4 evidence.

If both pass, download and verify their `open-design-ci-win-tauri-e2e-report` and `open-design-ci-linux-tauri-e2e-report` artifacts. Prefer the branch-head-aware wait path after dispatch:

```bash
pnpm exec tsx scripts/download-tauri-m4-reports.ts \
  --branch codex/electron-to-tauri-migration \
  --expected-head <migration-commit-sha> \
  --remote origin \
  --wait \
  --output-dir /tmp/open-design-tauri-m4-reports
```

When `--run-id` is omitted, the script uses `gh run list` to select a completed `ci.yml` run for `codex/electron-to-tauri-migration`; `--expected-head <migration-commit-sha> --wait` keeps it from consuming stale branch evidence. If you already know the completed run id, either set `GITHUB_RUN_ID=<github-run-id>` before rerunning the packaged command sidecar or pass `--run-id <github-run-id> --branch codex/electron-to-tauri-migration --expected-head <migration-commit-sha> --remote origin` directly to `scripts/download-tauri-m4-reports.ts`. The explicit `--run-id` path verifies the run branch/head with `gh run view` before downloading. The Windows report must prove NSIS build/install/start/eval/screenshot/stop/uninstall. The Linux report must prove AppImage build/install/start/eval/screenshot/stop/uninstall plus headless install/start/stop. If you are ready to mutate the migration branch immediately after verified downloads, add `--advance`; the script will run `scripts/advance-tauri-migration-m4-m5.ts` against the downloaded reports and re-check the configured remote branch before applying the guarded M5 default flip.
Before downloading artifacts, the downloader also verifies that the selected run contains successful `Packaged windows Tauri smoke` and `Packaged linux Tauri smoke` jobs. This keeps M4 evidence tied to the native package-smoke jobs rather than to any completed workflow run that happens to expose similarly named artifacts. `--run-id` and `--advance` require `--expected-head`, because both explicit evidence selection and mutation must stay tied to the migration branch head. `--advance` also passes `--remote` through to the phase advance script, so the receiver's remote name and the M4 evidence head stay coupled.

After extracting the report artifacts, verify the required evidence mechanically:

```bash
pnpm exec tsx scripts/verify-tauri-platform-gates.ts \
  --win-report /tmp/open-design-tauri-m4-reports/open-design-ci-win-tauri-e2e-report \
  --linux-report /tmp/open-design-tauri-m4-reports/open-design-ci-linux-tauri-e2e-report
```

To apply the verified M4 evidence to this document in the same step, pass the document path:

```bash
pnpm exec tsx scripts/verify-tauri-platform-gates.ts \
  --win-report /tmp/open-design-tauri-m4-reports/open-design-ci-win-tauri-e2e-report \
  --linux-report /tmp/open-design-tauri-m4-reports/open-design-ci-linux-tauri-e2e-report \
  --update-migration-doc docs/electron-to-tauri-migration.md
```

This direct verifier path records only native platform evidence. It does not record pushed remote branch-head evidence and therefore does not unlock `scripts/apply-tauri-migration-m5.ts` by itself. Prefer the phase advance command below when the goal is to move from M4 into M5.

To verify the reports, update M4, and immediately apply the guarded M5 default flip, use the phase advance command instead:

```bash
pnpm exec tsx scripts/advance-tauri-migration-m4-m5.ts \
  --remote origin \
  --branch codex/electron-to-tauri-migration \
  --expected-head <migration-commit-sha> \
  --win-report /tmp/open-design-tauri-m4-reports/open-design-ci-win-tauri-e2e-report \
  --linux-report /tmp/open-design-tauri-m4-reports/open-design-ci-linux-tauri-e2e-report
```

The verifier rejects skipped reports, missing screenshots, non-success suite results, wrong specs, missing health eval output, missing executable paths, non-empty `remainingPids`, Windows uninstall residue, and Linux headless regressions. Treat a passing verifier as the minimum evidence needed before editing the M4 checkboxes. Keep the verifier's printed `Windows NSIS M4 evidence` and `Linux AppImage/headless M4 evidence` sections with the PR or execution log when closing the M4 checkboxes.
