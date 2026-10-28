# tools/pack

Local packaging control plane for Open Design.

`tools-pack` is the cross-platform packaging and smoke-lifecycle control plane. The macOS commands include:

- `tools-pack mac build --to all`
- `tools-pack mac build --to app|dmg|zip`
- `tools-pack mac build --to all --signed`
- `tools-pack mac build --to all --portable` for release artifacts that must not bake local tools-pack runtime paths
- `tools-pack mac install`
- `tools-pack mac start`
- `tools-pack mac stop`
- `tools-pack mac logs`
- `tools-pack mac uninstall`
- `tools-pack mac cleanup`

Build artifacts are namespace-scoped under `.tmp/tools-pack/out/mac/namespaces/<namespace>/`.
Public release bundles keep channel-distinct identities: `Open Design.app`, `Open Design Beta.app`,
`Open Design Prerelease.app`, or `Open Design Preview.app`. Local `tools-pack install` adds the developer
namespace so installs can coexist without affecting runtime data/log/cache paths.

Packaged runtime state is namespace-scoped under `.tmp/tools-pack/runtime/mac/namespaces/<namespace>/`:

- Packaged daemon storage is governed only by the root `AGENTS.md` section
  **Daemon data directory contract**. Before changing or documenting packaged
  storage propagation, you MUST read that section; this README MUST NOT
  restate it.
- `logs/` contains packaged process logs for `desktop`, `web`, and `daemon`.
- `runtime/` is the sidecar runtime base used by the packaged desktop/web/daemon process group.
- `cache/` is reserved for namespace-local packaged cache state.
- `user-data/` is the Electron/Chromium `userData` root, with `user-data/session/` used for `sessionData`.

Every packaged root registers the exact five-field sidecar stamp
(`channel / namespace / source / mode / app`) in its own argv. Direct OS
launches register during packaged startup; tools-pack launches receive the same
stamp through the sidecar launch atomic. No identity file participates in
discovery or ownership.

`tools-pack mac stop` scans exact argv stamps for desktop, Web, and daemon across
both tools-pack and direct packaged sources, requests private graceful teardown,
waits for every captured generation to exit, and then force-stops only the
still-matching process trees. Cleanup and uninstall refuse to remove artifacts
while any captured generation remains alive.

This keeps `stop` from killing processes outside the current namespace.

Packaged desktop also writes main-process lifecycle logs to `logs/desktop/latest.log` so Finder/manual launches are
diagnosable. This log is intentionally scoped to packaged desktop startup/shutdown/process errors and does not capture
web/renderer console output.

The packaged daemon path contract lives only in the root `AGENTS.md` section
**Daemon data directory contract**. Before changing or documenting packaged
path propagation, you MUST read that section; this README MUST NOT restate it.

Packaged desktop checks release metadata, verifies the downloaded artifact, and exposes update actions through desktop
IPC. Launcher-based builds prefer verified payload activation followed by relaunch; installer replacement remains the
fallback for artifact types and older builds that cannot apply a payload in place.

Electron-builder resources live under `tools/pack/resources/mac/`. The current logo is staged there as the mac icon/DMG
placeholder so future design-provided assets can replace the resource files without changing packaging code.

Local developer artifacts bake the tools-pack namespace runtime root so `tools-pack mac start/stop/logs/cleanup` can manage
them from the repo. Release artifacts use `--portable` so the installed app resolves namespace data/log/runtime/user-data
from the user's Electron `userData` root instead of the build machine's `.tmp` path.

### macOS compatibility notes

- `tools-pack mac build --portable --to zip` is the safest manual-install artifact for Intel Macs. This path was smoke-tested on macOS 12.7.6 Monterey on a 2015 Intel iMac and the app launched successfully from `/Applications`.
- Finder/manual launches on macOS may not inherit your shell-managed `PATH`. If packaged Open Design cannot detect agent CLIs that work in Terminal, expose those binaries to the GUI login environment or launch the packaged app from a shell session that already sees them.

## Windows

Local lifecycle commands:

- `tools-pack win build --to dir` for fast unpacked smoke builds.
- `tools-pack win build --to nsis` for installer builds.
- `tools-pack win build --to all` for both outputs.
- `tools-pack win install`
- `tools-pack win start`
- `tools-pack win inspect --expr "document.title"`
- `tools-pack win logs`
- `tools-pack win stop`
- `tools-pack win cleanup`
- `tools-pack win list`
- `tools-pack win reset`

