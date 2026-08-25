# Electron Shell foundation

The product layer is deliberately thin. It declares identity, window policy,
the `od://` handler, and adapters supplied by `@open-design/electron-kit`.

```sh
pnpm -C shells/electron dev
pnpm -C shells/electron dev -- --headless
pnpm -C shells/electron pack
```

Headless mode completes the same lifecycle, explicit-readiness, protocol, and
hidden-renderer mount sequence without creating a splash or revealing/focusing
a window. `ELECTRON_KIT_HEADLESS=1` is the environment equivalent.

`pack` emits a macOS `.app` and `.dmg` under `dist/` on macOS. Windows emits a
directory build and NSIS installer on a Windows host. The current lifecycle is
the replaceable phase-one fixture; it does not import Closure implementation.
The standard `prepack` lifecycle intentionally points at the same Shell-owned
`scripts/pack.mjs` shim, because pnpm reserves `pack` as a built-in command.
`node-lock.json` is Shell-local but byte-for-byte aligned with Terminal's
official Node lock; tests prevent the two supported carriers from drifting.
