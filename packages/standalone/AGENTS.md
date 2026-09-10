# Standalone package guide

This package is the shell-neutral trust and lifecycle boundary for exact distributions.

- Keep metadata and receipt schemas versioned and deterministic.
- Content metadata schema 5 declares `shell.<type>.version.min` and its build
  identity. Do not accept the former requirement array or mixed field shapes.
  Generation records remain schema 4; namespace state is schema 5. State retains
  each activation's rollback or explicit-recovery policy across consumers.
  Electron whole-startup candidates use explicit recovery: neither another
  launcher nor automatic interrupted-attempt handling may retry or roll them back.
  Independent healthy Closure hot-update and Terminal policies remain explicit
  at their activation call sites; do not infer policy from a Shell type string.
- Stable lifecycle versions use `X.Y.Z`; counted channels use
  `X.Y.Z-<channel>.N`. Channel scope is explicit, not inferred from a suffix.
  Compare releases through `compareChannelReleaseVersions`; publication gates
  remain in tools-release, not in the consumer's protocol grammar.
- Own the Shell-neutral host control contract, transport-injected client, and
  logical host lifecycle, dispatcher, and shared lifecycle ledger. Shell adapters supply transport and a state port;
  shared code must not import Electron or Sidecar transport. A logical lifecycle
  result is never proof that physical processes have retired.
- Verify signatures before fetching or materializing components.
- Maintenance and namespace state transactions share a private coordinator over
  Platform kernel ownership. Bound acquisition waits, never owner lifetimes;
  do not resurrect TTL/heartbeat lock stealing or stale-file deletion. Process
  death releases coordination only, not activation or recovery evidence.
  Pass canonical root and transaction purpose as logical lease identity; do not
  derive transport endpoints. Kernel lease v2 requires stopped-client migration
  from the former TCP leases, not rolling coexistence in one namespace.
- Address immutable blobs by SHA-256 and fail closed on size or digest mismatch.
- Keep generation preparation separate from activation and successful-start acknowledgement.
- Explicit `recoverGeneration` authenticates and materializes a pinned signed
  target, then replaces the activation attempt under the expected state revision.
  It never selects latest, rolls back, starts code, or marks the target healthy.
  The caller must retain its repair blockade and own physical resource retirement;
  normal `prepare` still refuses an unfinished activation attempt.
- `StandaloneUpdater.prepareFromHead` consumes a caller-selected signed head,
  snapshots it before I/O and keeps the same trust, compatibility, monotonicity
  and activation-policy checks as `prepareLatest`; it never rereads latest.
- Own Shell-neutral package methods through `/packages` (source locks, physical
  verification and Node runtime binding) and `/packages/build` (locked Node and
  native package assembly). The runtime entry must not load build dependencies.
  Shells supply product dependency locks/probes and installation composition;
  tools retain persistent build-cache policy. Shells choose installation-bound
  packages or an independently authenticated exact platform resource. The latter
  uses `/packages/resource`, separate from the lightweight `/packages` leaf;
  it never defines a channel, latest feed, updater, or Closure business resource.
  Resource callers authenticate the descriptor before acquisition and own
  explicit-recovery authorization. Normal preparation rejects damaged cache;
  executable permissions and native probes follow complete tree verification.
- Expose domain types and pure/library APIs only. Concrete pack, scene, cache,
  materialize, promote, release, workflow, and argv handling belongs elsewhere.
- `/tree` exposes the pure tree digest shared by build producers and runtime
  verification. Producers needing only that digest must not load Store or lifecycle
  code. Its extraction does not change the existing digest algorithm or metadata.
- Every resource explicitly declared `sync` materializes before generation preparation;
  Node remains Shell-owned and never enters Closure's business blob catalogue.
- Keep `packages/download` as an atomic transport primitive. Blob identity, global CAS, Shell-carried candidates, materialized trees, quarantine, reachability, and bounded cleanup belong here.
- Shell compatibility is intentionally visible to Closure through shell-neutral updater and lifecycle-transition ports; concrete installer and renderer behavior remains Shell-owned.
- Shell-updater snapshot/capability v4 distinguishes restart activation from
  physical installation. Restart handoffs bind an opaque exact target digest,
  Closure generation and full Shell identity, never installer artifacts or
  platform trust. Keep a selected handoff immutable within its attempt; concrete
  Capsule meaning and activation confirmation remain with the Electron carrier.
- Keep Sidecar behind `LifecyclePort`. Before #7244 lands, do not add process identity, IPC, discovery, or stop dialects.
- Do not depend on `apps/**`, `shells/**`, `.github/scripts`, `tools/pack`, or `tools/release`.
