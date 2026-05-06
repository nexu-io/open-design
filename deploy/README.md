# Docker deployment

This deployment ships Open Design as a single Alpine-based runtime image. The
daemon serves both the API and the built Next.js static export, so there is no
separate nginx container.

## Local compose

```bash
cd deploy
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
