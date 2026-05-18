# HTTP/SSE Protocol Reference

**Parent:** [`../spec.md`](../spec.md)
**Source types:** [`../../packages/contracts/src/`](../../packages/contracts/src/) (canonical request/response types)
**Route implementations:** [`../../apps/daemon/src/*-routes.ts`](../../apps/daemon/src/)
**Status:** v0.1 · 2026-05-15

---

## 1. Base Conventions

### 1.1 Transport

- **Base URL:** `http://localhost:7456` (v1; localhost-only by default)
- **Content-Type:** `application/json` for request bodies and non-streaming responses
- **SSE transport:** `text/event-stream` with JSON-encoded `data:` payloads

### 1.2 SSE Wire Format

All SSE streams follow the contract in `packages/contracts/src/sse/common.ts`:

```
event: <EventName>
data: <JSON payload>

```

Each event is typed as `SseTransportEvent<Name, Payload>`:

```ts
interface SseTransportEvent<Name extends string, Payload> {
  id?: string;
  event: Name;
  data: Payload;
}
```

### 1.3 Error Envelope

All non-streaming error responses use the format from `packages/contracts/src/errors.ts`:

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Project abc123 not found",
    "details": {},
    "retryable": false,
    "requestId": "req_abc"
  }
}
```

**Error code categories** (45 codes total):

| Category | Codes |
|----------|-------|
| Generic HTTP | `BAD_REQUEST`, `UNAUTHORIZED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `VALIDATION_FAILED`, `INTERNAL_ERROR` |
| Agent | `AGENT_UNAVAILABLE`, `AGENT_AUTH_REQUIRED`, `AGENT_EXECUTION_FAILED`, `AGENT_PROMPT_TOO_LARGE` |
| Upstream | `UPSTREAM_UNAVAILABLE`, `RATE_LIMITED` |
| Project / File | `PROJECT_NOT_FOUND`, `FILE_NOT_FOUND`, `ARTIFACT_NOT_FOUND`, `ARTIFACT_REGRESSION` |
| Tool auth | `TOOL_TOKEN_MISSING`, `TOOL_TOKEN_INVALID`, `TOOL_TOKEN_EXPIRED`, `TOOL_ENDPOINT_DENIED`, `TOOL_OPERATION_DENIED` |
| Live artifacts | `LIVE_ARTIFACT_NOT_FOUND`, `LIVE_ARTIFACT_INVALID`, `LIVE_ARTIFACT_STORAGE_FAILED`, `LIVE_ARTIFACT_REFRESH_UNAVAILABLE`, `LIVE_ARTIFACT_REFRESH_TIMEOUT` |
| Refresh | `REFRESH_LOCKED`, `REFRESH_TIMED_OUT`, `REFRESH_FAILED` |
| Connector | `CONNECTOR_NOT_FOUND`, `CONNECTOR_NOT_CONNECTED`, `CONNECTOR_DISABLED`, `CONNECTOR_TOOL_NOT_FOUND`, `CONNECTOR_SAFETY_DENIED`, `CONNECTOR_INPUT_SCHEMA_MISMATCH`, `CONNECTOR_RATE_LIMITED`, `CONNECTOR_OUTPUT_TOO_LARGE`, `CONNECTOR_EXECUTION_FAILED` |
| Other | `DESKTOP_AUTH_PENDING`, `OUTPUT_TOO_LARGE`, `TEMPLATE_BINDING_INVALID`, `REDACTION_REQUIRED` |

Full definition: `packages/contracts/src/errors.ts` (`API_ERROR_CODES`)

---

## 2. Endpoint Domains

### 2.1 Chat & Runs

The primary user interaction path. Routes: `apps/daemon/src/chat-routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/chat` | Start a new chat run (primary entry). Request: `ChatRequest`. Response: SSE stream. |
| `POST` | `/api/runs` | Create a run. Response: `{ runId }` (202). |
| `GET` | `/api/runs` | List runs. Query: `?projectId=`, `?conversationId=`, `?status=`. |
| `GET` | `/api/runs/:id` | Get run status. Response: `ChatRunStatusResponse`. |
| `GET` | `/api/runs/:id/events` | SSE stream for a specific run's events. |
| `POST` | `/api/runs/:id/cancel` | Cancel a running run. Response: `{ ok: true }`. |

