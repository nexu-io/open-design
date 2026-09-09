# shells/electron

Follow the root `AGENTS.md` first. This directory owns the OpenDesign Electron
Shell and the typed adapter boundary consumed by repository tools.

## Ownership

- `config/` declares product identity, Shell compatibility, runtime policy,
  platform policy, and distribution policy.
- `src/` composes product handlers and adapters over `electron-kit`.
- Public `/build` and `/lifecycle` exports own the tool-facing composition boundary.
  `/build/contracts` is the pure artifact metadata leaf; release controllers and
  fixtures must not visit native compiler/installer modules to compose metadata.
  `/lifecycle/inspection` is the lightweight diagnostic/CDP leaf for relocatable
  controllers: it must not load build dependencies or launch a runtime. Location
  inspection is read-only; explicit CDP updater calls use the running product contract.
  Installed manifest inspection delegates to the isolated Kit ASAR reader and
  returns actual physical bytes/identity, never a caller's expected release receipt.
  Local callers use typed functions, not private source paths or adapter subprocesses.
  tools-release exposes scene/distribution commands over `/build`; manifest
  resolution is internal product composition, not a separate command or file RPC.
- `src/adapters/tools/` owns product tool request parsing and composition; it consumes public Sidecar atoms only for the Electron process and observes shared resources without retiring them. Production shared-resource retirement remains in the Standalone runtime adapter under its guard. Never import scripts as a library or import these tool adapters into the production runtime.
- `src/adapters/tools/lifecycle/` owns dev/installed control-plane behavior, not
  Carrier bytes. Exact planning binds it and `/lifecycle` to Shell tests and
  installed acceptance, not Carrier builds. Build recipes and installation
  composition stay outside this directory and retain their build identity.
- Tool dev/pack schema 2 consumes local installation schema 4, including a signed
  Capsule manifest and exact archive, without Closure payload seeds. Loopback fixture
  acquisition belongs to tools-dev/tools-pack via the tools-serve fixture client,
  not to Shell or electron-kit. Product installation assembly is shared with exact
  distribution and must preserve prebuilt scene authority bytes. Distribution
  explicitly projects only installation resources and the current prepared Capsule;
  scene build inputs must not become implicit installer payloads.
- `tests/` validates Shell policy and both Shell/Closure updater handler lines.
- Scene assembly accepts only the two-entry `closure.runtime-resources.build`
  collection. Independent data archives belong to tools-release preparation,
  not scene inputs or installer resources.
- Scene requests do not accept a caller-supplied buildHash. Kit derives physical
  carrier content identity during assembly; release composition consumes the
  verified scene manifest rather than substituting a workflow plan identity.
- Capsule composition consumes the explicit installed manifest; never bundle a
  default release manifest into its independently built product content.
- Startup reads the durable Capsule selection before accessing the bundled
  first-install seed. A current/pending Capsule uses the sealed installation
  trust root independently; missing or invalid selected state never falls back
  to the seed. Empty lineage materializes the exact local seed without network.
  Explicit recovery follows the same selection authority and uses a historical
  seed only for the identical pinned target when its local caches are unavailable.
  Signed Capsule platform resources prepare through Standalone after the first
  screen; recovery verifies that same descriptor under the stopped-session guard.
  Normal startup never substitutes the installation's former platform tree.
  Dev, pack and scene assembly do not accept a Node archive or build/embed a
  platform tree. Independent platform production is exposed through `/build`;
  tools-release owns its acquisition and release-neutral artifact receipt.
- `config/appearance.json` owns Capsule window/loading declarations and channel
  title overrides. Physical manifest schema 2 excludes these presentation fields;
  keep OS product identity, icons and installer endpoints physical.
- `config/carrier.json` owns fixed preflight and physical lifecycle budgets;
  it is the only runtime policy file copied into the physical scene. Capsule
  owns `config/runtime.json` warmup/recovery policy and must not redeclare preflight.
  Capsule protocol v6 expresses this boundary and carrier-owned final startup
  commit plus first-screen-before-Node preparation; regenerate local v1–v5 experiment
  artifacts instead of adding compatibility aliases for their definition shape.
- Compose the public electron-capsule startup presentation with product media;
  do not put loading HTML or DOM mechanics back into Shell adapters or kit.
- The Capsule entry exports the product definition factory and the public
  electron-capsule session runner. It receives established carrier identity and
  startup authority; do not recreate OS listeners, platform discovery or quit
  protection in product composition.
- The verified loader supplies composite Shell capability separately from the
  installed manifest. Closure attachment/compatibility uses that capability;
  installer confirmation, LKG capture and carrier compatibility use the physical
  manifest identity. Provider schema 3 carries both explicitly, together with
  the fixed carrier runtime root used to observe restart activation. Never turn
  Capsule-provided capability into proof of a replaced installation.

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
