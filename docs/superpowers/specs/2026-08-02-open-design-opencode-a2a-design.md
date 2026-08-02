# Open Design and OpenCode A2A multi-turn design

## Status

Approved for implementation on the `odmcp` branch. The proof of concept must
cover the complete clarification loop, not only a one-shot prompt-to-artifact
request.

## Goal

Prove that Open Design can run as an A2A remote agent while OpenCode acts as an
A2A client, with enough protocol fidelity to make a later Mobilework client a
small integration rather than a port of Open Design's tools and workflows.

The acceptance path is:

1. OpenCode discovers Open Design through its Agent Card.
2. OpenCode submits a design request and receives an A2A task immediately.
3. Open Design runs its existing project, conversation, agent, skill, and
   workflow path.
4. When Open Design emits a `<question-form>`, the A2A task becomes
   `TASK_STATE_INPUT_REQUIRED` and carries the form as structured data.
5. OpenCode collects answers and sends them with the same `taskId` and
   `contextId`.
6. Open Design continues the same conversation and eventually completes the
   task with artifact metadata and preview links.
7. OpenCode can inspect and cancel the task throughout the lifecycle.

## Protocol baseline

The implementation targets A2A Protocol 1.0 and pins the official JavaScript
SDK at `@a2a-js/sdk@1.0.1`. JSON-RPC is the only transport in the proof of
concept.

The implementation uses the v1 wire model:

- Agent discovery at `/.well-known/agent-card.json`.
- An Agent Card `supportedInterfaces` entry with `protocolBinding: "JSONRPC"`
  and `protocolVersion: "1.0"`.
- `SendMessage`, `GetTask`, and `CancelTask` operations.
- ProtoJSON enum values such as `ROLE_USER` and
  `TASK_STATE_INPUT_REQUIRED`.
- Parts with exactly one of `text`, `data`, `url`, or `raw`; the deprecated
  v0.3 `kind` discriminator is not emitted.
- `SendMessageConfiguration.returnImmediately: true` for long-running work.

Official references:

- <https://a2a-protocol.org/latest/specification/>
- <https://a2a-protocol.org/latest/whats-new-v1/>
- <https://github.com/a2aproject/A2A/releases>
- <https://github.com/a2aproject/a2a-js>

## Chosen architecture

### Open Design is the A2A server

The existing daemon remains the only owner of projects, conversations, runs,
agent spawning, skills, workflows, files, and artifacts. A new focused A2A
route module is mounted on the daemon's Express app. It exposes the Agent Card
and the JSON-RPC endpoint, then delegates protocol execution to the official
A2A SDK.

The A2A executor is an adapter, not a second workflow engine. It talks to the
daemon through a small internal HTTP client that uses the same public endpoints
already used by `mcp.ts`:

- create or resolve a project and conversation;
- `POST /api/runs` to start or continue work;
- `GET /api/runs/:id` and `/api/runs/:id/events` to inspect progress and
  reconstruct the agent message;
- `POST /api/runs/:id/cancel` to cancel;
- project file and metadata endpoints to build final artifact links.

Using the daemon HTTP contract keeps A2A isolated from the large run-starting
implementation in `server.ts` and prevents web/daemon private imports. The
adapter can later be extracted into a separately deployed gateway without
changing the client protocol.

### OpenCode is the A2A client

OpenCode core source is not modified. The proof of concept adds one
project-level plugin under `.opencode/plugins/` and a plugin-local dependency
manifest under `.opencode/`. The plugin uses the official A2A client SDK and
registers four narrow tools:

- `open_design_a2a_send`: discover the Agent Card and submit an initial
  message;
- `open_design_a2a_get`: retrieve current task state;
- `open_design_a2a_answer`: submit structured answers to an input-required
  task;
- `open_design_a2a_cancel`: cancel an active task.

The server URL comes from `OD_A2A_URL` and defaults to the normal local Open
Design daemon origin. The plugin does not store authoritative task state; the
model passes the returned opaque `taskId` and `contextId` into later calls.

When the task requires input, the plugin returns the structured form to the
OpenCode agent. The agent may use OpenCode's existing `question` tool to render
the choices, then calls `open_design_a2a_answer`. No OpenCode UI or runtime
patch is required.

