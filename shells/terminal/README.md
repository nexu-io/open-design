# Terminal exact Shell

Terminal is distributed as equivalent POSIX `sh` and Windows PowerShell 5.1
carriers. Neither implementation requires pnpm, TypeScript, or a preinstalled
Node runtime.

The native carrier has one deliberately small job: verify and install the pinned
official Node carrier, verify the installed Terminal manifest and executable,
then invoke `runtime/fossil.mjs` with that absolute executable. The archive
carries its Sidecar bootstrap/host and the minimal verified
`@open-design/sidecar`/`@open-design/platform` runtime modules. The fossil adapter
uses only Sidecar's public convergence and control APIs, while lifecycle policy
stays in the installed `@open-design/standalone` artifact.

The authoritative release artifact is a complete offline archive. Its digest is
the immutable download identity. Once installed, the exact bytes of
`install-manifest.json` are the Shell identity; the digest is carried in
`install-manifest.sha256` and in every carrier resolution.

`sh/distribution.sh` and `ps1/distribution.ps1` own target layout and archive
assembly. Repository orchestration supplies request JSON and consumes receipt
JSON without knowing that layout. The native contract entrypoints are:

```sh
sh shells/terminal/sh/scene.sh --request scene-request.json --receipt scene-receipt.json
sh shells/terminal/sh/distribution.sh --request distribution-request.json --receipt distribution-receipt.json
```

Windows uses the equivalent `-Request` and `-Receipt` parameters on the two
PowerShell scripts. The request files follow `contract/scene-request.schema.json`
and `contract/distribution-request.schema.json`; promotion rejects release
identity that differs from the signed content metadata.

The archived standalone-closure proof of concept remains the behavioral reference
at commit `715c0cb9d8ffdedd47d8c27a78a1d5dfdb2dc201`; this implementation preserves
its fossil/handoff lessons without copying Electron-specific policy.

The formal lifecycle decomposition, invariants, linearization points, failure
semantics, and POC reference ledger live in [`model/README.md`](model/README.md).
Its executable state model is test-only: it constrains future Sidecar and
Electron adapters without becoming part of the distributed Terminal runtime.

## Boundary and lifecycle

The installation root is immutable Shell material. `carrier.lock` is deliberately
line-oriented so native code can locate Node before any JSON runtime exists. The
native entrypoint validates its fixed relative paths, executable digest and
version, then validates `install-manifest.json`. That manifest binds the carrier
lock, both native script sets, fossil, Standalone, required Closure seed, trust,
release content metadata and a digest-indexed copy of every JSON contract. Its
canonical byte digest is the installed Shell identity; the outer tar/zip digest is
a separate download identity.

After Node is available, `runtime/fossil.mjs` verifies the complete installed
surface again and imports only the installed Standalone public entrypoint. Store,
signature, update, activation and rollback policy remain in Standalone. The fossil
adapts Terminal files to the public Sidecar operations; IPC, endpoint derivation,
process discovery and generation fencing stay private to `@open-design/sidecar`.
`probe`, cold `start`, reference/heartbeat/release/stop, content update preparation
and apply are all executable without Web or daemon.