**Chat SSE stream (`/api/chat`, `/api/runs/:id/events`):**

Event flow: `start` → [`status` | `agent` | `stdout` | `stderr`]* → [`error` | `end`]

| Event | Payload | Protocol |
|-------|---------|----------|
| `start` | `ChatSseStartPayload` — `runId`, `agentId`, `bin`, `cwd`, `projectId`, `model` | `CHAT_SSE_PROTOCOL_VERSION = 1` |
| `agent` | `DaemonAgentPayload` — discriminated union (see §3.1) | — |
| `stdout` | `{ chunk: string }` | Raw stdout |
| `stderr` | `{ chunk: string }` | Raw stderr |
| `error` | `SseErrorPayload` — `message`, `error?` | — |
| `end` | `ChatSseEndPayload` — `code`, `signal?`, `status?` | — |

Full types: `packages/contracts/src/sse/chat.ts`

**Proxy streams (`/api/proxy/*`):**

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/proxy/anthropic/stream` | Direct Anthropic Messages API proxy |
| `POST` | `/api/proxy/openai/stream` | Direct OpenAI Chat Completions proxy |
| `POST` | `/api/proxy/azure/stream` | Direct Azure OpenAI proxy |
| `POST` | `/api/proxy/google/stream` | Direct Google Gemini proxy |
| `POST` | `/api/proxy/ollama/stream` | Direct Ollama API proxy |

Proxy SSE event flow: `start` → `delta`* → [`error` | `end`]. Protocol version: `PROXY_SSE_PROTOCOL_VERSION = 1`.

Full types: `packages/contracts/src/sse/proxy.ts`

### 2.2 Projects

Routes: `apps/daemon/src/project-routes.ts`. Types: `packages/contracts/src/api/projects.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/projects` | List all projects |
| `POST` | `/api/projects` | Create project. Body: `CreateProjectRequest` (`id`, `name`, `skillId`, `designSystemId`, `pendingPrompt`, `metadata`) |
| `GET` | `/api/projects/:id` | Get project detail + resolved directory |
| `PATCH` | `/api/projects/:id` | Update project fields |
| `DELETE` | `/api/projects/:id` | Delete project |
| `GET` | `/api/projects/:id/events` | SSE stream for project mutations (see §3.2) |

**Project shape** (`packages/contracts/src/api/projects.ts`):

```ts
interface Project {
  id: string;
  name: string;
  skillId: string | null;
  designSystemId: string | null;
  createdAt: number;
  updatedAt: number;
  status?: ProjectStatusInfo;
  pendingPrompt?: string;
  metadata?: ProjectMetadata;
  customInstructions?: string;
}
```

**Project kinds:** `prototype` | `deck` | `template` | `image` | `video` | `audio` | `other`

### 2.3 Conversations & Messages

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/projects/:id/conversations` | List conversations |
| `POST` | `/api/projects/:id/conversations` | Create conversation |
| `PATCH` | `/api/projects/:id/conversations/:cid` | Update title |
| `DELETE` | `/api/projects/:id/conversations/:cid` | Delete conversation |
| `GET` | `/api/projects/:id/conversations/:cid/messages` | List messages |
| `PUT` | `/api/projects/:id/conversations/:cid/messages/:mid` | Insert/update message |

**Message shape:**

```ts
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  agentName?: string;
  events?: PersistedAgentEvent[];
  createdAt?: number;
  runId?: string;
  runStatus?: ChatRunStatus;
  producedFiles?: ProjectFile[];
  feedback?: ChatMessageFeedback;
}
```

