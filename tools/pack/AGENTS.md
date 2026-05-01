# tools/pack

Follow the root `AGENTS.md` and `tools/AGENTS.md` first. This tool owns the repo-external packaged build/start/stop/logs command surface.

## Owns

- Local packaging orchestration for packaged Open Design artifacts.
- mac-first build/install/start/stop/logs/uninstall/cleanup smoke commands.
- Consuming sidecar/process/path primitives from `@open-design/sidecar-proto`, `@open-design/sidecar`, and `@open-design/platform`.

## Does not own

- Product business logic.
- Sidecar protocol definitions.
- A second process identity model.
- Product/business update runtime integration.

## Rules

- Do not hand-build `--od-stamp-*` args; use `createProcessStampArgs` with `OPEN_DESIGN_SIDECAR_CONTRACT`.
- Do not use port numbers in data/log/runtime/cache path decisions. Namespace decides paths; ports are only transient transports.
- Release artifacts keep canonical `Open Design.app`; local tools-pack installs may use `Open Design.<namespace>.app` only as an install-path/app-bundle naming convention for developer multi-instance validation.
- Do not let namespace-named `.app` installs change data/log/runtime/cache path conventions.
- Use `--portable` for public/release artifacts so packaged config does not bake local tools-pack runtime roots from the build machine.
- Pack resource files used by electron-builder belong under `tools/pack/resources/`; do not point pack logic at Downloads, web public assets, docs assets, or other app-owned resource paths.
