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
- Windows NSIS and Linux AppImage Tauri packaging paths are wired and have lifecycle readiness tests, but remain platform smoke gates.
- CI now has opt-in-by-change Tauri platform gates for Windows NSIS and Linux AppImage through `packaged_smoke_tauri_win` and `packaged_smoke_tauri_linux`; those jobs still need native runner evidence before the M4 boxes below can close.
- `release-beta` has an explicit `desktop_runtime` workflow input, defaulting to `electron`, so maintainers can run beta packaging with `tauri` before the default flip without changing public defaults.
- MSI and Windows/Linux unpacked `--to dir` are not default-flip blockers. Tauri officially supports MSI via WiX, but this repository still needs a namespace-scoped MSI install/uninstall lifecycle before treating MSI as release-grade. Tauri's documented bundle targets are `deb`, `rpm`, `appimage`, `nsis`, `msi`, `app`, and `dmg`, with no `dir` target; keep Electron `--to dir` during the transition and resolve the command shape during M6. Reference: https://v2.tauri.app/reference/config/#bundletype
- Tauri versions are pinned to `tauri@2.11.2`, `@tauri-apps/cli@2.11.2`, and `@tauri-apps/api@2.11.0`.
- Electron remains the default runtime for `tools-dev` and `tools-pack`.

## Schedule

| Phase | Dates | Goal | Exit Criteria |
| --- | --- | --- | --- |
| M0 Runtime parity | 2026-05-20 to 2026-05-22 | Make the Tauri dev runtime inspectable and usable enough for daily smoke. | `status`, `eval`, `click`, `console`, and `screenshot` work through the existing desktop sidecar message shapes on macOS dev. |
| M1 Cross-platform IPC | 2026-05-25 to 2026-05-29 | Remove Unix-only assumptions from the Rust desktop runtime. | Windows named-pipe IPC and Linux/macOS Unix socket IPC pass the same status/eval/click tests. |
| M2 Bridge hardening | 2026-06-01 to 2026-06-03 | Prove renderer bridge parity. | `openExternal`, `pickAndImport`, `openProjectPath`, analytics desktop detection, and browser print fallback are covered by web + runtime smoke. |
| M3 Packaging parallel path | 2026-06-04 to 2026-06-10 | Add Tauri as an opt-in `tools-pack` runtime. | `tools-pack mac|win|linux build --desktop-runtime tauri` produces namespace-mapped artifacts and keeps existing install/start/stop/logs/inspect command shape. |
| M4 Platform package smoke | 2026-06-11 to 2026-06-17 | Validate installable Tauri artifacts. | mac `.app/.dmg`, Windows NSIS, and Linux AppImage/headless flows start daemon/web/desktop and pass inspect status/eval/screenshot. MSI is tracked as a post-flip release follow-up unless release ownership makes it mandatory. |
| M5 Default flip | 2026-06-18 to 2026-06-19 | Make Tauri the default desktop runtime. | `tools-dev` and `tools-pack` default to Tauri; Electron remains available behind an explicit fallback flag for one release window. |
| M6 Electron removal | 2026-06-22 to 2026-06-24 | Remove Electron-only runtime code and dependencies. | Electron deps, builder hooks, packaged Electron entry glue, and Electron-only docs/tests are removed or replaced. |

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
- [x] Decide Windows/Linux Tauri `--to dir` is not a default-flip release requirement; resolve it during M6 by either removing win/linux `dir` or adding an explicit portable Tauri mode.

### M4 Platform package smoke

- [x] macOS `.app`: build, start, inspect status/eval/screenshot, stop.
- [x] macOS `.dmg`: build, install, start, inspect status/eval/screenshot, stop.
- [ ] Windows NSIS: build, install, start, inspect status/eval/screenshot, stop.
- [x] Windows MSI: out of scope for the default flip; reopen only if release ownership makes MSI mandatory.
- [ ] Linux: build AppImage, install, start, inspect status/eval/screenshot, stop.
- [x] Linux headless path has non-GUI lifecycle regression coverage.
- [ ] Linux headless platform smoke remains supported and unaffected.
- [x] Run e2e `tests/tools-dev/inspect.test.ts` against Tauri where the host supports a GUI.

