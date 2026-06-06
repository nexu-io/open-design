# Network Security Guide

How to expose the Open Design daemon to your network safely.

## When you need this

The daemon defaults to `127.0.0.1` (localhost only). Change the bind address when you want to:

- Access the daemon from another device on your LAN
- Run the daemon on a headless server and connect from your laptop
- Share a single daemon instance across a team

## Quick reference

```bash
# Bind to all interfaces (LAN-accessible)
od --host 0.0.0.0 --port 7456

# Bind to a specific interface (e.g. Tailscale)
od --host 100.64.0.1 --port 7456

# With API key authentication
od auth key generate --label "my-laptop"
# => od_abc123...
od --host 0.0.0.0

# With IP allowlist
OD_ALLOWED_HOSTS=192.168.1.0/24,10.0.0.5 od --host 0.0.0.0

# Tailscale: bind to tailnet IP only (no API keys needed)
od --host $(tailscale ip -4) --port 7456
```

## Configuration

| Setting | CLI flag | Env var | Default |
|---------|----------|---------|---------|
| Bind address | `--host` | `OD_BIND_HOST` | `127.0.0.1` |
| Port | `--port` | `OD_PORT` | `7456` |
| IP allowlist | — | `OD_ALLOWED_HOSTS` | (empty = allow all) |
| Extra CORS origins | — | `OD_ALLOWED_ORIGINS` | (empty) |

## Security layers

When the daemon is bound to a non-loopback address, two security layers activate automatically:

### 1. IP allowlist (`OD_ALLOWED_HOSTS`)

Comma-separated list of IPs and CIDR ranges. Only these hosts can connect. Loopback (`127.0.0.1`, `::1`) is always allowed.

```bash
# Only allow one specific IP
OD_ALLOWED_HOSTS=192.168.1.100 od --host 0.0.0.0

# Allow an entire subnet
OD_ALLOWED_HOSTS=192.168.1.0/24 od --host 0.0.0.0

# Multiple entries
OD_ALLOWED_HOSTS=192.168.1.0/24,10.0.0.5 od --host 0.0.0.0
```

If unset, all network hosts can connect.

### 2. API key authentication

When bound to a non-loopback address, non-loopback requests must carry a valid API key.

```bash
# Generate a key
od auth key generate --label "my-laptop"
# Output: Generated API key (id: a1b2c3d4):
#         od_abc123...

# Use the key
curl -H "Authorization: Bearer od_abc123..." http://192.168.1.10:7456/api/health

# Or via header
curl -H "X-API-Key: od_abc123..." http://192.168.1.10:7456/api/health
```

Key management:

```bash
od auth key list              # list key IDs + labels
od auth key revoke <id>       # revoke a key
od auth key generate          # generate a new key
```

Loopback requests (from the same machine) never require a key, so local `tools-dev` and the desktop app continue to work without changes.

### What is skipped

- `OPTIONS` requests (CORS preflight)
- `GET /api/health` (health checks)

## Startup warnings

When bound to a non-loopback address, the daemon logs warnings on startup:

```
[od] daemon bound to 0.0.0.0 — accessible from the network
[od] WARNING: no IP allowlist (OD_ALLOWED_HOSTS) configured; all network hosts can connect
[od] WARNING: no API keys configured; run `od auth key generate` to create one
```

## Nix / Home Manager

```nix
services.open-design = {
  enable = true;
  port = 7456;
  autoStart = true;
};
# Set env vars in the service definition for network exposure:
# OD_ALLOWED_HOSTS = "192.168.1.0/24";
```

## LaunchAgent (manual)

Add `OD_ALLOWED_HOSTS` to the plist `EnvironmentVariables` dict:

```xml
<key>EnvironmentVariables</key>
<dict>
  <key>OD_ALLOWED_HOSTS</key>
  <string>192.168.1.0/24</string>
</dict>
```

## Tailscale