### 2.4 Preview Comments

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/projects/:id/conversations/:cid/comments` | List comments |
| `POST` | `/api/projects/:id/conversations/:cid/comments` | Create comment (anchored to element `data-od-id`) |
| `PATCH` | `/api/projects/:id/conversations/:cid/comments/:commentId` | Update status |
| `DELETE` | `/api/projects/:id/conversations/:cid/comments/:commentId` | Delete comment |

### 2.5 Files

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/projects/:id/files` | List files. Query: `?since=` (timestamp filter) |
| `GET` | `/api/projects/:id/files/:name` | Read file by name |
| `GET` | `/api/projects/:id/files/:name/preview` | Build document preview |
| `POST` | `/api/projects/:id/files` | Upload file (multipart binary or JSON `{name, content, encoding}`) |
| `POST` | `/api/projects/:id/files/rename` | Rename file. Body: `{ from, to }` |
| `DELETE` | `/api/projects/:id/files/:name` | Delete file |
| `GET` | `/api/projects/:id/search` | Search files. Query: `?q=`, `?pattern=`, `?max=` |
| `GET` | `/api/projects/:id/raw/*` | Serve raw file (supports Range requests for video/audio) |
| `POST` | `/api/projects/:id/upload` | Multi-file upload handler |

### 2.6 Skills

Routes: `apps/daemon/src/static-resource-routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/skills` | List all skills (body omitted, `hasBody` boolean) |
| `GET` | `/api/skills/:id` | Get skill detail |
| `GET` | `/api/skills/:id/files` | List skill files |
| `GET` | `/api/skills/:id/example` | Serve pre-built HTML example |
| `GET` | `/api/skills/:id/assets/*` | Serve static asset file |
| `POST` | `/api/skills/import` | Import skill from UI-provided body |
| `PUT` | `/api/skills/:id` | Update user-managed skill's SKILL.md |
| `POST` | `/api/skills/install` | Install skill from target URL |
| `DELETE` | `/api/skills/:id` | Uninstall skill |

### 2.7 Design Systems

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/design-systems` | List installed design systems |
| `GET` | `/api/design-systems/:id` | Get DESIGN.md body |
| `GET` | `/api/design-systems/:id/preview` | Render preview HTML |
| `GET` | `/api/design-systems/:id/showcase` | Render marketing-style showcase page |
| `POST` | `/api/design-systems/install` | Install from URL |
| `DELETE` | `/api/design-systems/:id` | Uninstall |

### 2.8 Design Templates

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/design-templates` | List all template-mode skills |
| `GET` | `/api/design-templates/:id` | Get template detail |

### 2.9 Live Artifacts

Routes: `apps/daemon/src/live-artifact-routes.ts`. Types: `packages/contracts/src/api/live-artifacts.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/live-artifacts` | List artifacts. Query: `?projectId=` |
| `GET` | `/api/live-artifacts/:artifactId` | Get artifact. Query: `?projectId=` |
| `PATCH` | `/api/live-artifacts/:artifactId` | Update artifact. Query: `?projectId=` |
| `DELETE` | `/api/live-artifacts/:artifactId` | Delete artifact. Query: `?projectId=` |
| `GET` | `/api/live-artifacts/:artifactId/preview` | Preview HTML. Query: `?projectId=&variant=(rendered\|template)` |
| `POST` | `/api/live-artifacts/:artifactId/refresh` | Trigger refresh. Query: `?projectId=` |
| `GET` | `/api/live-artifacts/:artifactId/refreshes` | List refresh log. Query: `?projectId=` |

Tool-token authenticated variants exist for agent-facing use: `POST /api/tools/live-artifacts/create`, `list`, `update`, `refresh`.

### 2.10 Media

Routes: `apps/daemon/src/media-routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/media/models` | List providers, models, aspect ratios, durations |
| `GET` | `/api/media/config` | Read provider config (keys masked) |
| `PUT` | `/api/media/config` | Update provider config |
| `POST` | `/api/projects/:id/media/generate` | Enqueue media generation task. Response: `{ taskId }` (202) |
| `POST` | `/api/media/tasks/:id/wait` | Long-poll until media task completes |
| `GET` | `/api/projects/:id/media/tasks` | List project media tasks |

### 2.11 MCP Configuration

