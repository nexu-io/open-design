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

If you expose Open Design through a reverse proxy, also set:

```bash
OPEN_DESIGN_ALLOWED_ORIGINS=https://yourdomain.com
```

## Step 3: Start Open Design

```bash
docker-compose up -d
```

What to expect:
- First run can take 1-2 minutes while Docker pulls the image
- You should see container creation and startup messages

## Step 4: Confirm Container Health

```bash
docker-compose ps
```

Success looks like:
- `open-design` container is listed
- `STATUS` shows `Up` and eventually `healthy`
- Port mapping includes `127.0.0.1:7456->7456/tcp`

![Docker Desktop container running](../screenshots/deployment/docker/02-docker-desktop-container-running.png)
![docker-compose ps healthy output (sanitized)](../screenshots/deployment/docker/04-docker-compose-ps-healthy.png)

## Step 5: Verify HTTP Response

```bash
curl -i http://127.0.0.1:7456/
```

Success looks like:
- HTTP status `200 OK`

![curl HTTP 200 output (sanitized)](../screenshots/deployment/docker/05-curl-http-200-proof.png)

## Step 6: Open Open Design in Your Browser

Open:
- `http://localhost:7456/`

You should see the Open Design interface.

![Open Design home (desktop)](../screenshots/deployment/docker/01-open-design-home.png)
![Open Design home (mobile)](../screenshots/deployment/docker/03-open-design-mobile.png)

## Common Issues

- `failed to connect to the docker API`: Docker Desktop is not running yet
- `address already in use`: Port `7456` is occupied by another process
- `curl: (7) Failed to connect`: container is still starting; wait 10-20 seconds and retry
- reverse proxy + `OD_API_TOKEN`: either inject `Authorization: Bearer <OD_API_TOKEN>` at the proxy, or set `OPEN_DESIGN_DISABLE_API_AUTH=1` only when that proxy already authenticates every request and the daemon is not directly exposed.
- `Authorization: Bearer <OD_API_TOKEN> required` on macOS: Docker Desktop bridge networking makes the daemon see requests as non-loopback. See [Docker Desktop on macOS](../../deploy/README.md#docker-desktop-on-macos) for the host networking workaround.
