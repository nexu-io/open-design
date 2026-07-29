# Sandbox Orchestration Hardening Architecture

## Status

Architecture review draft. This document describes the hardening work needed to
keep Open Design safe to embed under an external orchestrator without adding
consumer-specific infrastructure to this repository.

The plan is intentionally upstream-neutral. Open Design should refer to this
integration shape as an external orchestrator, not by any private deployment or
infrastructure name.

## Goal

Future contributors should not be able to accidentally weaken the sandbox
runtime contract while adding normal Open Design features. The durable defense is
not a large inventory of happy-path tests. The durable defense is to make unsafe
states hard to construct, then pin the remaining public contracts with focused
guards and smoke coverage.

The protected use case is:

1. An external orchestrator launches Open Design with `OD_SANDBOX_MODE=1` and an
   isolated `OD_DATA_DIR`.
2. The orchestrator creates runs over HTTP/SSE and supplies only run-scoped
   policy, tools, and project context.
3. Open Design contributes design context, skills, previews, artifacts, CLI/UI
   parity, and agent execution.
4. The orchestrator owns caller auth, provider credentials, budgets, rate
   limits, external media tools, accounting, fanout, retries, and fulfillment.

## Corrected Framing

`OD_SANDBOX_MODE=1` is the spine of the sandbox runtime contract. Several
important behaviors are deliberately conditional on sandbox mode:

- persisted MCP servers are not mixed into a run-scoped tool bundle;
- persisted MCP OAuth tokens are not read for sandboxed runs;
- `HOME`, `XDG_*`, `CODEX_HOME`, and `TMPDIR` are pinned into the sandbox
  runtime root;
- imported-folder project access is restricted until files are mirrored into a
  managed project directory.

Without `OD_SANDBOX_MODE=1`, Open Design is the normal local product runtime, not
the external-orchestrator containment runtime. Tests and docs must say which mode
they are proving.

Namespace and data isolation are separate axes. Namespace identifies sidecar
processes, IPC sockets, pointers, and launcher-managed runtime files. Daemon data
is isolated by `OD_DATA_DIR` plus sandbox mode, not by namespace alone.

## Safety Invariants

### I1. Public Contracts Stay Product-Neutral

Public contracts, prompts, and docs must not name private orchestrators or
private infrastructure. They should use "external orchestrator" or
"orchestrator."

Hardening:

- Add a product-neutrality guard to `pnpm guard` over public contracts, prompts,
  help strings, docs, and shipped content. The upstream guard should enforce
  generic orchestrator phrasing and may support private local forbidden terms
  through developer configuration, but it should not commit private deployment
  names into the public repository.
- Keep public docs phrased around the integration role, not deployment-specific
  names.

### I2. Media Spend Uses an Enforced Chokepoint

The current policy path is easy to bypass because the provider-spending helper is
lower level than the policy guard. The target architecture is:

- introduce a single `generateMediaForRun(...)` style chokepoint that resolves
  the run, validates the run-scoped media policy, checks token/run provenance,
  then calls the provider implementation;
- make the raw provider implementation private to the media module or guard its
  imports so it cannot become a new app-level entrypoint;
- require every run creation path to pass an explicit `mediaExecution` decision
  into `design.runs.create`, even when the chosen value is the default enabled
  policy;
- in sandbox mode, make the legacy local media route require a run-scoped grant
  or route through the token-gated media endpoint.

This moves the primary guarantee from "known callers are tested" to "new callers
cannot accidentally skip the policy."

### I3. Run-Scoped Tools Are Mode-Explicit

Run-scoped tool bundles are a sandbox-mode guarantee. In sandbox mode, the spawned
agent should see only the run-scoped MCP servers supplied for that run, and
persisted registry/OAuth state should not bleed into the run.

Hardening:

- Keep the existing unit coverage for run-scoped bundle selection.
- Add one tools-dev/e2e variant that launches with `OD_SANDBOX_MODE=1` and a
  unique `OD_DATA_DIR`, then asserts run-scoped tools and runtime homes are
  contained.
- Pin `applySandboxRuntimeEnv` behavior with primitive tests that inspect the
  child environment assembled for an agent.

### I4. Sidecar Namespaces Cannot Cross Wires

The namespace contract is about launcher identity and sidecar transport, not
daemon data. The useful hardening targets are:

