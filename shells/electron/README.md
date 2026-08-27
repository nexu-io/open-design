# Electron Shell foundation

The product layer is deliberately thin. It declares identity, window policy,
the `od://` handler, ready-before preflight policy, concrete warmup topology, and adapters supplied to
`@open-design/electron-kit`. `config/runtime.json` owns both the ordered warmup
declaration and finite locale/connection preflight selection; electron-kit owns
only graph lifecycle, bounded concurrency, required/best-effort failure semantics,
receipts, validation, and its public carrier/Standalone atoms. The placeholder resource
prewarm node is a concrete Shell executor and the renderer consumes the warmed value.
`src/main.ts` is only the process entry, `src/composition/definition.ts` is the
single composition root, and `src/adapters/` contains concrete renderer, updater,
installer, and platform bindings. This is an internal observation boundary for a
possible later Desktop extraction, not a Desktop framework or public protocol.
Concrete host exemptions remain in that Shell config and are applied before app
readiness. `config/distribution.json` separately owns the finite macOS/Windows artifact and NSIS
presentation policy. `shell.json` owns the single publisher/product identity; `config/platforms/windows.json`
owns install scope and uninstall data retention. electron-kit derives registry endpoints from those declarations, while this Shell
schedules post-ready registry reconciliation. These policies are consumed only by the relevant
runtime or pack projection; the assembled scene remains independent of distribution and release policy.
`config/platforms/mac.json` declares a regular interactive application: electron-kit
uses `app.setActivationPolicy`, `app.dock.show()` and `app.dock.hide()` only for
the current process presentation. A user's “Keep in Dock” choice is persisted
and matched to the stable bundle identity by macOS; neither the Shell nor
electron-kit stores, infers, pins, or unpins that state.
Desktop handlers land only after the Standalone logical-handoff and Sidecar
runtime-handle contracts freeze. Shell JSON and Shell code own product
composition, while Sidecar owns private IPC, process identity, guarded physical
lifetime, retirement, and terminal stop. electron-kit does not publish a
transport or control-session wrapper. The phase-one fixture intentionally does
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
opening it. The Shell handler arms that helper before Electron requests quit;
the helper still waits for the Electron parent to exit before acting.

`pack` emits a macOS `.app` and `.dmg` under `dist/` on macOS. Windows emits a
directory build and NSIS installer on a Windows host. Its ephemeral NSIS include
projects the shared Shell identity into App Paths and protocol registration, with
owner-checked cleanup; it is loaded from electron-kit's packaged resources and never
enters the release-neutral scene. The current lifecycle is the replaceable
phase-one fixture. Its `createFixturePorts` adapter and low-level endpoint
registry are explicitly not the production contract, and it does not import
Closure implementation.
The standard `prepack` lifecycle intentionally points at the same Shell-owned
`scripts/pack.mjs` shim, because pnpm reserves `pack` as a built-in command.
`config/carriers/node-lock.json` is Shell-local but byte-for-byte aligned with Terminal's
official Node lock; tests prevent the two supported carriers from drifting.
The lock is consumed by the thin `dev.mjs`/`pack.mjs` shims and the packaged
runtime. The verified carrier executes bootstrap/lifecycle helpers; electron-kit
does not expose a bin and the Shell never imports another Shell at runtime.
