# Docker and Docker Compose

This is the easiest self-hosting path for beginners.

## Before You Start

- Docker Desktop installed and running
- Internet connection (first run downloads the image)

## Step 1: Open the Deploy Folder

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design/deploy
```

What this does:
- Downloads the project
- Moves into the folder that contains `docker-compose.yml`

## Step 2: Create `.env` and choose an API auth mode

Create `deploy/.env` from the tracked template:

```bash
cp .env.example .env
```

Generate a token if you want the default protected mode:

```bash
openssl rand -hex 32
```

Then edit `.env` and configure one of these before first start:

- recommended default: paste the generated token into `OD_API_TOKEN=`
- trusted authenticated reverse proxy only: leave `OD_API_TOKEN=` empty and set `OPEN_DESIGN_DISABLE_API_AUTH=1`

If you expose OpenDesign through a reverse proxy, also set:

```bash
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com
```

## Step 3: Start OpenDesign

```bash
docker compose up -d
```

What to expect:
- First run can take 1-2 minutes while Docker pulls the image
- You should see container creation and startup messages

## Step 4: Confirm Container Health

```bash
docker compose ps
```

Success looks like:
- `open-design` container is listed
- `STATUS` shows `Up` and eventually `healthy`
- Port mapping includes `127.0.0.1:7456->7456/tcp`

![Docker Desktop container running](../screenshots/deployment/docker/02-docker-desktop-container-running.png)
![docker-compose ps healthy output (sanitized)](../screenshots/deployment/docker/04-docker-compose-ps-healthy.png)

## Step 5: Verify Container Health Over HTTP

```bash
curl -i http://127.0.0.1:7456/api/health
```

Success looks like:
- HTTP status `200 OK`

![curl HTTP 200 output (sanitized)](../screenshots/deployment/docker/05-curl-http-200-proof.png)

## Step 6: Open OpenDesign in Your Browser

Open:
- `http://127.0.0.1:7456/`

If the browser displays a sign-in dialog, enter `open-design` as the username
and the `OD_API_TOKEN` value from `deploy/.env` as the password. You should then
see the OpenDesign interface. Docker bridge peers remain authenticated; no host
networking override is required.

![OpenDesign home (desktop)](../screenshots/deployment/docker/01-open-design-home.png)
![OpenDesign home (mobile)](../screenshots/deployment/docker/03-open-design-mobile.png)

## Connect a remote coding agent over MCP

The setup snippets in **Settings -> MCP server** are local-runtime only. They
launch a stdio helper using the executable, CLI entrypoint, and environment of
the running OpenDesign daemon. With Docker, those belong to the container, not
to the workstation displaying the Settings page. The same restriction applies
to the install buttons and deep links in that panel.

Changing the snippet's loopback URL to your public URL is not enough: the
executable and CLI paths would still refer to the container. Forwarding only
the HTTP port does not make those paths available either.

For a coding agent on another machine, run the stdio helper inside the existing
container through SSH. This is a deployment-specific bridge, not a remote HTTP
MCP endpoint. First verify SSH access and Docker permissions from the workstation:

```bash
ssh user@docker-host docker inspect --format '{{.State.Running}}' open-design
```

Replace `user@docker-host` with your SSH destination and `open-design` with your
running container name. Complete host-key verification and configure SSH key or
agent authentication before configuring MCP; the client cannot answer interactive
SSH prompts. The command above should print `true`.

For a client that accepts `mcpServers` JSON, use this configuration on the
workstation:

```json
{
  "mcpServers": {
    "open-design": {
      "command": "ssh",
      "args": [
        "-T", "-o", "BatchMode=yes",
        "user@docker-host",
        "docker", "exec", "-i", "open-design",
        "node", "/app/apps/daemon/dist/cli.js",
        "mcp", "--daemon-url", "http://127.0.0.1:7456"
      ]
    }
  }
}
```

The CLI path and port above match the repository Docker image. Adjust them if
your image differs. The workstation needs `ssh`; Node and the OpenDesign helper
run inside the container. For a client running on the Docker host itself, use
`docker` as the command and start the argument list at `exec`.

Keep stdin open with `docker exec -i`, disable SSH terminal allocation with `-T`,
and do not add Docker's `-t`: stdout carries the MCP protocol and must not contain
terminal formatting or shell startup messages. The helper inherits the existing
container environment. Preserve the deployment's data-root configuration as
defined in [the daemon data directory contract](../../AGENTS.md#daemon-data-directory-contract).

Reconnect the MCP client and confirm it can list OpenDesign tools and read a
project you have access to. If SSH exits immediately, check authentication and
Docker permissions; if the helper cannot reach the daemon, check container health
and its internal port. This bridge does not require publishing another port or
disabling the deployment's API authentication.

## Common Issues

- `failed to connect to the docker API`: Docker Desktop is not running yet
- `address already in use`: Port `7456` is occupied by another process
- `curl: (7) Failed to connect`: container is still starting; wait 10-20 seconds and retry
- `pull access denied` or `authentication required` for `ghcr.io/nexu-io/od`: the GHCR package must be public for anonymous Docker, Compose, and Dokploy pulls. An organization maintainer must open GitHub -> Packages -> `od` -> Package settings and change visibility to Public.
- reverse proxy + `OD_API_TOKEN`: either inject `Authorization: Bearer <OD_API_TOKEN>` at the proxy, or set `OPEN_DESIGN_DISABLE_API_AUTH=1` only when that proxy already authenticates every request and the daemon is not directly exposed.
- browser sign-in repeats: use username `open-design` and the exact `OD_API_TOKEN` value from `deploy/.env`; recreate the container after changing the token.
