# WSL2 Setup Guide

Use this guide when your coding-agent CLIs run inside WSL2. In that setup,
install and run Open Design from WSL as well so the agent CLI, `od` command,
daemon, Node modules, and credentials all come from the same Linux environment.

For native Windows PowerShell setup, use
[`docs/windows-troubleshooting.md`](windows-troubleshooting.md) instead.

## Recommended shape

- Clone Open Design inside WSL2.
- Install Node `~24` and the repo-pinned pnpm (`10.33.2`) inside WSL2.
- Put a WSL-native `od` wrapper before `/usr/bin` on `PATH`.
- Start the daemon from WSL with `od --no-open`.
- Install MCP entries from the same WSL shell.

Do not assume the Windows desktop app's daemon is the right daemon for WSL
agent clients. WSL2 networking and Windows credential stores can make that path
ambiguous. A WSL-started daemon keeps the MCP clients and Open Design in the
same environment.

## 1. Install from source in WSL

```bash
git clone https://github.com/nexu-io/open-design.git ~/tools/open-design
cd ~/tools/open-design

node --version   # should print v24.x.x
corepack enable
corepack pnpm --version   # should print 10.33.2
pnpm install
```

If you use `mise`, trust and install the repo toolchain before `pnpm install`:

```bash
mise trust
mise install
```

## 2. Fix the `od` command collision

Linux already ships `/usr/bin/od` (octal dump). If that binary wins on `PATH`,
commands such as `od mcp install claude` fail with file-not-found messages for
`mcp`, `install`, and the agent name.

Check what your shell resolves:

```bash
type -a od
```

If `/usr/bin/od` appears before Open Design, create a wrapper in `~/.local/bin`
and make sure that directory is first on `PATH`:

```bash
mkdir -p ~/.local/bin

cat > ~/.local/bin/od <<'EOF'
#!/usr/bin/env bash
repo="$HOME/tools/open-design"
cd "$repo" || exit 127

if command -v mise >/dev/null 2>&1; then
  exec mise exec -- pnpm exec od "$@"
fi

exec corepack pnpm exec od "$@"
EOF

chmod +x ~/.local/bin/od
export PATH="$HOME/.local/bin:$PATH"
hash -r
type -a od
```

Expected first result:

```text
od is /home/<user>/.local/bin/od
```

`od.exe` is not a reliable workaround from WSL. It may resolve to a Windows
coreutils binary instead of Open Design, especially on machines with Windows
coreutils installed.

## 3. Start the daemon from WSL

Run the daemon from the same WSL environment that your agent CLIs use:

```bash
cd ~/tools/open-design
od --no-open
```

In another WSL terminal, verify it is reachable:

```bash
curl -sSf http://127.0.0.1:7456 >/dev/null && echo "Open Design daemon is reachable"
```

Leave the daemon terminal running while using MCP integrations.

## 4. Install MCP entries

From WSL, run the installer for each agent CLI you use:

```bash
od mcp install claude
od mcp install opencode
od mcp install codex
od mcp install antigravity
od mcp install copilot
```

The installer writes to the agent config locations for the current WSL user,
for example `~/.claude.json`, `~/.config/opencode/opencode.json`,
`~/.codex/config.toml`, `~/.gemini/antigravity/mcp_config.json`, and
`~/.copilot/mcp-config.json`.

## Native module mismatch after changing Node versions

If dependencies were installed under Node 22 and Open Design later runs under
Node 24, native modules such as `better-sqlite3` can fail with a
`NODE_MODULE_VERSION` mismatch.

Reinstall under the active Node 24 runtime:

```bash
cd ~/tools/open-design
rm -rf node_modules
pnpm store prune
pnpm install
```

Then verify the native module loads:

```bash
pnpm --filter @open-design/daemon exec node -e "require('better-sqlite3')"
```

## Codex config parse failures

If Codex fails before MCP install or a direct `codex` run with:

```text
invalid type: map, expected a boolean
in `features`
```

check `~/.codex/config.toml` for nested feature tables such as:

```toml
[features.multi_agent_v2]
hide_spawn_agent_metadata = false
max_concurrent_threads_per_session = 10000
enabled = false
```

Current Codex CLI versions expect `[features]` values to be booleans. Remove or
comment out the nested `[features.*]` block, then retry the command.

Open Design also normalizes this shape before daemon-launched Codex runs, but
manual cleanup may still be needed when Codex itself is invoked directly before
Open Design gets a chance to patch the config.
