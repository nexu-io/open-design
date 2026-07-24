# tools/pack

Follow the root `AGENTS.md` and `tools/AGENTS.md` first. This tool owns the repo-external packaged build/start/stop/logs command surface.

## Owns

- Local packaging orchestration for packaged Open Design artifacts.
- mac build/install/start/stop/logs/uninstall/cleanup smoke commands.
- Windows NSIS build/install/start/stop/logs/uninstall/cleanup/list/reset smoke commands.
- Windows registry observation/cleanup must go through `reg.exe` and stay scoped to entries matching the namespace install/uninstaller paths.
- Windows lifecycle logs must expose NSIS automation logs/markers/timings in addition to app runtime logs.
- Linux AppImage build/install/start/stop/logs/uninstall/cleanup smoke commands.
- Linux headless (no-Electron) install/start/stop via `--headless` flag on `install`, `start`, and `stop`.
- Linux containerized builds via `electronuserland/builder` Docker image for distro-agnostic glibc compat.
- Consuming sidecar/process/path primitives from `@open-design/sidecar-proto`, `@open-design/sidecar`, and `@open-design/platform`.

## Does not own

- Product business logic.
- Sidecar protocol definitions.
- A second process identity model.
- Product/business update runtime integration.

## Rules

- Do not hand-build `--od-stamp-*` args; use `createProcessStampArgs` with `OPEN_DESIGN_SIDECAR_CONTRACT`.
- Do not use port numbers in data/log/runtime/cache path decisions. Namespace decides paths; ports are only transient transports.
- Public release artifacts must use channel-specific app identity: stable uses `Open Design`, beta uses `Open Design Beta`, prerelease uses `Open Design Prerelease`, and preview uses `Open Design Preview`. Local tools-pack installs may still use namespace-scoped install paths only as a developer multi-instance validation convention.
- Do not let namespace-named `.app` installs change data/log/runtime/cache path conventions.
- `--dir` controls tools-pack output/runtime/install validation roots only. It must not be treated as the cache root. The default workspace tools-pack cache is the hot path. `--cache-dir` is a special-case escape hatch for cache isolation or cold-cache validation, not a routine QA/build parameter.
- Use `--portable` for public/release artifacts so packaged config does not bake local tools-pack runtime roots from the build machine.
- Pack resource files used by electron-builder belong under `tools/pack/resources/`; do not point pack logic at Downloads, web public assets, docs assets, or other app-owned resource paths.
- For ordinary Windows NSIS smoke tests, use short namespaces such as `rg`, `smoke`, or `nsis-a`. NSIS extracts deeply nested Next.js standalone files under the namespace-scoped install directory; long namespaces can push installed paths past the traditional Windows 260-character limit even when builder `win-unpacked` output is correct. During merge regression, namespace `regression-merge-nsis` produced an installed path length of 264 characters and missed `next/dist/server/route-matcher-providers/helpers/cached-route-matcher-provider.js` in the installed directory, while the same NSIS smoke passed with namespace `rg`. Use long namespaces only when intentionally testing installer path-length behavior.

## Packaged auto-update architecture and harness

Read this section before changing packaged auto-update behavior. The updater crosses package, desktop, web UI, release-feed, and installer surfaces, so bugs often hide between otherwise-green package tests.

### Architecture map

