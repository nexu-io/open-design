# tools/pack

Local packaging control plane for Open Design.

The active slice is mac-first local packaging and smoke lifecycle control:

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
Release artifacts keep the canonical `Open Design.app` bundle shape; local `tools-pack install` copies it as
`Open Design.<namespace>.app` so developer namespaces can coexist without affecting runtime data/log/cache paths.

Packaged runtime state is namespace-scoped under `.tmp/tools-pack/runtime/mac/namespaces/<namespace>/`:

- `data/` is the daemon-managed data root passed to the daemon through the packaged sidecar launch environment.
- `logs/` contains packaged process logs for `desktop`, `web`, and `daemon`.
- `runtime/` is the sidecar runtime base used by the packaged desktop/web/daemon process group.
- `cache/` is reserved for namespace-local packaged cache state.
- `user-data/` is the packaged host webview data root, with `user-data/session/` used for `sessionData`.

Finder/manual launches cannot carry argv stamps on the root desktop process. To keep process fallback safe,
`apps/packaged` writes `runtime/desktop-root.json` with the desktop stamp, PID, executable path, app path, and log path.
`tools-pack mac stop` trusts that marker only when namespace/stamp/PID/command validation passes; otherwise it reports the
unmanaged/not-owned reason instead of killing unknown processes.

### `tools-pack mac stop` validation

- If the marker is absent, stop reports `not-running`.
- If the marker PID is gone, stop reports `not-running` and clears the stale marker.
- If the marker PID was reused by an unrelated process, stop reports `unmanaged`.
- If the marker namespace, stamp, runtime root, or command does not match the current namespace, stop reports `unmanaged`.

This keeps `stop` from killing processes outside the current namespace.

Packaged desktop also writes main-process lifecycle logs to `logs/desktop/latest.log` so Finder/manual launches are
diagnosable. This log is intentionally scoped to packaged desktop startup/shutdown/process errors and does not capture
web/renderer console output.

The packaged daemon path contract is explicit: `tools-pack` writes namespace/base config, `apps/packaged` resolves
namespace paths, and the packaged sidecar launcher passes daemon managed paths via launch env. The daemon may keep its
own default fallback for non-packaged launches, but packaged runtime must not rely on fallback inference from host
user-data roots, app bundle names, or ports.

The updater core can check the release metadata feed, download a verified mac DMG or Windows installer, and open the
downloaded installer for manual replacement. Native Tauri host wiring is tracked separately from the packaging path.

Packaged resources live under `tools/pack/resources/mac/`. The current logo is staged there as the mac icon/DMG
placeholder so future design-provided assets can replace the resource files without changing packaging code.

Local developer artifacts bake the tools-pack namespace runtime root so `tools-pack mac start/stop/logs/cleanup` can manage
them from the repo. Release artifacts use `--portable` so the installed app resolves namespace data/log/runtime/user-data
from the user's packaged app data root instead of the build machine's `.tmp` path.

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
- `tools-pack linux build --to dir` (unsupported by the Tauri package path)
- `tools-pack linux build --containerized` (currently unsupported by the Tauri package path)
- `tools-pack linux build --to all --portable` (release artifacts that must not bake local tools-pack runtime paths)
- `tools-pack linux install`
- `tools-pack linux install --headless` (install the headless launcher script instead of the AppImage)
- `tools-pack linux start`
- `tools-pack linux start --headless` (start the headless entry: daemon + web only)
- `tools-pack linux stop`
- `tools-pack linux stop --headless` (stop a running headless process)
- `tools-pack linux inspect` (desktop status, eval, and screenshot for AppImage mode)
- `tools-pack linux inspect --headless` (status only)
- `tools-pack linux logs`
- `tools-pack linux uninstall`
- `tools-pack linux uninstall --headless`
- `tools-pack linux cleanup`
- `tools-pack linux cleanup --headless`

Build artifacts are namespace-scoped under `.tmp/tools-pack/out/linux/namespaces/<namespace>/`. Packaged runtime state is namespace-scoped under `.tmp/tools-pack/runtime/linux/namespaces/<namespace>/{data,logs,runtime,cache,user-data}/`.

Local installs use XDG paths:

- AppImage: `~/.local/bin/Open-Design.<namespace>.AppImage`
- Menu entry: `~/.local/share/applications/open-design-<namespace>.desktop`
- Icon: `~/.local/share/icons/hicolor/512x512/apps/open-design-<namespace>.png`

The `<namespace>` suffix is unconditional so multiple developer namespaces can coexist on the same desktop. The `.desktop` file registers the `od://` scheme via `MimeType=x-scheme-handler/od;` and pre-sets `OD_PACKAGED_NAMESPACE` on the `Exec=` line so menu launches identify the correct namespace.

### Headless mode (`--headless`)

Headless mode targets environments without a display (WSL2, headless servers, CI) where the desktop host can't run. If you have a desktop, use the AppImage; if you're SSH'd into a machine or in WSL, use headless.

`--headless` makes `install`, `start`, `stop`, `uninstall`, and `cleanup` operate on the headless entry (`@open-design/packaged/dist/headless.mjs`) instead of the AppImage. Headless mode runs daemon + web without the desktop host.

