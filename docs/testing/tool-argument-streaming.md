# Long tool arguments: local CLI acceptance

The red line is a visible tool row **before arguments finish generating**.
Streaming command stdout after execution begins does not satisfy it. A filename
is a separate capability: never infer one from the user's prompt.

## Results on 2026-09-11

| Ordinary CLI | Verified boundary | Result |
| --- | --- | --- |
| Codex 0.153.4 | Real CLI → daemon → browser | `apply_patch`: 124,764-byte patch over 40.097 seconds; first file event after 7 ms, filename visible at 15 seconds. |
| Claude Code 2.1.267 | Real CLI → daemon SSE | `Write`: 123,090-byte file; target event after 4 ms with arguments incomplete, final file exact. |
| OpenCode 1.17.18 | Real CLI → daemon SSE | `write`: first tool preview after 118 ms with arguments incomplete; one final tool/result pair, final 123,090-byte file exact. |
| OpenCode 1.18.30 | Real CLI → daemon SSE | Same assertion passes; first preview after 2,104 ms. |
| OpenCode 1.17.18, browser continuation | Real CLI → daemon → browser | 40-second argument hold; tool preview after 99 ms; screenshot shows `write` at 31.9 seconds while arguments are incomplete. |
| Vela fee9d67fa + OpenCode 1.17.18 | Real Vela → OD ACP bridge | `apply_patch`: 10.002-second hold, tool preview after 72 ms, exact 123,090-byte final file, durable session captured. This is an adapter experiment, not a new AMR browser acceptance. |

These are controlled local provider experiments, not live-model latency
benchmarks. Claude/AMR have existing frontend row regression coverage. The
September 11 AMR result above was adapter-only; the September 15 follow-up below
adds real daemon and browser witnesses.

Claude uses `--include-partial-messages` when its help probe advertises support.
Older builds retain the existing fallback. This does not certify arbitrary
Bash command arguments. Codex support is scoped to official `apply_patch`
streaming; see [Codex acceptance](codex-patch-streaming.md).

## AMR daemon and browser follow-up (2026-09-15)

`e2e/tests/amr/tool-preview.test.ts` launches the actual installed Vela and
OpenCode through OD's tools-dev daemon. A loopback Chat Completions provider
sends half of a large `apply_patch` argument, then waits until OD emits the
matching tool preview before releasing the remainder. No preview plugin is
injected into AMR. Both rounds verify exact 130,290-byte files, complete final
patch input, one successful tool/result pair with the preview's identity, and
native session recovery with the same handle and `resumed` state on round two.

| Vela | OpenCode | First-turn preview | Continuation preview | Files and session |
| --- | --- | --- | --- | --- |
| fee9d67fa | 1.17.18 | 68 ms | 58 ms | Both exact; original session resumed |
| fee9d67fa | 1.18.30 | 281 ms | 161 ms | Both exact; original session resumed |

Times measure provider argument start to daemon SSE receipt, not browser paint
or live-model performance. These two OpenCode versions are tested points, not
a claim about every Vela build or older bundled OpenCode version. The first
fixture attempt removed a trailing space from the patch; its byte assertion
correctly failed. The fixture now removes only the terminal newline when
constructing the patch, preserving file whitespace.

A separate local browser run used Vela fee9d67fa and OpenCode 1.17.18 with a
synthetic AMR account/workspace authority. Runs were created through the normal
HTTP API, then the project was opened in the real web app. With arguments still
held, the page displayed `Apply_patch` and its running indicator. The first
hold lasted about 195 seconds while browser inspection recovered from transient
timeouts; the continuation was observed during a 79-second hold. Both final
123,890-byte files were exact, each had one matching final tool/result pair,
and continuation reported `resumed` with the same native handle. This
proves visibility during the hold, not a measured first-paint latency. Screenshots
and event/file evidence are retained locally under
`.tmp/amr-browser-1789443221071/`. The browser witness is manual; the committed
opt-in test covers the daemon/SSE boundary and native continuation.

AMR therefore already meets the tool-type preview red line for these tested
versions. This follow-up adds the missing acceptance coverage, without changing
Vela's managed configuration or adding another event subscriber. It does not
promise an early filename or partial command: those still require upstream
argument deltas.

```sh
OD_E2E_VELA_BIN="$(command -v vela)" OD_E2E_OPENCODE_BIN="$(command -v opencode)" corepack pnpm --filter @open-design/e2e test tests/amr/tool-preview.test.ts
```

