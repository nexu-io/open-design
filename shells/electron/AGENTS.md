# shells/electron

Follow the root `AGENTS.md` first. This directory owns the OpenDesign Electron
Shell and the typed adapter boundary consumed by repository tools.

## Ownership

- `config/` declares product identity, Shell compatibility, runtime policy,
  platform policy, and distribution policy.
- `src/` composes product handlers and adapters over `electron-kit`.
- Public `/build` and `/lifecycle` exports own the tool-facing composition boundary.
  `/lifecycle/inspection` is the lightweight diagnostic/CDP leaf for relocatable
  controllers: it must not load build dependencies or launch a runtime. Location
  inspection is read-only; explicit CDP updater calls use the running product contract.
  Local callers use typed functions, not private source paths or adapter subprocesses.
  tools-release exposes scene/distribution commands over `/build`; manifest
  resolution is internal product composition, not a separate command or file RPC.
- `src/adapters/tools/` owns product tool request parsing and composition; it consumes public Sidecar atoms only for the Electron process and observes shared resources without retiring them. Production shared-resource retirement remains in the Standalone runtime adapter under its guard. Never import scripts as a library or import these tool adapters into the production runtime.
- `src/adapters/tools/lifecycle/` owns dev/installed control-plane behavior, not
  Carrier bytes. Exact planning binds it and `/lifecycle` to Shell tests and
  installed acceptance, not Carrier builds. Build recipes and installation
  composition stay outside this directory and retain their build identity.
- Tool dev/pack schema 2 consumes local installation files. Loopback fixture acquisition belongs to tools-dev/tools-pack via the tools-serve fixture client, not to Shell or electron-kit. Product installation assembly is shared with exact distribution and must preserve prebuilt scene authority bytes.
- `tests/` validates Shell policy and both Shell/Closure updater handler lines.

`electron-kit` owns reusable Electron mechanics. `electron-contract` is the
browser-safe declaration leaf in that build closure. App producers and web
consumers declare capabilities without knowing the private symbol-backed
context bridge; do not expose `window.__od__` or another public physical
locator.

Tools must not import `electron-kit` directly. Keep tools-facing adapters
strict, typed, and explicit about absolute paths, channel, namespace,
release version, and operation schema.

Native CDP is enabled only through Electron launch arguments. `tools-dev`
enables it by default; any distributed Shell may enable it through explicit
argument injection. Inspect combines Shell lifecycle/status/log observations
with native CDP discovery rather than defining a separate debug protocol.

macOS Dock presentation controls only the current process. User “Keep in Dock”
state belongs to macOS and resolves through stable bundle identity. Linux has
only its symmetric declaration in this PR and no distribution delivery.
