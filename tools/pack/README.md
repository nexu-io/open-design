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
- `user-data/` is the Electron/Chromium `userData` root, with `user-data/session/` used for `sessionData`.

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
own default fallback for non-packaged launches, but packaged runtime must not rely on fallback inference from Electron
`userData`, app bundle names, or ports.

The current release slice is mac beta publication. Runtime updater integration and Windows packaging remain later phases.

Electron-builder resources live under `tools/pack/resources/mac/`. The current logo is staged there as the mac icon/DMG
placeholder so future design-provided assets can replace the resource files without changing packaging code.

Local developer artifacts bake the tools-pack namespace runtime root so `tools-pack mac start/stop/logs/cleanup` can manage
them from the repo. Release artifacts use `--portable` so the installed app resolves namespace data/log/runtime/user-data
from the user's Electron `userData` root instead of the build machine's `.tmp` path.

## Linux

Local lifecycle commands:

- `tools-pack linux build --to all` (default; produces AppImage)
- `tools-pack linux build --to appimage` (explicit AppImage)
- `tools-pack linux build --to dir` (unpacked output for fast iteration)
- `tools-pack linux build --containerized` (run electron-builder inside `electronuserland/builder:base` Docker for distro-agnostic glibc compat — requires Docker)
- `tools-pack linux build --to all --portable` (release artifacts that must not bake local tools-pack runtime paths)
- `tools-pack linux install`
- `tools-pack linux start`
- `tools-pack linux stop`
- `tools-pack linux logs`
- `tools-pack linux uninstall`
- `tools-pack linux cleanup`

Build artifacts are namespace-scoped under `.tmp/tools-pack/out/linux/namespaces/<namespace>/`. Packaged runtime state is namespace-scoped under `.tmp/tools-pack/runtime/linux/namespaces/<namespace>/{data,logs,runtime,cache,user-data}/`. Containerized build cache lives under `.tmp/tools-pack/.docker-cache/{electron,electron-builder}/`.

Local installs use XDG paths:

- AppImage: `~/.local/bin/Open-Design.<namespace>.AppImage`
- Menu entry: `~/.local/share/applications/open-design-<namespace>.desktop`
- Icon: `~/.local/share/icons/hicolor/512x512/apps/open-design-<namespace>.png`

The `<namespace>` suffix is unconditional so multiple developer namespaces can coexist on the same desktop. The `.desktop` file registers the `od://` scheme via `MimeType=x-scheme-handler/od;` and pre-sets `OD_NAMESPACE` on the `Exec=` line so menu launches identify the correct namespace.

### AppImage launch mode (FUSE caveat)

`tools-pack linux start` always spawns the AppImage with `--appimage-extract-and-run`. Smoke testing on Ubuntu 24.04 and Arch Linux showed that direct FUSE-mounted AppImage launches make Node module loads (Express, better-sqlite3, etc.) slow enough that the daemon sidecar consistently failed to clear `apps/packaged`'s 35-second startup timeout. Extract-and-run unpacks the AppImage into `/tmp/appimage_extracted_<hex>/` and exec's the inner Electron from there, bypassing FUSE and getting daemon boot in under 5 seconds — roughly an order-of-magnitude improvement.

**Implication for end-users:** if launching the installed AppImage manually (not via `tools-pack linux start`), pass `--appimage-extract-and-run` yourself, or rely on a desktop launcher / `appimage-launcher` daemon that handles extract-and-run automatically.

### Optional system tools

`tools-pack linux install` and `tools-pack linux uninstall` invoke `update-desktop-database` and `gtk-update-icon-cache` as best-effort post-hooks. Either tool being absent (`iconCache: "missing"` in the output) is harmless — the icon and menu entry still work, the cache just isn't refreshed. Install via your distro:

- Arch / CachyOS: `sudo pacman -S desktop-file-utils gtk-update-icon-cache`
- Debian / Ubuntu: `sudo apt install desktop-file-utils gtk-update-icon-cache`
- Fedora: `sudo dnf install desktop-file-utils gtk-update-icon-cache`

`libfuse2` is needed for FUSE-mounted AppImage launch (the default mode when running an AppImage directly without `--appimage-extract-and-run`). `tools-pack linux start` always uses extract-and-run and bypasses FUSE entirely, so it does not need `libfuse2`. Most modern distros ship `libfuse2` by default; older Ubuntu LTS hosts may need `sudo apt install libfuse2t64` (or `libfuse2` on pre-24.04).

### Sandbox / chrome-sandbox

Electron 41 on Linux requires `kernel.unprivileged_userns_clone=1` (default on Arch, Ubuntu 24+, Debian 12+) or AppImage's `--no-sandbox` fallback. Most modern distros need no extra setup.

### Distro-agnostic guarantee

AppImages built natively on a rolling distro (e.g., Arch / CachyOS) link against recent glibc and may not run on stable distros (Ubuntu 22.04, Debian 12). Use `--containerized` to build against the wide-compat `electronuserland/builder:base` baseline (Ubuntu 18.04 / glibc 2.27).

### Format choice: why AppImage first

Linux desktop apps in this space split across formats: VS Code ships `.deb` + `.rpm` + Snap; Discord ships AppImage + `.deb`; Slack ships `.deb` + `.rpm`; Cursor and Obsidian ship AppImage. We start with AppImage because it is universal (one artifact runs on any glibc-compatible distro), needs no repo plumbing, and integrates cleanly with the namespace-scoped install layout. `.deb` / `.rpm` / Snap / Flatpak can land incrementally if user demand surfaces.

### Out of scope (later phases)

- AppImage signing (`--signed`) — deferred pending a GPG key infrastructure decision and a user-facing verification flow design (no ETA).
- AppImage auto-update feed (`latest-linux.yml`) — the linux electron-builder config has no `publish` block wired, so a generated feed would point users at a feed that never updates. Tracked alongside signing.
- Additional package formats: `.deb`, `.rpm`, Snap, Flatpak.
- Linux entry in `ci.yml` (release lanes only build linux; PR validation does not yet).

`--to dmg` is manual-install DMG output only. Any builder-generated updater metadata such as `latest-mac.yml` or
`.blockmap` files is treated as scratch and cleaned from the builder directory; release-beta generates the authoritative
`latest-mac.yml` feed during release asset preparation, pointing at the update ZIP.
