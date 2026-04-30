# Runtime Adapter Current State

## Purpose

Runtime Adapter is the daemon layer responsible for adapting local AI agent CLIs. It converts Open Design's unified generation requests into the actual command-line invocations for each CLI, and converts CLI output into streaming events that the frontend can consume.

The current implementation is concentrated in:

- `apps/daemon/src/agents.ts`: agent definitions, detection, model lists, argument construction, model validation.
- `apps/daemon/src/server.ts`: `/api/chat` request orchestration, prompt composition, `spawn()` subprocesses, SSE forwarding.
- `apps/daemon/src/claude-stream.ts`: parsing Claude Code structured JSONL output.
- `apps/daemon/src/json-event-stream.ts`: parsing structured JSON/JSONL output from Codex, Gemini, OpenCode, and Cursor Agent.
- `apps/daemon/src/acp.ts`: model detection and streaming session orchestration for the ACP JSON-RPC runtime.

## Currently Supported Runtimes

`AGENT_DEFS` in `apps/daemon/src/agents.ts` defines 8 local runtimes:

| id | Name | CLI | Output format | Model list source |
|---|---|---|---|---|
| `claude` | Claude Code | `claude` | `claude-stream-json` | Static fallback |
| `codex` | Codex CLI | `codex` | `json-event-stream` | Static fallback |
| `gemini` | Gemini CLI | `gemini` | `json-event-stream` | Static fallback |
| `opencode` | OpenCode | `opencode` | `json-event-stream` | `opencode models` + fallback |
| `hermes` | Hermes | `hermes` | `acp-json-rpc` | `session/new` from `hermes acp` + fallback |
| `kimi` | Kimi CLI | `kimi` | `acp-json-rpc` | `session/new` from `kimi acp` + fallback |
| `cursor-agent` | Cursor Agent | `cursor-agent` | `json-event-stream` | `cursor-agent models` + fallback |
| `qwen` | Qwen Code | `qwen` | `plain` | Static fallback |

Each runtime definition contains:

- `id` / `name` / `bin`: used for frontend display and process startup.
- `versionArgs`: used to detect the version.
- `fallbackModels`: static fallback options for the model selector.
- `listModels`: optional model discovery command.
- `fetchModels`: optional custom model detection logic, suitable for runtimes such as ACP that require a handshake before the model list is available.
- `reasoningOptions`: optional reasoning effort options, currently used by Codex.
- `buildArgs()`: converts unified input into the CLI's argv; it can also read `runtimeContext` at runtime, currently used to explicitly pass execution context such as `cwd`.
- `streamFormat`: tells the daemon how to interpret stdout.

## Detection Flow

The detection entry point is `detectAgents()`.

Flow:

1. Iterate over `AGENT_DEFS`.
2. Use `resolveOnPath()` to locate the CLI binary in `PATH`.
3. After locating it, run `versionArgs` to get the version.
4. Generate the model list through `listModels`, `fetchModels`, or `fallbackModels`, depending on runtime capabilities.
5. Return the result to the frontend and refresh the runtime's model validation cache.

The detection result includes:

- `available`: whether the CLI is available.
- `path`: the actual binary path.
- `version`: version string.
- `models`: model list used by the frontend model menu.
- `reasoningOptions`: reasoning effort menu.
- `streamFormat`: output format hint.

## Runtime Flow

Actual execution happens in `POST /api/chat` in `apps/daemon/src/server.ts`.

Flow:

1. The frontend submits `agentId`, user message, system prompt, project ID, attachments, model, and reasoning options.
2. The daemon uses `getAgentDef(agentId)` to find the runtime definition.
3. The daemon creates or locates `.od/projects/<projectId>/` as the agent working directory.
4. The daemon validates uploaded image paths and project attachment paths.
5. The daemon combines the system prompt, working directory hint, existing file list, attachment list, and user request into one prompt.
6. The daemon prepares additional readable directories: `skills/` and `design-systems/`.
7. The daemon validates the model and reasoning option.
8. It calls `def.buildArgs(...)` to generate CLI arguments; currently it also passes `runtimeContext = { cwd }` for CLIs that need an explicit workspace argument.
9. It starts the local runtime with `spawn(def.bin, args, { cwd })`; plain / Claude use read-only stdin, and ACP runtimes use writable stdin.
10. The daemon forwards runtime output to the frontend through SSE.

