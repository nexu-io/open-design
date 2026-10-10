# Open Design — Flatpak (community distribution)

`io.open-design.desktop.json` is a [flatpak-builder](https://docs.flatpak.org/en/latest/flatpak-builder.html)
manifest that packages the prebuilt Electron tree produced by
`pnpm tools-pack linux build --to dir` (the `linux-unpacked` output) into a
user-local Flatpak. It is a community/experimental distribution channel —
not part of the release pipeline (Linux distro targets are build-only and
explicit-opt-in; see `tools/pack/AGENTS.md`).

The manifest does not compile anything: it copies the already-built
`linux-unpacked` tree into `/app/open-design`, installs a launcher at
`/app/bin/open-design`, and registers a desktop entry and icon.

## Sandbox: loose by design

The `finish-args` intentionally grant a wide sandbox because Open Design is
an agent workspace: it spawns the user's own coding-agent CLIs (`claude`,
`codex`, `gemini`, `cursor-agent`, …), which live in the user's home
directory and need the network, and it reads/writes user projects.

| Finish arg | Why |
| --- | --- |
| `--share=network` | Daemon/API traffic, agent CLIs, update checks |
| `--share=ipc` | X11/shared-memory rendering |
| `--socket=x11` / `--socket=wayland` | GUI (XWayland or native Wayland) |
| `--socket=pulseaudio` | Audio playback in previews |
| `--socket=session-bus` | The packaged sidecar daemon and the agent CLIs it
  spawns expect a reachable D-Bus session bus; flatpak scrubs
  `DBUS_SESSION_BUS_ADDRESS`, so the launcher also defaults it to
  `unix:path=$XDG_RUNTIME_DIR/bus` |
| `--device=dri` | GPU rendering |
| `--filesystem=home` | Project files, agent CLI homes, packaged data paths |
| `--talk-name=org.freedesktop.Notifications` | Desktop notifications |

This is **not** a Flathub-grade locked-down sandbox. Anyone evaluating the
Flatpak for security-sensitive use should treat it as roughly "app with
network + home access", comparable to the `.rpm`/`.deb`/AppImage channels.

## Requirements

- `flatpak` + `flatpak-builder` (tested with flatpak 1.18.4, flatpak-builder 1.4.12)
- Runtime `org.freedesktop.Platform`/`org.freedesktop.Sdk` **26.08** and base
  app `org.electronjs.Electron2.BaseApp//26.08` from Flathub:

  ```bash
  flatpak install --user -y flathub \
    org.freedesktop.Platform//26.08 org.freedesktop.Sdk//26.08 \
    org.electronjs.Electron2.BaseApp//26.08
  ```

## Rebuild

```bash
# 1. Produce the unpacked app tree (skip if it already exists and is current)
pnpm tools-pack linux build --to dir

# 2. Build (from the repository root; build-dir/ is scratch and not committed)
flatpak-builder --user --force-clean --jobs=1 build-dir \
  packaging/flatpak/io.open-design.desktop.json

# 3. Install into the local user installation
flatpak-builder --user --install --force-clean --jobs=1 build-dir \
  packaging/flatpak/io.open-design.desktop.json

# 4. Run
flatpak run io.opendesign.desktop
```

`--jobs=1` keeps the build sequential; the sources are large (~0.5 GiB) and
parallel extraction is memory-hungry. Remove `build-dir/` whenever you want —
it is pure scratch and regenerates on the next build.

The source `dir` path in the manifest is resolved relative to the manifest
file, so the build must run against a checkout that contains a fresh
`.tmp/tools-pack/out/linux/namespaces/default/builder/linux-unpacked/`.

## Uninstall

```bash
flatpak uninstall --user io.opendesign.desktop
# optionally also drop app data kept in the home directory by hand
```

## Design notes

- **Electron sandboxing:** Electron's built-in chrome-sandbox cannot use
  user namespaces inside a Flatpak, so Electron apps normally route through
  **zypak** (shipped by `org.electronjs.Electron2.BaseApp`). With BaseApp
  26.08, though, zypak's spawn sandbox re-launches app children inside its
  own bwrap namespace with a scrubbed environment, and this app's sidecar
  supervisor then dies with `SIGABRT` in `zypak-helper`
  (`DetermineZygoteStrategy` D-Bus portal probe) before the daemon becomes
  ready. The launcher therefore sets `ELECTRON_DISABLE_SANDBOX=1` and execs
  Electron directly: Chromium's *inner* sandbox is disabled while the
  Flatpak sandbox remains the outer process/filesystem boundary. Revisit
  zypak when the BaseApp/zypak interplay with multi-process Node children
  is fixed.
- **Naming:** the desktop entry and icon deliberately use space-free,
  id-like names. Flatpak only exports a desktop entry whose *file name* is
  `<app-id>.desktop`, so the entry ships as
  `io.opendesign.desktop.desktop` (desktop-file id `io.opendesign.desktop`,
  matching the app id) and the icon as `io.opendesign.desktop.png`. Flatpak
  validates exported icons at 512x512 max, so the build downscales the
  1024x1024 source icon (`tools/pack/resources/linux/icon.png`, the same
  file the `.rpm`/`.deb`/AppImage lanes use) to 512x512 into
  `hicolor/512x512/apps` at build time. The `.rpm`
  channel ships `Open Design.desktop` / `Open Design.png`, and spaces in
  icon names are a known problem on KDE.
- **App ID:** `io.opendesign.desktop`. Flatpak rejects D-Bus-style app ids
  whose hyphen is not in the last segment, so the earlier candidate
  `io.open-design.desktop` is not buildable; the hyphen-free form keeps the
  same shape (`reverse-domain` + `.desktop`). The manifest *file* keeps its
  historical `io.open-design.desktop.json` name.
- **Runtime pin:** 26.08 (freedesktop platform + matching Electron BaseApp).
  Bump `runtime-version`/`base-version` together when rebasing.
- **Known artifact caveat (2026-10-05):** this manifest wraps whatever
  `linux-unpacked` tree exists, and the current Linux packaged artifact
  cannot fully boot its web sidecar: `@open-design/web`'s `next.config.ts`
  reads `apps/web/...` fingerprint inputs under `WORKSPACE_ROOT` at config
  load, which does not exist in the packaged tree, so `next` exits 1 and the
  app quits (`SidecarBootstrapGenerationRetiredError`, exit 75). This
  reproduces outside the Flatpak with the same artifact (installed `.rpm`
  tree) and belongs to the Linux packaging lane (the mac lane ships a web
  standalone via an after-pack hook; `linuxResources` has none), not to the
  Flatpak manifest.
