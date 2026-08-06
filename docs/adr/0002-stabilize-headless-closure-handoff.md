# 0002. Stabilize the Headless Closure handoff

## Status

Accepted

## Context

Open Design already relies on three hard-won coordinates that remove product
friction: `channel` chooses how a release evolves, `namespace` isolates where
one product instance exists locally, and `sidecar` contains process and host
differences. The independent Closure work has also separated candidate,
materialization, activation, rollback, and Web + daemon lifecycle from the
Desktop launcher identity.

The remaining seam is still too broad. A shell can currently learn the active
Closure layout and assemble the body itself. That makes a future body change a
shell change, blurs shell recovery with Closure recovery, and forces unrelated
shell and body combinations back into the same acceptance matrix.

The immediate release needs a safe cut, not a general component platform. Test
cost rises with every new identity, state transition, compatibility pair,
process owner, and recovery exit. Future flexibility therefore cannot justify
new current behavior by itself.

## Decision

Introduce one stable, Closure-owned shim/handoff seam:

```text
Shell / Installer -> thin Closure shim -> monolithic Closure body
```

The shim is physically carried by the shell or installer so a compatible entry
is always reachable. The shell invokes `ensure + handoff`; it does not read the
Closure store, body layout, active pointer, or component identity.

The existing coordinates retain their meanings:

- a candidate belongs to `channel` and remains namespace-neutral;
- materialization, binding, active state, and rollback belong to `namespace`;
- a handoff is bound to one sidecar/runtime `generation`; stale readiness from
  another generation cannot confirm it.

The shell owns launch timing, visible UX, permissions, retry presentation,
installer-reinstall, windows, menus, and OS integration. The Closure side owns
candidate trust and integrity, materialization, Store truth, activation,
rollback, body startup, health confirmation, and body shutdown.

The first handoff protocol is versioned and additive, but exposes only one
legal body form: the atomic Web + daemon Closure release-set. Body paths and
module layout remain opaque to the shell. Background updates may prepare a
candidate for a later launch; this release does not live-swap a running body.

A future idea may enter the shim/handoff only as a seed when it introduces no
reachable state, no persistent truth, no lifecycle branch, no compatibility
axis, and no additional acceptance cell today. Component-level activation,
general leases, migration frameworks, generic GC, a new release platform, and
full key-rotation machinery are not part of this decision.

## Delivery contract

Before Shell and Closure work proceeds in parallel, the seam must provide:

1. versioned request/result and handoff identity types with shared fixtures;
2. a real process-boundary demo using a tiny body and local release source;
3. golden traces for fresh acquisition, reuse, trust/integrity rejection,
   installer-reinstall, and unhealthy-candidate rollback;
4. protocol tests for namespace isolation and stale generation rejection;
5. fake Shell and fake body surfaces so either side can develop independently.

macOS runs the full demo before handoff. Windows must run protocol, build, and
real child-process smoke before product integration is accepted. Full Desktop
and mixed-generation product acceptance remains an integration gate after the
parallel implementations meet.

## Consequences

Shell and Closure upgrades become independently testable without creating a
second product identity. The next release can raise the shell minimum version
after a compatible shim is reachable, while historical combined payload code
remains a one-way, removable recovery path during the transition.

The seam deliberately freezes less than the implementation: handoff semantics,
result codes, lifecycle invariants, fixtures, and golden traces are contract;
Store layout, download implementation, body module structure, and sidecar
transport are not.
