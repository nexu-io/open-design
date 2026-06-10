# Architecture Blueprint: Claude Code ↔ Open Design Middleware

## Goal

A zero-config bridge: Claude Code sends a design request → Open Design
generates UI → Claude Code collects the result → integrates into project.
One round trip. No ports, no URLs, no browser tabs for the user.

---

## Design decisions (discussed)

| Decision | Choice | Why |
|----------|--------|-----|
| Request model | **Sync request→response** | User confirmed one round trip; no async fire-and-forget |
| Transport Phase 1 | curl + Bash (existing APIs) | Proof-of-concept, zero new code |
| Transport Phase 2 | MCP server (`od-mcp`) | Typed tools, clean error handling |
| MCP location | Independent package (`packages/od-mcp`) | Not daemon logic; separate lifecycle; npm-publishable |
| File exchange | Filesystem shared directory | Claude Code naturally reads/writes files; no base64 bloat |
| Design brief format | Free-text Markdown | Design Agent understands natural language; no schema friction |
| Real-time / bidirectional | **Not needed** | User explicitly said "一来一回，不用搞实时" |

---

## Current state (Phase 0 — what already exists in OD)

| Component | Location | Status |
|-----------|----------|--------|
| Design system registry | `/api/design-systems` (129 brands) | ✅ |
| Project CRUD API | `/api/projects` | ✅ |
| File workspace API | `/api/projects/:id/files` | ✅ |
| Design agent launch | `/api/chat` (SSE streaming) | ✅ |
| Design agent via CLI | `od run <projectId> --prompt "..."` | ✅ |
| Agent discovery | `od agents` (16+ CLIs detected) | ✅ |
| Env injection | `OD_DAEMON_URL`, `OD_PROJECT_ID`, `OD_PROJECT_DIR` | ✅ |
| Skill loading | `skills/*/SKILL.md` auto-discovered | ✅ |

---

## Phase 1: curl-based proof-of-concept (zero new code)

### Flow

```
Step 1  CC detects OD daemon      GET /api/status
Step 2  User picks design system  GET /api/design-systems
Step 3  CC creates project        POST /api/projects {designSystemId, skillId}
Step 4  CC writes brief           echo "..." > $OD_PROJECT_DIR/design-brief.md
Step 5  CC launches design agent  POST /api/chat → SSE (wait for artifact_end)
Step 6  CC collects artifacts     GET /api/projects/:id/files
Step 7  CC integrates             read_file → copy into user's project
```

### Cost

- ~3-5 curl calls per handoff
- ~3-5K tokens spent on API response text in Claude Code context
- ~30-90 seconds wall-clock (design agent generation time)
- Zero new code. All endpoints exist today.

### Limitation

- Claude Code's Bash tool handles SSE poorly (long-running streaming)
- Error recovery depends on `grep` + exit codes
- No typed tool definitions for Claude Code to reason about

---

## Phase 2: MCP server (`packages/od-mcp`)

### Motivation

Replace curl calls with typed MCP tools. Claude Code gets:
- Structured tool definitions in its system prompt (better decisions)
- Typed error messages (no grep-based recovery)
- Single tool for the whole handoff (or 2-3 tools for flexibility)

### Proposed tools

#### od_design_handoff (one-shot: do everything in one call)

```typescript
{
  name: "od_design_handoff",
  description: "Send a UI design request to Open Design. Creates a project with the chosen design system, launches a design agent, waits for completion, and returns the generated file paths.",
  inputSchema: {
    type: "object",
    properties: {
      designSystemId: {
        type: "string",
        description: "Brand style to apply. Call od_design_list_systems to see options."
      },
      brief: {
        type: "string",
        description: "Free-text markdown design brief: page type, sections, content, constraints. See assets/design-brief-template.md for the recommended structure."
      },
      projectName: {
        type: "string",
        description: "Human-readable project name"
      },
      skillId: {
        type: "string",
        description: "Design skill to use. Default: 'canvas-design'."
      },
      maxWaitSeconds: {
        type: "number",
        description: "Maximum seconds to wait for design completion. Default: 120."
      }
    },
    required: ["designSystemId", "brief", "projectName"]
  }
}
```

