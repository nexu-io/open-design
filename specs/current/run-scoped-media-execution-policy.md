# Run-scoped media execution policy

## Purpose

Define the smallest Open Design patch that lets an upstream orchestrator call
OD as a creative runtime adapter while the upstream orchestrator keeps authority
over media provider use.

The proposed patch adds a run-scoped media execution policy. The policy tells
OD whether a run may generate media bytes, emit structured media requests
without executing them, or delegate those requests to a generic external media
executor. The default preserves current OD behavior.

This is a strategy and implementation-shape document. It is intended to be the
first review artifact before code lands, following the maintainer pattern from
recent architecture threads:

- Issue [#2146](https://github.com/nexu-io/open-design/issues/2146) accepted a
  focused contract proposal before implementation.
- Issue [#1969](https://github.com/nexu-io/open-design/issues/1969) asked for a
  focused design note with schema, fixture, and comparison criteria before a
  multi-mode export implementation.
- Issue [#1637](https://github.com/nexu-io/open-design/issues/1637), PR
  [#1746](https://github.com/nexu-io/open-design/pull/1746), and PR
  [#3021](https://github.com/nexu-io/open-design/pull/3021) established that a
  broad prototype should become a doc-only integration-shape review surface
  before implementation is treated as mergeable.

The same shape applies here: land the integration contract first, keep the
first code patch small, and do not make OD a provider router or account owner.

## Background

Open Design already has a media dispatcher. It is local-first and daemon-owned:

- `apps/daemon/src/media-routes.ts` exposes the project media endpoints,
  including `POST /api/projects/:id/media/generate`.
- `apps/daemon/src/media.ts` owns `generateMedia`, model/provider dispatch, and
  file writes into the project.
- `apps/daemon/src/media-config.ts` owns local provider credentials and config.
- `apps/daemon/src/media-tasks.ts` owns task snapshots, progress, waits, and
  persistence.
- `apps/daemon/src/cli.ts` exposes `od media generate` and `od media wait` as
  the shell-callable surface used by agents.
- `apps/daemon/src/prompts/media-contract.ts` instructs media-surface agents to
  call `"$OD_NODE_BIN" "$OD_BIN" media generate ...`.
- `apps/daemon/src/prompts/system.ts` adds the media contract and also contains
  a Codex imagegen override for selected image models.

The run layer already has a scoped tool-token primitive:

- `apps/daemon/src/tool-tokens.ts` mints `OD_TOOL_TOKEN` grants tied to
  `runId`, `projectId`, endpoint allowlists, operation allowlists, TTL, and
  plugin trust/capabilities.
- `apps/daemon/src/server.ts` injects `OD_TOOL_TOKEN`, `OD_BIN`,
  `OD_NODE_BIN`, `OD_DAEMON_URL`, `OD_PROJECT_ID`, and `OD_PROJECT_DIR` into
  agent runtimes.
- Existing `/api/tools/*` endpoints are the precedent for run-scoped, token
  gated wrapper commands.

The current media path is correct for normal OD use. It is too permissive for
an externally orchestrated creative execution path because an agent inside a
run can shell out to `od media generate`, causing OD to spend provider budget
and use OD-held credentials. For this integration shape, OD should contribute
creative context, skills, design systems, previews, artifacts, and
design-aware workflow, while the external orchestrator owns caller auth,
admission, orchestration, provider policy, retries, budgets, accounting,
webhooks, and external artifact manifests.

## Non-goals

- Do not replace OD's existing local media dispatcher for normal OD users.
- Do not make OD a model router, provider account pool, media budget authority,
  or global provider rate-limit service.
- Do not add an orchestrator-specific provider or import external-service
  concepts into OD's core media dispatcher.
- Do not expose arbitrary daemon/media access to any caller that can reach the
  local daemon.
- Do not require any external orchestrator for local OD media generation.
- Do not start with a broad provider-refactor PR. The first patch should be a
  focused run-policy and request-capture slice.

## Issue-response map

This proposal intentionally addresses the concrete maintainer points surfaced
in the linked issues and PRs.

| Maintainer signal | What it means here |
|---|---|
| #2146: use an authoritative contract, do not silently infer extra children. | `mediaExecution` on the run is the authoritative policy. Agents do not infer permission from project kind, selected model, or provider config. |
| #2146: keep persisted ids/storage separate from unsafe display ids. | Media requests get daemon-owned ids and project-relative artifact paths. Provider names, external executor ids, and caller labels are metadata, not storage paths. |
| #1969: decide the user workflow first, then implement modes. | The workflow split is "OD executes local media" vs "OD emits design-aware media requests for an upstream executor." These are separate policy modes, not a hidden fallback. |
| #1969: first useful artifact is design note plus schema/fixture/comparison criteria. | This doc includes the mode schema, media request shape, enforcement points, and tests. Fixtures should cover enabled, disabled, request-only, and external-stub runs. |
| #1637/#1746: avoid more isolated engine churn when product/pipeline boundary is unresolved. | Do not start by refactoring providers. Start at the run boundary, media command boundary, and request event boundary. |
| #1637/#3021: use an integration-shape doc with concrete decision points. | This doc names the policy modes, API contracts, event/resource model, owner decisions, and phased implementation sequence. |
| #3021: keep the doc self-contained and grounded in live daemon contracts. | The background section names the live files and primitives this patch should change. It does not depend on a parked branch. |
| #3021: preserve the current daemon storage contract exactly. | New persistent state should follow daemon runtime data ownership. This spec MUST NOT define daemon data paths; read root [`AGENTS.md`](../../AGENTS.md) → **Daemon data directory contract**. Media config storage remains media-config-only and should not own request state. |

## Decision summary

1. Add a run-scoped `mediaExecution` policy to `POST /api/runs`.
2. Default policy is `enabled`, preserving current behavior.
3. First implementation should ship `enabled`, `disabled`, and `request-only`.
4. Treat `external` as a generic executor contract and either document it in
   the first PR or ship it as a second patch after request-only is reviewed.
5. Move agent-driven media generation behind a run-scoped `/api/tools/media/*`
   endpoint guarded by `OD_TOOL_TOKEN`.
6. Keep the existing `/api/projects/:id/media/generate` endpoint for UI/legacy
   CLI use, but do not let an in-run agent bypass the run policy through it.
7. Add first-class media requests. Do not model request-only output as only a
   project file or only an SSE event.
8. Emit SSE when a request is created, fulfilled, failed, or cancelled.
9. Add project artifact/manifest references only when bytes exist or when a
   request is intentionally recorded as an expected slot.
10. Suppress direct media-provider prompt instructions, including the Codex
    imagegen override, unless the policy permits byte generation.
11. Gate external MCP media tools in non-enabled modes so connected MCP servers
    cannot bypass OD's own media policy.
12. Keep provider credentials and budgets outside the new policy object.

## Policy model

Recommended contract name:

```ts
export type MediaExecutionMode =
  | 'enabled'
  | 'disabled'
  | 'request-only'
  | 'external';

export interface MediaExecutionPolicy {
  mode: MediaExecutionMode;
  allowedSurfaces?: Array<'image' | 'video' | 'audio'>;
  allowedModels?: string[];
  externalExecutor?: ExternalMediaExecutorRef;
}

export interface ExternalMediaExecutorRef {
  kind: 'http';
  id?: string;
  endpoint: string;
  auth?: {
    kind: 'none' | 'bearer-env' | 'header-env';
    env?: string;
    header?: string;
  };
}
```

`enabled` means current OD behavior. Provider credentials, local media config,
and task execution work as they do today.

`disabled` means this run must not generate media bytes or create media
requests. Attempts fail with a structured policy error. The prompt should not
tell the agent to call `od media generate`.

`request-only` means the agent may create structured media requests. OD stores
the request and emits events, but does not call providers or write media bytes.
This is the safest first step for external orchestration because the upstream
service can read/poll/subscribe to the request, execute it under its own
creative policy, and fulfill it later.

`external` means OD can synchronously or asynchronously submit a media request
to a generic HTTP executor. This should stay generic. A particular deployment
can provide one executor implementation, but OD should not add
orchestrator-specific code to the provider dispatcher.

Open question: whether the first code PR should include `external`. The
recommended merge path is to ship `request-only` first, with the external
executor contract documented and covered by a fake-executor test in a follow-up.

## API and contract changes

### Runs

`POST /api/runs` accepts:

```json
{
  "projectId": "proj_...",
  "agentId": "codex",
  "prompt": "...",
  "mediaExecution": {
    "mode": "request-only",
    "allowedSurfaces": ["image", "video"]
  }
}
```

Omitted `mediaExecution` is equivalent to:

```json
{ "mode": "enabled" }
```

`GET /api/runs/:id` and run status responses should include the effective
policy summary. Do not include provider credentials, executor secrets, or
budget details in the response.

### In-run media tool endpoint

Add a token-gated endpoint for agent wrapper commands:

```text
POST /api/tools/media/generate
Authorization: Bearer <OD_TOOL_TOKEN>
```

The request body should be the existing media generation body plus optional
fields needed for request capture:

```json
{
  "surface": "image",
  "model": "gpt-image-2",
  "prompt": "A campaign poster...",
  "output": "poster.png",
  "aspect": "16:9"
}
```

Behavior by mode:

| Mode | Endpoint result |
|---|---|
| `enabled` | Create a normal media task and run `generateMedia`. |
| `disabled` | Return a structured policy error, no task, no request. |
| `request-only` | Create a `MediaRequest`, emit an event, return request metadata. |
| `external` | Create a `MediaRequest`, submit it to the external executor, and update status from executor response. |

`od media generate` should prefer this endpoint when `OD_TOOL_TOKEN` is present.
Outside a run, it can continue using the existing project endpoint so normal OD
and current UI flows remain compatible.

### Media request resource

Add first-class request endpoints:

```text
GET  /api/runs/:runId/media-requests
GET  /api/media-requests/:id
POST /api/media-requests/:id/fulfill
POST /api/media-requests/:id/cancel
```

The fulfill endpoint is for a trusted caller that already has run/project
authority. It stores the produced project-relative file metadata and moves the
request to `fulfilled`. The first patch may scope this to local/test use and
externally orchestrated deployments can bind it behind their own admission/auth
layer.

### CLI

The CLI already has `od media generate` and `od media wait`. The first patch
should add:

```text
od media requests list --run <runId> --json
od media requests fulfill <requestId> --file <project-relative-path> --json
```

If maintainers prefer a smaller first patch, list/fulfill can be hidden behind
the HTTP API initially, but root `AGENTS.md` says user-facing capability should
be reachable through both web UI and CLI. Because external orchestrators and
other external agents are CLI/API-first users, the CLI should not be deferred
for long.

### Web UI

No new full UI is required for the first request-only patch, but the run status
surface should be able to display "media request created" events and link to
the request resource. If a visible web surface is added, the CLI mirror must
land in the same PR.

## Data and event model

### MediaRequest

Recommended request DTO:

```ts
export type MediaRequestStatus =
  | 'requested'
  | 'submitted'
  | 'running'
  | 'fulfilled'
  | 'failed'
  | 'cancelled';

export interface MediaRequest {
  id: string;
  runId: string;
  projectId: string;
  conversationId?: string;
  surface: 'image' | 'video' | 'audio';
  model?: string;
  prompt: string;
  output?: string;
  aspect?: string;
  length?: number;
  duration?: number;
  audioKind?: 'music' | 'speech' | 'sfx';
  voice?: string;
  language?: string;
  inputRefs?: Array<{
    kind: 'project-file' | 'artifact' | 'media-request';
    ref: string;
  }>;
  status: MediaRequestStatus;
  policyMode: MediaExecutionMode;
  createdAt: string;
  updatedAt: string;
  fulfilledAt?: string;
  fulfilledFile?: {
    name: string;
    kind: 'image' | 'video' | 'audio';
    mime: string;
    size: number;
    path: string;
  };
  external?: {
    executorId?: string;
    externalRequestId?: string;
    statusUrl?: string;
  };
  error?: {
    code?: string;
    message: string;
  };
}
```

This should live in `packages/contracts`, not daemon-private source, because
web, CLI, e2e tests, and external orchestrators all need the same shape.

### SSE events

Add a run event payload for media requests:

```ts
export interface MediaRequestEvent {
  type: 'media_request';
  request: MediaRequest;
  action: 'created' | 'submitted' | 'progress' | 'fulfilled' | 'failed' | 'cancelled';
}
```

The event should be normalized through the existing SSE event path rather than
using ad hoc stdout text. Agents can still narrate, but the contract signal is
the structured event.

### Artifacts and manifests

Request-only mode should not fabricate bytes. It should record an expected
slot:

```json
{
  "kind": "media-request",
  "requestId": "mreq_...",
  "surface": "image",
  "status": "requested",
  "requestedOutput": "poster.png"
}
```

When fulfilled, the request points at the actual project file/artifact metadata.
This keeps OD's artifact structure useful without pretending a request is a
generated image/video/audio file.

Do not store media requests only as files under the project directory. The
daemon needs to query by run, enforce status transitions, emit SSE, and prevent
path traversal. A project file can mirror the request for human inspection, but
the daemon-owned request row is the source of truth.

## Enforcement points

### Run creation and storage

`apps/daemon/src/runs.ts` should store the effective policy on the run object.
If a caller omits the policy, set `enabled`. If a caller provides unknown modes
or invalid executor config, reject at the HTTP boundary.

`apps/daemon/src/server.ts` should pass the effective policy to the prompt
composer, tool-token minting, and the run environment.

### Tool token grant

Extend `CHAT_TOOL_ENDPOINTS` and `CHAT_TOOL_OPERATIONS` in
`apps/daemon/src/tool-tokens.ts` with media entries:

```ts
'/api/tools/media/generate'
'media:generate'
'media:requests:list'
'media:requests:fulfill'
```

The grant should keep the run/project binding. Media endpoints must verify the
token's `runId` and `projectId` and then load the run policy before doing any
provider work.

### Media routes

Keep `/api/projects/:id/media/generate` for existing UI and outside-run CLI
use. Add a stricter path for in-run calls:

- If `OD_TOOL_TOKEN` is present, `od media generate` posts to
  `/api/tools/media/generate`.
- If no token is present, `od media generate` keeps posting to the legacy
  project endpoint.
- If a token is present but invalid or disallowed, fail closed instead of
  falling back to the legacy endpoint.

This preserves compatibility while preventing an in-run agent from escaping
policy enforcement.

### Prompt composer

`apps/daemon/src/prompts/system.ts` and
`apps/daemon/src/prompts/media-contract.ts` should render different guidance by
mode:

| Mode | Prompt guidance |
|---|---|
| `enabled` | Current media generation contract. |
| `disabled` | State that media generation is disabled for this run and the agent must not call `od media generate` or external media tools. |
| `request-only` | Instruct the agent to create media requests through the OD wrapper. State that OD will not execute provider calls. |
| `external` | Instruct the agent to create/delegate media requests through OD wrapper only. Do not name provider credentials or direct provider APIs. |

The Codex built-in imagegen override must render only when the effective policy
is `enabled`. Otherwise Codex can bypass OD's dispatcher and violate the run
policy.

### External MCP tools

`apps/daemon/src/server.ts` injects connected external MCP instructions into
the run prompt. In `disabled`, `request-only`, and non-generic `external` modes,
the prompt should block direct media-provider MCP tools unless OD can gate them
through the same policy. Otherwise a connected MCP server can become an
untracked provider route.

### Local renderers

Local renderers such as `hyperframes-html` still create media bytes. In
`request-only`, they should produce requests, not run renders. In `disabled`,
they should fail. In `enabled`, current behavior stays.

### Cancellation and task polling

Existing media tasks own polling/wait loops. Media requests should have a
separate lifecycle because request-only mode has no provider task to poll.

In `external`, OD should model cancellation as best-effort:

- mark OD request `cancelled` if it has not been submitted,
- call executor cancel endpoint if the executor declared one,
- otherwise record cancellation requested and stop waiting locally.

Retries should not be OD's responsibility in the externally orchestrated path.
OD can expose the request and failure details; the upstream service decides
whether to retry.

## External executor contract

The external executor should be generic HTTP, not specific to any upstream
orchestrator.

Recommended submit request:

```json
{
  "requestId": "mreq_...",
  "runId": "run_...",
  "projectId": "proj_...",
  "surface": "image",
  "model": "gpt-image-2",
  "prompt": "A campaign poster...",
  "output": "poster.png",
  "constraints": {
    "aspect": "16:9"
  },
  "inputRefs": [],
  "callback": {
    "fulfillUrl": "http://127.0.0.1:7456/api/media-requests/mreq_.../fulfill"
  }
}
```

Recommended response:

```json
{
  "externalRequestId": "external_media_...",
  "status": "submitted",
  "statusUrl": "https://...",
  "expectedMime": "image/png"
}
```

Auth representation:

- OD may read a bearer token or header value from an environment variable named
  in `externalExecutor.auth`.
- OD must not store provider credentials, provider account ids, budgets, or
  provider rate-limit policy in the run policy.
- The executor token authenticates OD to the executor, not OD to a concrete
  media provider.

Artifact storage:

- Preferred: executor returns or posts bytes/files to OD fulfillment endpoint,
  and OD writes the final artifact into the project using daemon project-file
  APIs.
- Alternate: executor returns a durable URL and OD records a manifest entry
  without importing bytes. This should be explicit because local-first users
  may expect project artifacts to remain available offline.

Open question: whether OD should allow the alternate URL-only fulfillment in
the first external implementation. For externally orchestrated use, imported
bytes are safer because OD previews remain stable.

## Backward compatibility

- Omitted policy means `enabled`, so existing OD users see no behavior change.
- Existing media config and provider credentials continue to work for normal
  OD media projects.
- Existing UI calls to `/api/projects/:id/media/generate` keep working.
- `od media generate` outside a run keeps working.
- In-run `od media generate` becomes stricter only when `OD_TOOL_TOKEN` exists.
  This is intentional because the run has an explicit policy.
- `request-only` and `disabled` are opt-in. An external orchestrator must ask
  for them.

## Testing plan

### Unit and contract tests

- Contract tests for `MediaExecutionPolicy`, `MediaRequest`, and SSE payload
  serialization in `packages/contracts`.
- Daemon policy parser tests: omitted policy defaults to `enabled`; invalid
  modes fail; invalid executor auth fails; allowed surface/model filtering is
  enforced.
- Tool-token tests: media endpoint/operation allowlists work; invalid token
  fails closed; token project mismatch fails.
- Media-policy enforcement tests: `disabled` does not create task/request;
  `request-only` creates request but does not call `generateMedia`; `enabled`
  calls the existing dispatcher.
- Prompt tests: media contract changes by mode; Codex imagegen override is
  absent in `disabled` and `request-only`.

### Daemon route tests

- `/api/tools/media/generate` with a valid run token in each mode.
- Legacy `/api/projects/:id/media/generate` remains same-origin protected and
  continues to work outside run policy.
- Media request list/get/fulfill/cancel transitions.
- Fulfill rejects unsafe paths and cross-project files.

### CLI tests

- `od media generate` uses `/api/tools/media/generate` when `OD_TOOL_TOKEN` is
  set.
- `od media generate` fails closed on a bad token rather than falling back.
- `od media requests list --run ... --json` returns machine-readable output.
- `od media requests fulfill ... --json` writes or records the fulfilled file
  through the API, not by directly mutating daemon state.

### E2E tests

Use the existing fake-agent harness:

- Extend `e2e/lib/fake-agents.ts` with a fake agent that calls
  `"$OD_NODE_BIN" "$OD_BIN" media generate`.
- Add run tests using `e2e/lib/vitest/runs.ts` to start request-only and
  disabled runs.
- Assert request-only emits a structured media request event and no media task
  reaches provider execution.
- Assert disabled fails with a policy error and does not create request/task
  state.
- Add a fake HTTP executor for the external follow-up. It should record submit
  payloads, simulate async fulfillment, and verify OD writes the fulfilled file.

## Implementation sequence

1. Land this doc-only integration-shape PR and ask maintainers to decide:
   first patch modes, resource shape, and whether external ships now or later.
2. Add contract types in `packages/contracts` for policy, media requests, route
   DTOs, and SSE payloads.
3. Store effective policy on runs in `apps/daemon/src/runs.ts`; expose it in
   run status responses.
4. Add `apps/daemon/src/media-policy.ts` with pure helpers:
   `normalizeMediaExecutionPolicy`, `assertMediaAllowed`,
   `shouldRenderMediaContract`, and `shouldRenderCodexImagegenOverrideForPolicy`.
5. Extend `apps/daemon/src/tool-tokens.ts` with media endpoint/operation grants.
6. Add `/api/tools/media/generate` and media request CRUD/fulfill routes.
7. Update `apps/daemon/src/cli.ts` so in-run `od media generate` uses the
   token-gated endpoint and fails closed on token errors.
8. Update prompt rendering to distinguish enabled, disabled, request-only, and
   external modes.
9. Add request persistence under daemon-owned runtime data, backed by SQLite if
   the adjacent media task tables already make that easiest. Do not use
   `OD_MEDIA_CONFIG_DIR`.
10. Add focused daemon and CLI tests.
11. Add e2e fake-agent tests for disabled and request-only.
12. Ship external executor support as a second PR unless maintainers explicitly
    want it in the first patch.

## Exact files likely to change

Contracts:

- `packages/contracts/src/api/chat.ts`
- `packages/contracts/src/api/media.ts` or a new
  `packages/contracts/src/api/media-requests.ts`
- `packages/contracts/src/sse/chat.ts`
- `packages/contracts/src/index.ts`

Daemon:

- `apps/daemon/src/runs.ts`
- `apps/daemon/src/server.ts`
- `apps/daemon/src/media-routes.ts`
- `apps/daemon/src/media.ts`
- `apps/daemon/src/media-tasks.ts`
- `apps/daemon/src/tool-tokens.ts`
- `apps/daemon/src/cli.ts`
- `apps/daemon/src/prompts/media-contract.ts`
- `apps/daemon/src/prompts/system.ts`
- new `apps/daemon/src/media-policy.ts`
- new `apps/daemon/src/media-requests.ts`

Web, if a minimal visible status surface lands:

- `apps/web/src/providers/daemon.ts`
- chat/run event rendering components that already render SSE agent events

Tests:

- `apps/daemon/tests/media-policy.test.ts`
- `apps/daemon/tests/media-requests.test.ts`
- `apps/daemon/tests/media-routes.test.ts` or adjacent existing media route
  suites
- `apps/daemon/tests/cli-media.test.ts` if CLI tests are already split there,
  otherwise the existing CLI test area
- `e2e/lib/fake-agents.ts`
- `e2e/lib/vitest/runs.ts`
- new e2e spec for request-only and disabled media runs

Docs:

- this file
- optional follow-up entry in `docs/agent-adapters.md` once the contract lands

## Risks and alternatives

### Risk: policy bypass through legacy endpoint

If in-run `od media generate` falls back to `/api/projects/:id/media/generate`
after token failure, the policy is ineffective. The CLI must fail closed when a
token is present.

### Risk: Codex imagegen bypass

The Codex built-in imagegen override is a direct byte-generation path. It must
be gated by effective policy, not only by agent/model metadata.

### Risk: request-only modeled as plain text

If request-only mode only prints "please generate an image" in chat, an
external orchestrator cannot reliably orchestrate, account, fulfill, or
reconcile artifacts. Use a first-class request resource plus SSE.

### Risk: external executor becomes provider routing by another name

Keep the executor contract generic and request-level. OD submits a design-aware
media request to one executor. It does not choose OpenAI vs Runway vs Kling,
rotate credentials, manage budgets, or retry provider-specific failures.

### Alternative: env var only

An `OD_MEDIA_EXECUTION=request-only` env var is too weak. It does not survive
HTTP run creation, cannot be shown in run status, cannot be validated by
contracts, and does not give external orchestrators a stable API.

### Alternative: project-level policy

Project-level policy is too broad for external orchestration. One project may
be opened locally with OD-owned media enabled and later run under an external
orchestrator with media disabled or request-only. The policy should be
run-scoped.

### Alternative: skill/plugin-only control

Prompt-only control is not enforceable. Skills can guide the agent, but the
daemon must still enforce at the tool/media endpoint.

## Open questions for owner decision

1. Should the first code patch include only `enabled`, `disabled`, and
   `request-only`, or also the generic `external` executor?
2. Should the public field be named `mediaExecution`, `mediaPolicy`, or
   `mediaMode`?
3. Should `request-only` media requests be persisted in SQLite, project files,
   or both? Lean: SQLite source of truth, optional project-file mirror.
4. Should the fulfill endpoint require the same run-scoped tool token, a
   separate fulfillment token, or only local/same-origin access in v1?
5. Should URL-only fulfillment be allowed, or must fulfilled requests import
   bytes into the OD project?
6. Should connected MCP media tools be fully hidden in non-enabled modes, or
   shown with explicit "not allowed by run policy" guidance?
7. Should allowed models be advisory hints for the upstream orchestrator, or
   hard validation in OD request-only mode?
8. Should `disabled` allow placeholder slots, or should slots require
   `request-only`?
9. Where should media request status appear in the web UI for the first patch:
   chat event only, project artifact rail, or a dedicated request list?
10. Should media request fulfillment update conversation messages, artifact
    manifests, or only request state and project files in v1?

## Validation commands for implementation PRs

```bash
pnpm guard
pnpm typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/web test
```

Add e2e validation for the first PR that changes run behavior:

```bash
pnpm --filter @open-design/e2e test -- <new-media-policy-spec>
```