Build artifacts are namespace-scoped under `.tmp/tools-pack/out/win/namespaces/<namespace>/`.
Packaged runtime state is namespace-scoped under `.tmp/tools-pack/runtime/win/namespaces/<namespace>/`.
`--to dir` may point `built-app.json` at an immutable cached `win-unpacked` executable while keeping
namespace-local config and runtime paths outside that cache entry.

## Linux

Local lifecycle commands:

- `tools-pack linux build --to all` (default; produces AppImage)
- `tools-pack linux build --to appimage` (explicit AppImage)
- `tools-pack linux build --to rpm` (native Fedora/RHEL/openSUSE package)
- `tools-pack linux build --to dir` (unpacked output for fast iteration)
- `tools-pack linux build --containerized` (run electron-builder inside `electronuserland/builder:base` Docker for a wider glibc compatibility target — requires Docker)
- `tools-pack linux build --to all --portable` (release artifacts that must not bake local tools-pack runtime paths)
- `tools-pack linux install`
- `tools-pack linux install --headless` (install the headless launcher script instead of the AppImage)
- `tools-pack linux start`
- `tools-pack linux start --headless` (start the headless entry — daemon + web, no Electron)
- `tools-pack linux stop`
- `tools-pack linux stop --headless` (stop a running headless process)
- `tools-pack linux inspect` (desktop status, eval, and screenshot for AppImage mode)
- `tools-pack linux inspect --headless` (status only)
- `tools-pack linux logs`
- `tools-pack linux uninstall`
- `tools-pack linux uninstall --headless`
- `tools-pack linux cleanup`
- `tools-pack linux cleanup --headless`

Build artifacts are namespace-scoped under `.tmp/tools-pack/out/linux/namespaces/<namespace>/`. Packaged logs, sidecar runtime, cache, and Electron user-data are namespace-scoped under the tools-pack runtime root. Daemon storage follows only the root `AGENTS.md` **Daemon data directory contract**. Containerized build cache lives under `.tmp/tools-pack/.docker-cache/{electron,electron-builder}/`.

The assembled app runs the packaged daemon under the bundled Node binary, so the production install keeps native install scripts enabled and builds `better-sqlite3` for that binary. It defaults `ONNXRUNTIME_NODE_INSTALL_CUDA=skip` to avoid the optional ONNX CUDA download; set `ONNXRUNTIME_NODE_INSTALL_CUDA=1` to opt in. npm 12 blocks dependency install scripts unless the assembled package's `allowScripts` field approves them; the Linux builder writes that list for the native/runtime packages. pnpm 10 ignores npm's `allowScripts`, and the containerized assembled app lives under `/tools-pack` outside the repository workspace, so the builder also renders the same list into the assembled app's `pnpm-workspace.yaml` as `onlyBuiltDependencies`. Do not build with `--ignore-scripts` or `npm_config_ignore_scripts=true`: that skips the `better-sqlite3` install script, and the resulting AppImage/RPM exits at launch with `Could not locate the bindings file` before the daemon reports status.

electron-builder 26.8.1's pnpm collector predates pnpm 10.29.3's deduped dependency listing and can omit transitive packages even when they are present in the assembled tree. The Linux builder forces electron-builder's manual traversal collector (`resolveLinuxElectronBuilderEnv`) and then starts the packaged daemon from `linux-unpacked` against `/api/health` (`verifyLinuxPackagedDaemon`) before accepting the artifact. The probe loads the exact production dependency graph and native bindings, so a missing module or failed binding fails the build instead of producing an installer that exits before listening. Keep both the collector override and the probe.

Local installs use XDG paths:

- AppImage: `~/.local/bin/Open-Design.<namespace>.AppImage`
- Menu entry: `~/.local/share/applications/open-design-<namespace>.desktop`
- Icon: `~/.local/share/icons/hicolor/512x512/apps/open-design-<namespace>.png`

The `<namespace>` suffix is unconditional so multiple developer namespaces can coexist on the same desktop. The `.desktop` file registers the `od://` scheme via `MimeType=x-scheme-handler/od;` and pre-sets `OD_PACKAGED_NAMESPACE` on the `Exec=` line so menu launches identify the correct namespace.

### Headless mode (`--headless`)

Headless mode targets environments without a display (WSL2, headless servers, CI) where Electron can't run. If you have a desktop, use the AppImage; if you're SSH'd into a machine or in WSL, use headless.

