# Docker deployment

This deployment ships Open Design as a single Alpine-based runtime image. The
daemon serves both the API and the built Next.js static export, so there is no
separate nginx container.

For the quickest on-ramp, use the one-click installer which handles Docker
detection, `.env` generation, pull, start, health check, and optional systemd
service:

```bash
./scripts/install.sh
```

See [`scripts/install.sh`](scripts/install.sh) for `--non-interactive` and
`--port` flags, or continue with the manual compose steps below.

## Local compose

Before starting (optional):

```bash
cp .env.example .env
```

> The compose file ships with API auth **disabled by default** because the host port
> is bound to `127.0.0.1` (local machine only). To enable token-based auth for a
> remote or LAN deployment, set `OD_DISABLE_API_AUTH=0` in your `.env`, generate a
> token (`openssl rand -hex 32`), and paste it into `OD_API_TOKEN=` in the same file.
> Only override the compose default (`OD_DISABLE_API_AUTH=1`) when you intend to
> turn auth on — the compose file reads the value from environment variable
> interpolation (`${OD_DISABLE_API_AUTH:-1}`), so editing `docker-compose.yml` is
> not needed.

Then pull and start the service:

```bash
docker compose pull
docker compose up -d
```

> **Note for Windows / macOS users:** Docker Desktop may not forward environment variables correctly when using the YAML mapping format (`KEY: value`) in the `environment` block. This compose file uses the list format (`- KEY=value`) which works reliably across all platforms. If the daemon doesn't start, run `docker compose logs open-design` to check for errors.

Use a specific image tag to pin a release:

```bash
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:0.18.0 docker compose up -d --no-build
```

Use `ghcr.io/nexu-io/od:latest` for the latest stable image, or
`ghcr.io/nexu-io/od:<version>` to pin a supported release.

Defaults:

- Host port: `127.0.0.1:7456` (`OPEN_DESIGN_PORT=8080` to publish on `127.0.0.1:8080`)
- Runtime data: before documenting, changing, or choosing persistent daemon
  storage, you MUST read root [`AGENTS.md`](../AGENTS.md) → **Daemon data
  directory contract**. This README MUST NOT restate it.
- Node heap cap: `--max-old-space-size=192`
- Compose memory cap: `384m` (`OPEN_DESIGN_MEM_LIMIT=256m` to override)

<!-- AUTO-GENERATED from deploy/.env.example, deploy/docker-compose.yml -->
Full environment variable reference:

| Variable | Compose default | Description |
|----------|----------------|-------------|
| `OPEN_DESIGN_IMAGE` | `ghcr.io/nexu-io/od:latest` | Container image reference |
| `OPEN_DESIGN_PORT` | `7456` | Host port bound to `127.0.0.1` |
| `OD_ALLOWED_ORIGINS` | (empty) | CORS origins for `/api` access |
| `OD_WEB_PORT` | auto-derived | Browser-visible port (set when remapped by proxy) |
| `OD_API_TOKEN` | (empty) | 32-byte hex token. Generate with `openssl rand -hex 32` |
| `OD_DISABLE_API_AUTH` | `1` | Auth enforcement: `0` = on, `1` = off |
| `OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET` | `1` | Trusts RFC1918 as loopback. Set `0` for LAN hardening |
| `OD_ADDITIONAL_ALLOWED_DIRS` | (empty) | Extra dirs the agent can read/write inside container |
| `OD_TRUST_PROXY` | (empty) | Hop count (`1`), specific IP (`172.18.0.1`), or comma-separated list of IPs/CIDRs to trust for `X-Forwarded-*` headers |
| `OD_PUBLIC_BASE_URL` | (empty) | Externally-reachable base URL |
| `OD_CODEX_SANDBOX` | (empty) | Codex sandbox. `danger-full-access` to bypass workspace-write |
| `OPEN_DESIGN_MEM_LIMIT` | `384m` | Container memory limit (idle ~18-22 MiB) |
| `NODE_OPTIONS` | `--max-old-space-size=192` | Node.js heap cap |

Set any variable via `.env` (for persistent overrides) or as a prefix:
```bash
OD_API_TOKEN=abc123 OD_DISABLE_API_AUTH=0 docker compose up -d
```

Do not publish the daemon directly on a public or shared LAN interface. The API is
unauthenticated for non-browser clients, so remote deployments should keep Compose
bound to localhost and put an authenticated reverse proxy, SSH tunnel, or VPN in
front of it.

When exposing the service through an authenticated public IP, domain, or reverse
proxy, set `OD_ALLOWED_ORIGINS` to the exact browser origins that should
be allowed to call `/api`:

```bash
OD_ALLOWED_ORIGINS=https://od.example.com,http://203.0.113.10:7456 docker compose up -d --no-build
```

API auth is disabled in the compose file by default (`OD_DISABLE_API_AUTH=1`).
The daemon-side token enforcement is off, so direct access to the daemon must
remain blocked. This is safe because the compose file binds the host port to
`127.0.0.1` only — only the Docker host machine can reach the daemon.

To enable token-based auth for a remote or LAN deployment, see the note at the
top of this section.

Pin a specific published image with a digest instead of the mutable `latest` tag:

```bash
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od@sha256:<digest> docker compose up -d --no-build
```
The image intentionally does not bundle Claude/Codex/Gemini CLI binaries. Keep
those outside the image, or build a separate private runtime layer if a server
deployment needs local code-agent CLIs installed in the container.

If you install Codex inside an unprivileged Linux container and it fails while
creating its `workspace-write` sandbox, opt into Codex's full-access mode for
all Codex runs in that deployment:

```bash
OD_CODEX_SANDBOX=danger-full-access docker compose up -d --no-build
```

Only the exact value `danger-full-access` is supported; unknown values are
ignored. Use this only for trusted, single-user deployments. It lets Codex run
without the workspace-write sandbox, which is useful when the container host
blocks unprivileged user namespaces, but it gives the Codex process broader
filesystem access inside the container.

## Manual image publish override

```bash
deploy/scripts/publish-images.sh --image_tag latest
```

Useful overrides:

```bash
IMAGE_NAMESPACE=your-ghcr-org deploy/scripts/publish-images.sh --arch arm64
deploy/scripts/publish-images.sh --image ghcr.io/your-org/od:0.1.0
```

The script defaults to:

- `ghcr.io/nexu-io/od:<tag>`
- `linux/amd64,linux/arm64`
- `skopeo` push strategy with registry credentials read from `~/.docker/config.json`
- preloading base images through `skopeo` to reduce Docker Hub pull flakiness

If `127.0.0.1:7890` is available and no proxy is already set, the script uses it
for registry access and passes `host.docker.internal:7890` into Docker builds. The
host-gateway alias is only added for builds that need this local proxy mapping.

### Colima swap helper for Apple Silicon

`deploy/scripts/prepare-colima-build-swap.sh` is for manual Docker image
publishing from an Apple Silicon macOS host that uses Colima as the Docker VM.
The helper is intentionally Apple Silicon-only because the failure mode it covers
is local arm64 Colima builds exhausting a small Linux VM while preparing
multi-arch images. It exits before touching Colima on non-macOS or
non-Apple-Silicon hosts.

Low-memory Colima VMs can run out of RAM during multi-arch image builds. The
helper checks the VM memory and swap status, then creates and enables a temporary
swap file only when the VM has no swap and less than 4 GiB of RAM. The 4 GiB
threshold is a conservative default for short-lived manual publishes on small
Colima profiles; raise `COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB` if larger builds
still OOM, or lower it if you only want swap for very small VMs.

Prefer increasing the Colima VM memory (`colima start --memory <GiB>` or the
profile config) when you want a persistent build machine. Use this helper when
you need a temporary, reversible boost for one manual publish without resizing
or recreating the VM.

Run it before a manual publish if Docker builds fail with out-of-memory errors,
or if `status` shows a small Colima VM with no swap. The swap remains active
until cleanup or VM restart, so use a shell trap for one-off sessions:

```bash
deploy/scripts/prepare-colima-build-swap.sh status
deploy/scripts/prepare-colima-build-swap.sh
trap 'deploy/scripts/prepare-colima-build-swap.sh cleanup' EXIT
deploy/scripts/publish-images.sh --image_tag latest
```

Useful overrides:

```bash
COLIMA_BUILD_SWAP_SIZE=6G deploy/scripts/prepare-colima-build-swap.sh
COLIMA_BUILD_SWAP_MEMORY_THRESHOLD_KIB=6291456 deploy/scripts/prepare-colima-build-swap.sh
COLIMA_BIN=/opt/homebrew/bin/colima deploy/scripts/prepare-colima-build-swap.sh status
COLIMA_BUILD_SWAP_CLEANUP_FORCE=1 COLIMA_BUILD_SWAPFILE=/custom-swapfile deploy/scripts/prepare-colima-build-swap.sh cleanup
```

`cleanup` removes the default helper path and the old helper path. If you set a
custom `COLIMA_BUILD_SWAPFILE`, cleanup refuses to remove it unless
`COLIMA_BUILD_SWAP_CLEANUP_FORCE=1` is also set.

### Docker Desktop on macOS

When running Docker Compose on macOS with `OD_API_TOKEN` enabled, Docker Desktop bridge networking may cause the daemon to see API requests as non-loopback peers. In that case, the web UI can fail with:

`Authorization: Bearer <OD_API_TOKEN> required`

**Option A — set `OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=1` (simpler):**

The compose file already defaults this to `1`. If your `.env` overrides it to `0` or you unset it, set it back to `1`. Docker port publishing rewrites the source address to a gateway IP (e.g. `172.18.0.1`), and this flag tells the daemon to trust private subnet (RFC1918) addresses as loopback. This is safe as long as the host port stays bound to `127.0.0.1`.

**Option B — host networking (stronger isolation):**

1. Enable host networking in Docker Desktop:
   `Docker Desktop → Settings → Resources → Network → Enable host networking → Apply and restart`

2. Use a local override to docker-compose.yml:

   ```yaml
   services:
     open-design:
       network_mode: host
       ports: []
   ```

3. Recreate the container:

   ```bash
   docker compose down
   docker compose up -d --force-recreate
   ```

4. Verify:

   ```bash
   docker inspect open-design --format '{{.HostConfig.NetworkMode}}'
   # host
   ```