## Output Stream Handling

There are currently four output formats:

### Claude Code: Structured JSONL

Claude Code uses:

```bash
claude -p <prompt> --output-format stream-json --verbose --include-partial-messages
```

The daemon parses stdout through `createClaudeStreamHandler()` and converts Claude Code JSONL events into UI events:

- `status`
- `text_delta`
- `thinking_delta`
- `thinking_start`
- `tool_use`
- `tool_result`
- `usage`

These events are sent to the frontend through the SSE `agent` event.

### Codex / Gemini / OpenCode / Cursor Agent: Structured JSON Event Stream

These four runtimes currently use the unified `json-event-stream` output format, with stdout parsed by `apps/daemon/src/json-event-stream.ts`.

#### Codex

Codex currently uses:

```bash
codex exec --json --skip-git-repo-check --full-auto -C <cwd> <prompt>
```

The current integration uses the lightweight structured path through `exec --json`. Compared with the original plain-text `codex exec`, this path adds:

- `--json`: structured event output
- `--skip-git-repo-check`: allows running in a temporary working directory
- `--full-auto`: non-interactive automatic execution
- `-C <cwd>`: explicit working directory

The daemon currently maps:

- `thread.started` → `status(initializing)`
- `turn.started` → `status(running)`
- `item.completed(agent_message)` → `text_delta`
- `turn.completed.usage` → `usage`

#### Gemini

Gemini currently uses:

```bash
gemini --output-format stream-json --skip-trust -p <prompt>
```

The daemon currently maps:

- `init` → `status(initializing)`
- `message(role=assistant)` → `text_delta`
- `result.stats` → `usage`

Gemini may still output some workspace scan warnings on stderr at runtime; the main flow remains unaffected.

#### OpenCode

OpenCode currently uses:

```bash
opencode run --format json --dangerously-skip-permissions <prompt>
```

When the user selects a model, `--model <id>` is appended.

The daemon currently maps:

- `step_start` → `status(running)`
- `text` → `text_delta`
- `tool_use` → `tool_use`
- Completed `tool_use.state` → `tool_result`
- `step_finish.part.tokens` → `usage`

#### Cursor Agent

Cursor Agent currently uses:

```bash
cursor-agent --print --output-format stream-json --stream-partial-output --force --trust --workspace <cwd> -p <prompt>
```

When the user selects a model, `--model <id>` is appended.

The daemon currently maps:

- `system(subtype=init)` → `status(initializing)`
- `assistant` partial chunks with `timestamp_ms` → `text_delta`
- `result.usage` → `usage`

Cursor outputs both partial assistant chunks and the final aggregated assistant message. The daemon currently prioritizes partial chunks and ignores the final aggregated text after partial chunks have appeared, avoiding duplicate rendering.

### Qwen: Plain Text Pass-through

Qwen currently still uses the `plain` output format.

The daemon directly forwards stdout chunks to the frontend through the SSE `stdout` event, and stderr chunks through the `stderr` event.

### Hermes / Kimi: ACP JSON-RPC

Hermes uses:

```bash
hermes acp --accept-hooks
```

Kimi uses:

```bash
kimi acp
```

The daemon starts an ACP session over stdio through `apps/daemon/src/acp.ts`:

1. `initialize`
2. `session/new`
3. Optional `session/set_model`
4. `session/prompt`

When an ACP runtime actively emits `session/request_permission`, the daemon prefers `approve_for_session`, which supports headless automatic approval for CLIs such as Kimi that require approval before tool calls.

The `session/new` response returns `sessionId`, `models.availableModels`, and `models.currentModelId`. The daemon reuses this information for model detection and runtime status reporting.

