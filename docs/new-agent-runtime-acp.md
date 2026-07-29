# New agent runtime expectations: ACP over stdio

This note documents the preferred integration shape for a new Open Design agent runtime.

## Recommendation

New agent runtimes should expose an **ACP over stdio** CLI mode.

In practice, Open Design expects to spawn a local executable and speak JSON-RPC over the child process streams:

```text
Open Design daemon
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

That wrapper keeps Open Design on the standard ACP subprocess transport and avoids requiring a daemon-side network transport adapter.

## Why stdio, not an ACP server?

The ACP protocol uses JSON-RPC, but transport matters.

The ACP transport documentation defines **stdio** as communication over standard input and standard output. In that transport, the client launches the agent as a subprocess, the agent reads from `stdin`, writes protocol messages to `stdout`, and writes logs to `stderr`.

ACP's remote HTTP/WebSocket transport is still described as a draft/proposal rather than the established compatibility path. Open Design's implemented ACP adapters therefore use stdio subprocesses today.

## Messages Open Design sends

For `streamFormat: 'acp-json-rpc'`, Open Design currently drives a session with these JSON-RPC methods:

1. `initialize`
   - Sent first.
   - Includes Open Design client metadata and `clientCapabilities`.
2. `session/new`
   - Creates a working session.
   - Includes the project working directory.
   - May include MCP server descriptors when the runtime is allowed to use Open Design-provided tools.
3. `session/set_config_option` or `session/set_model` *(optional)*
   - Sent when the user selected a non-default model.
   - Open Design prefers `session/set_config_option` when `session/new` reports a model config option; otherwise it falls back to `session/set_model`.
4. `session/prompt`
   - Sends the composed user/system prompt as text content.
   - A successful response marks the prompt as complete.
5. `session/cancel`
   - Sent on user cancellation when a session exists and stdin is still writable.

## Messages Open Design expects from the agent

The runtime should support the corresponding JSON-RPC responses and notifications:

1. Response to `initialize`.
2. Response to `session/new`.
   - Must include a usable `sessionId`.
   - Should report the current model if available.
   - Should report model config options if model selection is supported through config options.
3. Notifications using `session/update`.
   - Open Design currently maps:
     - `agent_thought_chunk` to thinking output.
     - `agent_message_chunk` to assistant text output.
4. Optional `session/request_permission` requests.
   - Open Design auto-selects an approve/allow-style option when available.
   - If no acceptable option is present, the turn fails fast.
5. Response to `session/prompt`.
   - Should include usage metadata when available.
   - This response tells Open Design the turn is finished.

## Process lifecycle expectations

- Keep protocol messages on `stdout` parseable as JSON-RPC lines.
- Write human-readable logs and diagnostics to `stderr`.
- Return clear JSON-RPC errors for protocol failures.
- After `session/prompt` completes, either exit cleanly when stdin closes or tolerate Open Design sending `SIGTERM` after a short grace period.
- Implement `session/cancel` if possible. Open Design falls back to process termination when the transport is no longer usable.
- Avoid interactive terminal prompts. If permission is required, use ACP permission requests instead.

## Open Design adapter shape

An ACP runtime definition in Open Design is intentionally small:

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

Existing examples include Devin, Hermes, Kimi, Kiro, Kilo, and Vibe runtime definitions under `apps/daemon/src/runtimes/defs/`.

## Fact sources

- ACP transport documentation: <https://agentclientprotocol.com/protocol/transports>
  - ACP uses JSON-RPC.
  - The stdio transport uses standard input and standard output.
  - In stdio mode, the client launches the agent as a subprocess.
  - The agent reads from `stdin`, writes protocol messages to `stdout`, and uses `stderr` for logs.
- ACP remote transport RFD: <https://agentclientprotocol.com/rfds/streamable-http-websocket-transport>
  - Describes Streamable HTTP / WebSocket as the proposed remote transport direction.
  - Notes that ACP's standard transport has historically been stdio and that a standard remote transport is still being defined.
- Open Design implementation:
  - `apps/daemon/src/acp.ts` implements the ACP JSON-RPC session lifecycle.
  - `apps/daemon/src/server.ts` spawns ACP runtimes as child processes with piped stdio.
  - `apps/daemon/src/runtimes/defs/*.ts` contains existing ACP runtime definitions using `streamFormat: 'acp-json-rpc'`.
