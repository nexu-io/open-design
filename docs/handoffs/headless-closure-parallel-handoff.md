# Headless Closure parallel handoff

This handoff operationalizes [ADR 0002](../adr/0002-stabilize-headless-closure-handoff.md).
It is the shared boundary for the Shell/Installer and Closure implementation
tracks; it is not a second architecture specification.

The broader local-debug, release, platform, installer, and cutover route lives
in the [Headless Closure delivery matrix](headless-closure-delivery-matrix.md).
This document remains the seam-level handoff and does not duplicate that map.

## Frozen seam

The following are safe to build against:

- `@open-design/closure-proto` shim request/result, handoff envelope, signature
  descriptor, validators, and JSON fixtures;
- `@open-design/closure-shim` `ensureAndHandoffClosure()` and its five stable
  error codes;
- the body export `handoffOpenDesignClosure()` and readiness proof bound to the
  exact channel, namespace, platform, and generation;
- the generation-bound Shell capability request/result and runtime terminal
  status fixtures;
- the golden event order asserted by the Closure shim conformance suite.

The Store directory layout, body module layout, sidecar transport, downloader,
and internal trace representation are not frozen. Additive protocol fields may
be accepted and ignored; they must not create behavior until separately
approved.

## Ownership split

| Surface | Shell / Installer track | Closure track |
| --- | --- | --- |
| Invocation | Supplies resolved roots, shell identity, timing, UX, and reinstall action | Validates request and returns `ready` or `installer-reinstall` |
| Candidate | Supplies configured release source and pinned public key material | Verifies trust, integrity, compatibility, materialization, and Store state |
| Runtime | Does not inspect body layout or active pointer | Loads the opaque entry, owns handoff, health confirmation, shutdown, and bounded rollback |
| Sidecar | Owns host UI and OS integration; serves supported Shell capabilities | Proves readiness and terminal status for the exact handoff generation |
| Updates | Presents progress/retry and upgrades the shell | Prepares/activates the atomic Web + daemon release-set; no live swap |

Each track develops against the other side's public seam. Tests may use
`@open-design/closure-shim/testing` for a fake request, resolved test roots, and
an in-memory fake body. Product code must not import that subpath.

## Protocol proof matrix

This is a boundary proof, not the final product inventory. A new cell is an
ordinary local extension only while it preserves the identity, correlation,
transport freedom, lifecycle owner, and failure exits demonstrated here.

| Lane | Representative cells proved now | What later cells may add locally |
| --- | --- | --- |
| Shell → Closure control | ensure; ready; installer-reinstall | typed control handlers and Shell UX mappings |
| Closure → Shell capability | completed; unsupported; failed | typed host capabilities such as native IPC adapters |
| Runtime lifecycle | running; requested stop; unexpected failure | internal restart, suspend, or diagnostics policy |
| Update lifecycle | activate healthy; reject; bounded rollback | preparation and selection policy inside Closure |
| Compatibility and isolation | minVersion; additive fields; exact channel/namespace/generation | additive operations that retain the same fencing |

If a proposed cell needs another identity, physical transport, lifecycle plane,
process owner, or persistent truth source, the protocol proof does not cover it
and the architecture decision must reopen.

## Acceptance matrix

| Trace | Pre-handoff proof | Product integration gate |
| --- | --- | --- |
| Fresh acquisition | Signed local candidate, real archive verification, real child process, active + last-successful confirmed | macOS and Windows release candidate |
| Second launch | No artifact download, same verified active candidate, new process handoff | Cold start through installed shell |
| Trust/integrity rejection | Bad signature and corrupt archive leave current truth unchanged | Public/internal feed policy and visible recovery UX |
| Installer reinstall | Trusted `minVersion` mismatch returns before body download | Installed outer selects and opens the correct installer |
| Unhealthy update | One failed generation rolls back once to last-successful | Web + daemon health failure and shell-visible diagnostics |
| Namespace/generation fencing | Protocol and fake-body conformance tests | Platform sidecar smoke; not a separate first-round product E2E |
| Reverse Shell capability | Independent Shell parser/producer plus real shim guard; completed, unsupported, failed, and stale-result semantics | One host capability through the selected platform adapter |
| Requested stop / unexpected exit | Real child stop and failure observations bound to the active handoff | Installed shell quit plus crash/recovery presentation |

macOS must run the complete conformance demo before the tracks split. Windows
must run protocol tests, package build, and real child-process smoke before
integration acceptance. Full mixed-generation Desktop QA remains after the two
tracks meet.

## Stable outcomes

- `ready`: one body generation is healthy and confirmed;
- `installer-reinstall`: the trusted candidate requires a newer shell and no
  body bytes were downloaded;
- `request-invalid`: the shell invocation violated the v1 contract;
- `trust-rejected`: the signature descriptor, key, or signature was rejected;
- `candidate-rejected`: candidate coordinates, integrity, or materialization
  failed before handoff;
- `body-unavailable`: no active or acquired body can be selected;
- `handoff-failed`: startup/readiness failed and bounded rollback could not
  produce one healthy body.

Shells may map these outcomes to product-specific UX. They must not infer
Closure Store state from an error or add a private fallback selector.

## Local proof

```bash
pnpm --filter @open-design/closure-proto test
pnpm --filter @open-design/closure-shim test
pnpm --filter @open-design/closure-shim typecheck
pnpm --filter @open-design/closure-shim build
```

The conformance test generates its signed archives and body modules in a
temporary root. It checks in no private key and leaves no installed product or
runtime state behind.

## Change control

Stop parallel implementation and reopen the boundary decision before adding:

- a new product identity, persistent pointer, or release coordinate;
- a new active/serving state or live-swap transition;
- another compatibility generation or recovery exit;
- component-level Web/daemon/resources activation;
- generic multi-shell leases, migration, GC, key rotation, or publication
  framework;
- any shell read of Closure body layout or Store state.

Ordinary implementation changes that preserve the fixtures, golden traces,
outcomes, and ownership table do not require both tracks to move together.
Adding a typed operation inside the agreed matrix is ordinary; adding another
identity, physical transport requirement, lifecycle plane, or process owner is
a boundary decision.
