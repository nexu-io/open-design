# Runtime Adapter Current State

## Purpose

The runtime adapter layer lets the daemon drive locally installed AI-agent
CLIs through one Open Design run contract. It resolves and probes each CLI,
builds a runtime-specific invocation, delivers the composed prompt, normalizes
the runtime's output, and publishes run events to the web UI and `od` CLI.

## Current Source Layout

The implementation is split by responsibility:

- `apps/daemon/src/runtimes/registry.ts` owns the built-in registry and appends
  configured local profiles.
- `apps/daemon/src/runtimes/defs/*.ts` contains one runtime definition per
  built-in adapter. `apps/daemon/src/agents.ts` is now only a compatibility
  re-export surface; it is not the definition source.
- `apps/daemon/src/runtimes/types.ts` defines `RuntimeAgentDef` and the detected
  agent shape.
- `apps/daemon/src/runtimes/detection.ts`, `launch.ts`, `executables.ts`,
  `invocation.ts`, and `models.ts` own probing, executable resolution, process
  launch normalization, and model validation.
- `apps/daemon/src/routes/runs.ts` owns `POST /api/runs`, run event streaming,
  cancellation, and the compatibility `POST /api/chat` route. The current run
  execution pipeline is assembled in `apps/daemon/src/server.ts`.
- `apps/daemon/src/runtimes/claude-stream.ts`, `json-event-stream.ts`,
  `qoder-stream.ts`, and `apps/daemon/src/copilot-stream.ts` normalize
  runtime-specific structured output.
- `apps/daemon/src/agent-protocol/` owns the shared JSON-line transport and the
  ACP and pi RPC protocol implementations.

## Registered Runtimes

`BASE_AGENT_DEFS` in `apps/daemon/src/runtimes/registry.ts` currently contains
26 built-in adapter definitions. `AGENT_DEFS` also appends valid local profiles
loaded by `readLocalAgentProfileDefs()`, so an installation can expose more
entries than the built-in list.

| Stream / protocol | Built-in adapter IDs | CLI binaries |
|---|---|---|
| `claude-stream-json` | `claude`, `amp`, `codebuddy` | `claude`, `amp`, `codebuddy` |
| `json-event-stream` | `codex`, `opencode`, `byok-opencode`, `cursor-agent`, `mimo` | `codex`, `opencode-cli`, `opencode-cli`, `cursor-agent`, `mimo` |
| `acp-json-rpc` | `amr`, `devin`, `hermes`, `trae-cli`, `kimi`, `kiro`, `kilo`, `vibe`, `reasonix` | `vela`, `devin`, `hermes`, `traecli`, `kimi`, `kiro-cli`, `kilo`, `vibe-acp`, `reasonix` |
| `pi-rpc` | `pi` | `pi` |
| `qoder-stream-json` | `qoder` | `qodercli` |
| `copilot-stream-json` | `copilot` | `copilot` |
| `plain` | `grok-build`, `qwen`, `deepseek`, `aider`, `antigravity`, `atomcode` | `grok`, `qwen`, `deepseek`, `aider`, `agy`, `atomcode` |

There is no registered `gemini` adapter. The standalone Gemini CLI runtime was
retired when Kimi ACP was restored. The JSON event parser still understands a
Gemini-shaped stream as an internal compatibility path for buffered
Antigravity output; that parser branch does not make Gemini a selectable
runtime.

## Runtime Definition Contract

Each `RuntimeAgentDef` supplies the declarative data and hooks needed by the
shared orchestration layer. The main groups are:

- Identity and executable discovery: `id`, `name`, `bin`, `fallbackBins`,
  `versionArgs`, and optional help/capability probes.
- Model discovery and validation: `fallbackModels`, optional `listModels` or
  `fetchModels`, optional `reasoningOptions`, and custom-model policy.
- Invocation: `buildArgs()`, optional runtime environment, prompt delivery
  mode, image support, and prompt-size constraints.
- Output normalization: `streamFormat` and, for the shared JSON event stream,
  `eventParser`.
- Integrations: MCP discovery/injection metadata, authentication probes,
  inactivity timeouts, and install/documentation metadata.
- Session continuity: CLI resume, captured stream session IDs, or ACP
  `session/load`, depending on the runtime.

Local profiles inherit a built-in adapter and may override identity, binary,
arguments, environment, models, and version/help probes. A profile cannot
replace a built-in ID, and an unknown explicit base adapter is rejected.

## Detection Flow

The batch entry point is `detectAgents()`; `detectAgentsStream()` yields the
same results as each probe settles.

1. Iterate over the registry, including valid local profiles.
2. Use `resolveAgentLaunch()` to select the executable that the run path will
   actually launch. This includes configured binaries, compatible fallback
   binaries, and wrapper/native-launch normalization.
3. Run the version probe. A missing, non-executable, or broken target is
   reported as unavailable with a diagnostic.
4. For an invocable runtime, probe advertised CLI capabilities, models, and
   authentication concurrently.
5. Use live model discovery when it succeeds; otherwise expose the adapter's
   fallback model list and mark its source as `fallback`.
6. Refresh the model-validation cache from the result surfaced to clients.

A failed probe is isolated to that adapter instead of removing every agent
from the picker. Detection results include availability, resolved path,
version, models and their source, stream metadata, authentication state, and
diagnostics where applicable.

## Run Flow

`apps/daemon/src/routes/runs.ts` exposes the durable run API:

