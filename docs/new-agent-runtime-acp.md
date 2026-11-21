# New agent runtime expectations: ACP over stdio

This note documents the preferred integration shape for a new OpenDesign agent runtime.

## Recommendation

New agent runtimes should expose an **ACP over stdio** CLI mode.

In practice, OpenDesign expects to spawn a local executable and speak JSON-RPC over the child process streams:

```text
OpenDesign daemon
  └─ spawn your-agent acp
       ├─ stdin  <- ACP JSON-RPC requests/responses
       ├─ stdout -> ACP JSON-RPC responses/notifications
       └─ stderr -> logs and diagnostics only
```

If the runtime's real implementation is a local or remote server, keep that detail behind a thin CLI wrapper:

```text
your-agent acp
  └─ connects to your runtime server / SDK / model backend
```

That wrapper keeps OpenDesign on the standard ACP subprocess transport and avoids requiring a daemon-side network transport adapter.

## Why stdio, not an ACP server?

The ACP protocol uses JSON-RPC, but transport matters.

The ACP transport documentation defines **stdio** as communication over standard input and standard output. In that transport, the client launches the agent as a subprocess, the agent reads from `stdin`, writes protocol messages to `stdout`, and writes logs to `stderr`.

ACP's remote HTTP/WebSocket transport is still described as a draft/proposal rather than the established compatibility path. OpenDesign's implemented ACP adapters therefore use stdio subprocesses today.

## Messages OpenDesign sends

For `streamFormat: 'acp-json-rpc'`, OpenDesign currently drives a session with these JSON-RPC methods:

1. `initialize`
   - Sent first.
   - Includes OpenDesign client metadata and `clientCapabilities`.
2. `session/new` or `session/load`
   - Creates a working session, or resumes the durable upstream session from a
     prior turn when OpenDesign has a saved session handle.
   - Includes the project working directory.
   - `session/new` may include MCP server descriptors when the runtime is
     allowed to use OpenDesign-provided tools.
3. `session/set_config_option` or `session/set_model` *(optional)*
   - Sent when the user selected a non-default model.
   - OpenDesign prefers `session/set_config_option` when `session/new` reports a model config option; otherwise it falls back to `session/set_model`.
4. `session/prompt`
   - Sends the composed user/system prompt as a text block, followed by
     `resource_link` blocks for staged image attachments when present.
   - A successful response marks the prompt as complete.
5. `session/cancel`
   - Sent on user cancellation when a session exists and stdin is still writable.
6. `session/delete` *(disposable connection tests only)*
   - Sent only when `initialize.agentCapabilities.sessionCapabilities.delete`
     is an object. Omitted, `null`, and malformed values do not advertise support.
   - Deletes the session created for the probe before closing stdio. Ordinary
     chat sessions and loaded sessions are retained for future turns.

## Connection-test session cleanup

A temporary working directory isolates workspace files, not the agent's own
session store. Connection tests therefore opt into best-effort ACP cleanup for
their disposable sessions. Once an established probe finishes or fails, the
bridge requests deletion only when the **running agent** advertised support.
Unsupported agents produce a daemon log entry instead of an unsuccessful
connection result. Cancellation sends `session/cancel` before attempting cleanup.

The bridge waits up to one second for the delete response before its normal
transport teardown. A rejected request, closed transport, or cleanup timeout is
logged without changing the original smoke-test verdict. Cleanup logs do not
include session IDs, working directories, or raw agent error payloads. If the prompt
is already terminal at the connection-test deadline, cleanup and process exit
receive the existing two-second shutdown grace instead of an immediate timeout.
If an agent exits before cleanup, a session may remain; cleanup is not guaranteed.

