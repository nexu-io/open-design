# One-Click Install Guide

**Parent:** [`spec.md`](spec.md) · **Siblings:** [`self-hosting.md`](self-hosting.md) · [`network-security.md`](network-security.md)

Deploy Open Design on Linux or macOS with a single command. The installer wraps the existing Docker Compose stack — no build step required.

## Quick reference

Clone the repository and run the installer:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
bash deploy/scripts/install.sh
```

## Prerequisites

The only requirement is Docker with the Compose plugin.

| Platform | Minimum version | Install |
|----------|----------------|---------|
| Docker Engine | 24.0 | [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) |
| Docker Compose plugin | 2.20 | Bundled with Docker Desktop; `apt install docker-compose-plugin` on Linux |
| Docker Desktop (macOS/Windows) | 4.25 | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |

The installer checks for Docker and offers to install it automatically on Ubuntu/Debian, Fedora, and macOS (via Homebrew). Use `--skip-docker-install` to skip this step.

> **MCP note:** Docker/Compose installs run the daemon inside the container. The MCP client snippets shown in Settings are stdio/local-path based and require a local/source install for now. Container-friendly MCP transport will be added in a follow-up.

## Interactive install walkthrough

Running the installer without flags launches an interactive wizard:

```
  ╔══════════════════════════════════════╗
  ║         O P E N   D E S I G N        ║
  ║          One-Click Installer         ║
  ╚══════════════════════════════════════╝

[open-design] OS: Linux ubuntu 24.04 (x86_64)
[open-design] Docker: Docker version 26.1.3, build b72abbb
[open-design] Compose: Docker Compose version v2.27.1

Docker image [docker.io/vanjayak/open-design:latest]:
Port [7456]:
Allowed origins (CORS, comma-separated, or empty) []:
Memory limit [384m]:

[open-design] Pulling image: docker.io/vanjayak/open-design:latest
[open-design] Starting Open Design...
[open-design] Waiting for health check (up to 60s)...
[open-design] Daemon is healthy (200 OK)
```

### What each prompt does

| Prompt | Default | Notes |
|--------|---------|-------|
| **Docker image** | `docker.io/vanjayak/open-design:latest` | Pin a digest for reproducibility: `docker.io/vanjayak/open-design@sha256:<digest>` |
| **Port** | `7456` | The port the daemon listens on. Must not be in use. |
| **Allowed origins** | _(empty)_ | CORS origins for reverse-proxy setups. See [`network-security.md`](network-security.md). Leave empty for localhost-only use. |
| **Memory limit** | `384m` | Container memory cap. Raise for large concurrent agent runs. |

After you confirm, the installer:

1. Writes a `deploy/.env` file (backs up any existing one).
2. Runs `docker compose pull` to fetch the image.
3. Runs `docker compose up -d --no-build` to start the container.
4. Polls `/api/health` for up to 60 seconds to confirm the daemon is ready.
5. On Linux: installs a `systemd --user` unit so the service starts on login.

## Non-interactive install

For CI, headless servers, and automated provisioning:

```bash
bash deploy/scripts/install.sh --non-interactive [--port 7456] [--image <ref>] [--no-systemd]
```

All prompts are skipped and defaults are used. If Docker is not installed, the script exits with an error instead of offering to install it.

### All flags

**`install.sh`**

| Flag | Description |
|------|-------------|
| `--non-interactive` | Skip all prompts |
| `--port <n>` | Host port (default: `7456`) |
| `--image <ref>` | Docker image reference |
| `--skip-docker-install` | Never attempt to install Docker |
| `--no-systemd` | Skip systemd unit creation |

## Service management

### Linux (systemd)

The installer creates a `systemd --user` unit that wraps Docker Compose. No `sudo` required.

```bash
# Check status
systemctl --user status open-design

# Start / stop / restart
systemctl --user start open-design
systemctl --user stop open-design
systemctl --user restart open-design

# View logs
journalctl --user -u open-design -f

# Disable auto-start
systemctl --user disable open-design