### M5 Default flip

- [ ] Change `tools-dev` default desktop runtime to Tauri.
- [ ] Change `tools-pack` default desktop runtime to Tauri.
- [ ] Keep Electron fallback explicit during the transition window.
- [ ] Update README, architecture docs, and directory guidance to describe Tauri as the primary runtime.

### M6 Electron removal

- [ ] Remove `electron`, `electron-builder`, `@electron/rebuild`, and Electron-only package scripts.
- [ ] Remove Electron preload/runtime code after Tauri bridge and packaging parity are complete.
- [ ] Remove Electron-only resources/hooks from `tools-pack`.
- [ ] Delete or rewrite Electron-only tests.
- [ ] Update AGENTS guidance and PR checklist references from Electron to Tauri.

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
| Windows NSIS smoke | Windows 11 with Node 24, pnpm 10.33.2, Rust stable, Tauri Windows prerequisites | `pnpm tools-pack win build --to nsis --desktop-runtime tauri --namespace tauri-win-smoke --json`; `pnpm tools-pack win install --desktop-runtime tauri --namespace tauri-win-smoke --json`; `pnpm tools-pack win start --desktop-runtime tauri --namespace tauri-win-smoke --json`; `pnpm tools-pack win inspect --desktop-runtime tauri --namespace tauri-win-smoke --expr "location.href" --json`; `pnpm tools-pack win inspect --desktop-runtime tauri --namespace tauri-win-smoke --path %TEMP%\\open-design-tauri-win.png --json`; `pnpm tools-pack win stop --desktop-runtime tauri --namespace tauri-win-smoke --json` | Installer path, installed exe path, start status URL, eval URL with trailing slash, screenshot file path, `remainingPids: []` on stop. |
| Linux AppImage smoke | Linux desktop host with Node 24, pnpm 10.33.2, Rust stable, Tauri Linux prerequisites | `pnpm tools-pack linux build --to appimage --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux install --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux start --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux inspect --desktop-runtime tauri --namespace tauri-linux-smoke --expr "location.href" --json`; `pnpm tools-pack linux inspect --desktop-runtime tauri --namespace tauri-linux-smoke --path /tmp/open-design-tauri-linux.png --json`; `pnpm tools-pack linux stop --desktop-runtime tauri --namespace tauri-linux-smoke --json` | AppImage path, installed AppImage path, start status URL, eval URL with trailing slash, screenshot file path, `remainingPids: []` on stop. |
| Linux headless regression | Linux host after a successful Tauri Linux build | `pnpm tools-pack linux install --headless --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux start --headless --desktop-runtime tauri --namespace tauri-linux-smoke --json`; `pnpm tools-pack linux stop --headless --desktop-runtime tauri --namespace tauri-linux-smoke --json` | Headless launcher path, status URL or marker, `remainingPids: []` on stop. |
| MSI follow-up | Windows host / release owner decision | MSI is not a default-flip blocker. If release ownership later makes MSI mandatory, add `--to msi` support plus a namespace-scoped install/uninstall lifecycle before running the same inspect smoke as NSIS. | Follow-up issue or code change and Windows smoke result. |
| Windows/Linux `--to dir` M6 resolution | Windows and Linux hosts / dev workflow owner decision | Tauri has no `dir` bundle target. Before Electron removal, either remove win/linux `dir` from the public Tauri-era command shape or implement an explicit portable Tauri directory mode with resources and start/inspect support. | M6 code change and targeted tests. |

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
- 2026-05-20: Committed the migration implementation locally on branch `codex/electron-to-tauri-migration` at `e87d3109172ea0c4a9a9289f793b493bd3ebf4f8`, then added this native CI handoff note. Unrelated local files were left unstaged. Attempted `git push -u origin codex/electron-to-tauri-migration`, but the configured Git credential (`sunseol`) lacks write permission to `nexu-io/open-design` and GitHub returned 403. The GitHub connector also returned 403 for creating the same branch. Native Windows/Linux M4 evidence is therefore still pending a push/PR from a credential with repository write access or an equivalent native-host run.
- 2026-05-20: Added `scripts/verify-tauri-platform-gates.ts` to mechanically validate extracted Windows/Linux release-smoke artifacts before closing M4. It rejects skipped reports, missing `summary.json`, missing screenshots, wrong specs, failed suite results, bad health evals, non-empty stop PID lists, Windows uninstall residue, and Linux headless regressions. Verified a synthetic passing report pair and confirmed the current macOS skip report fails with a missing `summary.json` error.
- 2026-05-20: Added `scripts/verify-tauri-platform-gates.test.ts` and wired it into `pnpm guard`, so the report verifier is now part of the repository policy gate. The tests cover a complete Windows+Linux evidence pair, a skipped report with no runtime summary, and Windows stop residue. `pnpm guard` and `pnpm typecheck` passed after the wiring change.
- 2026-05-20: Added `OD_PACKAGED_E2E_REUSE_BUILD=1` support to `e2e/specs/win-tauri.spec.ts` and `e2e/specs/linux.spec.ts`, allowing release workflows to smoke the artifact built in an earlier tools-pack step instead of rebuilding. `release-beta` now has a `desktop_runtime: electron|tauri` input, keeps Electron as the default, and wires Tauri beta runs through the runtime-specific tools-pack build flags, Rust/Tauri Linux prerequisites, Windows Tauri smoke, Linux Tauri smoke, and the existing mac packaged smoke with `OD_PACKAGED_E2E_DESKTOP_RUNTIME`.
- 2026-05-20: Wired `scripts/verify-tauri-platform-gates.ts` into the PR CI Tauri platform jobs and the `release-beta desktop_runtime=tauri` Windows/Linux smoke paths. Native Windows/Linux jobs now fail if the release-smoke wrapper exits successfully but the report artifact lacks the M4 evidence needed for signoff.
- 2026-05-20: Re-ran the local QA plan after the CI verifier wiring. `pnpm guard`, `pnpm typecheck`, `pnpm --filter @open-design/web test`, `pnpm --filter @open-design/desktop test`, `pnpm --filter @open-design/packaged test`, `pnpm --filter @open-design/tools-dev test`, `pnpm --filter @open-design/tools-pack test`, `cargo check --manifest-path apps/desktop/src-tauri/Cargo.toml`, `cargo clippy --manifest-path apps/desktop/src-tauri/Cargo.toml -- -D warnings`, and `cargo test --manifest-path apps/desktop/src-tauri/Cargo.toml` passed locally. The platform e2e specs `specs/mac.spec.ts`, `specs/linux.spec.ts`, and `specs/win-tauri.spec.ts` also load successfully on macOS and skip when their host gates are not enabled.

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