- `apps/desktop/src/main/updater.ts` owns updater state, release metadata parsing, artifact selection, checksum verification, download-store ownership, progress events, and opening the downloaded installer. It is pure main-process logic and is tested under `apps/desktop/tests/main/updater.test.ts`.
- `apps/desktop/src/main/runtime.ts` exposes updater IPC to the renderer through `od:update:status|check|download|install|quit` and emits `od:update:status-changed`. Keep installer launch separate from process shutdown; quit is an explicit post-installer action.
- `apps/desktop/src/main/index.ts` wires the scheduler and the packaged macOS app-menu update item. The native item mirrors updater state and opens the renderer-owned update dialog; it must not create a second updater or a native result dialog. Windows and Linux menus do not expose update actions.
- `apps/web/src/lib/updater.ts` normalizes host updater snapshots into UI-ready state.
- `apps/web/src/components/UpdaterPopup.tsx` remains the ready-update surface in the left rail. `apps/web/src/components/UpdateDialog.tsx` owns the explicit macOS app-menu check flow. All visible copy and native menu labels must go through `apps/web/src/i18n`.
- `packages/launcher-proto` owns launcher pointer, attempt, and desktop-handoff journal shapes plus payload selection. `runtime.json` together with `attempt.json` is the only payload-version state machine.
- `apps/packaged/src/index.ts` delegates to the selected payload desktop before initializing the outer Electron runtime, then passes packaged `appVersion` and namespace-scoped `updateRoot` into desktop main only when the outer itself must run.
- `apps/daemon/src/sidecar/payload-desktop-handoff.ts` is the isolated compatibility bridge for historical outers that cannot delegate. It rearms the selected payload with the real previous pointer, launches that payload's desktop after the old outer exits, and persists a small desktop-binding journal for later shortcut cold starts. The journal is not a second version selector.
- `install.json` continues to identify the physically installed outer executable for recovery. Payload activation or handoff must not rewrite it to a versioned payload executable.
- `tools/serve` owns deterministic local updater fixtures only. It must not contain product updater runtime logic.
- `tools/pack` owns packaged build/install/start/inspect/logs/uninstall/cleanup and the platform installer harness, including Windows NSIS registry observation and cleanup.

### Release metadata shape

The runtime updater reads `https://releases.open-design.ai/<channel>/latest/metadata.json` unless `OD_UPDATE_METADATA_URL` overrides it. For package-launcher updates:

