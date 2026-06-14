# od-mcp

MCP server bridging Claude Code to Open Design for agent-to-agent UI design handoff.

One round trip: Claude Code sends a design brief + chooses a brand → Open Design generates HTML/CSS → Claude Code collects the result.

## Install

```bash
claude mcp add od-design -- npx @open-design/od-mcp
```

## Prerequisites

Open Design daemon must be running:

```bash
pnpm tools-dev start --prod
```

The MCP server auto-discovers the daemon URL via:
1. `OD_DAEMON_URL` env var
2. `.od/tmp/daemon-url.json` (written by daemon on startup)
3. `http://127.0.0.1:7456` (fallback)

## Tools

### `od_design_handoff`

Send a UI design request. One call: creates project, writes brief, launches agent, returns files.

| Parameter | Required | Description |
|-----------|----------|-------------|
| `designSystemId` | ✅ | Brand style (e.g. `stripe`, `linear`, `airbnb`) |
| `brief` | ✅ | Free-text Markdown design brief |
| `projectName` | ✅ | Human-readable project name |
| `skillId` | | Design skill (default: `canvas-design`) |

### `od_design_list_systems`

List 150+ available design systems. No parameters.

## Troubleshooting

| Error | Cause | Fix |
|-------|-------|-----|
| `Failed to fetch` | Daemon not running | `pnpm tools-dev start --prod` |
| `Design system not found` | Invalid designSystemId | Call `od_design_list_systems` first |
| `Design agent timed out` | Agent took >3min | Retry with simpler brief |