- two namespaces must resolve independent IPC sockets, pointers, log paths, and
  runtime paths;
- port changes must not change namespace-scoped paths;
- stale pointer cleanup must only remove the pointer it owns;
- process matching must not classify a foreign process tree as an Open Design
  sidecar just because command text looks similar.

These are primitive tests against `packages/sidecar-proto`,
`packages/sidecar`, `packages/platform`, and `tools/dev`, not broad e2e user
flows.

### I5. Export And Preview Surfaces Stay Project-Scoped

The export manifest and inline-export coverage is useful. The byte-serving
surface used by previews is the raw project-file route. The protected contract
is:

- manifest entries describe project files without leaking host paths;
- `GET /api/projects/:id/raw/*` cannot traverse or follow symlink escapes;
- inline export continues to require `inline=1`, HTML owner files, and bounded
  owner bytes;
- preview URLs are derived from the project entry file, use the daemon raw route
  with per-segment encoding, are null when no entry exists, and are not durable
  public URLs.

Hardening should focus on the byte-serving path as much as the manifest path.

### I6. Stream-JSON Tool Results Stay Run-Scoped

`POST /api/runs/:id/tool-result` is a privileged writeback channel into a live
stream-json run. It already derives run scope from the path, but it does not yet
fail closed on a `toolUseId` that is absent from that run's pending host-answer
set.

Add focused tests for wrong-run IDs, unknown tool IDs, repeated answers, and body
fields that try to smuggle a different run id, then add the membership check
before writing to child stdin.

## Already Covered

Do not re-implement these as new broad tests unless the underlying behavior is
being changed:

| Area | Existing coverage |
| --- | --- |
| Media policy parser and denial codes | `apps/daemon/tests/media-policy.test.ts` |
| In-run media route behavior, disabled policy, surface/model denial, token/no-token legacy behavior | `apps/daemon/tests/media-policy-routes.test.ts` |
| Run-scoped MCP bundle parsing and sandbox-mode bundle selection | `apps/daemon/tests/run-tool-bundle.test.ts` |
| Sandbox mode parsing and data-root requirements | `apps/daemon/tests/sandbox-mode.test.ts`, `apps/daemon/tests/resolve-data-dir.test.ts` |
| Sandbox runtime directory/bootstrap behavior | `apps/daemon/tests/sandbox-runtime-bootstrap.test.ts` |
| Tool-token issuance and route authorization | `apps/daemon/tests/tool-tokens.test.ts` |
| Export manifest shape and sandbox imported-folder denial | `apps/daemon/tests/export-manifest-route.test.ts` |
| Inline export route behavior | `apps/daemon/tests/export-inline-route.test.ts` |
| `/api/ready` daemon readiness | `apps/daemon/tests/daemon-lifecycle.test.ts` |
| Always-on tools-dev inspect smoke | `e2e/tests/tools-dev/inspect.test.ts` |

The hardening plan should diff against this list before adding tests.

## Net-New Work

### PR Strategy

Keep the follow-up stack to three PRs unless review uncovers a real ownership
boundary that needs to split out. This follows the maintainer read on #3416:
start with the neutrality guard plus daemon-route and `tool_result` hardening,
then move to media fail-closed behavior, then pin contracts and static ownership
checks.

1. PR1: product-neutrality guard and daemon-core chokepoints.
2. PR2: sandbox-mode media fail-closed behavior and the tools-dev/e2e smoke.
3. PR3: contracts/golden fixtures, static ownership checks, and raw project-file
   regression coverage.

Dependent branches should be based on the previous branch and updated before
opening, so review catches conflicts within the stack instead of at merge time.

### Phase 0: Product-Neutrality And Daemon-Core Chokepoints

- Replace any public private-orchestrator references with "external
  orchestrator."
- Add a public guard that fails on named orchestrator examples in public
  contract, prompt, docs, help, and shipped content surfaces; support stricter
  private terms through local configuration.
- Keep the allowlist narrow so normal references to Open Design, GitHub
  repository names, and public package names do not fail.
- Delete dead shadow handlers for `POST /api/projects/:id/media/generate` and
  `POST /api/projects/:id/export/pdf`.
- Add a duplicate-route registration guard so Express registration order is not
  the safety mechanism.
