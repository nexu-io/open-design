# Standalone Closure delivery matrix

This document turns [ADR 0002](../adr/0002-stabilize-standalone-closure-handoff.md)
and the [parallel handoff](standalone-closure-parallel-handoff.md) into an
implementation-ready delivery map. It is intentionally a map, not another
runtime protocol. Its machine-readable companion is
[`e2e/resources/standalone-closure-delivery-matrix.ts`](../../e2e/resources/standalone-closure-delivery-matrix.ts),
which is consumed only by tests.

## Fixed shape

```text
Shell / Installer -> thin shim (ensure + handoff) -> atomic Closure -> Standalone (Web + daemon)
```

- `channel` selects an evolving release line; a Closure candidate is
  namespace-neutral and platform-specific.
- `namespace` binds one installed/local product instance and all of its
  mutable state.
- `generation` fences one selected body process lifecycle and every readiness,
  capability, and terminal observation associated with it.
- sidecars remain the process/host adaptation boundary. They do not become a
  fourth product identity or a second persistent truth source.
- the Shell owns OS integration, visible UX, invocation timing, and installer
  actions. Closure owns trust, Store truth, update, rollback, and selection of
  exactly one Standalone body. Standalone owns the joined Web + daemon process
  lifecycle and shutdown.
- the running body is never live-swapped. A prepared candidate becomes active
  on a later launch; `minVersion` exits to installer-reinstall before body
  download or startup.

The existing packaged Closure path is reusable migration material, not the new
boundary: it still reads the active body layout and assembles Web + daemon in
the shell. A green legacy product test therefore cannot close a new-shim gate.

## Full capability matrix

“Proven now” names the strongest evidence already present on this branch.
“Product closure” is the exact gate the implementation tracks must add.

| Lane | Lifecycle requirement | Proven now | Product closure |
| --- | --- | --- | --- |
| Shell shim | invoke ensure once → `ready` or `installer-reinstall`; correlate reverse capabilities; observe requested stop vs unexpected failure | independent Shell parser/producer and real shim conformance | installed shell never reads Store/body layout; one real host capability and terminal UX pass on each platform |
| Local debug | start → status/logs → stop → namespace cleanup, without a release publish | `tools-dev` already owns daemon/Web/Desktop local lifecycle; `apps/standalone` exports the shell-neutral product lifecycle | add a Closure product target inside `tools-dev`; do not add a second CLI or control plane |
| Process lifecycle | daemon ready → Web ready → running; stop Web → stop daemon; converge partial startup | `@open-design/standalone-runtime` lifecycle tests plus real child shim demo | real archived Standalone exports `handoffOpenDesignStandalone()` and emits generation-bound status through installed shells |
| Update lifecycle | discover → trust → materialize → activate → arm → confirm, or one bounded rollback | Closure update/Store/shim tests cover integrity, isolation, minVersion, reuse, and rollback | release candidate discovery and trusted keys enter through the shim; shells stop selecting or confirming bodies |
| Distribution | build namespace-neutral platform body → sign inventory/manifest → store version → bind from channel metadata | `tools-pack closure build`, `tools-release` publication tests, and release-beta lanes | publish=false QA resolves bytes and metadata from release storage; GitHub artifacts are never authoritative inputs |
| Local real-real | local release source → real shim → real body → exact ready/terminal signals | bilateral conformance and the reusable packaged Closure fixture | one deterministic test covers fresh, reuse, reject, reinstall, rollback, capability, stop, and failure without fixed sleeps |
| Windows installer | resolve release namespace identity → stop owner → replace/install → cold start → uninstall | NSIS identity/lifecycle/registry tests and the existing Windows product reference | `release-beta-win` proves minVersion reinstall, locked-file convergence, new-shim cold start, rollback, and clean uninstall |

Acceptance levels have distinct meanings:

1. **Contract** — independent producer/consumer validation of the frozen seam.
2. **Component** — one owner proves its lifecycle against fakes or fixtures.
3. **Local real** — real shim and real body cross a process boundary against a
   deterministic local release source.
4. **Platform product** — an installed macOS or Windows shell and installer
   prove the same trace.

Passing a lower level cannot be reported as a higher one. Existing macOS and
Windows packaged Closure cases are product references until they invoke the
new shim entry.

## Delivery cuts

These are atomic outcomes, not time estimates. SC-01/02 and SC-03 can proceed
in parallel against the frozen fixtures. Dependency order is also encoded in
the machine-readable matrix.

| Atom | Track | Single done condition |
| --- | --- | --- |
| SC-01 | Standalone body | archived `runtime.mjs` accepts the handoff and owns Web + daemon start, health, and stop |
| SC-02 | Closure acquisition | shim owns candidate discovery/trust, Store selection, activation, confirmation, and rollback |
| SC-03 | Shell | packaged shell calls only ensure + handoff and maps capability, terminal, and reinstall outcomes |
| SC-04 | Developer experience | `tools-dev` controls source Standalone start/status/logs/stop/cleanup as one product |
| SC-05 | Integration | deterministic local source drives real shim + real body through the complete trace |
| SC-06 | Distribution | beta builds/signs/stores/resolves Closure independently, including publish=false QA retrieval |
| SC-07 | macOS | installed shell passes cold start, reuse, reinstall, failure, and rollback through the new seam |
| SC-08 | Windows installer | installer preserves namespace identity, stops the owner, and fulfills minVersion reinstall |
| SC-09 | Windows | installed shell passes cold start, reuse, reinstall, failure, rollback, and clean uninstall through the new seam |
| SC-10 | Cutover | minVersion rises only after both platform mixed-generation gates pass |
| SC-11 | Retirement | historical combined-payload selection is removed after the compatibility observation window |

The next release contains SC-01 through SC-10. SC-11 is deliberately separate:
short-term fallback remains one-way and observable; it is not allowed to select
or mutate the new Closure truth. This preserves the agreed “next release puts
the architecture on the table” scope while keeping irreversible cleanup out of
the first cut.

## Track handoff packets

Each implementation atom hands off four small artifacts:

1. the changed owner surface;
2. one green test at its declared acceptance level;
3. the exact lifecycle trace or failure exit it added;
4. any platform gate still required.

The Closure track may change Store layout, downloader internals, body module
layout, or physical transport without moving the Shell track. The Shell track
may change Electron IPC, installer mechanics, or UX without moving Closure.
Either track must stop if it needs a new product identity, persistent pointer,
process owner, live-serving state, recovery exit, compatibility axis, or
transport requirement.

## Validation route

The implementation should grow the proof in this order:

```text
closure-proto / closure-shim contract
  -> Standalone body and tools-dev component tests
  -> deterministic local real-real trace
  -> release-beta publish=false retrieval
  -> macOS installed product gate
  -> Windows installer + installed product gate
  -> minVersion cutover
```

macOS can run the complete local and installed acceptance on this host. Windows
reuses the same fixtures and matrix on its branch, then adds the real NSIS gate;
a macOS-hosted mock does not substitute for that gate. Release publication is
not required to develop or close the local-real level.

## Change control

No new decision is needed to implement the atoms above. Reopen the architecture
before adding component-level activation, live swap, another persistent
selector, generic leases/GC/migration, a sidecar-owned update truth, or a shell
read of Closure Store/body internals. Future decomposition may be seeded behind
the shim only when it adds no reachable state or acceptance cell today.