ACP guarantees removal from `session/list`, **not physical erasure** of every
backing record. Deleting an active session is agent-defined, so cancellation
cleanup is also best effort. See the [ACP v1 session-delete specification](https://github.com/agentclientprotocol/agent-client-protocol/blob/main/docs/protocol/v1/session-delete.mdx).

### ACP capability evidence (2026-10-06)

This is a dated evidence matrix, not a runtime allowlist. Installed versions can
advertise different capabilities. Source inspection and documentation examples
are identified separately from actual initialize captures; fake-ACP tests do
not establish vendor support.

| Adapter | Advertises standard `session/delete` | Evidence |
| --- | --- | --- |
| `amr` | No in captured build | Initialize-only capture from repository-pinned `@powerformer/vela-cli@0.1.4-test.0`, Windows x64. `agentInfo` reported `Vela OpenCode` / `0.0.0`; capabilities contained `loadSession`, prompt capabilities, and native continuation metadata, with no `sessionCapabilities.delete`. |
| `kilo` | No in inspected source | [`ACP.initialize` at `82fddfd`](https://github.com/Kilo-Org/kilocode/blob/82fddfdd608f336a1c3083fe37fdd80933fb5569/packages/opencode/src/acp/service.ts#L94-L141): session capabilities are `close`, `fork`, `list`, and `resume`. |
| `kimi` | No in inspected source | [`ACPServer.initialize` at `9ab1286`](https://github.com/MoonshotAI/kimi-cli/blob/9ab1286b8fe4e6bcd116949a27ce5e0ac3389c82/src/kimi_cli/acp/server.py#L97-L112): session capabilities are `list` and `resume`. |
| `kiro` | No in documented initialize example | [Official ACP documentation](https://kiro.dev/docs/cli/acp/#example-initialize-connection) reports `kiro-cli` / `1.5.0` with `loadSession` and image prompts, without a delete capability. [V3 migration docs](https://kiro.dev/docs/cli/v3/acp-migration/#2-negotiate-capabilities) also omit deletion from their standard-method list. No local Kiro runtime capture. |
| `hermes` | No in inspected source | [`HermesACPAgent.initialize` at `aa30e02`](https://github.com/NousResearch/hermes-agent/blob/aa30e02d860fb2683db0d9d2241d4980a6ee6978/acp_adapter/server.py#L528-L551): session capabilities are `fork`, `list`, and `resume`. |
| `vibe` | No in inspected source | [`VibeAcpAgent.initialize` at `7cb9189`](https://github.com/mistralai/mistral-vibe/blob/7cb91894c40bb25173abcfa36e5ea2b4b81eb28c/vibe/acp/agent.py#L499-L514): session capabilities are `close`, `list`, and `fork`. Its delete extension does not advertise the standard delete capability. |
| `trae-cli` | Unverified | [Official ACP documentation](https://docs.trae.cn/cli_acp) documents `traecli acp serve`, but no initialize capability payload. No installed binary was available and the official download endpoint returned a region-blocked HTTP 403. Do not infer either support or lack of support. |
| `devin` | Yes in captured build | Initialize-only capture of official Windows x64 Devin CLI `3000.11.3`, downloaded from [its versioned distribution](https://static.devin.ai/cli/3000.11.3/devin-3000.11.3-x86_64-pc-windows.zip) and checksum-verified against the vendor manifest. `agentInfo` reported `affogato` / `0.0.0-dev`; `sessionCapabilities` included `list: {}`, `delete: {}`, and `additionalDirectories: {}`. Launched `devin acp` with default permissions; no session or prompt was sent. |
| `reasonix` | Yes in inspected source | [`initialize` at `95d0f74`](https://github.com/esengine/DeepSeek-Reasonix/blob/95d0f747a86181218fed0743ee59963c9e87fea4/internal/frontend/acp/handshake.go#L20-L28) advertises `Delete: &EmptyCapability{}`; [`service.go`](https://github.com/esengine/DeepSeek-Reasonix/blob/95d0f747a86181218fed0743ee59963c9e87fea4/internal/frontend/acp/service.go#L153-L156) registers `session/delete`. |

The sanitized [Vela and Devin initialize captures](../apps/daemon/tests/fixtures/acp-probe-initialize-captures.json)
are checked in and consumed by the capability-gate regression suite. They
contain no authentication payloads or session data.

To refresh a runtime row, launch that adapter's documented ACP entrypoint and
send only `initialize`. Record the CLI version and the returned `agentInfo` and
`agentCapabilities`, then close stdio. Do not create a session or send a model
prompt merely to measure capability support. The remaining Trae row needs such
a capture before its support status can be verified.

### Non-ACP trade-offs

Codex and Claude use non-ACP transports in OpenDesign. This cleanup path does
not redirect `CODEX_HOME` or `CLAUDE_CONFIG_DIR`: those homes also carry
credentials/configuration, so relocating them would test a different login
environment. Where those CLIs persist probe state, that residue is accepted as
inert CLI-owned history for this change; it is not an OpenDesign conversation.
Adapter-specific non-persistence flags or future state/config separation can be
evaluated separately without changing the authentication being tested.

OpenCode and Crush follow XDG-style configuration/data separation, but are also
outside this ACP cleanup change. This does not claim to eliminate their probe
records. Reasonix state-home isolation in #8573 and model-discovery probe
isolation in #5927 remain separate work.

## Messages OpenDesign expects from the agent

The runtime should support the corresponding JSON-RPC responses and notifications:

1. Response to `initialize`.
2. Response to `session/new` or `session/load`.
   - Must include a usable `sessionId`.
   - A new session may also return the durable upstream session handle that
     OpenDesign records for the next turn.
   - Should report the current model if available.
   - Should report model config options if model selection is supported through config options.
3. Notifications using `session/update`.
   - OpenDesign currently maps:
     - `agent_thought_chunk` to thinking output.
     - `agent_message_chunk` to assistant text output.
     - `tool_call` and `tool_call_update` to tool-use/result events, including
       artifact-write accounting when the update carries a real file path.
     - Other update kinds to bounded status/diagnostic events.
4. Optional `session/request_permission` requests.
   - OpenDesign auto-selects an approve/allow-style option when available.
   - If no acceptable option is present, the turn fails fast.
5. Response to `session/prompt`.
   - Should include usage metadata when available.
   - This response tells OpenDesign the turn is finished.

## Process lifecycle expectations

- Keep protocol messages on `stdout` parseable as JSON-RPC lines.
- Write human-readable logs and diagnostics to `stderr`.
- Return clear JSON-RPC errors for protocol failures.
- After `session/prompt` completes, either exit cleanly when stdin closes or tolerate OpenDesign sending `SIGTERM` after a short grace period.
- Implement `session/cancel` if possible. OpenDesign falls back to process termination when the transport is no longer usable.
- Avoid interactive terminal prompts. If permission is required, use ACP permission requests instead.

## OpenDesign adapter shape

An ACP runtime definition in OpenDesign is intentionally small:

```ts
export const myAgentDef = {
  id: 'my-agent',
  name: 'My Agent',
  bin: 'my-agent',
  versionArgs: ['--version'],
  fallbackModels: [{ id: 'default', label: 'default' }],
  buildArgs: () => ['acp'],
  streamFormat: 'acp-json-rpc',
} satisfies RuntimeAgentDef;
```

Current examples include AMR, Devin, Hermes, Kimi, Kiro, Kilo, Reasonix, Trae CLI,
and Vibe runtime definitions under `apps/daemon/src/runtimes/defs/`.

## Fact sources

- ACP transport documentation: <https://agentclientprotocol.com/protocol/transports>
  - ACP uses JSON-RPC.
  - The stdio transport uses standard input and standard output.
  - In stdio mode, the client launches the agent as a subprocess.
  - The agent reads from `stdin`, writes protocol messages to `stdout`, and uses `stderr` for logs.
- ACP remote transport RFD: <https://agentclientprotocol.com/rfds/streamable-http-websocket-transport>
  - Describes Streamable HTTP / WebSocket as the proposed remote transport direction.
  - Notes that ACP's standard transport has historically been stdio and that a standard remote transport is still being defined.
- OpenDesign implementation:
  - `apps/daemon/src/agent-protocol/acp/session.ts` implements the ACP JSON-RPC session lifecycle and is exposed through `apps/daemon/src/agent-protocol/index.ts`.
  - `apps/daemon/src/server.ts` spawns ACP runtimes as child processes with piped stdio.
  - `apps/daemon/src/runtimes/defs/*.ts` contains existing ACP runtime definitions using `streamFormat: 'acp-json-rpc'`.
