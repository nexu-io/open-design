# Docker deployment

This deployment ships Open Design as a single Alpine-based runtime image. The
daemon serves both the API and the built Next.js static export, so there is no
separate nginx container.

## Local compose

Before starting:

1. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

2. Generate a secure token (recommended unless your reverse proxy will both authenticate every request and set `OPEN_DESIGN_DISABLE_API_AUTH=1`):

   ```bash
   openssl rand -hex 32
   ```

3. Open `.env` in your editor and choose one auth mode:
   - default: paste the token into `OD_API_TOKEN=`
   - trusted reverse proxy that already authenticates every request: leave `OD_API_TOKEN=` empty and set `OPEN_DESIGN_DISABLE_API_AUTH=1`

Then pull and start the service:

```bash
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest docker compose pull
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od:latest docker compose up -d --no-build
```

Use `ghcr.io/nexu-io/od:latest` for the latest stable image, or
`ghcr.io/nexu-io/od:<version>` to pin a supported release.

The published `ghcr.io/nexu-io/od` package must be public for anonymous
`docker pull`, Docker Compose, and Dokploy installs to work. If GHCR returns an
authentication or access-denied error for this image, an organization maintainer
must open GitHub -> Packages -> `od` -> Package settings and change visibility
to Public. GitHub treats that as a one-way visibility change for container
packages, so confirm the package is intended to stay public before switching it.

Defaults:

- Host port: `127.0.0.1:7456` (`OPEN_DESIGN_PORT=8080` to publish on `127.0.0.1:8080`)
- Runtime data: before documenting, changing, or choosing persistent daemon
  storage, you MUST read root [`AGENTS.md`](../AGENTS.md) → **Daemon data
  directory contract**. This README MUST NOT restate it.
- Node heap cap: `--max-old-space-size=192`
- Compose memory cap: `384m` (`OPEN_DESIGN_MEM_LIMIT=256m` to override)

Do not publish the daemon directly on a public or shared LAN interface. The API is
unauthenticated for non-browser clients, so remote deployments should keep Compose
bound to localhost and put an authenticated reverse proxy, SSH tunnel, or VPN in
front of it.

When exposing the service through an authenticated public IP, domain, or reverse
proxy, set `OPEN_DESIGN_ALLOWED_ORIGINS` to the exact browser origins that should
be allowed to call `/api`:

```bash
OPEN_DESIGN_ALLOWED_ORIGINS=https://od.example.com,http://203.0.113.10:7456 docker compose up -d --no-build
```

If the reverse proxy already authenticates every request and you do not want it
to inject `Authorization: Bearer <OD_API_TOKEN>` upstream, set:

```bash
OPEN_DESIGN_DISABLE_API_AUTH=1
```

Use this only for trusted deployments where the daemon is reachable strictly
through that authenticated proxy. It disables daemon-side bearer enforcement for
all `/api/*` requests, so direct access to the daemon must remain blocked. The
Compose variable maps to daemon env `OD_DISABLE_API_AUTH`.

Pin a specific published image with a digest instead of the mutable `latest` tag:

```bash
OPEN_DESIGN_IMAGE=ghcr.io/nexu-io/od@sha256:<digest> docker compose up -d --no-build
```
The image intentionally does not bundle Claude/Codex/Gemini CLI binaries. Keep
those outside the image, or build a separate private runtime layer if a server
deployment needs local code-agent CLIs installed in the container.

## Linux: mounting host agent CLIs

On Linux you can mount host-installed agent CLIs (Claude Code, opencode, Codex,
…) into the container without rebuilding the image. The override file
`docker-compose.linux.yml` is already loaded automatically by `install.sh` on
Linux; it switches to `network_mode: host` and adds the CLI mounts.

**1. Build the local image** (adds `libc6-compat` so glibc-linked CLIs run on Alpine):

```bash
docker build -t open-design-local -f deploy/Dockerfile.local .
```

**2. Point `.env` at the local image:**

```bash
OPEN_DESIGN_IMAGE=open-design-local
```

**3. Edit `docker-compose.linux.yml`** to match your CLI install paths, then start:

```bash
docker compose -f docker-compose.yml -f docker-compose.linux.yml up -d --no-build
```

Common install paths:

| CLI | Default path |
|-----|-------------|
| Claude Code | `~/.local/bin/claude` (symlink) + `~/.local/share/claude` (binaries) |
| opencode | `~/.opencode/bin/opencode` |
| Codex | `~/.local/bin/codex` |

The daemon auto-detects any CLI that is visible in `PATH` at startup — no extra
configuration needed. For a CLI installed in a non-standard path, add a volume
and prepend its directory to `PATH` in `docker-compose.linux.yml`, then restart:

```yaml
environment:
  PATH: /mnt/host-mycli:/mnt/host-local-bin:/mnt/host-opencode:/usr/local/bin:/usr/bin:/bin
volumes:
  - /opt/mycli/bin:/mnt/host-mycli:ro
```

```bash
docker compose -f docker-compose.yml -f docker-compose.linux.yml up -d --no-build
```

If a CLI fails with `symbol not found` or relocation errors despite `libc6-compat`,
the compose file mounts `/lib/x86_64-linux-gnu` and `/lib64` from the host read-only,
which provides full glibc for the most demanding binaries. These paths are **amd64-only**;
on arm64 replace them with `/lib/aarch64-linux-gnu:/lib/aarch64-linux-gnu:ro`.

**Upgrading from a previous install:** if you previously ran the container as a different
user (e.g. `node`, uid 1000), the data volume may need an ownership fix before the daemon
can write to it:

```bash
docker run --rm -v open-design_open_design_data:/data alpine chown -R 1001:1001 /data
```

Pass provider API keys via `.env`:

```bash
DEEPSEEK_API_KEY=sk-…
ANTHROPIC_API_KEY=sk-ant-…
OPENAI_API_KEY=sk-…
```

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

Workaround:

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