Both jobs run `scripts/verify-tauri-platform-gates.ts` against the generated report before uploading the artifact.

Do not close the Windows/Linux M4 checkboxes from CI wiring alone. Close them only after the native CI jobs or equivalent host commands produce the required eval/screenshot/stop evidence.

### Remote CI Handoff

The local branch `codex/electron-to-tauri-migration` contains the current migration state:

```bash
git rev-parse codex/electron-to-tauri-migration
```

To collect native M4 evidence, push that branch with a credential that can write to `nexu-io/open-design`, open a draft PR against `main`, and wait for these CI jobs:

- `Packaged windows Tauri smoke`
- `Packaged linux Tauri smoke`

If both pass, download or inspect their `open-design-ci-win-tauri-e2e-report` and `open-design-ci-linux-tauri-e2e-report` artifacts. The Windows report must prove NSIS build/install/start/eval/screenshot/stop/uninstall. The Linux report must prove AppImage build/install/start/eval/screenshot/stop/uninstall plus headless install/start/stop. Only then mark the three remaining M4 platform checkboxes complete and proceed to M5.

After extracting the report artifacts, verify the required evidence mechanically:

```bash
pnpm exec tsx scripts/verify-tauri-platform-gates.ts \
  --win-report /path/to/open-design-ci-win-tauri-e2e-report \
  --linux-report /path/to/open-design-ci-linux-tauri-e2e-report
```

The verifier rejects skipped reports, missing screenshots, non-success suite results, wrong specs, missing health eval output, non-empty `remainingPids`, Windows uninstall residue, and Linux headless regressions. Treat a passing verifier as the minimum evidence needed before editing the M4 checkboxes.
