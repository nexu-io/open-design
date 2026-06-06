# MCP Install Snippets Reference

Source of truth: `apps/web/src/components/SettingsDialog.tsx` (4041–4399)  
Auth env var: `OD_MCP_TOKEN` — managed by the daemon, never baked into snippets  
Last updated: 2026-05-15

---

## Common variables

| Variable | Description |
|----------|-------------|
| `<COMMAND>` | Absolute path to the Node runtime supplied by the daemon |
| `<CLI_PATH>` | Absolute path to `cli.js` supplied by the daemon |
| `<DAEMON_URL>` | `http://127.0.0.1:<port>` (local only) or omitted (sidecar mode) |
| `<REMOTE_URL>` | `http://<host>:<port>/mcp` or `OD_PUBLIC_BASE_URL/mcp` |
| `$OD_MCP_TOKEN` | Shell env var reference — value written to shell profile by daemon on key create/rotate/delete |
| `OD_DATA_DIR` | Always included — pins a writable path for packaged apps (#848) |

---

## Key lifecycle → shell env

| Event | Shell profile effect |
|-------|----------------------|
| `POST /api/mcp-keys` (generate / rotate) | `export OD_MCP_TOKEN=<actual key>` written to `~/.zshrc` (or equivalent) |
| `DELETE /api/mcp-keys/:id` | `OD_MCP_TOKEN` cleared (set to `''`) |

Snippets are **immutable** — no need to re-copy after key rotation.

---

## Local stdio snippets

### Claude Code
```bash
claude mcp add-json --scope user open-design '{"command":"<COMMAND>","args":["<CLI_PATH>","mcp","--daemon-url","<DAEMON_URL>"],"env":{"OD_DATA_DIR":"<DATA_DIR>","OD_MCP_TOKEN":"$OD_MCP_TOKEN"}}'
```

### Codex (`~/.codex/config.toml`)
```toml
[mcp_servers.open-design]
command = "<COMMAND>"
args = ["<CLI_PATH>", "mcp", "--daemon-url", "<DAEMON_URL>"]

[mcp_servers.open-design.env]
OD_DATA_DIR = "<DATA_DIR>"
OD_MCP_TOKEN = "$OD_MCP_TOKEN"
```

### Cursor (`~/.cursor/mcp.json`) · Windsurf · Antigravity
```json
{
  "mcpServers": {
    "open-design": {
      "command": "<COMMAND>",
      "args": ["<CLI_PATH>", "mcp", "--daemon-url", "<DAEMON_URL>"],
      "env": {
        "OD_DATA_DIR": "<DATA_DIR>",
        "OD_MCP_TOKEN": "$OD_MCP_TOKEN"
      }
    }
  }
}
```

### VS Code (MCP settings)
```json
{
  "servers": {
    "open-design": {
      "type": "stdio",
      "command": "<COMMAND>",
      "args": ["<CLI_PATH>", "mcp", "--daemon-url", "<DAEMON_URL>"],
      "env": {
        "OD_DATA_DIR": "<DATA_DIR>",
        "OD_MCP_TOKEN": "$OD_MCP_TOKEN"
      }
    }
  }
}
```

### Zed (settings.json)
```json
{
  "context_servers": {
    "open-design": {
      "source": "custom",
      "command": "<COMMAND>",
      "args": ["<CLI_PATH>", "mcp", "--daemon-url", "<DAEMON_URL>"],
      "env": {
        "OD_DATA_DIR": "<DATA_DIR>",
        "OD_MCP_TOKEN": "$OD_MCP_TOKEN"
      }
    }
  }
}
```

> **Note:** `OD_MCP_TOKEN` entry is omitted entirely when auth is disabled (`networkExposed=false` or no keys configured).

---

## Remote HTTP snippets (shown only when `networkExposed=true`)

### Claude Code
```bash
# auth enabled
claude mcp add --transport http open-design <REMOTE_URL> --header "Authorization: Bearer $OD_MCP_TOKEN"

# auth disabled
claude mcp add --transport http open-design <REMOTE_URL>
```

### Codex (`~/.codex/config.toml`)
```toml
# auth enabled
[mcp_servers.open-design]
url = "<REMOTE_URL>"
bearer_token_env_var = "OD_MCP_TOKEN"

# auth disabled
[mcp_servers.open-design]
url = "<REMOTE_URL>"
```

### Cursor (`~/.cursor/mcp.json`) · Windsurf · Antigravity
```json
{
  "mcpServers": {
    "open-design": {
      "url": "<REMOTE_URL>",
      "headers": {
        "Authorization": "Bearer $OD_MCP_TOKEN"
      }
    }
  }
}
```

### VS Code
```json
{
  "servers": {
    "open-design": {
      "type": "http",
      "url": "<REMOTE_URL>",
      "headers": {
        "Authorization": "Bearer $OD_MCP_TOKEN"
      }
    }
  }
}
```

### Zed
```json
{
  "context_servers": {
    "open-design": {
      "source": "custom",
      "url": "<REMOTE_URL>",
      "headers": {
        "Authorization": "Bearer $OD_MCP_TOKEN"
      }
    }
  }
}
```

---

## Auth flow summary

```
Local stdio
  od mcp process
    └─ env.OD_MCP_TOKEN = "$OD_MCP_TOKEN"  (shell expands at spawn time)
       → daemon HTTP API receives Bearer <actual value>
       (when networkExposed=false, middleware is no-op → token not required)

Remote HTTP
  /mcp endpoint
    └─ Authorization: Bearer <token>
       - Claude/Cursor/VSCode/Zed: Configured via "Authorization" header
       - Codex: Configured via "bearer_token_env_var"
       (daemon auth middleware always requires this header)
```

## Related files

- Snippet generation logic: `apps/web/src/components/SettingsDialog.tsx:4041`
- Install payload builder: `apps/daemon/src/mcp-install-info.ts`
- Shell env management: `apps/daemon/src/shell-env.ts`
- Key generate (sets env): `apps/daemon/src/server.ts:2600`
- Key delete (clears env): `apps/daemon/src/server.ts:2632`
- stdio auth header: `apps/daemon/src/mcp.ts:572` (reads `OD_MCP_TOKEN`)
- HTTP MCP handler: `apps/daemon/src/mcp-http.ts`
- Auth middleware: `apps/daemon/src/auth-middleware.ts`
