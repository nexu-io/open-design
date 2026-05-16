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
- Public release artifacts must use channel-specific app identity: stable uses `Open Design.app`, beta uses `Open Design Beta.app`, and preview uses `Open Design Preview.app` on mac. Local tools-pack installs may still use namespace-scoped install paths only as a developer multi-instance validation convention.
- Do not let namespace-named `.app` installs change data/log/runtime/cache path conventions.
- Use `--portable` for public/release artifacts so packaged config does not bake local tools-pack runtime roots from the build machine.
- Pack resource files used by electron-builder belong under `tools/pack/resources/`; do not point pack logic at Downloads, web public assets, docs assets, or other app-owned resource paths.
- For ordinary Windows NSIS smoke tests, use short namespaces such as `rg`, `smoke`, or `nsis-a`. NSIS extracts deeply nested Next.js standalone files under the namespace-scoped install directory; long namespaces can push installed paths past the traditional Windows 260-character limit even when builder `win-unpacked` output is correct. During merge regression, namespace `regression-merge-nsis` produced an installed path length of 264 characters and missed `next/dist/server/route-matcher-providers/helpers/cached-route-matcher-provider.js` in the installed directory, while the same NSIS smoke passed with namespace `rg`. Use long namespaces only when intentionally testing installer path-length behavior.