- Add red-spec-first tests for `POST /api/runs/:id/tool-result`, then reject
  unknown, wrong-run, and duplicate `toolUseId` submissions before writing to
  child stdin.

### Phase 1: Media Chokepoint

- Move stable media policy denial codes into `packages/contracts`.
- Add a small golden fixture that pins the disabled-policy response shape and
  code names.
- Introduce a run-aware media generation entrypoint and make raw provider
  execution non-exported or statically guarded.
- Make `mediaExecution` explicit at every `design.runs.create` call site.
- In sandbox mode, fail closed when an in-run caller reaches the legacy media
  route without a run-scoped grant.

### Phase 2: Sandbox-Mode E2E Variant

- Plumb `OD_SANDBOX_MODE=1` and a unique `OD_DATA_DIR` through a
  `createSmokeSuite(...).with.toolsDev(...)` variant.
- Assert sandbox mode through `/api/daemon/status`.
- Start one run with a run-scoped MCP tool and verify persisted MCP registry
  state is not visible in the child.
- Verify agent home/temp paths resolve under the sandbox runtime root.

### Phase 3: Contract Golden And Static Ownership

Keep the stable shapes in `packages/contracts` so web, daemon, CLI, and
orchestrators read the same source of truth:

- media policy denial codes;
- disabled media response skeleton;
- export manifest v1 skeleton;
- run status fields relevant to external observation;
- preview URL shape constraints.

The daemon tests should compare live responses to the golden. The e2e smoke
should check one live daemon against the same fixture.

- Add a precise web-isolation guard: `apps/web/**` must not import daemon private
  source, sidecar internals, or platform process primitives.
- Avoid broad "business logic cannot import sidecar" rules; the daemon is a
  sidecar host and legitimately imports sidecar modules.
- Add CODEOWNERS once the owning GitHub team/user names are known, with coverage
  for sandbox runtime, sidecar/process stamping, tools-dev, media policy,
  contracts, route registration, and e2e smoke harness files.
- Mirror these surfaces in the external maintainer PR-duty workflow so review
  output marks them as sandbox-orchestration-sensitive. Do not restore
  `tools/pr` without a separate maintainer decision.
- Ensure every new guard or smoke is invoked by `.github/workflows/ci.yml`; an
  uncalled guard is documentation, not enforcement.

### Phase 4: Raw Project-File Regression Coverage

- Extend raw route and `resolveProjectFilePath` tests for traversal, symlink
  escape, and preview URL derivation.
- Keep inline export route tests as regression coverage for its existing caps and
  symlink-aware resolution.

## Open Decisions

1. `/api/ready` already exists. Either add `od daemon ready --json` for CLI
   parity or classify readiness as an internal daemon probe exempt from the
   UI/CLI dual-track rule.
2. CODEOWNERS needs real repository owner handles before it can be enforced.
3. The exact sandbox-mode behavior for the legacy local media route needs a
   compatibility decision: token-only in sandbox mode is the safest option, but
   the normal local UI/CLI path should remain compatible outside sandbox mode.
4. Decide whether the contract golden should live under
   `packages/contracts/src/api/` as typed exports, under `packages/contracts`
   tests as JSON fixtures, or both.

## Non-Goals

- Do not add a generic provider router, provider account pool, global media
  budget system, or external executor API to Open Design.
- Do not add consumer-specific conformance tests to Open Design CI.
- Do not claim namespace alone isolates daemon data.
- Do not use regex-only guards for data-flow properties like "paths are not
  derived from ports"; write primitive tests instead.
- Do not use broad sidecar import bans that fail on legitimate daemon host code.

## Suggested PR Slices

1. Product-neutrality guard plus daemon-core chokepoints: corrected plan,
   guard/test, dead shadow-route deletion, duplicate-route guard, and
   `tool_result` pending-id enforcement.
2. Sandbox-mode fail-closed media and e2e smoke: explicit run media policy for
   orbit/routine paths, sandbox-only legacy media hardening, and one
   `OD_SANDBOX_MODE=1` tools-dev smoke.
3. Contracts goldens and static ownership checks: contract-owned denial codes
   and fixtures, raw project-file regression coverage, web import isolation, and
   CODEOWNERS/external PR-duty updates if owner handles are known.
