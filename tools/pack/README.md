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

Finder/manual launches cannot carry argv stamps on the root desktop process. To keep process fallback safe,
`shells/electron` writes `runtime/desktop-root.json` with the desktop stamp, PID, executable path, app path, and log path.
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

`--to dmg` is manual-install DMG output only. Any builder-generated updater metadata such as `latest-mac.yml` or
`.blockmap` files is treated as scratch and cleaned from the builder directory; release workflows generate the authoritative
feed during release asset preparation, pointing at the update ZIP.

## Linux

Linux has no packaged-delivery promise in this release architecture. Expert users may build the source workspace directly,
but `tools-pack`, installers, release metadata, and CI delivery gates cover only macOS and Windows.
