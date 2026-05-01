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

`--to dmg` is manual-install DMG output only. Any builder-generated updater metadata such as `latest-mac.yml` or
`.blockmap` files is treated as scratch and cleaned from the builder directory; release-beta generates the authoritative
`latest-mac.yml` feed during release asset preparation, pointing at the update ZIP.
