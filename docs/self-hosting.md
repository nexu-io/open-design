# Self-Hosting Guide

Run Open Design on your own machine. The daemon is a single Node.js process — no cloud account required.

## Topologies

| Topology | Description | Extra setup |
|----------|-------------|-------------|
| **A — Local only** | You, on this machine at `http://localhost:7456` | None |
| **B — LAN sharing** | You + teammates on the same network | Settings → Network: bind to `0.0.0.0`, then configure auth keys |
| **C — Remote / tunnel** | Anyone with the URL via Tailscale, Cloudflare Tunnel, or ngrok | See [network-security.md](./network-security.md) |

---

## Installation

### Option 1: Desktop app (recommended)

Download from [open-design.ai](https://open-design.ai/) or the [latest release](https://github.com/nexu-io/open-design/releases). The daemon starts automatically when you open the app.

To start on login, enable **Settings → Desktop → Launch at login**.

### Option 2: Daemon only (headless)

Install the `od` CLI and run it as a background service. No Electron required — access the UI from any browser.

#### 1. Build

```bash
pnpm install
pnpm --filter @open-design/web build
pnpm --filter @open-design/daemon build
```

#### 2. Install `od` globally

```bash
pnpm setup  # first-time: sets up global bin directory
# Reload your shell, then:
(cd apps/daemon && pnpm link --global)
```

> **macOS:** `od` conflicts with `/usr/bin/od` (octal dump). Add an alias:
> ```bash
> # zsh
> echo 'alias od="$HOME/Library/pnpm/od"' >> ~/.zshrc && source ~/.zshrc
> ```

#### 3. Run

```bash
# Foreground (test it works)
od --port 7456 --no-open

# Background with PM2 (recommended)
npm install -g pm2
CLI_JS=$(realpath ~/Library/pnpm/global/5/node_modules/@open-design/daemon/dist/cli.js)  # macOS
# CLI_JS=$(realpath ~/.local/share/pnpm/global/5/node_modules/@open-design/daemon/dist/cli.js)  # Linux
pm2 start "$CLI_JS" --name od -- --port 7456 --no-open
pm2 save
pm2 startup  # auto-start on login (follow the printed instructions)
```

After rebuilding: `pm2 restart od`

---

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OD_BIND_HOST` | `127.0.0.1` | Bind address. Set to `0.0.0.0` for LAN/tunnel access. |
| `OD_PORT` | `7456` | Port the daemon listens on. |
| `OD_DATA_DIR` | `$HOME/.od` (installed) or `<repo>/.od` (dev) | Relocates all daemon data. |
| `OD_ALLOWED_HOSTS` | _(none)_ | Comma-separated IPs/CIDRs allowed when not loopback. |
| `OD_ALLOWED_ORIGINS` | _(loopback only)_ | CORS origins. Set to your tunnel/LAN URL when exposing remotely. |
| `OD_API_KEY` | _(none)_ | API key for `od mcp`. Auto-included in Settings → MCP server snippet. |

---

## Data directory

| Environment | Location |
|-------------|----------|
| Installed daemon (`pnpm link --global`, PM2, systemd) | `$HOME/.od/` |
| Source checkout (`pnpm tools-dev`) | `<repo-root>/.od/` |

Override with `OD_DATA_DIR` in either case.

On first run, if `$HOME/.od/` doesn't exist but the legacy `<install-dir>/.od/` does, the daemon migrates data automatically.

---

## Network and security

For LAN sharing, tunnel setup (Tailscale, Cloudflare Tunnel, ngrok), OS-native auto-start (LaunchAgent, systemd, Nix), IP allowlists, and the full security reference, see **[docs/network-security.md](./network-security.md)**.

MCP client configuration is handled in **Settings → MCP server** — select your agent, copy the snippet, and paste it into your terminal or config file.

---

## References

- Network security and tunnel setup: [docs/network-security.md](./network-security.md)
- Nix Home Manager module: [nix/home-manager.nix](../nix/home-manager.nix)
- Docker setup: [QUICKSTART.md](../QUICKSTART.md#docker-setup)