Both executable variables are required; the test skips without them. Provider
traffic is local and uses synthetic credentials. This is additional coverage
of existing AMR behavior, so it is not a red-on-main bug-fix test.

## OpenCode event integration and compatibility

### Recovery after a temporary version probe failure (2026-09-15)

`e2e/tests/dialog/opencode-preview-recovery.test.ts` uses an ordinary installed
OpenCode with a wrapper that delays only `--version` beyond the daemon's
three-second deadline. Its first real write completes without early previews.
After removing the injected delay, the same daemon and OD conversation execute
a second write without a scan or restart. Assertions cover native `-s` session
continuation, preview arrival before arguments are released, exact file bytes,
and one final tool/result pair per turn.

On OpenCode 1.17.18 and 1.18.30, both 130,290-byte files were correct. The first
turn held arguments for 10 seconds with no preview; the recovered turn received
a preview after 350 ms and 153 ms respectively, then released them. This is a controlled-provider
daemon/SSE acceptance run, not a new GUI or live-provider latency measurement.

Run with `OD_E2E_OPENCODE_BIN=/absolute/path/to/opencode pnpm --filter
@open-design/e2e test tests/dialog/opencode-preview-recovery.test.ts`.

### Plugin boundary

The native
[JSON CLI](https://github.com/anomalyco/opencode/blob/v1.17.18/packages/opencode/src/cli/cmd/run.ts)
emits final tool records only. OD retains that transport and native session
resume. A small, dependency-free module carried in the daemon observes the
[official plugin event hook](https://opencode.ai/docs/plugins/), subscribing only
to `message.part.updated` tool pending/running states. It emits OD's private
`od_opencode_tool` JSON line with session ID, call ID, tool name and, once known,
a file target. It never copies file contents, long arguments or tool output.
The daemon converts it to the existing `tool_in_flight` contract. Native final
records remain authoritative and use the same call ID.

The plugin callback can arrive before native `step_start`; the parser buffers
that window and releases only previews belonging to the confirmed root session.
Duplicate previews/finals and late previews are suppressed. An interrupted
stream settles outstanding rows as errors instead of leaving a spinner.

- Enabled for stable `1.x` versions starting at **1.17.18**, the oldest version
  exercised here. This is a tested integration floor, **not** a claim that
  plugins first appeared in that version.
- Older, unknown, prerelease and future major versions keep native final-only
  behavior. `OPENCODE_PURE` also retains its explicit plugin-disable semantics.
- A failed/unknown version probe does not block execution. A browser run
  exercised this fallback: the file was correct but no early tool row appeared.
  Missing-version results expire after five seconds. The next launch retries
  through the bounded version probe, with concurrent launches sharing a probe;
  known versions remain cached. No manual scan or daemon restart is required.
  The daemon log records when a missing version disables previews.
- Existing inline and daemon overlay plugin lists are preserved. No user-global
  configuration is written; the child-only overlay refers to an atomically
  staged module under the daemon-owned root. Path ownership follows the root
  [AGENTS.md data-directory contract](../../AGENTS.md#daemon-data-directory-contract).
- No patched CLI, separately installed app-server, npm plugin package or new
  dependency imported by OD's module is required. OpenCode itself can still
  initialize npm dependencies and wait for them before loading local plugins;
  this is not a zero-network or zero-startup-cost guarantee (see source audit
  below). Windows native execution was not exercised.
- After successful staging, the OpenCode child receives npm fetch defaults of
  zero retries and a 10,000 ms per-request timeout. Explicit lowercase or
  uppercase npm environment settings are preserved. These defaults take
  precedence over npmrc values, affect all npm fetches in that child (including
  uncached user plugins), and are not a total startup deadline. A slow registry
  can therefore cause an uncached user plugin to fail earlier. No npmrc, global
  OpenCode config, or parent-process environment is edited; users can retain a
  longer policy by passing explicit npm fetch environment settings to OD or their CLI wrapper.

OpenCode's
[processor](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/session/processor.ts)
does not publish argument text from `tool-input-delta`. Therefore early previews
show the **tool type**, not the filename or partial command. File targets appear
when the upstream provides complete input. `tool.execute.before` is too late to
solve this generation-stage gap.

AMR already runs Vela's private OpenCode server through ACP. Vela maps the same
pending/running events, and OD's ACP bridge already forwards them. The new
plugin is intentionally scoped to direct OpenCode and BYOK-OpenCode launches;
it is not injected into Vela's managed configuration.

### Official source audit (2026-09-11)

Inspected official tags `v0.15.0`, `v1.0.0`, `v1.17.18` and `v1.18.30`.
The last tag resolved to commit
`3104c1428ec91f809e5ab86631300de41eb6952e` during this audit.

- The public `Hooks.event` callback is already present in the
  [initial plugin commit](https://github.com/anomalyco/opencode/commit/ca031278ca9ca30277620e344f7a95c597a8a0de)
  dated 2025-08-02, and in the
  [v0.15.0 plugin interface](https://github.com/anomalyco/opencode/blob/v0.15.0/packages/plugin/src/index.ts).
  This establishes historical availability, not the precise first release or
  tested compatibility with that old executable.
- The [v0.15.0 prompt processor](https://github.com/anomalyco/opencode/blob/v0.15.0/packages/opencode/src/session/prompt.ts)
  already publishes a pending tool part at `tool-input-start`. Its pending
  state omits `input`; OD's observer tolerates that missing field. Current
  processors still do not publish partial tool arguments on `tool-input-delta`.
- The [v1.18.30 plugin initializer](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/plugin/index.ts)
  supports both newer plugin modules and legacy function exports, including
  OD's default async function. It dispatches the public event with
  `type` and `properties`, which OD consumes. This is a public hook rather than
  an experimental hook, but it is not a promise against future upstream changes.
- The [loader](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/opencode/src/plugin/loader.ts)
  resolves local file URLs directly. Its `engines.opencode` compatibility check
  applies to npm plugins, not local file plugins. OD therefore owns its version
  gate. Enabling later stable 1.x versions is a compatibility policy, not proof
  that every intervening or future version has been tested.
- Having configured plugins makes initialization call `waitForDependencies`.
  The [configuration implementation](https://github.com/anomalyco/opencode/blob/3104c1428ec91f809e5ab86631300de41eb6952e/packages/opencode/src/config/config.ts)
  schedules background installation of `@opencode-ai/plugin` in applicable
  configuration directories, then joins those tasks when asked to wait.
  OD's module has no imports, but adding it can make an existing background
  dependency task part of the startup wait. The implementation now supplies
  bounded fetch defaults through the npm environment read by the upstream
  [NpmConfig loader](https://github.com/anomalyco/opencode/blob/v1.18.30/packages/core/src/npm-config.ts).
  This reduces network-failure waiting; it does not eliminate npm work.

Additional isolated CLI fault probes on official **1.18.30** configured either
an intentionally malformed module or an event callback that throws on a pending
tool event. Both runs exited zero, wrote the exact 123,090-byte fixture, and
resumed the same native session successfully. The callback error marker is
present in stderr, confirming execution of that failure path. These probes
test continued execution, not early preview timing or universal fault isolation.
Their local reports are under `.tmp/opencode-stream-research/` with names
`1.18.30-syntax-error-1789127547470` and
`1.18.30-callback-error-1789127547471`.

The source audit does not lower the tested version floor.

### Cold-cache failure handling

An isolated 1.18.30 run with external networking denied by macOS sandbox-exec
and the original npm defaults did not reach its first model request within the
90-second experiment deadline. The fixture provider remained reachable over
loopback. With the final compiled OD staging code and its fetch defaults:

| Official CLI | First preview after argument start | Held arguments | Final file | Same-session continuation |
| --- | --- | --- | --- | --- |
| 1.18.30 | 22 ms | 10.002 s | 123,090 bytes, exact | Passed |
| 1.17.18 | 667 ms | 10.003 s | 123,090 bytes, exact | Passed |

Both experiments isolated OpenCode config, XDG state/cache and the npm cache.
They blocked external networking for the CLI and its descendants; this tests
unavailable registries, not an offline model. Their reports are under
`.tmp/opencode-stream-research/1.18.30-offline-staged-1789131555164/` and
`.tmp/opencode-stream-research/1.17.18-offline-staged-1789131677804/`.

The shipped observer catches callback failures, and a failed stdout write does
not suppress a later retry of the same preview. Staging verifies and reuses
intact content, repairs corrupted modules atomically, and leaves the original
child overlay untouched if staging fails.

### Packaged macOS acceptance

Built an unsigned macOS arm64 `.app` through `tools-pack mac build --to app`
in the isolated `oc-events` namespace, then started that built executable
through `tools-pack mac start`. The real packaged daemon staged its embedded
module under its resolved data root. Through the application's renderer and
REST/SSE path, official OpenCode 1.18.30 with external networking denied produced:

- first `write` preview in **48 ms** after argument generation began;
- a **10-second** incomplete-argument hold;
- an exact **123,090-byte** file and exactly one final tool/result pair;
- final run status `succeeded`.

The model request began approximately **60 seconds after run launch** in this
packaged cold-cache experiment. Upstream logs show dependency setup failures
near the end of that interval; the exact cause of the residual delay has not
been isolated. The fetch settings are not an overall startup deadline. Do not
describe cold startup as fully solved or infer a 10-second maximum from them.

The final report is
`.tmp/opencode-stream-research/packaged-1789132326470/result.json`.
Initial harness attempts hit the inspect IPC deadline and then used an
incorrect provider configuration: `agentCliEnv` only permits `OPENCODE_BIN`
for OpenCode. The successful experiment uses an isolated CLI wrapper to supply
the local provider/config environment while retaining OD's plugin overlay.
These setup failures are not successful acceptance runs.

Windows and Linux packaged execution, signing, and installer/update flows were
not exercised by this plugin acceptance.

## Other event candidates

| Event | Integration decision |
| --- | --- |
| `message.part.updated` tool states | Implemented here; native CLI handles final output and errors. |
| `message.part.delta` text/reasoning | Useful next improvement for direct OpenCode. Requires per-part delta/snapshot deduplication before replacing native final text. AMR already maps this through Vela. |
| `session.status` / retry status | Useful for explaining retries or waiting. Never interpret an idle notification alone as successful run completion. Vela already maps status. |
| `session.error` | Keep existing native CLI error and ACP error paths; subscribing again without deduplication would duplicate failures. |
| `permission.asked` | Requires a real permission request/reply path. Do not turn it into a display-only event or automatically approve it. Vela already has ACP permission handling. |

These candidates follow the official [event catalogue](https://opencode.ai/docs/plugins/)
and [server interface](https://opencode.ai/docs/server/). They are not all newly
subscribed in this patch.

## Reproduce and regression coverage

From the repository root, point each variable at the actual ordinary CLI binary
(avoid wrappers that replace the isolated configuration):

```sh
OD_E2E_CLAUDE_BIN="$(command -v claude)" corepack pnpm --filter @open-design/e2e test tests/dialog/tool-argument-stream.test.ts -t claude
OD_E2E_OPENCODE_BIN="$(command -v opencode)" corepack pnpm --filter @open-design/e2e test tests/dialog/tool-argument-stream.test.ts -t opencode
```

Use the package `test` script so the lifecycle harness receives `npm_execpath`
and can reuse the caller's package manager without downloading pnpm into the
isolated XDG cache. A prior direct `exec vitest` invocation failed at that
Corepack setup step, before the agent ran; it was not a streaming regression.

The tests skip without the corresponding binary variable. The additional
OpenCode cold-cache/external-network-denied variant runs only on macOS. They gate incomplete
arguments until a qualifying event arrives; a deadline releases unsupported
versions so the test can diagnose a late event instead of hanging. Claude must
expose the filename; OpenCode must expose the actual tool type. Both require an
exact final file and one final tool/result pair. Reports include version,
request user-agent, timing, daemon events and file comparison. Runtime config
and state remain isolated in the shared tools-dev suite.

The Messages fixture excludes capability probes/title requests from the held
response. Its lines omit trailing spaces because Claude Write removes those
spaces. Setup failures are not evidence that streaming failed.

Focused checks passed: 133 daemon parser/ACP/resume tests and 21 frontend row
tests. The four preview regressions fail against the pre-change parser at the
worktree base and pass with the change. Recorded OpenCode trace `0580c870`
replays through the mock CLI and parser with seven tool calls and seven matching
results. Root `pnpm guard` and `pnpm typecheck` pass.

After callback/staging/fetch hardening, 26 focused plugin and native-resume
tests pass (18 plugin tests), along with both official 1.18.30 daemon E2E
variants. Online/offline first-preview latencies were 121/120 ms; both files
were exact and each had one final tool/result pair. Root guard/typecheck and
the E2E package typecheck pass. The local development daemon was rebuilt and
restarted for the existing web listener on port 60502.
