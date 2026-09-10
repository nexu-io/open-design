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
  payloads for native assembly; the publisher retains the full resource set.
  `prepare --freeze-storage true` freezes the exact selection, public signing
  keys and compatibility baseline at `<channel>/<version>/version-input.json`
  in policy-bound release storage. This is an immutable release input, not a
  workload cache record or an activation marker. Fresh-runner retries restore
  it before reading `latest`; changed selections and readback collisions fail.
  Never persist private keys. A frozen version cannot be reassigned to another
  source commit after a failed attempt.
- `build distribution --retain-result true` retains completed installers and
  their binding receipt at `<channel>/<version>/native/<shell>/<target>/` in
  release storage. Restore only matching frozen inputs and verified original
  bytes; never treat an interrupted native workspace as a completed result or
  assume that signing the same inputs again produces identical bytes. The
  completed result does not replace installed acceptance or channel activation.
- `resource acquire` assembles the complete nine data inputs; `runtime build`
  produces an explicit miss-only web/daemon selection and `runtime acquire`
  assembles the complete native runtime pair. Acquisition never builds or
  contributes cache results. Ordinary URL+SHA descriptors are business inputs,
  not permission to interpret workload identities. User-facing CDN objects
  remain complete per-version immutable copies, even for reused bytes.
- Same-carrier installed acceptance chooses isolated Closure hot update or
  public Shell updater Capsule+Closure replacement using verified logical Shell
  identity, not per-version metadata URLs. Capsule proof requires sealed baseline
  and first-install bindings, freshly authenticated selected bytes, exact committed
  generation, outgoing shutdown, restarted renderer and a separate cold restart.
  Keep current first-install proof independent; a changed physical carrier still
  requires its own upgrade evidence and must not silently become first-install-only.
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
