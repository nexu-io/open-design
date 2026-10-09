# Headless BYOK runs over REST

Use `POST /api/runs` to start an OpenDesign run against your own model provider
from a script, CI job, or server without opening the UI. Select
`agentId: "byok-opencode"` and send the provider configuration with each run.
The daemon launches OpenCode to perform the model/tool loop; a provider API key
alone does not replace that executable.

## Prerequisites

- A running daemon. Follow [Docker deployment](../deploy/README.md) or the
  [source setup](../QUICKSTART.md). Use the daemon URL reported by your setup;
  source-development ports are allocated dynamically.
- An OpenCode executable available **inside the daemon's environment**. The
  adapter looks for `opencode-cli`, then `opencode`, and shares the `opencode`
  app-config entry's `OPENCODE_BIN` override. Installing it only on the Docker
  host is insufficient unless it is also available inside the container. See
  [BYOK OpenCode](agent-adapters.md#52-byok-opencode) and the
  [Docker CLI setup](../deploy/README.md#linux-mounting-host-agent-clis).
- A project ID, a provider API base URL reachable from the daemon/container,
  and an explicit model ID supported by that provider.
- `curl` with `--fail-with-body` support, `jq`, and Node.js for the examples
  below (Node.js is only used by the client to generate a request ID).

The examples target a local Personal project on a token-protected daemon.
`OD_API_TOKEN` authenticates requests **to OpenDesign**; `BYOK_API_KEY`
authenticates requests **to the model provider**. They are separate credentials.
Inject them as secret environment variables in CI; do not commit the request
body or enable shell tracing around credentials. Follow the
[deployment authentication guidance](../deploy/README.md#local-compose) for
remote access and TLS.

For a Team project, preserve the caller's authorized workspace context,
including both `x-od-workspace-id` and `x-od-workspace-member-id`, on requests.
The shared daemon token does not establish workspace membership. Team writes
still pass the project authorization gate; do not omit identity headers to
work around a denial.

## Request fields

The run route consumes the provider shape defined by
[`ByokChatProviderConfig`](../packages/contracts/src/api/chat.ts), and the
[BYOK adapter](../apps/daemon/src/runtimes/byok-opencode.ts) validates it together
with the **top-level** `model`.

| Field | What to send |
| --- | --- |
| `projectId` | An existing project ID, not its display name. |
| `message` | The prompt to execute. |
| `agentId` | `"byok-opencode"`. Plain `"opencode"` uses that CLI's own configuration instead. |
| `model` | An explicit provider model ID. Empty values and the literal `"default"` are rejected. Do not add OpenDesign's internal `open-design-byok/` prefix. |
| `byokProvider.protocol` | One of `"anthropic"`, `"openai"`, `"azure"`, `"google"`, `"ollama"`, `"senseaudio"`, or `"aihubmix"`. Use `"openai"` for a custom OpenAI-compatible gateway. |
| `byokProvider.apiKey` | Provider credential. A nonempty value is required unless the provider is keyless as described below. |
| `byokProvider.baseUrl` | Provider API root, including its required path prefix, e.g. `https://llm.example.com/v1`. Do not append `/chat/completions`. Set this explicitly for a custom gateway; omission selects a protocol default and is invalid for Azure. |
| `byokProvider.apiVersion` | Optional Azure API version. Omit for other protocols. |
| `byokProvider.model` | Optional model selection for BYOK-backed utilities. Keep it equal to top-level `model` when supplied; it does **not** replace the required top-level field. |
| `byokProvider.requiresApiKey` | Set to `false` only for an endpoint that actually accepts unauthenticated requests. Use `apiKey: ""` in that case. Local Ollama endpoints recognized by the adapter are also keyless by default. |
| `clientRequestId` | Optional stable ID for one logical submission; reuse it when retrying the same request after a transport failure. Use a new ID for a new prompt. |

For `protocol: "openai"`, a custom host uses the OpenAI-compatible
chat-completions adapter. The real `api.openai.com` host uses the OpenAI adapter.
For local model servers in Docker, remember that `localhost` refers to the
container, not the host.

## Submit a run

These environment variables are inputs to the example script, not new daemon
configuration options. Export `OD_API_TOKEN` and `BYOK_API_KEY` through your
secret manager or local shell before running it.

```bash
set -euo pipefail
: "${OD_API_TOKEN:?Set the daemon API token}"
: "${BYOK_API_KEY:?Set the provider API key}"
export OD_URL='http://127.0.0.1:7456'
export BYOK_BASE_URL='https://llm.example.com/v1'
export BYOK_MODEL='your-provider-model-id'

# Find an existing project ID. Use a local Personal project for this example.
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $OD_API_TOKEN" \
  "$OD_URL/api/projects" | jq '.projects[] | {id, name}'
export PROJECT_ID='replace-with-project-id'

# Generate once per new prompt; retain this value for transport retries.
export REQUEST_ID="$(node -p 'crypto.randomUUID()')"

RUN_ID="$(
  jq -n '{
    projectId: env.PROJECT_ID,
    clientRequestId: env.REQUEST_ID,
    message: "Create a single-page HTML project status report in index.html.",
    agentId: "byok-opencode",
    model: env.BYOK_MODEL,
    byokProvider: {
      protocol: "openai",
      apiKey: env.BYOK_API_KEY,
      baseUrl: env.BYOK_BASE_URL,
      model: env.BYOK_MODEL
    }
  }' | curl --fail-with-body --silent --show-error \
    -H "Authorization: Bearer $OD_API_TOKEN" \
    -H 'Content-Type: application/json' \
    --data-binary @- "$OD_URL/api/runs" | jq -er '.runId'
)"
printf 'Run ID: %s\n' "$RUN_ID"
```

The UUID command uses Node.js, which is also required by the source setup. A
client running outside that environment can supply its own unique request ID.
For a keyless provider, remove the `BYOK_API_KEY` prerequisite and send
`apiKey: "", requiresApiKey: false` in `byokProvider`.

To create a project without the UI, first send `POST /api/projects` with a new
safe `id` (letters, digits, `_`, or `-`) and a nonempty `name`, for example
`{"id":"headless-demo","name":"Headless demo"}`, using the same daemon
authentication. Then use that ID as `PROJECT_ID`. Do not send credentials in
project metadata or `pendingPrompt`.

When `conversationId` and `assistantMessageId` are omitted, the daemon resolves
the project's default conversation and creates the message pin. Keep the
returned conversation ID if your client needs to continue a particular
conversation rather than relying on that default.

## Check the result

`POST /api/runs` returns HTTP `202` with `runId` and the resolved conversation
and assistant-message IDs. This acknowledges the run; it does not mean the
provider call succeeded or a file was delivered.

```bash
curl --fail-with-body --silent --show-error \
  -H "Authorization: Bearer $OD_API_TOKEN" \
  "$OD_URL/api/runs/$RUN_ID" \
  | jq '{status, errorCode, error, deliverableValid, deliverableEntryFile}'
```

Repeat the GET with a bounded polling interval until `status` is `succeeded`,
`failed`, or `canceled`; `queued` and `running` are nonterminal states. For a
file-generating request, also check `deliverableValid` and the returned
`deliverableEntryFile`. The [run contract](../specs/current/run.md) describes
the lifecycle and event stream.

## Why MCP and app-config are different

| Purpose | REST `POST /api/runs` | MCP `start_run` |
| --- | --- | --- |
| Project | `projectId` (ID) | `project` (resolved by MCP) |
| Prompt | `message` | `prompt` |
| Runtime | `agentId` | `agent` |
| Model | `model` | `model` |
| Provider credentials | Run-scoped `byokProvider` | Rejected, including credential-shaped fields nested in `inputs` |

MCP deliberately rejects raw API keys. Do not rename or nest a credential to
bypass that check. For headless BYOK, call the REST endpoint directly rather
than passing `byokProvider` to `start_run`.

The `opencode`/`byok-opencode` app-config environment allowlist exposes
`OPENCODE_BIN`, not a provider URL/key configuration. Setting that binary path,
or setting up a provider in one browser, does not supply `byokProvider` for an
independent REST caller. Send the provider object with every new BYOK run,
including follow-up turns. A persistent headless provider-configuration API
is not part of this workflow.

## Troubleshooting

- **HTTP 400 `VALIDATION_FAILED`, incomplete provider configuration:** check
  top-level `model`, supported `protocol`, API key policy, and `baseUrl`.
  `byokProvider.model` alone is insufficient, and `"default"` is not a model
  placeholder the daemon resolves for you.
- **MCP says raw API keys are not accepted:** use REST with the field names
  above; the MCP rejection is intentional.
- **OpenCode unavailable or exits on unsupported flags:** check the executable
  detected by the daemon/container and its compatibility with the
  [installed adapter](agent-adapters.md#52-byok-opencode). REST BYOK still
  requires a working OpenCode runtime.
- **401/403 from OpenDesign:** check the daemon token or reverse-proxy
  authentication, then the project's workspace authorization. A provider key
  cannot authenticate to the daemon.
- **Run fails with an upstream 401/403/404:** inspect the run's `error` and
  `errorCode`; verify the provider key, model access, and complete API base
  path. A successful `202` response does not validate those upstream facts.