## Identity mapping

The mapping is deliberately explicit:

| A2A concept | Open Design concept | Rule |
| --- | --- | --- |
| `contextId` | `conversationId` plus project identity | Server-generated and opaque to the client. All tasks in a context reuse the same Open Design project and conversation. |
| `taskId` | One stateful commissioned design task | A task may span multiple Open Design `runId` values when clarification answers trigger continuation runs. |
| `messageId` | One inbound A2A turn | Used for deduplication within the in-memory proof-of-concept task store. |
| Task metadata | `projectId`, `conversationId`, current `runId` | Server-owned integration metadata; clients must not construct it. |
| Artifact | Generated design result | Contains agent prose, Studio URL, preview URL, project id, conversation id, run id, and file metadata where available. |

An initial message without `contextId` creates a server context. A message with
the same `contextId` but no `taskId` starts a new task in the same Open Design
conversation. A clarification response must carry both identifiers and they
must match.

## Task state mapping

| Open Design condition | A2A state |
| --- | --- |
| Run accepted but not started | `TASK_STATE_SUBMITTED` |
| Run queued or running | `TASK_STATE_WORKING` |
| Successful run whose final assistant text contains a valid question form | `TASK_STATE_INPUT_REQUIRED` |
| Successful run with a deliverable and no question form | `TASK_STATE_COMPLETED` |
| Run failed | `TASK_STATE_FAILED` |
| Run canceled | `TASK_STATE_CANCELED` |
| Invalid request, unavailable agent, or unsupported input | `TASK_STATE_REJECTED` when a task already exists; otherwise an A2A error |

`INPUT_REQUIRED` is interrupted, not terminal. Answer submission starts a new
Open Design run using the task's existing `projectId` and `conversationId`,
while the A2A `taskId` remains unchanged.

## Question Form transport

Question Form becomes a shared transport contract rather than a web-private
type. Pure completed-form parsing and answer formatting live in
`packages/contracts`; progressive streaming rendering remains web-owned.

The input-required status message contains:

- a `text` part with human-readable clarification prose;
- a `data` part with media type
  `application/vnd.open-design.question-form+json` and this envelope:

```json
{
  "schemaVersion": 1,
  "form": {
    "id": "discovery",
    "title": "Quick brief",
    "questions": [
      {
        "id": "platform",
        "label": "Platform",
        "type": "radio",
        "options": [
          { "label": "Responsive web", "value": "responsive-web" }
        ],
        "required": true
      }
    ]
  }
}
```

The answer message contains a data part with media type
`application/vnd.open-design.question-form-answer+json`:

```json
{
  "schemaVersion": 1,
  "formId": "discovery",
  "answers": {
    "platform": "responsive-web"
  }
}
```

The server validates the form id, required questions, answer value shapes, and
finite-choice values. It then uses the shared formatter to produce the same
`[form answers — <id>]` user message the Open Design web client submits today.
This keeps the inner agent and workflow behavior identical across web and A2A.

Only complete, valid forms transition the task to `INPUT_REQUIRED`. Malformed
form markup is returned as assistant text and the task fails with an explicit
adapter error rather than inventing questions.

## Artifact transport

The completed task carries one summary artifact with:

- a text part containing the final Open Design assistant message when present;
- a structured data part containing `projectId`, `conversationId`, final
  `runId`, `studioUrl`, `previewUrl`, entry file, and generated-file metadata;
- URL parts for the Studio and preview links when present.

The proof of concept does not inline generated binary files or the entire
project source tree. URLs and bounded metadata are sufficient to prove A2A
handoff and avoid large tool responses. Source transfer can be added later as
explicit artifacts or continued through the existing Open Design MCP tools.

## Polling and concurrency

The initial and answer calls request non-blocking execution. The client polls
`GetTask`; the server refreshes the task from the current Open Design run on
each retrieval.

Only one run may be active for a task. Answer submission is accepted only while
the task is `INPUT_REQUIRED`. Duplicate answer submissions with the same A2A
`messageId` return the current task without starting another run. A different
answer message received while a continuation is already working is rejected.

The proof of concept uses the SDK's in-memory task store plus an in-memory
context-to-Open-Design mapping. A daemon restart invalidates outstanding A2A
task ids. Durable task storage is intentionally deferred; production cloud
deployment must replace this store with SQLite or another tenant-aware durable
store.

