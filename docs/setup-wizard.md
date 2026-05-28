# Setup Wizard Guide

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`architecture.md`](architecture.md) · [`agent-adapters.md`](agent-adapters.md) · [`modes.md`](modes.md) · [`network-security.md`](network-security.md)

How to configure Open Design on first launch and reconfigure it later.

## When you need this

The setup wizard runs automatically the first time you start `od` and whenever you explicitly invoke `od setup`. Use it to:

- Select which code agents to configure
- Enter API keys for BYOK (bring-your-own-key) agents
- Register Open Design as an MCP server in your code agent
- Choose privacy and telemetry preferences
- Optionally start the daemon and open the browser

If you have already completed setup, you can reconfigure any setting at any time via `od config set <key> <value>` or the Settings UI.

## Quick reference

```bash
# First run — launches automatically
od

# Run the wizard again at any time
od setup

# Choose a specific mode
od setup --mode advanced

# Non-interactive (CI, headless, scripts)
od setup --non-interactive --accept-risk

# Reconfigure a single setting without the wizard
od config set agentId claude
od config set bindHost 0.0.0.0
od config set port 8080
```

## How first-run detection works

When you run `od` with no subcommand, the default daemon mode reads the app configuration file (`<dataDir>/app-config.json`). If the `onboardingCompleted` key is missing or `false`, the wizard launches instead of the daemon.

After the wizard completes, it writes `onboardingCompleted: true` to the config file. Subsequent `od` invocations skip the wizard and start the daemon directly.

You can trigger the wizard again at any time with `od setup`. The wizard does not reset `onboardingCompleted` if it was already set — it simply walks through the steps again and overwrites whatever you change.

## Wizard modes

The wizard offers two modes. Quick covers the essentials in five steps. Advanced adds network binding, design system defaults, and provider configuration for a total of seventeen steps.

### Quick mode (5 steps)

Quick mode gets you from zero to a running daemon in under two minutes. It covers the settings that matter most on first use.