[Tailscale](https://tailscale.com) provides a zero-config WireGuard mesh VPN. When you bind the daemon to the Tailscale interface, only authenticated devices in your tailnet can reach it — which means you can skip API key authentication entirely.

### Why Tailscale

- Each device authenticates via your identity provider (Google, GitHub, SSO, etc.)
- Traffic is end-to-end encrypted (WireGuard)
- No need to open firewall ports or manage API keys
- Works across LAN, WAN, and NAT — access your daemon from anywhere

### Setup

**1. Install Tailscale**

```bash
# macOS
brew install tailscale

# Or download from https://tailscale.com/download
```

**2. Authenticate**

```bash
sudo tailscale up
# Opens browser for login
```

**3. Find your Tailscale IP**

```bash
tailscale ip -4
# e.g. 100.64.0.1
```

**4. Bind the daemon to the Tailscale interface**

```bash
# Bind only to Tailscale IP — unreachable from regular LAN
od --host 100.64.0.1 --port 7456
```

Or via environment variable:

```bash
OD_BIND_HOST=100.64.0.1 OD_PORT=7456 od
```

**5. Connect from another device**

From any device in your tailnet:

```bash
curl http://100.64.0.1:7456/api/health
```

Open the web UI in a browser at `http://100.64.0.1:7456`.

### Bind to all interfaces with Tailscale-based allowlist

If you need both local and Tailscale access, bind to `0.0.0.0` and restrict to your tailnet range:

```bash
# Tailscale assigns IPs from 100.64.0.0/10 (CGNAT range)
OD_ALLOWED_HOSTS=127.0.0.1,100.64.0.0/10 od --host 0.0.0.0
```

This allows:
- Loopback (`127.0.0.1`) — local tools and desktop app
- Tailscale (`100.64.0.0/10`) — tailnet devices only
- Blocks everything else

### API keys with Tailscale

When the daemon is bound to a Tailscale IP (`--host 100.64.0.1`), requests from Tailscale addresses (100.64.0.0/10) automatically bypass API key authentication. The Tailscale mesh itself authenticates devices via your identity provider, so API keys are redundant for tailnet traffic.

When binding to `0.0.0.0`, Tailscale devices are also auto-detected and skip auth. Non-Tailscale LAN clients will still need a key:

```bash
od auth key generate --label "lan-laptop"
```

### Tailscale Serve (alternative)

If you prefer HTTPS and a stable URL over an IP address, use [Tailscale Serve](https://tailscale.com/kb/1242/tailscale-serve):

```bash
# Expose the daemon over HTTPS with a stable tailnet URL
# Tailscale assigns the https://<hostname>.ts.net URL automatically
tailscale serve --bg http://localhost:7456
```

This lets you:
- Keep the daemon on `127.0.0.1` (no network exposure at all)
- Access it at `https://my-od.tail1234.ts.net` from any tailnet device
- Get automatic TLS certificates

### LaunchAgent with Tailscale

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.open-design.daemon</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/od</string>
    <string>--host</string>
    <string>100.64.0.1</string>
    <string>--port</string>
    <string>7456</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>/tmp/open-design-daemon.log</string>
  <key>StandardErrorPath</key>
  <string>/tmp/open-design-daemon.err</string>
</dict>
</plist>
```

### Nix / Home Manager with Tailscale

```nix
services.open-design = {
  enable = true;
  port = 7456;
  autoStart = true;
  extraEnv.OD_BIND_HOST = "100.64.0.1";  # Tailscale IP
};
```

## Security recommendations

1. **Use Tailscale** for cross-network access. Bind to the Tailscale IP and skip API keys entirely — identity-based auth + WireGuard encryption is stronger than shared secrets on an open LAN.
2. **Always set `OD_ALLOWED_HOSTS`** when binding to `0.0.0.0`. Without it, any device on the network can reach the daemon.
3. **Generate at least one API key** before exposing to the network without Tailscale.
4. **Prefer specific interface binding** (`--host 192.168.1.10` or `--host 100.64.0.1`) over `0.0.0.0` when possible.
5. **Use a reverse proxy** (Caddy, nginx) with TLS for production deployments. The daemon itself is HTTP-only.
6. **Do not expose the daemon to the public internet** without a VPN (Tailscale, WireGuard) or SSH tunnel.

## Architecture

```
┌──────────────┐     ┌───────────────────────────────────────┐
│  LAN client  │────▶│  IP allowlist (OD_ALLOWED_HOSTS)      │
│              │     │  ── 403 if IP not in list              │
└──────────────┘     ├───────────────────────────────────────┤
                     │  API key auth (Bearer / X-API-Key)     │
┌──────────────┐     │  ── 401 if key missing or invalid      │
│  Tailscale   │────▶│  ── auto-detected: 100.64.0.0/10 skips  │
│  device      │     │  ── skipped for loopback requests        │
└──────────────┘     ├───────────────────────────────────────┤
                     │  Origin validation (existing)          │
┌──────────────┐     │  ── CORS + Host header checks          │
│  Loopback    │────▶│  ── bypasses all layers                 │
│  (local)     │     ├───────────────────────────────────────┤
└──────────────┘     │  Route handlers                        │
                     └───────────────────────────────────────┘
```

Loopback clients (`127.0.0.1`, `::1`) bypass all security layers. When bound to a Tailscale IP (`100.64.x.x`), only authenticated tailnet devices can reach the daemon — no additional auth needed.

## References

- Self-hosting guide: [`docs/self-hosting.md`](./self-hosting.md)
- Nix flake: `nix/README.md`
- Origin validation source: `apps/daemon/src/origin-validation.ts`