## Error handling

- Unknown task: A2A `TaskNotFoundError`.
- Mismatched `taskId` and `contextId`: invalid request.
- Canceling a terminal task: `TaskNotCancelableError`. Submitted, working, and
  input-required tasks can be canceled; an input-required task has no active
  run to terminate, so the adapter marks the A2A task canceled directly.
- Daemon unavailable: task failure with a safe status message; internal URLs,
  credentials, and stack traces are not returned.
- Invalid question answers: request validation error; the task remains
  `INPUT_REQUIRED` so the user can retry.
- Unsupported file or content type: `ContentTypeNotSupportedError`.
- Duplicate message id: idempotent replay of current task state.
- Open Design run failure: `TASK_STATE_FAILED`, with bounded error code and
  message copied from the daemon status.

## Security boundary

The local proof of concept advertises no authentication and binds to the
existing local daemon origin. It must not expose credentials, local absolute
paths, event log paths, or raw daemon configuration in Agent Cards, task
metadata, messages, or artifacts.

Before cloud or Mobilework deployment, the same adapter requires HTTPS,
Bearer/OAuth authentication, tenant isolation for every context and task,
authorization on project and artifact URLs, request-size limits, rate limits,
and durable ownership checks. Those controls are not simulated in this proof
of concept.

## Repository changes

Open Design changes are expected in these bounded areas:

- `packages/contracts`: shared completed Question Form DTO, parser, validator,
  and answer formatter;
- `apps/daemon/src/a2a/`: Agent Card, daemon HTTP client, executor, state
  mapping, and route registration;
- `apps/daemon/src/server.ts`: one route registration and dependency wiring;
- `apps/daemon/package.json` and `pnpm-lock.yaml`: official A2A SDK dependency;
- `apps/daemon/tests/` and `packages/contracts/tests/`: focused protocol and
  contract tests;
- protocol usage documentation for starting Open Design and pointing a client
  at its Agent Card.

OpenCode changes are limited to:

- `.opencode/plugins/open-design-a2a.ts`;
- `.opencode/package.json` for the official client SDK dependency;
- a focused plugin test only if the repository's project-plugin test harness
  can cover it without modifying core runtime code.

## Test strategy

1. Contract tests parse canonical and malformed Question Forms, validate answer
   envelopes, and confirm web-compatible answer formatting.
2. Executor unit tests use a fake daemon client to cover submitted, working,
   input-required, answer continuation, completed, failed, canceled, duplicate
   message, and invalid-context paths.
3. Route tests validate the Agent Card and exercise `SendMessage`, `GetTask`,
   and `CancelTask` through the official A2A client SDK.
4. A local end-to-end test runs Open Design with a deterministic fake agent,
   invokes the OpenCode project plugin, answers the returned Question Form, and
   verifies that the same A2A task completes with a Studio or preview artifact.
5. Open Design validation includes daemon and contracts typechecks/tests plus
   repository `guard` and root `typecheck`. OpenCode validation is package
   scoped and does not run tests from its repository root.

## Acceptance criteria

- The Agent Card is discoverable and declares only implemented capabilities.
- OpenCode core source remains unchanged.
- An initial OpenCode tool call returns a valid A2A task and opaque ids.
- A real Open Design `<question-form>` becomes structured
  `TASK_STATE_INPUT_REQUIRED` data.
- Answering the form continues the same A2A task and Open Design conversation.
- The final task reaches `TASK_STATE_COMPLETED` and contains usable artifact
  links and metadata.
- Cancel and failure paths produce correct A2A states or standard errors.
- No v0.3 wire shapes are emitted.
- Existing MCP behavior and Open Design web Question Form behavior remain
  unchanged.

## Explicit non-goals

- SSE streaming, push notifications, and webhooks.
- gRPC or HTTP+JSON/REST bindings.
- Cloud authentication and multi-tenant authorization.
- Durable A2A task recovery after daemon restart.
- Inlining complete source trees or large binary artifacts.
- OpenCode core UI or session-runtime modifications.
- Replacing Open Design MCP; A2A proves agent delegation while MCP remains
  useful for fine-grained tool and file access.
