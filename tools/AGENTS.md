# tools/AGENTS.md

Follow the root `AGENTS.md` first. This file only records module-level boundaries for `tools/`.

## Active tools

- `tools/dev` provides `@open-design/tools-dev` and the `tools-dev` bin. It is the only currently active local development lifecycle control plane.
- `pnpm tools-dev` exposes `desktop` as the public selector for the integrated `shells/electron` stack; its internal typed identity is `electron`.
- `tools-dev` invokes the public `@open-design/shell-electron/lifecycle` API with an explicit caller-owned log descriptor; it does not import electron-kit or launch an app-owned Electron runtime.
- `pnpm tools-dev run web` runs foreground daemon + web for the Playwright webServer flow.
- `pnpm tools-dev prepare closure --output <directory>` prepares development-only references to already-built daemon/Web outputs and emits `resource-receipt.json` for `tools-serve --resource-receipt`. These local references are not self-contained distribution artifacts and must never be published. Resource production is not an Electron Shell responsibility.
- `pnpm tools-dev inspect desktop status` projects the Electron Shell status through its typed adapter.
- Desktop inspect also exposes native `cdp --method <Domain.method> --params <json>`,
  `eval --expression <js>`, `screenshot --path <new-file>`, and bounded
  `events --method <Domain.enable> --duration-ms <ms>`. An explicit loopback
  `--cdp-url <origin>` attaches to an already-enabled installed application without
  taking lifecycle ownership; otherwise discovery uses the development instance.
  Select ambiguous pages with `--target-id`; never implicitly focus windows or
  replay mutating CDP calls. Full results can be written to a new `--path`; console
  output summarizes large strings. Events use JSON lines and one owned socket.
- `tools/pack` provides `@open-design/tools-pack` and the `tools-pack` bin. This PR delivers only the macOS build/install/start/stop/logs/uninstall/cleanup/inspect surface through public Shell build/lifecycle APIs.
- `tools/serve` provides `@open-design/tools-serve` and the `tools-serve` bin. It owns local fixture services such as `tools-serve start updater`.
- `tools/release` provides `@open-design/tools-release` and the `tools-release` bin. It owns release policy, channel-version lifecycle, metadata, immutable publication, reports, and notification-facing contracts. Python under `.github/scripts/` exclusively owns workflow planning, workload identities, cache decisions and result binding; tools-release must not consume or recompute that state.
- Exact content preparation, metadata signing and final composition live in
  tools-release behind its policy-bound commands. Do not restore tools-pack
  exact-control or a separate pack signing API/binary.
- `prepare --native-output` projects only bound metadata, trust and Capsule
  payloads for native assembly and final metadata composition.
  `prepare --publish-artifacts true` writes Closure, launcher, resource and platform
  payloads directly to immutable final version objects, with producer-computed
  digest metadata and byte readback. The thin installation input carries their
  channel/version/source-bound references. Finalize and publish authenticate those
  references at the policy-bound origin with HEAD; they do not download the payloads
  or accept arbitrary URLs. Capsule remains local for current budget verification.
  `prepare --freeze-storage true` freezes the exact selection, public signing
  keys and compatibility baseline at `<channel>/<version>/version-input.json`
  in policy-bound release storage. This is an immutable release input, not a
  workload cache record or an activation marker. Fresh-runner retries restore
  it before reading `latest`; changed selections and readback collisions fail.
  Never persist private keys. A frozen version cannot be reassigned to another
  source commit after a failed attempt.
- `distribution build --retain-result true` retains completed installers and
  their binding receipt at `<channel>/<version>/native/<shell>/<target>/result.json`
  in release storage; installer bytes live once at their final version object name.
  Internal distribution transport carries only the contribution for retained results.
  Restore only matching frozen inputs and verified original
  bytes; never treat an interrupted native workspace as a completed result or
  assume that signing the same inputs again produces identical bytes. The
  completed result does not replace installed acceptance or channel activation.
- `toolchain build|unpack|import` transports a built public Electron Shell
  package through Standalone's offline workspace-package export and Archive's
  native ZIP contract. Its target/Node/package/archive receipt is portable;
  only Python plan decides reuse. `distribution build --toolchain` consumes
  that verified package without workspace installation or source checkout.
  This delivery enables the toolchain product on matching macOS hosts only.