It then converts Hermes / Kimi `session/update` events into frontend-consumable `agent` events:

- `agent_thought_chunk` → `thinking_start` / `thinking_delta`
- `agent_message_chunk` → `text_delta`
- Final usage from `session/prompt` → `usage`

At runtime, two additional status events are added:

- Emit `status(model)` after `session/new` returns the default model.
- Emit `status(streaming)` when the first text token arrives, including `ttftMs`.

Model detection also reuses ACP: during detection, the daemon reads `models.availableModels` and `models.currentModelId` from the `session/new` response.

The current Kimi MVP integration directly reuses the Hermes ACP orchestrator. Automatic permission approval has been added to the shared ACP layer. `multica` also contains Kimi-specific tool title normalization and provider error sniffing; this repository currently keeps a lighter implementation.

## Prompt Injection Approach

Local CLIs currently use a unified approach of folding the system prompt into the user message.

The reason is that most local code-agent CLI command-line entry points lack an independent system channel. The daemon composes the following content into a single input:

- `systemPrompt`: base output contract + skill content + design system content.
- `cwdHint`: current working directory and file writing rules.
- `filesListBlock`: existing file list in the project directory.
- `attachmentHint`: attachments uploaded or selected by the user.
- `message`: original user request.
- `safeImages`: temporary uploaded image paths appended in `@path` form.

Claude Code additionally exposes `skills/` and `design-systems/` through `--add-dir`, making it easier for the agent to read skill seeds, templates, and design system files.

## Safety and Validation

Existing protections include:

- Process startup uses `spawn()` argument arrays, avoiding shell string concatenation.
- Model IDs are first compared with the model list exposed by the most recent `/api/agents` response.
- Custom model IDs are validated by `sanitizeCustomModel()`, limiting length, character set, and starting character.
- Reasoning options must exist in the runtime definition's `reasoningOptions`.
- Image paths must be located inside the daemon temporary upload directory.
- Attachment paths must be located inside the project working directory.
- Agent working directories are constrained to `.od/projects/<projectId>/`.
- ACP runtimes have timeout protection for the initialize, session/new, session/set_model, and session/prompt stages.
- ACP runtimes listen for `stdin` errors and proactively clean up detection processes after model detection completes.
- When the SSE connection closes, the daemon sends `SIGTERM` to the subprocess.

## Current Capability Boundaries

The current runtime adapter is a lightweight adaptation layer that already covers discovery, startup, argument construction, model selection, and streaming forwarding.

Main boundaries:

- The adapter is still a declarative object array and has not yet been split into independent adapter classes or directories.
- The capability model is thin and currently mainly exposes models, reasoning, and output format.
- Claude Code, Codex, Gemini, OpenCode, Cursor Agent, Hermes, and Kimi already have structured event parsing.
- Qwen currently still uses plain text pass-through.
- Skill injection mainly relies on prompt composition; only Claude Code uses `--add-dir` to support reading external directories.
- Hermes currently only integrates the core ACP text session path and has not mapped more `session/update` types into unified UI events.
- Cancellation is triggered by HTTP connection closure and `SIGTERM`; there is no explicit runId / cancel API yet.
- Resume, auth state, permission modes, and capability gating have not yet formed a unified interface.
- API fallback belongs to the frontend provider path and is currently outside the daemon runtime adapter layer.

## Gap from the Target Architecture

`docs/agent-adapters.md` describes a more complete target shape: each agent adapter has interfaces such as `detect()`, `capabilities()`, `run()`, `cancel()`, and `resume()`, and outputs unified `AgentEvent`s.

The current implementation already has the core outline of the target architecture:

- `detectAgents()` corresponds to `detect()`.
- `AGENT_DEFS` corresponds to the adapter registry.
- `buildArgs()` corresponds to runtime-specific invocation.
- `streamFormat` + `claude-stream.js` + `json-event-stream.js` + `acp.js` correspond to stream normalization.
- `/api/chat` corresponds to unified run orchestration.
