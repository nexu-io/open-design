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

2. Generate a secure token:

   ```bash
   openssl rand -hex 32
   ```

3. Open `.env` in your editor, find `OD_ACCESS_TOKEN=`, and paste the generated token there.

Then pull and start the service:

```bash
OPEN_DESIGN_IMAGE=docker.io/vanjayak/open-design:latest docker compose pull
OPEN_DESIGN_IMAGE=docker.io/vanjayak/open-design:latest docker compose up -d --no-build
```

Defaults:

- Host port: `127.0.0.1:7456` (`OPEN_DESIGN_PORT=8080` to publish on `127.0.0.1:8080`)
- Runtime data volume: `open_design_data` mounted at `/app/.od`
- Node heap cap: `--max-old-space-size=192`
- Compose memory cap: `384m` (`OPEN_DESIGN_MEM_LIMIT=256m` to override)

Do not publish the daemon directly on a public or shared LAN interface. The API is
unauthenticated for non-browser clients, so remote deployments should keep Compose
bound to localhost and put an authenticated reverse proxy, SSH tunnel, or VPN in
front of it.

When exposing the service through an authenticated public IP, domain, or reverse
proxy, set `OPEN_DESIGN_ALLOWED_ORIGINS` to the browser origins that should be
allowed to call `/api`:

```bash
OPEN_DESIGN_ALLOWED_ORIGINS=https://od.example.com,http://203.0.113.10:7456 docker compose up -d --no-build
```

Pin a specific published image with a digest instead of the mutable `latest` tag:

```bash
OPEN_DESIGN_IMAGE=docker.io/vanjayak/open-design@sha256:<digest> docker compose up -d --no-build
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

## Authentication modes

Open Design supports three mutually exclusive authentication modes. Choose one
and configure only that mode in your `.env` file.

| Mode | Variable(s) | Loopback exempt | Use case |
|------|-------------|-----------------|----------|
| Bearer token | `OD_ACCESS_TOKEN` | Yes | Simplest; single-user, LAN, or VPN-gated deployments |
| Cloudflare Access | `OD_BEHIND_PROXY=cloudflare`, `OD_CF_ACCESS_TEAM_DOMAIN`, `OD_CF_ACCESS_AUD` | No | Teams using Cloudflare Zero Trust |
| Trusted proxy | `OD_TRUSTED_PROXY` | Varies | Custom reverse proxy with forwarded headers |

**Bearer token** is the default for local Compose. Generate a token with
`openssl rand -hex 32`, set it in `OD_ACCESS_TOKEN`, and pass
`Authorization: Bearer <token>` with every `/api` request. Requests from
`127.0.0.1` are exempt.

**Cloudflare Access** mode validates `Cf-Access-Jwt-Assertion` headers issued by
your Cloudflare Access application. Set `OD_BEHIND_PROXY=cloudflare`, then
provide your team domain and application AUD tag. In this mode the bearer token
is ignored and loopback requests are *not* exempt.

**Trusted proxy** mode tells the daemon to trust `X-Forwarded-*` headers from a
named proxy (e.g. `nginx`, `caddy`, `cloudflare`). Pair it with
`OPEN_DESIGN_ALLOWED_ORIGINS` to validate browser origins.

The backward-compatible `OD_API_TOKEN` variable is still accepted by the server
as a deprecated fallback. New deployments should use `OD_ACCESS_TOKEN`.

## Reverse proxy

When deploying behind nginx, Caddy, or another reverse proxy, forward the
standard headers so the daemon can resolve the real client address and protocol.

### nginx example

```nginx
server {
    listen 443 ssl;
    server_name od.example.com;

    location / {
        proxy_pass http://127.0.0.1:7456;
        proxy_set_header Host              $host;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host  $host;
    }
}
```

### Caddy example

```
od.example.com {
    reverse_proxy localhost:7456
}
```

Caddy sets `X-Forwarded-*` headers automatically.

Set `OPEN_DESIGN_ALLOWED_ORIGINS` to the browser origins that should be allowed
to call `/api`:

```bash
OPEN_DESIGN_ALLOWED_ORIGINS=https://od.example.com docker compose up -d --no-build
```

If your proxy is a known type (e.g. `nginx`, `caddy`), set `OD_TRUSTED_PROXY`
so the daemon trusts forwarded headers from it.

> **Note:** Content Security Policy (CSP) headers are set by the daemon itself,
> not by the reverse proxy. Proxy-level CSP overrides may conflict with the
> daemon's sandbox and asset policies.

## Troubleshooting

### `ACCESS_TOKEN_REQUIRED` error

The daemon rejects API requests that lack authentication. Verify:

1. `OD_ACCESS_TOKEN` is set in your `.env` file.
2. Your client sends `Authorization: Bearer <token>` with every `/api` request.
3. If you are using Cloudflare Access mode, ensure `OD_BEHIND_PROXY=cloudflare`
   is set and the request carries a valid `Cf-Access-Jwt-Assertion` header.

### `Origin: null` not allowed

Sandboxed iframes (e.g. `sandbox="allow-scripts"`) report their origin as
`null`. This is expected browser behavior, not a Docker deployment regression.
If your workflow uses sandboxed content, add `null` to
`OPEN_DESIGN_ALLOWED_ORIGINS` or adjust the iframe's sandbox attributes.

### Docker Desktop macOS networking

Docker Desktop on macOS uses a virtual machine with bridge networking. The
daemon may see API requests as coming from a non-loopback address, causing the
bearer-token check to reject them even though the request originates locally.

Workaround — enable host networking:

1. In Docker Desktop: **Settings → Resources → Network → Enable host networking → Apply and restart**.

2. Add a local override to `docker-compose.yml`:

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

## Publish to Docker Hub

```bash
deploy/scripts/publish-images.sh --image_tag latest
```

Useful overrides:

```bash
IMAGE_NAMESPACE=your-dockerhub-user deploy/scripts/publish-images.sh --arch arm64
deploy/scripts/publish-images.sh --image docker.io/your-user/open-design:0.1.0
```

The script defaults to:

- `docker.io/vanjayak/open-design:<tag>`
- `linux/amd64,linux/arm64`
- `skopeo` push strategy with Docker credentials read from `~/.docker/config.json`
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