`--headless` makes `install`, `start`, `stop`, `uninstall`, and `cleanup` operate on the headless entry (`@open-design/packaged/dist/headless.mjs`) instead of the AppImage. Headless mode runs daemon + web without Electron.

- `install --headless` writes a shell launcher at `~/.local/bin/open-design-headless-<namespace>` that bakes in the namespace and resource paths. The launcher is self-contained, but the assembled app directory at those paths must remain in place — don't move it after install.
- `start --headless` launches through the sidecar atomic and waits up to 95s for private status readiness.
- `stop --headless` terminally stops the exact `mode=headless` argv stamp. The mode field keeps it disjoint from the AppImage desktop without identity files or public IPC paths.
- `inspect --headless` returns status only. Eval and screenshot require AppImage mode because there is no Electron renderer in headless mode.
- `uninstall --headless` removes the headless launcher after a safe stop.
- `cleanup --headless` stops the headless process before removing namespace output/runtime roots.

`logs` always reads `logs/desktop/latest.log` regardless of mode, so headless output is visible via `tools-pack linux logs`.

### AppImage launch mode (extraction cache)

The AppImage runtime mounts the payload through FUSE (`/tmp/.mount_<hex>`), and a plain FUSE mount serves every file through a userspace daemon. On Ubuntu 24.04 and Arch Linux that was slow enough for the packaged daemon to miss its startup budget, because the daemon demand-pages its payload through squashfuse.

The shipped `AppRun` wrapper extracts the payload once into `${XDG_CACHE_HOME:-$HOME/.cache}/open-design/appimage/<key>/` and re-execs the cached copy on every later launch. The cache key covers the AppImage path, size, and mtime, so replacing the file re-extracts instead of running a stale payload. The first launch pays the extraction cost (roughly two minutes for this payload on a slow disk); later launches start directly from the cache. The cache is not pruned automatically — stop the app first, then remove old versions with `rm -rf ~/.cache/open-design/appimage` when reclaiming disk. The launch lock is keyed to the AppImage path alone, so replacing the file at the same path does not start a second instance while the old build is running; the new build still gets a new cache directory.

`AppRun` acquires a non-blocking launch lock before either launch mode and exports the descriptor as `OD_APPIMAGE_LOCK_FD=8`. The detached sidecar supervisor inherits that descriptor during bootstrap and is the desktop generation root, so it keeps the lock after the initial launcher exits and across payload handoffs. A second click exits with `Open Design is already running.` instead of starting a competing runtime, and the same lock serializes the one-time extraction, so a second launch never waits on a wedged extractor.

`--appimage-extract-and-run` remains a fallback for hosts without FUSE: it unpacks into `/tmp/appimage_extracted_<hex>/` and needs no `libfuse2`, but it extracts before `AppRun` starts and therefore cannot populate the cache. `tools-pack linux start` launches the AppImage normally so it exercises the same cache path, and retries through `--appimage-extract-and-run` with `NO_CLEANUP=1` if the runtime cannot mount. Its first-start budget is 600s to cover a cold extraction on slower disks.

**Installed desktop launches:** `tools-pack linux install` points the desktop entry at `~/.local/share/open-design/<namespace>/launch.sh`, not the AppImage directly. The launcher checks `/dev/fuse` and `libfuse.so.2`; when mounting is unavailable it runs the AppImage with `--appimage-extract-and-run` and `NO_CLEANUP=1`, so the menu entry still starts on a no-FUSE host. Override the probe with `OD_APPIMAGE_FUSE=on|off|auto`.

