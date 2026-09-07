# Standalone package guide

This package is the shell-neutral trust and lifecycle boundary for exact distributions.

- Keep metadata and receipt schemas versioned and deterministic.
- Own the Shell-neutral host control contract, transport-injected client, and
  logical host lifecycle, dispatcher, and shared lifecycle ledger. Shell adapters supply transport and a state port;
  shared code must not import Electron or Sidecar transport. A logical lifecycle
  result is never proof that physical processes have retired.
- Verify signatures before fetching or materializing components.
- Address immutable blobs by SHA-256 and fail closed on size or digest mismatch.
- Keep generation preparation separate from activation and successful-start acknowledgement.
- Expose domain types and pure/library APIs only. Concrete pack, scene, cache,
  materialize, promote, release, workflow, and argv handling belongs elsewhere.
- Every resource explicitly declared `sync` materializes before generation preparation; Node remains the Shell-owned cold-start anchor and never enters the blob catalogue.
- Keep `packages/download` as an atomic transport primitive. Blob identity, global CAS, Shell-carried candidates, materialized trees, quarantine, reachability, and bounded cleanup belong here.
- Shell compatibility is intentionally visible to Closure through shell-neutral updater and lifecycle-transition ports; concrete installer and renderer behavior remains Shell-owned.
- Keep Sidecar behind `LifecyclePort`. Before #7244 lands, do not add process identity, IPC, discovery, or stop dialects.
- Do not depend on `apps/**`, `shells/**`, `.github/scripts`, `tools/pack`, or `tools/release`.