- `resource acquire` assembles the complete nine data inputs; `runtime build`
  produces an explicit miss-only web/daemon selection and `runtime acquire`
  assembles the complete native runtime pair. Acquisition never builds or
  contributes cache results. Ordinary URL+SHA descriptors are business inputs,
  not permission to interpret workload identities. User-facing CDN objects
  remain complete per-version immutable copies, even for reused bytes.
- `scene acquire`, `capsule acquire`, `platform acquire` and
  `validation acquire` consume complete selected business inputs without
  implicit builds or tests. Validation acquisition requires current-commit
  execution receipts for fresh inputs, while verified cached executions retain
  original provenance and bind to the current subject. Only the producer's
  `validation materialize` operation may execute missing test recipes.
- Same-carrier installed acceptance chooses isolated Closure hot update or
  public Shell updater Capsule+Closure replacement using verified logical Shell
  identity, not per-version metadata URLs. Capsule proof requires sealed baseline
  and first-install bindings, freshly authenticated selected bytes, exact committed
  generation, outgoing shutdown, restarted renderer and a separate cold restart.
  Keep current first-install proof independent; a changed physical carrier still
  requires its own upgrade evidence and must not silently become first-install-only.
- `installation exercise-pair` verifies and installs candidate and baseline before
  running first-start and hot-update in independent namespaces. Target selection
  consumes the authenticated bound Capsule through the Shell adapter, not a
  completed first-start session. Join waits for both runtime owners even on failure;
  final collection separately authenticates the first session's committed Capsule
  against its bound input and requires both independent execution receipts.
  Workflow adoption requires a namespace-capable compatible baseline and real
  isolation evidence; command-level concurrency tests alone do not establish it.
- Successful installation collection removes only its exclusively created
  namespace, after matching the local ownership marker and publication binding,
  holding both the stopped shared-resource guard and carrier session lease, and
  retaining runtime logs in the evidence workspace. Missing/mismatched ownership,
  live consumers, or retention failure preserve state; failed runs retain diagnosis.
- Experimental `baseline --mode candidate` is restricted to betahyx exact
  releases. It requires installed first-start evidence, marks that evidence as
  candidate-only and defers channel activation while advancing the test baseline
  with CAS. The subsequent default-mode release must pass hot acceptance before
  activation. It never claims that the old baseline upgraded successfully.

## Retired tools

- `tools/pr` / `@open-design/tools-pr` / `pnpm tools-pr` has been retired from this repository. Maintainer PR-duty workflows now live outside the product workspace in `PerishCode/duty`; do not restore an OpenDesign-local PR-duty tool without a new explicit maintainer decision.

## Packaging scope

- Keep `tools-pack` as a thin CLI over typed public APIs. Electron assembly, identity, product handlers, updater behavior, and native platform policy belong to `electron-kit` plus `shells/electron`.
- Tool code must not import `electron-kit`; invoke the typed Shell lifecycle adapters instead.
- Namespace controls packaged data/log/runtime/cache paths. Ports are transient transport details and must not participate in path decisions.
- There is no root `pnpm build` aggregate. Use package-scoped builds for source packages and `pnpm tools-pack ...` for packaged artifact build/install/release flows.

## Orchestration boundary

- Tool tests live in each tool's `tests/` directory, sibling to `src/`; keep `src/` source-only and do not add new `*.test.ts` or `*.test.tsx` files under `src/`.
- Orchestration layers must consume primitives from `@open-design/sidecar-proto`, `@open-design/sidecar`, and `@open-design/platform`.
- Do not hand-build `--od-stamp-*` args, process-scan regexes, runtime tokens, process roles, or duplicate namespace/source args in `tools/dev`, future `tools/pack`, or packaged launchers.
- Port flags are authoritative inputs: `--daemon-port` and `--web-port`. Internal env vars are `OD_PORT` and `OD_WEB_PORT`; do not introduce `NEXT_PORT`.

## Common tools commands

```bash
pnpm --filter @open-design/tools-dev typecheck
pnpm --filter @open-design/tools-dev build
pnpm --filter @open-design/tools-pack typecheck
pnpm --filter @open-design/tools-pack build
pnpm --filter @open-design/tools-serve typecheck
pnpm --filter @open-design/tools-serve build
pnpm --filter @open-design/tools-release typecheck
pnpm --filter @open-design/tools-release build
pnpm --filter @open-design/tools-release test
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev check
pnpm tools-pack mac build
pnpm tools-pack mac install
pnpm tools-pack mac cleanup
pnpm tools-serve start updater
```