Routes: `apps/daemon/src/mcp-routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/mcp/install-info` | Binary path injection code snippet |
| `GET` | `/api/mcp/servers` | List saved servers + templates |
| `PUT` | `/api/mcp/servers` | Replace all servers; persist to disk |
| `POST` | `/api/mcp/oauth/start` | Start OAuth flow. Response: `{ authorizeUrl, state }` |
| `GET` | `/api/mcp/oauth/callback` | OAuth callback handler |
| `GET` | `/api/mcp/oauth/status` | Check OAuth status. Query: `?serverId=` |
| `POST` | `/api/mcp/oauth/disconnect` | Disconnect MCP OAuth |

### 2.12 Memory

Routes: `apps/daemon/src/memory-routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/memory` | List memory entries + config |
| `PUT` | `/api/memory/index` | Update memory index file |
| `PATCH` | `/api/memory/config` | Enable/disable or configure extraction |
| `GET` | `/api/memory/events` | SSE stream for memory changes (live subscription) |
| `GET` | `/api/memory/extractions` | List recent extraction attempts |
| `POST` | `/api/memory/extract` | Manually trigger extraction |
| `GET` | `/api/memory/system-prompt` | Get composed system-prompt memory block |
| `POST` | `/api/memory` | Create memory entry |
| `GET` | `/api/memory/:id` | Get memory entry |
| `PUT` | `/api/memory/:id` | Update memory entry |
| `DELETE` | `/api/memory/:id` | Delete memory entry |

### 2.13 Deploy

Routes: `apps/daemon/src/deploy-routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/deploy/config` | Read deploy provider config |
| `PUT` | `/api/deploy/config` | Write deploy config |
| `POST` | `/api/projects/:id/deploy` | Deploy project files |
| `POST` | `/api/projects/:id/deploy/preflight` | Preflight file set for deployment |
| `GET` | `/api/projects/:id/deployments` | List project deployments |
| `POST` | `/api/projects/:id/deployments/:id/check-link` | Check deployment link status |

### 2.14 Connectors

Routes: `apps/daemon/src/connectors/routes.ts`.

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/connectors` | List all connectors |
| `GET` | `/api/connectors/status` | Get connector status map |
| `GET` | `/api/connectors/discovery` | Run provider discovery |
| `GET` | `/api/connectors/:id` | Get connector detail + tools |
| `POST` | `/api/connectors/:id/connect` | Initiate connection (OAuth support) |
| `DELETE` | `/api/connectors/:id/connection` | Disconnect |
| `POST` | `/api/tools/connectors/list` | List tools (tool-token auth) |
| `POST` | `/api/tools/connectors/execute` | Execute tool (tool-token auth) |

### 2.15 Import / Export

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/import/claude-design` | Import Claude Design ZIP (multipart `file`) |
| `POST` | `/api/import/folder` | Create project from existing directory |
| `GET` | `/api/projects/:id/archive` | Download project as ZIP |
| `POST` | `/api/projects/:id/archive/batch` | Build batch ZIP from file list |
| `POST` | `/api/projects/:id/export/pdf` | Export to PDF |
| `GET` | `/api/projects/:id/export/*` | Inline-CSS/JS HTML export (`?inline=1`) |

### 2.16 Other Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/health` | Health check. Response: `{ ok: true, version }` |
| `GET` | `/api/version` | Version info. Response: `{ version: AppVersionInfo }` |
| `GET` | `/api/agents` | List detected agents. Response: `{ agents: DetectedAgent[] }` |
| `GET` | `/api/app-config` | Read app config |
| `PUT` | `/api/app-config` | Write app config |
| `POST` | `/api/test/connection` | Test agent/provider connection |
| `POST` | `/api/provider/models` | List provider models |
| `GET` | `/api/metrics` | Prometheus-style metrics (when `OD_METRICS_ENDPOINT` is not `'disabled'`) |
| `GET` | `/api/active` | Read active context (project / file) |
| `POST` | `/api/active` | Set active context |
| `POST` | `/api/dialog/open-folder` | Open native folder picker dialog |
| `POST` | `/api/research/search` | Research search against downstream providers |
| `GET` | `/api/prompt-templates` | List prompt templates |
| `GET` | `/api/prompt-templates/:surface/:id` | Get prompt template |