| Step | What happens | Config keys written |
|------|-------------|-------------------|
| 1. Environment detection | Scans your system for installed code agents and displays a status table. No input required. | — |
| 2. Agent selection | Lists all 16 supported agents. Detected agents are pre-selected; undetected agents are grayed out. You pick which ones to configure. | — (stored in memory for next steps) |
| 3. API keys | For each selected agent that requires a BYOK key, the wizard prompts for it. Skips agents whose environment variables are already set. | `agentCliEnv` |
| 4. Plugin install | If Claude Code is among your selected agents, offers to run `claude mcp add --scope user open-design -- od mcp` to register the MCP server. | — (writes to Claude Code's config) |
| 5. Telemetry | Two yes/no questions: anonymous usage metrics and content analysis for improvement. Both default to off. | `telemetry`, `privacyDecisionAt` |
| Finalize | Saves `onboardingCompleted: true` and the primary `agentId`. Offers to start the daemon and open the browser, or defer to a manual start later. | `onboardingCompleted`, `agentId` |

### Advanced mode (17 steps)

Advanced mode includes every quick-mode step, then continues with additional configuration. Steps 5–9 are interactive in the wizard; steps 10–16 are deferred to the Settings UI because they are rarely changed.

| Step | What happens | Config keys written |
|------|-------------|-------------------|
| 5. Design system | Choose a default design system for new projects. | `designSystemId` |
| 6. Network | Pick a bind address (`127.0.0.1` or `0.0.0.0`) and port. | `bindHost`, `port` |
| 7. Media providers | Configure image/video generation providers. Redirects to Settings UI. | — |
| 8. External MCP | Configure external MCP servers that the daemon connects to as a client. Redirects to Settings UI. | — |
| 9. Memory | Configure a knowledge graph or memory backend. Redirects to Settings UI. | — |
| 10–16 | Connectors, Orbit, Language, Appearance, Desktop, Notifications, Integrations. These are deferred to the Settings UI. | — |
| 17. Telemetry + Finalize | Same as quick mode steps 5–finalize. | `telemetry`, `privacyDecisionAt`, `onboardingCompleted`, `agentId` |

## Step-by-step walkthrough

### Step 1 — Environment detection

The wizard probes your `PATH` for all 16 supported agent binaries and displays a table like this:

```
── Environment ────────────────────────────
  OS:          darwin arm64
  Node.js:     v24.1.0
  Claude       ✓ 1.0.33
  Codex        ✓ 0.1.250509
  Gemini       ✗ not found
  Devin        ✗ not found
  ...
───────────────────────────────────────────
```

No input is required. The detection results feed into the agent selection step.

**What the probe does:** For each agent, the wizard resolves the binary path (handling nvm, fnm, and mise wrappers), spawns it with `--version`, and records whether it is available and what version it reports. Agents that fail with `ENOENT`, `EACCES`, `ENOTDIR`, or exit codes 126/127 are marked as not found. Other failures are still listed as detected but without a version number.

### Step 2 — Agent selection

A multi-select list of all 16 supported agents appears. Agents detected in step 1 are pre-selected and marked with a green checkmark. Undetected agents are grayed out — you cannot select them without installing them first.

If you deselect all agents, the wizard warns you but continues. You can use BYOK API mode from the Settings UI later without a local agent binary.

The first agent you leave selected becomes your **primary agent** — the one the daemon uses by default when you start a new chat.

### Step 3 — API keys

Not every agent requires an API key. The wizard only prompts for agents in your selection that have a known BYOK environment variable:

| Agent | Environment variable | When it is skipped |
|-------|---------------------|-------------------|
| `codex` | `OPENAI_API_KEY` | Already set in your shell |
| `deepseek` | `DEEPSEEK_API_KEY` | Already set in your shell |
| `gemini` | `GEMINI_API_KEY` | Already set in your shell |
| `qwen` | `DASHSCOPE_API_KEY` | Already set in your shell |
| `qoder` | `OPENAI_API_KEY` | Already set in your shell |
| `opencode` | `OPENAI_API_KEY` | Already set in your shell |

Agents not listed here (Claude Code, Devin, Cursor Agent, etc.) authenticate through their own mechanisms and do not need an API key in the wizard.

Keys are stored in `app-config.json` under the `agentCliEnv` key, namespaced per agent. The daemon injects them into the agent's environment at spawn time. They never appear in logs or terminal output.

> **Security:** The wizard uses a password prompt (masked input) for API keys. Values are written to the local config file only. Do not commit `app-config.json` to version control.

### Step 4 — Plugin install (Claude Code)

If you selected the `claude` agent, the wizard offers to register the Open Design MCP server with Claude Code. This gives Claude Code access to `get_artifact`, `get_file`, `list_files`, and `search_files` tools — letting the agent read your Open Design projects without exporting files.

```bash
# What the wizard runs under the hood
claude mcp add --scope user open-design -- od mcp
```

If the command fails (e.g., `claude` is not on `PATH`, or Claude Code is not installed), the wizard prints manual instructions and continues.

You can also run this manually at any time:

```bash
# Install
claude mcp add --scope user open-design -- od mcp

# Verify
claude mcp list

# Remove
claude mcp remove open-design
```

### Step 5 — Telemetry

Two confirmation prompts:

1. **Allow anonymous usage metrics?** — Aggregated counts (daemon starts, agent invocations, feature usage). No project content is sent. Defaults to **no**.
2. **Allow content analysis for improvement?** — Allows sending anonymized snippets for model improvement. Defaults to **no**.

Both settings are written to `app-config.json` and can be changed later:

```bash
od config set telemetry.metrics true
od config set telemetry.content false
```

### Step 6 — Finalize

The wizard saves two final config keys:

- `onboardingCompleted: true` — prevents the wizard from auto-launching on subsequent `od` runs.
- `agentId: <first-selected-agent>` — your primary agent.

Then you choose:

| Option | What happens |
|--------|-------------|
| **Open in Browser** | Starts the daemon, runs a health check against `/api/health`, opens your default browser to the daemon URL, then exits the wizard process. The daemon keeps running. |
| **Later** | Prints a summary and exits. You start the daemon manually with `od`. |

The summary shows your primary agent, port, data directory, and the daemon URL (if started).

## Advanced-mode steps

### Network (Advanced step 6)

Choose the bind address and port for the daemon's HTTP server.

| Option | Address | Use case |
|--------|---------|----------|
| Localhost only | `127.0.0.1` | Recommended. Only accessible from this machine. |
| All interfaces | `0.0.0.0` | LAN access. Requires API key authentication. See [`network-security.md`](network-security.md). |

The default port is `7456`. You can change it to any valid port (1–65535).

```bash
# Override later without the wizard
od config set bindHost 0.0.0.0
od config set port 8080
```

### Design system, media, MCP, and memory (Advanced steps 5, 7–9)

These steps ask a single yes/no question each. If you answer yes, the wizard directs you to the Settings UI for detailed configuration because the options are too extensive for a terminal wizard:

| Setting | Where to configure it later |
|---------|---------------------------|
| Default design system | Settings → Design Systems, or `od config set designSystemId <id>` |
| Media providers | Settings → Media Providers, or `od config set mediaProviders.<id>.apiKey <key>` |
| External MCP servers | Settings → External MCP Client, or `od mcp add <name> -- <command>` |
| Memory backend | Settings → Memory, or `od config set memory.provider <type>` |

## Non-interactive mode

For CI, headless servers, and automated scripts, the wizard can run without any prompts:

```bash
od setup --non-interactive --accept-risk
```

The `--accept-risk` flag is required. It acknowledges that the wizard will use all default values:

| Setting | Default in non-interactive mode |
|---------|-------------------------------|
| Mode | Quick |
| Agent selection | All detected agents |
| API keys | None (empty strings) |
| Plugin install | Yes (attempts Claude MCP registration) |
| Telemetry metrics | No |
| Content analysis | No |
| Finalize | Attempts to start daemon and open browser |

> **Why `--accept-risk`?** Non-interactive mode makes real decisions (registering MCP servers, writing config files, starting the daemon). The flag ensures the operator has explicitly opted in. Running `--non-interactive` without it exits with error code 2.

## The prompter abstraction

The wizard is built on a `SetupPrompter` interface that decouples the step logic from the presentation layer. Two implementations ship with the daemon:

```
SetupPrompter (interface)
├── ClackPrompter    — interactive terminal via @clack/prompts
└── SilentPrompter   — non-interactive, returns defaults
```

`ClackPrompter` renders spinners, selection lists, password masks, and colored output using the `@clack/prompts` library. When the user presses Ctrl+C during any prompt, it throws a `CancelError` that cleanly terminates the wizard without writing partial config.

`SilentPrompter` accepts all defaults silently. Output methods (`info`, `success`, `warn`) write plain text to stdout/stderr with a `[setup]` prefix so you can see what happened in CI logs.

This abstraction means the same step modules work identically in interactive terminals, headless environments, and (in the future) a web-based setup UI.

## Reconfiguring after setup

The wizard is not the only way to change settings. After completing setup:

```bash
# View all current settings
od config list

# Change individual settings
od config set agentId gemini
od config set telemetry.metrics true
od config set bindHost 0.0.0.0
od config set port 9000

# Re-run the full wizard
od setup

# Re-run in advanced mode
od setup --mode advanced
```

You can also change any setting from the web UI: open the daemon in your browser, then navigate to Settings.

## Supported agents

The wizard detects and configures these 16 agents:

| Agent | Binary name | Auth method | Wizard configures |
|-------|------------|-------------|------------------|
| Claude Code | `claude` | OAuth / API key | MCP server registration |
| Codex | `codex` | `OPENAI_API_KEY` | API key |
| Devin | `devin` | OAuth | — |
| Gemini | `gemini` | `GEMINI_API_KEY` | API key |
| OpenCode | `opencode` | `OPENAI_API_KEY` | API key |
| Hermes | `hermes` | Varies | — |
| Kimi | `kimi` | Varies | — |
| Cursor Agent | `cursor-agent` | OAuth | — |
| Qwen | `qwen` | `DASHSCOPE_API_KEY` | API key |
| Qoder | `qoder` | `OPENAI_API_KEY` | API key |
| GitHub Copilot | `copilot` | OAuth | — |
| Pi | `pi` | Varies | — |
| Kiro | `kiro` | Varies | — |
| Kilo | `kilo` | Varies | — |
| Vibe | `vibe` | Varies | — |
| DeepSeek | `deepseek` | `DEEPSEEK_API_KEY` | API key |

Agents not detected on your system are displayed but cannot be selected. Install the agent's CLI first, then run `od setup` again.

## Configuration file reference

All wizard settings are persisted in `<dataDir>/app-config.json`. The data directory is:

- `<projectRoot>/.od` in development (when `OD_TOOLS_DEV_PARENT_PID` is set)
- `$HOME/.od` in production (overridable with `OD_DATA_DIR`)

| Key | Type | Set by wizard | Description |
|-----|------|--------------|-------------|
| `onboardingCompleted` | `boolean` | Finalize | Whether setup has been completed |
| `agentId` | `string \| null` | Finalize | Primary agent for new chats |
| `agentCliEnv` | `Record<string, Record<string, string>>` | API keys | Per-agent environment variables (API keys) |
| `telemetry` | `{ metrics: boolean, content: boolean, artifactManifest: boolean }` | Telemetry | Privacy preferences |
| `privacyDecisionAt` | `number \| null` | Telemetry | Timestamp of privacy decision |
| `bindHost` | `string` | Network (Advanced) | HTTP bind address |
| `port` | `number` | Network (Advanced) | HTTP port (1–65535) |

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| Wizard does not launch on `od` | `onboardingCompleted` is already `true` | Run `od setup` explicitly |
| No agents detected | Agent CLIs not on `PATH` | Install the CLI, verify with `<agent> --version`, then run `od setup` |
| Claude MCP registration fails | `claude` binary not found or Claude Code not installed | Install Claude Code, then run `claude mcp add --scope user open-design -- od mcp` manually |
| Daemon health check fails in finalize | Port already in use or firewall blocking | Kill the existing process or change the port: `od setup --mode advanced` |
| `--non-interactive` exits with error | Missing `--accept-risk` flag | Add `--accept-risk` to acknowledge defaults |
| API key not injected at runtime | Key stored under wrong agent namespace | Check with `od config list`, fix with `od config set agentCliEnv.<agentId>.<ENV_VAR> <key>` |
| Cannot select an agent in the wizard | Agent not detected in step 1 | The binary must be on `PATH` and respond to `--version` |

## Open questions

1. **Web-based setup UI** — The `SetupPrompter` abstraction supports a third implementation backed by web forms. A future iteration may serve the wizard through the browser for users who prefer a graphical interface.
2. **Agent auto-install** — The wizard currently detects agents but does not offer to install missing ones. Adding `npm install -g` or `brew install` prompts would reduce friction.
3. **Setup profiles** — Users who work across multiple machines may benefit from importable/exportable setup profiles (a JSON file that pre-answers every wizard question).