- `install --headless` writes a shell launcher at `~/.local/bin/open-design-headless-<namespace>` that bakes in the namespace and resource paths. The launcher is self-contained, but the assembled app directory at those paths must remain in place — don't move it after install.
- `start --headless` spawns the headless process directly, redirects stdout/stderr to `logs/desktop/latest.log`, and waits up to 95s (35s for identity marker + 60s for web URL) before returning.
- `stop --headless` reads the same `runtime/desktop-root.json` identity marker as the AppImage path, validates `stamp.source === PACKAGED`, sends a graceful SHUTDOWN over IPC, then terminates the process tree. It does not perform the AppImage-specific process-command check.
- `inspect --headless` returns status only. Eval and screenshot require AppImage mode because there is no desktop webview in headless mode.
- `uninstall --headless` removes the headless launcher after a safe stop.
- `cleanup --headless` stops the headless process before removing namespace output/runtime roots.

`logs` always reads `logs/desktop/latest.log` regardless of mode, so headless output is visible via `tools-pack linux logs`.

### AppImage launch mode (FUSE caveat)

`tools-pack linux start` always spawns the AppImage with `--appimage-extract-and-run`. Smoke testing on Ubuntu 24.04 and Arch Linux showed that direct FUSE-mounted AppImage launches make Node module loads (Express, better-sqlite3, etc.) slow enough that the daemon sidecar consistently failed to clear `apps/packaged`'s 35-second startup timeout. Extract-and-run unpacks the AppImage into `/tmp/appimage_extracted_<hex>/` and starts the inner bundle from there, bypassing FUSE and getting daemon boot in under 5 seconds — roughly an order-of-magnitude improvement.

**Implication for end-users:** if launching the installed AppImage manually (not via `tools-pack linux start`), pass `--appimage-extract-and-run` yourself, or rely on a desktop launcher / `appimage-launcher` daemon that handles extract-and-run automatically.

### Optional system tools

`tools-pack linux install` and `tools-pack linux uninstall` invoke `update-desktop-database` and `gtk-update-icon-cache` as best-effort post-hooks. Either tool being absent (`iconCache: "missing"` in the output) is harmless — the icon and menu entry still work, the cache just isn't refreshed. Install via your distro:

- Arch / CachyOS: `sudo pacman -S desktop-file-utils gtk-update-icon-cache`
- Debian / Ubuntu: `sudo apt install desktop-file-utils gtk-update-icon-cache`
- Fedora: `sudo dnf install desktop-file-utils gtk-update-icon-cache`

`libfuse2` is needed for FUSE-mounted AppImage launch (the default mode when running an AppImage directly without `--appimage-extract-and-run`). `tools-pack linux start` always uses extract-and-run and bypasses FUSE entirely, so it does not need `libfuse2`. Most modern distros ship `libfuse2` by default; older Ubuntu LTS hosts may need `sudo apt install libfuse2t64` (or `libfuse2` on pre-24.04).

### Distro compatibility target

AppImages built natively on a rolling distro (e.g., Arch / CachyOS) link against recent glibc and may not run on stable distros (Ubuntu 22.04, Debian 12). Release lanes build on GitHub-hosted Ubuntu runners with the native Tauri Linux dependencies installed; broader distro baselines should be handled as a future Linux packaging lane rather than through the removed container path.

Verified smoke coverage in this repository currently includes:

- PR lane: Ubuntu GitHub-hosted runner, headless Linux runtime.
- Release lane: Ubuntu GitHub-hosted runner, native AppImage build plus Xvfb AppImage runtime smoke when the Linux release lane is enabled.
- Manual AppImage behavior used to choose `--appimage-extract-and-run`: Ubuntu 24.04 and Arch Linux.

### Format choice: why AppImage first

Linux desktop apps in this space split across formats: VS Code ships `.deb` + `.rpm` + Snap; Discord ships AppImage + `.deb`; Slack ships `.deb` + `.rpm`; Cursor and Obsidian ship AppImage. We start with AppImage because one artifact can cover the widest glibc-compatible target without distro repositories, store packaging, signing infrastructure, or per-format install scripts, and it integrates cleanly with the namespace-scoped install layout. `.deb` / `.rpm` / Snap / Flatpak can land incrementally when user demand justifies the extra release ownership.

### Out of scope (later phases)

- AppImage signing (`--signed`) — deferred pending a GPG key infrastructure decision and a user-facing verification flow design (no ETA).
- AppImage auto-update feed (`latest-linux.yml`) — deferred until the Linux release feed and installer/update flow have an owner. Tracked alongside signing.
- Additional package formats: `.deb`, `.rpm`, Snap, Flatpak — deferred until there is demand and an owner for per-distro metadata, signing/store/repository plumbing, install/remove hooks, and release validation.
- Full Linux AppImage PR smoke remains release-lane only; PR validation runs the Linux headless packaged smoke because it does not require a display server.

`--to dmg` is manual-install DMG output only. Any builder-generated updater metadata such as `latest-mac.yml` or
`.blockmap` files is treated as scratch and cleaned from the builder directory; release-beta generates the authoritative
`latest-mac.yml` feed during release asset preparation, pointing at the update ZIP.
