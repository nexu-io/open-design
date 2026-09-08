# Electron Kit guide

Follow the root and `packages/AGENTS.md` guidance first.

- Own reusable Electron process, cold-start, window, fixture lifecycle, updater-provider, scene, and distribution mechanics.
- Own fixed carrier identity, platform integrity, startup/quit barriers and public
  atomic mechanics. Updatable session/warmup/renderer orchestration belongs to
  electron-capsule; concrete graphs, product Sidecar messages, Web readiness,
  routes, handlers, labels and resource identities stay in shells/electron.
- Normal carrier startup and explicit recovery share the canonical runtime-root
  session lease, acquired before platform/activation/Capsule work. The running
  carrier retains it until process death. Use Platform kernel ownership, not a
  copied transport/port-lock implementation or stale-file deletion; this lease
  never replaces Sidecar resource retirement or Standalone state authority.
- Treat Shell JSON as the authority for concrete topology and policy values, including warmup nodes and preflight host exemptions. Validate and execute finite atoms without turning JSON into an executable language or teaching electron-kit what a declared product value means.
- Warmup owns bounded concurrency, dependency ordering, required/best-effort failure semantics, timeout/cancellation, receipts, and disposal. Shell owns concrete resource ids, labels, executor bindings, and warmed values; renderer/Web adapters consume those values without exposing them to Closure.
- Keep concrete macOS/Windows distribution and installer policy in Shell JSON. electron-kit may validate a finite supported matrix and translate it to builder configuration; distribution policy must not leak into the release-neutral scene.
- Keep persistent cache roots, cache files, convergence graphs, hit/miss policy, retention, and immutable artifact registration outside electron-kit. `tools-pack` owns build-work reuse, `tools-release` owns verified final-artifact reuse, and convergence may cache only opaque scene products.
- A verified signed artifact is byte-immutable. `distribution/projection/` may model copy/wrap/sidecar metadata after reuse, but build information that must enter signed bytes is a pre-sign identity input and requires a rebuild.
- `/installation/inspection` reads the actual packed physical manifest and hashes
  the same archive snapshot without launching Electron or changing installed state.
  Keep its ASAR reader isolated from runtime exports; observation is not platform
  signature verification and never substitutes Capsule capability for carrier identity.
- Capsule content builds emit release-neutral bytes and a content descriptor;
  public contracts compose version and compatibility metadata without loading a
  compiler. Keep build-cache policy and final signature authority in tools.
- Capsule protocol v5 supplies a verified composite Shell identity alongside the
  immutable physical manifest. Its build hash binds carrier build inputs and
  exact Capsule content, excluding release versions; its runtime digest binds
  the full authenticated combination. Do not accept module-exported identity
  or use composite capability as physical installer proof.
- Capsule returns exact renderer-ready evidence only after installing its runtime
  owners. The carrier validates that evidence, owns the final durable activation
  commit and releases the startup quit barrier. Do not expose either commit method
  to Capsule or log complete startup from its partial initialization path.
- Loading documents, animation, DOM updates and startup/session sequencing belong
  to electron-capsule. Establish presentation permission, physical integrity and
  activation/quit protection before invoking its versioned startup entry. Native
  launch ingress is registered before loading and delivers only typed events.
- `/capsule-loader` is the Node-safe verification/loading leaf. Recovery inspection must
  authenticate the same signed manifest, compatibility edges and exact materialized
  bytes as execution without evaluating candidate code. An inspection receipt
  never bypasses revalidation by the one-load-per-process carrier loader.
- Physical scenes carry only validated carrier preflight/lifecycle configuration,
  never the Capsule warmup graph or renderer recovery policy. Reject Capsule
  preflight declarations after the fixed carrier has established OS identity.
- Sidecar owns private IPC, transport, process/generation identity, physical resource-set guards, retirement, and terminal stop. electron-kit must not wrap or republish that transport. The product Shell may compose only the frozen public Standalone handoff and Sidecar runtime-handle contracts when they are available.
- Global shortcuts use the same finite ownership rule: electron-kit owns registration, rollback, observation and teardown; Shell owns every accelerator declaration and action binding. Do not add inert placeholder shortcuts or product menu actions here.
- Import only public `@open-design/standalone` contracts. Never import `apps/closure`, another Shell, or product Web/daemon implementation.
- Consume Shell-neutral physical Node/native package verification through `@open-design/standalone/packages`; source locks and package assembly belong to Standalone, not Electron distribution or startup helpers.
- Do not restore the deleted phase-one lifecycle/updater authority or publish a consumer-visible transport. Production composition belongs to the product Shell over frozen Standalone and Sidecar authorities.
- Keep source responsibilities layered under `contracts/`, `runtime/`, `integrations/`, `platform/`, `update/`, `distribution/`, `fixtures/`, and `commands/`; mirror semantic test ownership below `tests/`. Platform trees own reusable OS atoms and must not absorb installer workflow or product identity values.
- Derive Windows uninstall, App Paths, protocol, shortcut, and executable endpoints from one validated Shell manifest plus the finite Shell lifecycle policy. Treat registry entries as a projection after install-tree commit: runtime reconciliation may update an existing deterministic owner key, but must never create a missing uninstall identity. Cleanup must compare normalized owned paths and commands before deleting shared registry locations.
- Resolve package resources through `lib/resources.ts` by walking parent `package.json` files until the requested package name matches; never encode workspace depth, pnpm layout, or source/dist-relative fallbacks. Resource templates use only the `lib/templates.ts` raw-scalar Mustache subset—sections, partials, lambdas, escaped tags, unknown values, and unused values are invalid.
- Package tests use the `@/*` alias for `src/*` imports.