- `POST /api/runs` creates and starts a run.
- `GET /api/runs/:id/events` streams persisted and live run events.
- `POST /api/runs/:id/cancel` cancels the run.
- `POST /api/chat` remains the compatibility chat/SSE entry point.

For a local runtime, the shared execution pipeline:

1. Resolves `RuntimeAgentDef` from the request's `agentId` and validates the
   selected model, reasoning option, project, attachments, and tool bundle.
2. Resolves the project working directory. This spec MUST NOT define daemon
   data paths; read root [`AGENTS.md`](../../AGENTS.md) → **Daemon data
   directory contract**.
3. Composes the daemon system prompt, applicable conversation context, active
   skill and design-system content, attachments, and the current user turn.
4. Stages active skill side files inside the project when possible and builds
   the runtime-specific allowed-directory set. Design-system bodies are read
   by the daemon and folded into the prompt.
5. Resolves the same launch target used by detection, calls `buildArgs()`,
   normalizes the platform-specific invocation, and starts the child with an
   argument array and `shell: false`.
6. Delivers the prompt through the adapter's declared input mode and routes
   stdout through the matching stream or protocol handler.
7. Publishes normalized agent events and lifecycle state to the run service,
   while tracking cancellation, retries, inactivity, artifacts, usage, and
   native-session recovery.

## Prompt Delivery and Session Continuity

Prompt delivery is no longer one universal argv strategy:

- Stdin-capable adapters declare `promptViaStdin`. Claude uses
  `promptInputFormat: 'stream-json'`; other stdin adapters receive text.
- `grok-build` and `atomcode` opt into daemon-created prompt files.
- ACP and pi RPC sessions send the prompt through their protocol handshake.
- Any remaining argv-based adapter is checked against platform command-line
  budgets before launch.

Session continuity is likewise adapter-specific:

- Claude, Codebuddy, and OpenCode can continue a CLI-owned session.
- Codex captures the thread ID from `thread.started` and resumes that explicit
  thread on later turns.
- Pi persists and reuses its RPC session file.
- AMR can capture an ACP durable session ID and resume with `session/load`.
- Other adapters continue to receive daemon-composed conversation context.

The daemon owns the resume identity checks and transparent reseed behavior, so
runtime definitions only declare the mechanism they support.

## Output Normalization

The run pipeline selects a handler from `streamFormat`:

| Format | Current handler |
|---|---|
| `claude-stream-json` | `createClaudeStreamHandler()` in `runtimes/claude-stream.ts` |
| `json-event-stream` | `createJsonEventStreamHandler()` in `runtimes/json-event-stream.ts`, parameterized by `eventParser` |
| `qoder-stream-json` | `createQoderStreamHandler()` in `runtimes/qoder-stream.ts` |
| `copilot-stream-json` | `createCopilotStreamHandler()` in `copilot-stream.ts` |
| `pi-rpc` | `attachPiRpcSession()` from `agent-protocol/pi-rpc/` |
| `acp-json-rpc` | `attachAcpSession()` from `agent-protocol/acp/` |
| `plain` | guarded stdout/stderr forwarding |

Structured handlers normalize runtime output into events such as `status`,
`text_delta`, `thinking_start`, `thinking_delta`, `tool_use`, `tool_result`,
`usage`, and `error`. The shared run layer applies role-marker and substantive-
output guards before completing the run.

## ACP and Pi Protocol Layout

The old flat `apps/daemon/src/acp.ts` and `apps/daemon/src/pi-rpc.ts` modules no
longer exist. Their current boundary is:

```text
apps/daemon/src/agent-protocol/
├── core/       shared JSON-line transport
├── acp/        ACP model detection, session setup, RPC, and update mapping
├── pi-rpc/     pi model parsing, session lifecycle, and event mapping
└── index.ts    explicit public re-exports
```

`core/` is the shared foundation. ACP and pi RPC do not import each other's
internals. See `apps/daemon/src/agent-protocol/README.md` for the module's
public surface and dependency rules.

## Safety and Lifecycle Guarantees

The current adapter layer includes these protections:

- Detection and execution resolve the same launch target; a run does not fall
  back to blindly spawning `def.bin` after detection fails.
- Child processes use argument arrays with `shell: false`; platform wrapper
  normalization is centralized in the invocation layer.
- Model IDs, reasoning choices, attachment paths, prompt budgets, working
  directories, and optional external MCP injection are validated before use.
- Structured protocol stages and the overall run have timeout/inactivity
  guards.
- `POST /api/runs/:id/cancel` propagates cancellation to the active child or
  protocol session, with forced shutdown as a fallback.
- Native session IDs are persisted only for adapters that declare a resume
  mechanism, and stale resume targets are cleared and reseeded once.

## Current Architecture Boundary

The runtime layer has already moved beyond a single `agents.ts` object array:
definitions, probing, executable resolution, prompt budgeting, parsers, and
subprocess protocols are separate modules. It remains intentionally centered
on declarative `RuntimeAgentDef` records plus shared run orchestration rather
than independent adapter classes implementing `detect()`, `run()`, `cancel()`,
and `resume()`.

Cancellation, retries, persistence, SSE/AG-UI delivery, and most resume policy
are run-service concerns. Runtime definitions own only the CLI-specific facts
and hooks needed by that shared pipeline. Cloud/API provider execution remains
a separate provider path; `byok-opencode` is the local OpenCode bridge.