Every runtime request carries an explicit `channel` and `namespace`. The Sidecar
layout may additionally select an explicit scope root through `--namespace-root`
(`-NamespaceRoot` in PowerShell). Shells attaching to the same scope must select
the same namespace and Store roots; the shared Standalone resolver supplies the
product layout and a conflicting live layout is rejected. Omitting the option
uses the namespace's existing Store scope root. No directory migration or merge
is performed. Daemon data ownership follows the root
[`AGENTS.md`](../../AGENTS.md#daemon-data-directory-contract) contract.

The Sidecar
shared instance is keyed only by that pair and follows
`contract/instance-lifecycle.schema.json`: reference attachment, heartbeat lease,
occupant projection, fenced transitions and an explicit traditional stop signal.
The local Sidecar issues a persisted attachment capability on first attachment;
heartbeat and release cannot take over a live reference by guessing its ID.
Content restart uses the same transition protocol as Shell install: it defers by
default while foreign references exist and only stops them on an explicit force.
Standalone owns the shared reducer, host runtime, serialized lifecycle ledger,
and versioned control client. Terminal supplies only the Sidecar transport and
generation-loading adapter; lifecycle commands no longer use the old
`domain/operation` protocol or a Terminal-specific lock file. Short-lived native
commands restore one scoped attachment credential through the public client.
The historical lifecycle model is test-only and is not distributed.
Instance health is keyed to the
exact generation launcher binding, while Shell identities and capability hashes
remain attachment facts. A transition advances from `reserved` to `stopped-sealed`;
this logical result does not prove physical retirement, which remains owned by
Sidecar's resource-set guard. A sealed fence cannot be released into normal startup.
Shell auto-update is independently declared by `contract/shell-updater.schema.json`.
Updater commands consume `StandaloneHostControlUpdater`. The native Terminal
installer provider is not yet registered, so the installed manifest declares
`shellUpdater: unavailable` and those commands fail closed. An incompatible
content update still returns its explicit Shell version requirement, with no
fabricated candidate or snapshot. Installation confirmation cannot copy the
candidate's identity: it requires a real replacement bound to a durable claim.
The former fixture updater is test-only and is not included in scene or
distribution artifacts. Real provider registration, guarded installation and
replacement confirmation remain required before claiming Shell update delivery.

Standalone generation state is a revisioned pure state machine. Update authority
forms `none < silent < user`; background policy cannot revoke or downgrade an
explicit user restart. Every authorization and activation is compare-and-swap
bound to the originally verified generation, so a later mutable channel head
cannot retarget an in-flight transaction. A candidate receives one initial launch
and at most one recovery launch before rollback to the last health-proved
generation. Readiness is an explicit proof bound to generation, instance,
and attachment; Standalone combines it with the exact activation-attempt and
launch token. The readiness envelope also carries the digest of
`channel + namespace + generation + standalone.launcher`; accepting a start
request is not a health proof, and a delayed
acknowledgement from the failed launch cannot confirm its recovery launch.
Terminal tests exhaust the finite control-state graph and then refine the critical
transition trace through the file Sidecar fixture.

Every signed content graph contains exactly one required `standalone.launcher`
sync component. The installed archive carries the same bytes only as an offline
seed; Store materializes them into the selected generation and the immutable
fossil resolves the absolute generation entrypoint. Selection, import and
failure are sticky for the lifetime of the host. Once selected, a failed
launcher is never replaced by baseline code or a rollback generation in the
same host; Store may roll state back, but recovery requires a fresh host
lifecycle. One selected generation body serves multiple Shell attachments,
routes attachment-scoped capabilities, and closes only after the final handle.
Terminal's supervised Sidecar host imports this materialized entry before invoking
the lifecycle continuation; normal cold start and transition-owned update start
therefore cannot drift into separate launch paths. The focused long-lived fake
host additionally exercises the complete Electron-facing multi-attachment
shape, including cold-start progress, without introducing Web or daemon.

Standalone owns the global mark/quarantine sweep and bounded asynchronous trash
cleanup APIs. The Terminal Sidecar host only schedules them after the requested scope is
idle. This keeps blob semantics and reclamation out of Closure while exercising
the same maintenance boundary Electron can reuse.

Passing `--feedback <jsonl>` (`-Feedback` on PowerShell) records the complete
Shell-to-Closure cold-start stream. Native Node verification is followed by
Standalone blob resolution, sync preparation, activation, Closure readiness or
rollback events. The JSONL stream is the reference surface for future Electron
handlers; human-facing terminal presentation is deliberately minimal.

## Scene and distribution

`sh/scene.sh` owns Darwin scene construction and `ps1/scene.ps1` owns Windows.
Scenes are target-specific but channel-neutral build sites. They contain official
Node, conventional Closure and Standalone artifacts, native scripts, fossil and
contracts; they contain no release version, URL, publication time, signature or
private key. Promotion publishes the Standalone artifact again as the required
versioned launcher component; the scene copy is only its verified offline seed,
not execution authority.

Promotion always copies a scene through the target owner's
`distribution.sh`/`distribution.ps1`, adds public trust and signed content
metadata, writes the installed manifest, and produces a complete offline
`tar.gz`/`zip`. The request/receipt schemas make these scripts callable by an
external orchestrator without teaching that orchestrator the installed layout.

`.github/workflows/release-exact.yml` is an independent validation and release
line; it is not part of `ci.yml`. Its separate convergence declaration may
restore a byte-verified, release-neutral target scene. A hit never promotes the
cached directory directly: native distribution still copies the scene and adds
release documents, then `tools-release exact-control` creates signed content and
Shell sidecars and performs immutable publication
before the channel-scoped latest CAS. Convergence therefore knows only Git
inputs, execution class and an opaque scene product; channel, version, trust,
minimum Shell version and artifact URL remain promotion concerns.

PR B deliberately publishes and accepts only `darwin-arm64`. The PowerShell
carrier and its isolated contract suite remain Electron/PR C preparation; they
are not evidence for a Windows release until that task adds a native public
artifact acceptance lane.

## Focused verification

The focused Vitest suites are not wired into the repository's
main CI:

```sh
OD_TERMINAL_NODE_ARCHIVE=/path/to/node-v24.18.0-darwin-arm64.tar.gz \
  pnpm --filter @open-design/terminal test
```

Without the environment variable the suite uses the matching archive from
`.tmp/terminal-e2e/node/` when present. It always checks contracts and shared
fixture semantics; on a matching native host it additionally covers scene,
offline distribution, cold lifecycle, update, channel isolation, atomic install
and tamper failure. The full local E2E starts the existing
`tools-serve start release-storage` fixture and fetches channel heads, signed
metadata and changed Closure bytes from it, so update coverage cannot pass by
reusing only the installed seed blob. Before its first launch, the installed beta
also replaces an unrelated prepared generation and receives the first health
proof under its exact signed identity. The same mutable
`somechan/latest/channel-head.json` object is promoted across three beta rounds;
`somepreview/latest` proves that another non-stable channel remains isolated.
Legacy model tests cover updater transition scenarios but are not evidence of
real installation. Native acceptance now verifies that unavailable updater
commands and unproved confirmation are rejected without stopping live consumers
or producing an installed record. It launches the Sidecar with Node and scripts
from the installed archive; separate native Sidecar coverage checks attachment
capabilities, host crash recovery, and idle-only blob sweep/cleanup.
The native carrier test also closes the final logical reference and
reattaches the same Terminal identity through a fresh Sidecar host while keeping
the supervisor generation stable; a later content activation performs another
exact host handoff.
Platform coverage is deliberately split between
`tests/mac.test.ts` (`sh` + tar.gz) and `tests/win.test.ts` (Windows PowerShell
5.1 + zip); `tests/contract.test.ts` owns the shared protocol assertions.