Returns:
```json
{
  "projectId": "abc-123",
  "status": "completed",
  "elapsedSeconds": 52,
  "files": [
    { "path": "artifacts/index.html", "size": 4521 },
    { "path": "artifacts/index.css", "size": 2130 }
  ],
  "projectDir": "/path/to/.od/projects/abc-123"
}
```

#### od_design_list_systems

```typescript
{
  name: "od_design_list_systems",
  description: "List available design systems (brand styles) in the local Open Design installation.",
  inputSchema: {
    type: "object",
    properties: {}
  }
}
```

Returns:
```json
{
  "systems": [
    { "id": "stripe", "name": "Stripe", "category": "product" },
    { "id": "linear", "name": "Linear", "category": "product" },
    ...
  ]
}
```

### Implementation

```
packages/od-mcp/
├── package.json            # @open-design/od-mcp
├── tsconfig.json
├── esbuild.config.mjs
├── src/
│   ├── index.ts            # MCP server entry (stdio transport)
│   ├── tools.ts            # Tool definitions + handlers
│   ├── daemon-client.ts    # HTTP client → OD daemon
│   └── daemon-discovery.ts # Find daemon URL from env/known-file
├── tests/
│   └── tools.test.ts
└── vitest.config.ts
```

**Daemon discovery** (`daemon-discovery.ts`):
1. Check `OD_DAEMON_URL` env var
2. Check `.od/tmp/daemon-url.json` in project root
3. Check known default port (127.0.0.1:7456)
4. Fail with clear message if OD isn't running

**Registration**:
```bash
claude mcp add od-design -- npx @open-design/od-mcp
```

### Error handling

```typescript
// daemon-client.ts
type DaemonError = 
  | { code: "DAEMON_NOT_RUNNING"; message: "Open Design daemon not found. Start it first: pnpm tools-dev start --prod" }
  | { code: "DESIGN_SYSTEM_NOT_FOUND"; message: `Design system '${id}' not found. Available: ${list}` }
  | { code: "DESIGN_TIMEOUT"; message: `Design agent did not complete within ${seconds}s` }
  | { code: "DESIGN_FAILED"; message: string; runId: string };
```

---

## File sharing protocol

### Shared directory

```
.od/projects/<id>/
├── design-brief.md        # written by Claude Code (via od_design_handoff)
├── source/                # reference files (copied by Claude Code, optional)
├── artifacts/             # written by Design Agent
│   ├── index.html
│   ├── index.css
│   └── assets/
└── conversations/         # managed by OD daemon
```

### Ownership

- **Claude Code writes**: `design-brief.md`, `source/*` (optional refs)
- **OD writes**: `artifacts/*` (generated UI)
- **No conflicts**: separate directories

### Integration after collection

Claude Code reads the generated files from `artifacts/` via its normal
`read_file` tool, then copies/adapts into the user's project. No base64
encoding in transit — files stay on disk.

---

## Auto-port / zero user input

### Discovery chain

```
1. OD_DAEMON_URL env var          ← injected by daemon spawn
2. .od/tmp/daemon-url.json        ← written by daemon on startup
3. http://127.0.0.1:7456          ← fallback default port
```

The user never types a port or URL. The MCP server reads the first
available signal and connects.

### What the user sees

```
User: "Design a landing page for my SaaS, Stripe brand style."

Claude Code:
  1. Calls od_design_list_systems → confirms "stripe" exists
  2. Calls od_design_handoff(designSystemId="stripe", brief="...")
  3. [~60s wait — OD design agent works]
  4. Gets back file list: index.html, index.css
  5. Reads files: read_file(.od/projects/<id>/artifacts/index.html)
  6. Copies into user's project
  7. Reports: "Done. Landing page with Stripe style generated at ui/index.html"
```

No port, no URL, no browser tab. The user only chose the brand and
described the UI.
