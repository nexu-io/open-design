# A2A integration

Open Design exposes its existing agent, skill, workflow, project, conversation,
and artifact runtime as an A2A 1.0 remote agent. The proof-of-concept transport
is JSON-RPC only.

Detailed Chinese documentation:

- [A2A concepts, architecture, and multi-turn flow](./a2a-technical-guide.zh-CN.md)
- [Open Design and OpenCode source walkthrough](./a2a-code-walkthrough.zh-CN.md)

## Endpoints

- Agent Card: `GET /.well-known/agent-card.json`
- A2A JSON-RPC: `POST /api/a2a`

The Agent Card is public so clients can discover the supported protocol and
endpoint. The JSON-RPC endpoint follows the daemon's normal `/api/*`
authentication policy. For a protected remote daemon, clients must send its
bearer token.

## OpenCode client

The companion OpenCode checkout contains the project tool module
`.opencode/tool/open-design-a2a.ts`. It does not patch OpenCode core. Start Open
Design normally, open the OpenCode checkout, and ask the OpenCode agent to use
the `open-design-a2a_send` tool.

The client defaults to `http://127.0.0.1:7456`. Override it with:

```powershell
$env:OD_A2A_URL = 'https://your-open-design-host'
$env:OD_A2A_TOKEN = '<bearer token>'
```

The normal loop is:

1. `open-design-a2a_send` starts a task.
2. `open-design-a2a_get` polls until the task needs input or finishes.
3. For `TASK_STATE_INPUT_REQUIRED`, render the structured Question Form and
   submit the answers through `open-design-a2a_answer` using the same task and
   context IDs.
4. Continue polling and answering; one A2A task may span multiple Open Design
   runs while it keeps the same Open Design project and conversation.
5. A completed task includes Studio/preview links and bounded file metadata.

When Open Design starts with a [website output mode](./site-output-modes.md),
the clarification turns remain unchanged and the completed artifact also
contains the optional `outputPolicy` repair and validation summary.

`open-design-a2a_cancel` cancels an active task. Outstanding task IDs are
currently in memory and do not survive an Open Design daemon restart.

## Current scope

The proof of concept does not expose streaming, push notifications, gRPC,
durable task recovery, or inline transfer of large source/binary artifacts.
Before hosted multi-tenant use, add tenant-scoped authorization and durable
task/context ownership storage.
