# Self-Hosting Guide

Run Open Design on your own machine and share it with your team over your local network or a private tunnel. The daemon is a single Node.js process — no cloud account required.

## Topologies

| Topology | Who accesses it | How |
|----------|----------------|-----|
| **A — Local only** | You, on this machine | `http://localhost:7456` |
| **B — LAN sharing** | You + teammates on the same network | `http://<your-ip>:7456` |
| **C — Remote / tunnel** | Anyone with the URL | Tailscale, Cloudflare Tunnel, or ngrok |

---

## Topology A — Local only

The default. The daemon binds to `127.0.0.1` and is only reachable from your machine.

### Option 1: Desktop app (recommended)

Download the packaged app from [open-design.ai](https://open-design.ai/) or the [latest release](https://github.com/nexu-io/open-design/releases). The daemon starts automatically when you open the app.

To start on login, enable **Settings → Desktop → Launch at login**.

### Option 2: Daemon only (headless)

Install the `od` CLI and run it as a background service. No Electron required — access the UI from any browser.

#### 1. Build

```bash
pnpm install
pnpm --filter @open-design/web build      # web UI static files
pnpm --filter @open-design/daemon build   # daemon CLI
```

#### 2. Install `od` globally

```bash
pnpm setup
# Reload your shell (zsh: source ~/.zshrc / bash: source ~/.bashrc / fish: source ~/.config/fish/config.fish)
(cd apps/daemon && pnpm link --global)
```

> **macOS note:** `od` conflicts with the system octal-dump utility (`/usr/bin/od`). Add an alias:
> ```bash
> # zsh
> echo 'alias od="$HOME/Library/pnpm/od"' >> ~/.zshrc && source ~/.zshrc
> # bash
> echo 'alias od="$HOME/Library/pnpm/od"' >> ~/.bashrc && source ~/.bashrc
> # fish
> echo 'alias od="$HOME/Library/pnpm/od"' >> ~/.config/fish/config.fish
> ```

#### 3. Run once (foreground)

```bash
od --port 7456 --no-open
```

Open `http://localhost:7456` in your browser.

#### 4. Run persistently with PM2 (recommended — macOS / Linux / Windows)

PM2 is a cross-platform process manager that handles auto-start on login without `sudo` and works with any Node.js version manager (mise, nvm, fnm, Homebrew).

```bash
npm install -g pm2

CLI_JS=$(realpath ~/Library/pnpm/global/5/node_modules/@open-design/daemon/dist/cli.js)  # macOS
# or: CLI_JS=$(realpath ~/.local/share/pnpm/global/5/node_modules/@open-design/daemon/dist/cli.js)  # Linux

pm2 start "$CLI_JS" --name od -- --port 7456 --no-open
pm2 save
```

Register auto-start (run once — requires `sudo` on first setup):

```bash
pm2 startup   # prints the command to run — copy and execute it
```

Useful PM2 commands:

```bash
pm2 status          # check running processes
pm2 logs od         # view logs
pm2 restart od      # restart daemon
pm2 stop od         # stop daemon
pm2 delete od       # remove from pm2
```

After rebuilding (`pnpm --filter @open-design/daemon build`), restart to pick up changes:

```bash
pm2 restart od
```

---

## Topology B — LAN sharing

Bind the daemon to `0.0.0.0` so teammates on the same network can reach it.

> **Security note:** binding to `0.0.0.0` exposes all daemon endpoints to every device on your LAN. Enable API key authentication and/or an IP allowlist before doing this. See [`docs/network-security.md`](./network-security.md).

### Start with LAN binding

```bash
od --host 0.0.0.0 --port 7456 --no-open
```

Or with PM2:

```bash
OD_BIND_HOST=0.0.0.0 pm2 start "$CLI_JS" --name od -- --port 7456 --no-open
```

### Share with teammates

Give them your machine's LAN IP:

```bash
# macOS
ipconfig getifaddr en0
# Linux / Windows (WSL)
ip -4 addr show | grep inet
```

They open `http://<your-ip>:7456` in their browser.

### Lock it down

```bash
# Generate an API key
od auth key generate --label "team-shared"
# Start with IP allowlist (your office subnet) + key auth
OD_BIND_HOST=0.0.0.0 OD_ALLOWED_HOSTS=192.168.1.0/24 od --no-open
```

Teammates include the key in Settings → API key, or pass it as a header:

```
Authorization: Bearer <key>
```

---

## Topology C — Remote access via tunnel

For accessing from outside your LAN (remote work, sharing a prototype with a client, etc.). See **[docs/network-security.md](./network-security.md)** for the full tunnel setup guides:

- **Tailscale** (recommended) — private WireGuard mesh, no port forwarding
- **Cloudflare Tunnel** — HTTPS without opening firewall ports
- **ngrok** — quick temporary tunnel

---

## Advanced: OS-native auto-start

PM2 is recommended for most setups. Use OS-native methods only if you have a specific reason to avoid PM2.

### macOS LaunchAgent

> **Note:** LaunchAgent runs with a minimal PATH. If your Node.js is installed via a version manager (mise, nvm, fnm), the daemon may fail to start with `node: not found`. PM2 avoids this entirely.

```bash
CLI_JS=$(realpath ~/Library/pnpm/global/5/node_modules/@open-design/daemon/dist/cli.js)
NODE_BIN=$(dirname "$(which node)")

cat > ~/Library/LaunchAgents/com.open-design.daemon.plist << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.open-design.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}/node</string>
    <string>${CLI_JS}</string>
    <string>--port</string><string>7456</string>
    <string>--no-open</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>HOME</key><string>${HOME}</string>
    <key>PATH</key><string>${NODE_BIN}:${HOME}/Library/pnpm:/usr/local/bin:/usr/bin:/bin</string>
    <key>PNPM_HOME</key><string>${HOME}/Library/pnpm</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/open-design-daemon.log</string>
  <key>StandardErrorPath</key><string>/tmp/open-design-daemon.err</string>
</dict>
</plist>
EOF

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.open-design.daemon.plist
# Wait a few seconds then verify:
curl -s http://localhost:7456/api/health
```

Status / stop / restart:

```bash
launchctl list | grep open-design
launchctl bootout  gui/$(id -u)/com.open-design.daemon
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.open-design.daemon.plist
tail -f /tmp/open-design-daemon.log
```

### Linux systemd

```bash
CLI_JS=$(which od | xargs realpath 2>/dev/null || echo "$HOME/.local/share/pnpm/global/5/node_modules/@open-design/daemon/dist/cli.js")
NODE_BIN=$(dirname "$(which node)")

mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/open-design.service << EOF
[Unit]
Description=Open Design daemon
After=network.target

[Service]
ExecStart=$(which node) ${CLI_JS} --port 7456 --no-open
Environment=PATH=${NODE_BIN}:${HOME}/.local/share/pnpm:/usr/local/bin:/usr/bin:/bin
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable --now open-design
journalctl --user -u open-design -f
```

### Nix Home Manager

```nix
services.open-design.enable = true;
services.open-design.autoStart = true;
```

See [`nix/home-manager.nix`](../nix/home-manager.nix) for the full module.

---

## Environment variable reference

| Variable | Default | Description |
|----------|---------|-------------|
| `OD_BIND_HOST` | `127.0.0.1` | Address the daemon binds to. Set to `0.0.0.0` for LAN/tunnel access. |
| `OD_PORT` | `7456` | Port the daemon listens on. |
| `OD_ALLOWED_HOSTS` | _(none)_ | Comma-separated IPs or CIDR ranges allowed when not loopback. |
| `OD_DATA_DIR` | `.od/` | Relocates all daemon data (SQLite, artifacts, credentials). |
| `OD_ALLOWED_ORIGINS` | _(loopback only)_ | CORS origins allowed. Set to your tunnel/LAN URL when exposing remotely. |

---

## Data directory

| Environment | Location |
|-------------|----------|
| Installed daemon (`pnpm link --global`, PM2, systemd) | `$HOME/.od/` |
| Source checkout (`pnpm tools-dev`) | `<repo-root>/.od/` |

Override with `OD_DATA_DIR` in either case.

On first run, if `$HOME/.od/` doesn't exist but the legacy `<install-dir>/.od/` does, the daemon migrates data automatically.

---

## Security checklist for shared setups

- [ ] API key authentication enabled (`od auth key generate`)
- [ ] IP allowlist set (`OD_ALLOWED_HOSTS`) or Tailscale used for network isolation
- [ ] `OD_ALLOWED_ORIGINS` set to your actual URL (not `*`)
- [ ] Daemon not exposed to the internet without a tunnel that enforces auth
- [ ] Data directory (`OD_DATA_DIR`) is not world-readable

For the full security reference, see [`docs/network-security.md`](./network-security.md).

---

## References

- Network security and tunnel setup: [docs/network-security.md](./network-security.md)
- Nix Home Manager module: [nix/home-manager.nix](../nix/home-manager.nix)
- Docker setup: [QUICKSTART.md](../QUICKSTART.md#docker-setup)
- PM2 documentation: https://pm2.keymetrics.io/
