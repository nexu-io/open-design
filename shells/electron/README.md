# Electron Shell foundation

The product layer is deliberately thin. It declares identity, window policy,
the `od://` handler, ready-before preflight policy, concrete warmup topology, and adapters supplied to
`@open-design/electron-kit`. `config/runtime.json` owns both the ordered warmup
declaration and finite locale/connection preflight selection; electron-kit owns
only graph lifecycle, validation, and its public carrier/Standalone atoms.
Concrete host exemptions remain in that Shell config and are applied before app
readiness. `config/distribution.json` separately owns the finite macOS/Windows artifact and NSIS
presentation policy. `config/platforms/windows.json` owns install scope, publisher, and uninstall
data retention; electron-kit derives registry endpoints from it plus `shell.json`, while this Shell
schedules post-ready registry reconciliation. These policies are consumed only by the relevant
runtime or pack projection; the assembled scene remains independent of distribution and release policy.
Desktop handlers will follow the same declaration pattern after the real
Sidecar readiness adapter lands: Shell JSON and Shell code own the finite
message topology, normalizer, and executors, while electron-kit only owns the
bound Sidecar control-session lease. The phase-one fixture intentionally does
not publish a temporary desktop handler protocol.

```sh
pnpm -C shells/electron dev
pnpm -C shells/electron dev -- --headless
pnpm -C shells/electron pack
```

Headless mode completes the same lifecycle, explicit-readiness, protocol, and
hidden-renderer mount sequence without creating a splash or revealing/focusing
a window. `ELECTRON_KIT_HEADLESS=1` is the environment equivalent.

For the fixture update proof, point `OD_UPDATE_METADATA_URL` at a
`tools-serve updater` metadata endpoint. Setting
`ELECTRON_KIT_FIXTURE_PREPARE_UPDATE=1` makes the fixture Closure schedule the
Shell-owned check/download path. Adding `ELECTRON_KIT_FIXTURE_INSTALL_UPDATE=1`
exercises the shared lifecycle transition and orderly after-quit installer
handoff; `ELECTRON_KIT_FIXTURE_INSTALLER_VERIFY_ONLY=1` keeps that proof safe by
re-verifying the artifact and writing the detached-helper receipt without
opening it.

`pack` emits a macOS `.app` and `.dmg` under `dist/` on macOS. Windows emits a
directory build and NSIS installer on a Windows host. The current lifecycle is
the replaceable phase-one fixture; it does not import Closure implementation.
The standard `prepack` lifecycle intentionally points at the same Shell-owned
`scripts/pack.mjs` shim, because pnpm reserves `pack` as a built-in command.
`config/carriers/node-lock.json` is Shell-local but byte-for-byte aligned with Terminal's
official Node lock; tests prevent the two supported carriers from drifting.
The lock is consumed by the thin `dev.mjs`/`pack.mjs` shims and the packaged
runtime. The verified carrier executes bootstrap/lifecycle helpers; electron-kit
does not expose a bin and the Shell never imports another Shell at runtime.