**What this does not fix:** the AppImage runtime mounts the squashfs *before* `AppRun` runs, so a raw AppImage launch still needs `libfuse.so.2`. Where that library is missing, the runtime exits with a `libfuse.so.2` error before the AppRun cache or lock code can run; the installed launcher above is what avoids that path. Install the library, use the launcher from `tools-pack linux install`, or use a native package (the RPM target below; the `.deb` target is tracked in #6010):

- Debian / Ubuntu 24.04+: `sudo apt install libfuse2t64` (pre-24.04: `libfuse2`)
- Fedora / RHEL: `sudo dnf install fuse-libs`
- Arch / CachyOS: `sudo pacman -S fuse2`
- openSUSE: `sudo zypper install libfuse2`

### Native RPM package (`--to rpm`)

A hand-off to someone on a stock Fedora/RHEL/openSUSE desktop should not depend on a FUSE compatibility library, so `tools-pack` can also produce a native RPM:

```bash
pnpm tools-pack linux build --to rpm --portable
```

The artifact lands next to the AppImage in `out/linux/namespaces/<namespace>/builder/`. End users install it with their normal package manager:

```bash
sudo dnf install ./open-design-default.rpm
```

The RPM installs system-wide (electron-builder's `/opt` layout, desktop entry, icons) and is the artifact to hand to a non-developer. It is **not** part of the `tools-pack linux install/start/stop/uninstall` lifecycle — that lifecycle stays AppImage-scoped because it manages a user-local, namespace-scoped copy. `all` deliberately remains AppImage-only so release lanes never depend on distro packaging tooling.

The RPM's `Requires` includes electron-builder's Fedora defaults plus the `libgbm.so.1()(64bit)` and `libasound.so.2()(64bit)` sonames Electron 41 loads at runtime. Fedora does not pull those through `gtk3`; without them `dnf install` succeeds but the installed binary exits with `error while loading shared libraries` before Electron starts.

The `.deb` target is intentionally not included here; the standards-compliant Debian package is tracked in #6010. The RPM build uses electron-builder's bundled `fpm`, which needs host tooling:

- RPM: `rpmbuild` (`rpm-tools` on Arch) and `libcrypt.so.1` for the bundled `fpm` (`libxcrypt-compat` on Arch, `libcrypt1` on Debian/Ubuntu). The RPM config pins fpm's single-threaded `xz` encoder because electron-builder's default `xzmt` encoder can use ~10 GB of RSS and gets OOM-killed on a 16 GB host.
- `--containerized` provides the RPM toolchain inside the builder image and is the most reproducible path.

### Optional system tools

`tools-pack linux install` and `tools-pack linux uninstall` invoke `update-desktop-database` and `gtk-update-icon-cache` as best-effort post-hooks. Either tool being absent (`iconCache: "missing"` in the output) is harmless — the icon and menu entry still work, the cache just isn't refreshed. Install via your distro:

- Arch / CachyOS: `sudo pacman -S desktop-file-utils gtk-update-icon-cache`
- Debian / Ubuntu: `sudo apt install desktop-file-utils gtk-update-icon-cache`
- Fedora: `sudo dnf install desktop-file-utils gtk-update-icon-cache`

`libfuse2` is needed for a FUSE-mounted AppImage launch. `AppRun` extracts once into the user cache and re-execs the cached copy, so the slow FUSE reads are paid only on the first launch, but the runtime still refuses to start without `libfuse.so.2`. `tools-pack linux start` uses the same cached path and falls back to `--appimage-extract-and-run` when the runtime cannot mount, and the installed desktop entry uses the external launcher with the same fallback, so both work on hosts without FUSE. The native RPM target below is the no-FUSE option for Fedora/RHEL/openSUSE; the `.deb` target is tracked in #6010.

### Sandbox / chrome-sandbox

Chromium's namespace sandbox requires unprivileged user namespaces. `AppRun` probes the capability (`unshare -Ur true`), adds `--no-sandbox` only when the probe fails, and strips the unconditional `--no-sandbox` that desktop-integration tooling passes when the sandbox does work. Override the decision with `OD_LINUX_SANDBOX=on` or `OD_LINUX_SANDBOX=off`.

Native RPM packages do not use `--no-sandbox`. electron-builder's FpmTarget `after-install.tpl` installs the AppArmor profile where supported and marks `chrome-sandbox` setuid (4755) when unprivileged user namespaces are unavailable, so the RPM keeps Chromium's sandbox enabled for every user. The AppImage's AppRun probe is the only conditional fallback.

If launches fail on Ubuntu 24.04+ with a namespace error, either let the probe add the fallback or lift the restriction system-wide:

```bash
sudo sysctl -w kernel.apparmor_restrict_unprivileged_userns=0
```

### Distro compatibility target

AppImages built natively on a rolling distro (e.g., Arch / CachyOS) link against recent glibc and may not run on stable distros (Ubuntu 22.04, Debian 12). Use `--containerized` to build against the `electronuserland/builder:base` baseline (Ubuntu 18.04 / glibc 2.27), which is the compatibility target for release AppImages rather than a guarantee for every Linux distribution.

Verified smoke coverage in this repository currently includes:

- Main PR CI: packaged Linux smoke is intentionally outside the main CI gate.
- Release lane: Ubuntu GitHub-hosted runner, containerized AppImage build plus Xvfb AppImage runtime smoke when the Linux release lane is enabled.
- Manual AppImage behavior used to validate the extraction cache: Ubuntu 24.04 and Arch Linux.

### Format choice: AppImage for release, RPM for hand-off

Linux desktop apps in this space split across formats: VS Code ships `.deb` + `.rpm` + Snap; Discord ships AppImage + `.deb`; Slack ships `.deb` + `.rpm`; Cursor and Obsidian ship AppImage. AppImage stays the release-published artifact because one file covers the widest glibc-compatible target without distro repositories, store packaging, signing infrastructure, or per-format install scripts, and it integrates cleanly with the namespace-scoped install layout. The RPM target is available for handing a build to an end user on Fedora/RHEL/openSUSE whose distro does not ship `libfuse2`; the `.deb` target is tracked in #6010. Publishing either native package through the release pipeline (metadata, checksums, feed, signing) is a separate decision.

### Out of scope (later phases)

- AppImage signing (`--signed`) — deferred pending a GPG key infrastructure decision and a user-facing verification flow design (no ETA).
- AppImage auto-update feed (`latest-linux.yml`) — the linux electron-builder config has no `publish` block wired, so a generated feed would point users at a feed that never updates. Tracked alongside signing.
- Publishing `.rpm` through the release lanes — the build target exists, but release metadata, checksums, signing, repository ownership, and install/remove hook validation do not. The `.deb` target itself is tracked in #6010. Snap and Flatpak remain deferred entirely.
- Full Linux AppImage and headless packaged smoke remain outside the main PR gate; run the applicable tools-pack validation manually or through a release lane when Linux packaging changes.

`--to dmg` is manual-install DMG output only. Any builder-generated updater metadata such as `latest-mac.yml` or
`.blockmap` files is treated as scratch and cleaned from the builder directory; release-beta generates the authoritative
`latest-mac.yml` feed during release asset preparation, pointing at the update ZIP.

## Branch build timing experiments

`release-beta.yml` supports branch/SHA builds with `publish=false`. For a full
macOS arm64, Intel and Windows packaging comparison, dispatch it from the branch
carrying the workflow and pin `ref` to the commit under test:

```bash
gh workflow run release-beta.yml --ref <branch> \
  -f ref=<commit-sha> -f publish=false \
  -f enable_mac_arm64=true -f enable_mac_x64=true -f enable_win_x64=true \
  -f enable_linux_x64=false \
  -f mac_arm64_target=all -f mac_x64_target=all -f win_x64_target=all \
  -f mac_arm64_sign_mode=notarize -f mac_x64_sign_mode=notarize \
  -f mac_arm64_smoke_mode=core -f mac_x64_smoke_mode=core -f win_x64_smoke_mode=core
```

This creates test artifacts and isolated dogfood downloads without changing any
channel's latest metadata. Windows signing remains off by default. `core`
checks installation/startup; it does not exercise the full updater lifecycle.
If the branch's packaged version is behind the current stable/beta feed, add
`-f force=true` while retaining `-f publish=false` to permit that test build.
Web source, tests and generated route types are validated in an independent
same-commit job. Stable retains its existing verification gate; prerelease
retains its independently dispatched, advisory verification.

Compare build step times separately from queueing, dependency installation,
Apple notarization/retries, artifact availability, smoke, and cache transfer.
The Windows outer cache keeps at most the newest complete entry per build layer
within a 6 GiB payload budget. Final installers, portable ZIPs and unpacked trees
remain reusable: dropping them made same-source repeat builds slower in the
timing experiment. Historical copies are discarded. The cache snapshot's `sizes.json` reports
retained/removed bytes by node. Snapshot compression/upload still costs time
in the build job; saving the GitHub cache and pruning old outer caches run in
`cache-maintenance.yml`, outside release concurrency. Cache maintenance failure
does not change the build's artifact validity.

A changed outer cache prefix starts cold. Measure a second run at the same
commit to assess the warm-cache tradeoff, and compare equivalent runner images,
artifact targets and signing modes. A single run is observational evidence,
not a stable percentage saving. `publish=false` also skips PostHog sourcemap
upload, so its total duration is not directly comparable with a publishing run.