# Re-enable auto-start
systemctl --user enable open-design
```

To skip systemd unit creation, pass `--no-systemd` to the installer.

### macOS (Docker Desktop)

Docker Desktop manages the container lifecycle. Use Docker Desktop's dashboard to start, stop, or restart the `open-design` container, or use the CLI:

```bash
# Using docker compose directly
docker compose -f deploy/docker-compose.yml start
docker compose -f deploy/docker-compose.yml stop
docker compose -f deploy/docker-compose.yml logs -f
```

## Update

Pull the latest image and restart with a single command:

```bash
bash deploy/scripts/update.sh
```

To update to a specific image:

```bash
bash deploy/scripts/update.sh --image=docker.io/vanjayak/open-design@sha256:<digest>
```

The update script:
1. Pulls the new image.
2. Restarts the container with `docker compose up -d --no-build`.
3. Waits for `/api/health` to return 200.
4. Prunes dangling old images.

## Uninstall

```bash
# Remove containers and data
bash deploy/scripts/uninstall.sh

# Remove containers but keep data volume
bash deploy/scripts/uninstall.sh --keep-data
```

The uninstaller:
1. Stops and removes containers (`docker compose down`), then removes the data volume separately.
2. On Linux: disables and removes the systemd unit.
3. Removes `deploy/.env`.

> **Data:** By default, the `open_design_data` volume (projects, artifacts, config) is also deleted. Pass `--keep-data` to preserve it. Remove the volume manually later: `docker volume rm open_design_data`.

## Configuration

All settings live in `deploy/.env`. Edit it directly or re-run the installer to regenerate it.

| Variable | Default | Description |
|----------|---------|-------------|
| `OPEN_DESIGN_IMAGE` | `docker.io/vanjayak/open-design:latest` | Full image reference |
| `OPEN_DESIGN_PORT` | `7456` | Host-side port (bound to `127.0.0.1`) |
| `OPEN_DESIGN_ALLOWED_ORIGINS` | _(empty)_ | CORS origins for reverse-proxy setups |
| `OPEN_DESIGN_MEM_LIMIT` | `384m` | Container memory cap |
| `NODE_OPTIONS` | `--max-old-space-size=192` | Node.js heap cap inside the container |

The container always binds `127.0.0.1:<port>:7456` — the daemon is never directly exposed to the network. To allow remote access, put an authenticated reverse proxy in front. See [`network-security.md`](network-security.md).

## Troubleshooting

| Problem | Likely cause | Fix |
|---------|-------------|-----|
| `Docker is not installed` | Docker not on PATH | Install Docker Desktop or Docker Engine |
| `Docker daemon is not running` | Docker Desktop not started | Open Docker Desktop or run `sudo systemctl start docker` |
| `Port 7456 is already in use` | Another service on that port | Re-run with `--port 8080` |
| Health check times out | Image pull slow or daemon slow to start | Wait and check `docker compose -f deploy/docker-compose.yml logs` |
| `Permission denied` on install.sh | Script not executable | Run `chmod +x deploy/scripts/install.sh` |
| systemd unit not created | `systemd` not found | Omit `--no-systemd` if systemd is available, or manage via Docker CLI |
| `.env` has wrong port after re-install | Old backup not restored | Edit `deploy/.env` directly or delete it and re-run |
| Container exits immediately | Image incompatibility | Check `docker compose -f deploy/docker-compose.yml logs` for errors |
| `Authorization: Bearer <OD_API_TOKEN> required` on macOS | Docker Desktop bridge networking | Enable host networking — see [Docker Desktop on macOS](../deploy/README.md#docker-desktop-on-macos) |

## References

- Docker Compose config: [`deploy/docker-compose.yml`](../deploy/docker-compose.yml)
- Environment template: [`deploy/.env.example`](../deploy/.env.example)
- Self-hosting topologies (PM2, systemd native): [`docs/self-hosting.md`](self-hosting.md)
- Network security and remote access: [`docs/network-security.md`](network-security.md)