- A valid packaged-launcher context prefers `platforms.<platform>.artifacts.payload`; the platform installer (`dmg` on macOS or `installer` on Windows) remains the recovery/fallback path.
- The artifact must have a checksum, preferably `sha256Url`; the updater verifies bytes before exposing an install action.
- `OD_UPDATE_CURRENT_VERSION` may override the packaged version for tests, but user-flow package validation should prefer building the package with the intended `--app-version`.
- Release metadata may include `releaseNote.content`, with a `defaultLocale` and locale descriptors containing `url`, `mediaType`, `sha256`, and `size`. The updater does not currently consume this block; `tools-release` owns its publication and verification independently from updater UI behavior.
- Release metadata may include `control.launcher.version.{min, url}` — the installer-reinstall floor. The updater compares `min` against the **physically installed outer package version** (read at check time from the outer bundle's `open-design-config.json` via the launcher launch path; `OD_UPDATE_INSTALLED_VERSION` overrides it for tests), NOT the running payload version — payload updates never touch the outer bundle, so a broken outer generation must reach the installer path even when its payload is current. When the floor trips (or `min` is set but the outer version is unreadable — conservative), the updater selects the installer artifact and, when no newer release exists, offers a same-version installer reinstall; snapshot field `reinstall` carries `{reason, installedVersion, minVersion, url}` and the web UI presents the optional operator `url` as a jump link with default i18n copy as fallback. Publication: channel policy is managed as one repo-vars pair per channel — `RELEASE_LAUNCHER_VERSION_MIN_<CHANNEL>` + `RELEASE_LAUNCHER_VERSION_MIN_URL_<CHANNEL>` — passed through workflows verbatim (no YAML fallback expressions) and resolved by the shared resolver in `tools/release/src/storage/launcher-version-floor.ts`: a non-stable channel whose own pair is unset falls back to the STABLE pair as a unit, and format/https/floor validation is applied at that single point. `publish-metadata` hard-fails when `min` exceeds the release version — a floor this release cannot satisfy would make the same-version reinstall offer nag forever. `verify-metadata` re-resolves the same channel policy and checks the published block against it; `summary-metadata` surfaces the floor in the step summary.
- The updater exposes a manual disaster-recovery `clear-cache` action (`od:update:clear-cache` IPC, sidecar action `clear-cache`, Settings → About "Clear update cache" row with a two-stage inline confirm). It resets one-shot update state (downloaded release, install freeze) back to `idle`, purges `releases/`, `staging/`, `downloads/`, and `.back/`, removes a stale launcher `attempt.json` plus any non-`confirmed` desktop-handoff journal, and deletes non-retained launcher payload versions. Runtime `active`/`lastSuccessful` versions, explicit `retained` cleanup entries, `install.json`, and a `confirmed` handoff journal are never touched; locked files defer through the existing cleanup.json retry machinery. An installer helper already spawned by a prior install action is not cancelled.
- Release-note source lives at `docs/CHANGELOG/v<full-releaseVersion>/<locale>.md`. All channels use the same publication pipeline, while stable additionally requires `en` and `zh-CN` before platform builds proceed.
- Post-update "what's new" highlights are NOT carried in release `metadata.json`. The daemon's `/api/whats-new` fetches a single hand-curated document on a dedicated R2 bucket (`https://whatsnew.open-design.ai/whats-new.json`, overridable with `OD_WHATS_NEW_URL`); the web home surface shows a one-time card driven by that document's `id`, not the running version. Operators edit that one file after a release — there is no per-version publish tooling.

### Channel identity rules

Channel identity must be stable across install, update install, shortcuts, registry entries, and app data:

- Stable: `Open Design`, namespace `default` or stable release namespace.
- Beta Windows: `Open Design Beta`, namespace `release-beta-win`, uninstall key `Open Design-release-beta-win`.
- Prerelease Windows: `Open Design Prerelease`, namespace `release-prerelease-win`, uninstall key `Open Design-release-prerelease-win`.
- Preview Windows: `Open Design Preview`, namespace `release-preview-win`, uninstall key `Open Design-release-preview-win`.
- Beta-like ad hoc namespaces such as `beta-local-flow` are test namespaces, not the beta channel. They must not be used for user-flow beta validation because they create a different registry key while sharing a confusing display name/path.

If a local release-channel package is meant to be updated by a real feed, build it with the matching release namespace and an older matching `--app-version` such as `--namespace release-beta-win --app-version 0.10.0-beta.1` or `--namespace release-prerelease-win --app-version 0.10.0-prerelease.1`. Otherwise the installed package and the downloaded package can appear as separate registry entries even though they target the same display name.

### Deterministic fixture harness

Use `tools-serve start updater` for fast, deterministic tests and e2e automation where network release state is not the thing under test. Fixture flow:

```bash
pnpm tools-serve start updater --json --channel beta --version 99.0.0-beta.1 --platform win
```

Then launch packaged desktop with:

```bash
OD_UPDATE_ENABLED=1
OD_UPDATE_METADATA_URL=<fixture metadataUrl>
OD_UPDATE_CURRENT_VERSION=99.0.0-beta.0
OD_UPDATE_OPEN_DRY_RUN=1
OD_UPDATE_AUTO_CHECK=1
```

This harness is appropriate for asserting IPC, popup rendering, progress, checksum/download-store behavior, and dry-run installer opening. It is not a full user-view validation because it replaces the public release feed and uses synthetic artifact bytes.

### High-confidence local user-flow acceptance

Use this when validating release-channel behavior before handing a Windows beta build to a human tester. This path intentionally avoids mock services and exercises the selected real beta feed. For the self-hosted `release-beta-s` lane, the real feed is the Nexu S3 origin configured by `release_public_origin`, currently `https://s3.nexu.space/od-releases`.

1. Confirm the latest beta metadata first:

```bash
curl.exe --ssl-no-revoke -fsSL https://releases.open-design.ai/beta/latest/metadata.json
```

For `release-beta-s`, check the internal feed instead:

```bash
curl.exe --ssl-no-revoke -fsSL https://s3.nexu.space/od-releases/beta/latest/metadata.json
```

2. Build a non-portable Windows beta package with the real beta namespace and a version lower than latest:

```bash
pnpm tools-pack win build --dir C:\odtp-beta-release-fixed --namespace release-beta-win --to nsis --app-version 0.8.0-beta.5 --json
```

3. Give the tester the generated installer:

```text
C:\odtp-beta-release-fixed\out\win\namespaces\release-beta-win\builder\Open Design-release-beta-win-setup.exe
```

4. Expected user flow:

- User installs `0.8.0-beta.5` through the NSIS UI.
- User launches `Open Design Beta`.
- App auto-checks the real beta feed and selects the latest Windows launcher payload when the package-launcher context is valid. The installer is the fallback path when the payload artifact or launcher context is unavailable.
- For the payload path, the app downloads `platforms.win.artifacts.payload`, verifies sha256, prepares the payload under `%APPDATA%\Open Design\launcher\channels\beta\namespaces\release-beta-win\versions\<version>\payload`, and shows the web updater popup.
- The native Windows File menu must not expose update actions. On macOS, the app menu exposes the state-aware update item and opens the renderer update dialog without making background checks intrusive.
- The updater popup uses i18n strings and download progress must not flash to 100% before real bytes arrive.
- Applying the payload update should quit and relaunch the exact executable under the prepared version's `payload` directory, then mark launcher `active` and `lastSuccessful` to that version and clear `attempt.json`.
- A historical outer may first create a mixed generation. Its daemon-sidecar compatibility handoff must replace the historical desktop with the exact payload desktop executable, preserve the true previous pointer for recovery, and leave the handoff journal either absent or `confirmed`—never stranded in `prepared` or `armed`.
- After a full stop, launching the installed shortcut/outer again must still converge on the same active payload desktop and preserve daemon/API behavior, including a real PPTX export.
- If the updater falls back to the installer path, clicking `Open installer` opens the real downloaded beta installer. Installing it should overwrite the same `Open Design-release-beta-win` registry key, not create a second beta key.

5. Registry and launcher sanity check after beta.6 update:

```powershell
Get-ItemProperty 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*' -ErrorAction SilentlyContinue |
  Where-Object { $_.DisplayName -like 'Open Design*' } |
  Select-Object PSChildName,DisplayName,DisplayVersion,InstallLocation

Get-Content "$env:APPDATA\Open Design\launcher\channels\beta\namespaces\release-beta-win\runtime.json"
```

For a clean beta channel result, expect one beta entry with `PSChildName` `Open Design-release-beta-win` and the latest `DisplayVersion`.
For the payload path, also expect launcher `active.version` and `lastSuccessful.version` to match the latest beta version, `attempt.json` to be absent, and the running desktop executable to resolve below that version's `payload` directory. `desktop-handoff.json` may be absent for a current outer or `confirmed` for a historical outer; `prepared` and `armed` are not successful terminal states.
Windows Settings > Apps may cache uninstall metadata within the current view. If Settings still shows the previous beta version after the registry query is correct, switch away from the Apps view and back, or reopen Settings, before treating it as an installer failure. The registry query above is the source of truth for this harness.

6. Avoid leaving validation residue. Stop running app processes first, then use tools-pack uninstall/cleanup for tool-managed namespaces. Only delete explicit temp roots after verifying the resolved path is exactly the intended directory.
`--dir` is an output/runtime root, not the default cache root. Do not add
`--cache-dir` to routine validation; it is an escape hatch for cache isolation
or cold-cache validation only.

```bash
pnpm tools-pack win stop --dir C:\odtp-beta-release-fixed --namespace release-beta-win --json
pnpm tools-pack win uninstall --dir C:\odtp-beta-release-fixed --namespace release-beta-win --remove-product-user-data --remove-data --remove-logs --remove-sidecars --json
pnpm tools-pack win cleanup --dir C:\odtp-beta-release-fixed --namespace release-beta-win --remove-product-user-data --remove-data --remove-logs --remove-sidecars --json
```

### Validation matrix for updater changes

`docs/testing/updater-lifecycle.md` is the full lifecycle-to-test coverage map (including deliberate manual-only nodes); consult it to find the owning tests for the node you touched, then run the narrow tests plus the repo checks:

```bash
pnpm --filter @open-design/desktop test -- tests/main/updater.test.ts tests/main/updater-host-boundary.test.ts tests/main/preload-host-boundary.test.ts
pnpm --filter @open-design/web test -- tests/components/UpdaterPopup.test.tsx tests/lib/updater.test.ts
pnpm --filter @open-design/tools-serve test
pnpm --filter @open-design/tools-pack test -- tests/win-identity.test.ts tests/win-app.test.ts tests/win-builder.test.ts
pnpm --filter @open-design/desktop typecheck
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/tools-pack typecheck
pnpm --filter @open-design/tools-serve typecheck
git diff --check
pnpm guard
pnpm typecheck
```

Run the high-confidence local user-flow acceptance whenever a change touches real release feed selection, channel identity, Windows registry/install behavior, installer opening, or visible updater UI behavior.
For launcher payload or handoff changes, also run the platform full spec. The full profile must validate exact desktop executable identity, a real PPTX response, a complete stop followed by an installed-outer cold start, and the same checks again after restart. Windows beta full validation must use `release-beta-win`; a beta-like local namespace is not equivalent delivery evidence.
