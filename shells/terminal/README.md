# Terminal exact Shell

Terminal is distributed as equivalent POSIX `sh` and Windows PowerShell 5.1
carriers. Neither implementation requires pnpm, TypeScript, or a preinstalled
Node runtime.

The native carrier has one deliberately small job: verify and install the pinned
official Node carrier, verify the installed Terminal manifest and executable,
then invoke `runtime/fossil.mjs` with that absolute executable. The fossil adapter
validates the exchange contract and delegates lifecycle work to the installed
`@open-design/standalone` artifact.

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
only adapts Terminal files, HTTP and the phase-one file fixture to those ports.
`probe`, cold `start`, reference/heartbeat/release/stop, content update preparation
and apply are all executable without Web or daemon. #7244 remains the integration
gate for the real Sidecar transport and product lifecycle.

Every runtime request carries an explicit `channel` and `namespace`. The phase-one
fixture shared instance is keyed only by that pair and follows
`contract/instance-lifecycle.schema.json`: reference attachment, heartbeat lease,
fenced transitions and an explicit traditional stop signal. Shell auto-update is
independently declared by `contract/shell-updater.schema.json`; Terminal publishes
`unsupported` in phase one while the independent Standalone content updater is
available. Neither capability exposes commands, executable paths or argv to
the Web layer. Fossil rejection includes `installer-required`, which is the
handoff used when release metadata requires a newer Shell.

## Scene and distribution

`sh/scene.sh` owns Darwin scene construction and `ps1/scene.ps1` owns Windows.
Scenes are target-specific but channel-neutral build sites. They contain official
Node, conventional Closure and Standalone artifacts, native scripts, fossil and
contracts; they contain no release version, URL, publication time, signature or
private key.

Promotion always copies a scene through the target owner's
`distribution.sh`/`distribution.ps1`, adds public trust and signed content
metadata, writes the installed manifest, and produces a complete offline
`tar.gz`/`zip`. The request/receipt schemas make these scripts callable by an
external orchestrator without teaching that orchestrator the installed layout.

## Focused verification

The focused Vitest suite lives with the Shell and is not wired into the repository's
main CI:

```sh
OD_TERMINAL_NODE_ARCHIVE=/path/to/node-v24.18.0-darwin-arm64.tar.gz \
  pnpm --filter @open-design/terminal test
```

Without the environment variable the suite uses the matching archive from
`.tmp/terminal-e2e/node/` when present. It always checks contracts and shared
fixture semantics; on a matching native host it additionally covers scene,
offline distribution, cold lifecycle, update, channel isolation, atomic install
and tamper failure. The native E2E starts the existing
`tools-serve start release-storage` fixture and fetches channel heads, signed
metadata and changed Closure bytes from it, so update coverage cannot pass by
reusing only the installed seed blob. Platform coverage is deliberately split between
`tests/mac.test.ts` (`sh` + tar.gz) and `tests/win.test.ts` (Windows PowerShell
5.1 + zip); `tests/contract.test.ts` owns the shared protocol assertions.