Routes: `apps/daemon/src/server.ts`, `routines/`, `critique/`

---

## 3. SSE Stream Detail

### 3.1 Chat SSE (`DaemonAgentPayload`)

The `agent` event carries a `DaemonAgentPayload` — a discriminated union on `type`:

| `type` | Key fields | Purpose |
|--------|-----------|---------|
| `status` | `label`, `model?`, `ttftMs?`, `detail?` | Status indicator |
| `text_delta` | `delta: string` | Streaming text append |
| `thinking_delta` | `delta: string` | Reasoning panel append |
| `thinking_start` | *(none)* | Show reasoning expander |
| `tool_use` | `id`, `name`, `input` | Tool call card |
| `tool_result` | `toolUseId`, `content`, `isError?` | Tool result display |
| `usage` | `usage?`, `costUsd?`, `durationMs?` | Token/cost summary |
| `live_artifact` | `action`, `projectId`, `artifactId`, `title` | Artifact create/update/delete |
| `live_artifact_refresh` | `phase`, `projectId`, `artifactId` | Artifact refresh lifecycle |
| `raw` | `line: string` | Unparsed debug line |

Full definition: `packages/contracts/src/sse/chat.ts` line 68.

### 3.2 Project Events SSE (`/api/projects/:id/events`)

| Event | Payload | Trigger |
|-------|---------|---------|
| `ready` | `{ projectId }` | Connection established, initial state sent |
| `file-changed` | File system change event | File modified, created, or deleted |
| `conversation-created` | `ProjectConversationCreatedSsePayload` | New conversation from routimes or external ops |
| `live_artifact` | `LiveArtifactSsePayload` | Artifact created / updated / deleted |
| `live_artifact_refresh` | `LiveArtifactRefreshSsePayload` | Artifact refresh phase change |

### 3.3 Proxy SSE (`/api/proxy/*/stream`)

| Event | Payload | Purpose |
|-------|---------|---------|
| `start` | `{ model?: string }` | Upstream stream connected |
| `delta` | `{ delta: string }` | Text chunk from provider |
| `error` | `SseErrorPayload` | Upstream error |
| `end` | `{ code?: number }` | Upstream stream closed |

Protocol version: `PROXY_SSE_PROTOCOL_VERSION = 1`.

---

## 4. Request/Response Patterns

### 4.1 SSE Stream Lifecycle

1. Client opens `POST /api/chat` (the handler starts an SSE response) or `GET /api/runs/:id/events` with `Accept: text/event-stream`
2. Daemon sends `event: start` with run metadata
3. Daemon sends zero or more `event: agent` / `event: stdout` / `event: stderr`
4. Daemon sends `event: end` with exit code and status, then closes the connection
5. On error, daemon sends `event: error` and closes

### 4.2 File Upload

Two patterns:
- **Multipart** — `Content-Type: multipart/form-data` with a `file` field. Used by `/api/projects/:id/upload` and `/api/import/claude-design`.
- **JSON** — `{ name: string, content: string, encoding?: "base64" | "utf8" }`. Used by `/api/projects/:id/files`.

### 4.3 Tool Token Auth

Agent-facing endpoints under `/api/tools/*` require a bearer token passed as `Authorization: Bearer <token>`. Tokens are generated per-run and validated against the active run's tool token. Error codes: `TOOL_TOKEN_MISSING`, `TOOL_TOKEN_INVALID`, `TOOL_TOKEN_EXPIRED`, `TOOL_ENDPOINT_DENIED`, `TOOL_OPERATION_DENIED`.

---

## 5. Project Metadata Shape

Defined in `packages/contracts/src/api/projects.ts`:

```ts
interface ProjectMetadata {
  kind: ProjectKind;
  platform: ProjectPlatform;
  intent?: string;
  baseDir?: string;
  linkedDirs?: string[];
  designSystemId?: string;
  skillId?: string;
  mode?: string;
  scenario?: string;
}
```

**Platform values:** `auto` | `responsive` | `web-desktop` | `mobile-ios` | `mobile-android` | `tablet` | `desktop-app`
