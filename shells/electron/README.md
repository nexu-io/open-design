# Electron Shell foundation

The product layer is deliberately thin. It declares identity, window policy,
the `od://` handler, ready-before preflight policy, concrete warmup topology, and adapters supplied to
`@open-design/electron-kit`. `config/runtime.json` owns both the ordered warmup
declaration and finite locale/connection preflight selection; electron-kit owns
only graph lifecycle, bounded concurrency, required/best-effort failure semantics,
receipts, validation, and its public carrier/Standalone atoms. The renderer resource
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

`config/splash-media.json` contains the unchanged transparent VP9/WebM brand
clip from gold `715c0cb9d8ffdedd47d8c27a78a1d5dfdb2dc201`, originally
`shells/electron/src/main/splash-video.ts` (SHA-256
`bb1c0530000a5bfe58becb53d2b8264486c1180efa9ba02fa2f41c4f6db5ce9b`).
It is embedded in the Shell build closure, independent of Web and offline before
Closure startup. The Shell retains the 1280×900 light startup window and 2000 ms
minimum overlapping startup. electron-kit owns sandboxed, non-looping media
presentation and stage feedback; the old progress bridge and boot authority are
not retained. `tools-dev` waits for explicit business readiness; inspect exposes
native CDP while starting, and logs retain diagnostic locations after exit
without preserving stale process/CDP state.
The manifest embeds the original product PNG icon (SHA-256
`3141cc3b348ac538c68d615cde8cf642abc0b1fb60f44a520853b499982a74cb`).
The same bytes drive process-local macOS Dock presentation and native bundle
icon generation; neither path depends on a Web resource server or changes Dock
pinning preferences.
The renderer adapter fixes its main-frame identity at mount time, opens foreign
HTTP(S) navigation in the system browser, limits child windows to the Shell's
own protocol host plus Blob/about:blank, and admits embedded browsers only in a
dedicated persistent partition with sandboxing and navigation revalidation.
These are retained product security behaviors from the gold/current Desktop;
renderer code cannot widen the allowlists or supply a preload path.
Shell JSON and Shell code own product
composition, while Sidecar owns private IPC, process identity, guarded physical
lifetime, retirement, and terminal stop. electron-kit does not publish a
transport or control-session wrapper. The deleted phase-one fixture is not a
fallback path and no temporary desktop handler protocol is published.

```sh
pnpm -C shells/electron dev
pnpm -C shells/electron dev -- --headless
pnpm -C shells/electron pack
```

Headless mode completes the same lifecycle, explicit-readiness, protocol, and
hidden-renderer mount sequence without creating a splash or revealing/focusing
a window. `ELECTRON_KIT_HEADLESS=1` is the environment equivalent.

`pack` emits a macOS `.app` and `.dmg` under `dist/` on macOS. Windows emits a
directory build and NSIS installer on a Windows host. Its ephemeral NSIS include
projects the shared Shell identity into App Paths and protocol registration, with
owner-checked cleanup; it is loaded from electron-kit's packaged resources and never
enters the release-neutral scene. The production `createStandaloneAuthority`
adapter consumes signed exact content, the Standalone updater/runtime-handle
contracts, and Sidecar guarded resource sets; the Shell does not import Closure
implementation.
The standard `prepack` lifecycle intentionally points at the same Shell-owned
`scripts/pack.mjs` shim, because pnpm reserves `pack` as a built-in command.
`config/carriers/node-lock.json` is Shell-local but byte-for-byte aligned with Terminal's
official Node lock; tests prevent the two supported carriers from drifting.
The lock is consumed by the thin `dev.mjs`/`pack.mjs` shims and the packaged
runtime. The verified carrier executes the production Fossil host; electron-kit
does not expose a bin and the Shell never imports another Shell at runtime.
