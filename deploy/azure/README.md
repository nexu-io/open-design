# Azure deployment (evaluation)

Deploy Open Design to Microsoft Azure from the published runtime image — the
same single Alpine image used by [`deploy/docker-compose.yml`](../docker-compose.yml)
and the [Helm chart](../../charts/open-design). The daemon serves both the API
and the built web UI on one port, so there is no separate web container.

> [!IMPORTANT]
> **These lanes are for evaluation and demos, not durable data.** Open Design
> stores its state in a SQLite database under `/app/.od`, and SQLite needs real
> file locking. The persistent-storage options on both App Service and ACI are
> backed by **Azure Files (SMB)**, where SQLite WAL/locking is unsupported and
> will corrupt the database. These templates therefore keep the data dir on the
> container's **local disk**, which has correct locking but is **ephemeral** —
> data is reset on restart, redeploy, or scale.
>
> For durable self-hosting today, use [`deploy/docker-compose.yml`](../docker-compose.yml)
> (named volume) or the [Helm chart](../../charts/open-design) (PVC with
> `ReadWriteOnce`). A durable Azure lane needs block storage (e.g. a VM with a
> managed disk) and is out of scope here.

Two lanes are provided:

| Lane | Template | Best for | Public endpoint |
| --- | --- | --- | --- |
| **App Service for Containers** | [`app-service.bicep`](./app-service.bicep) | Always-on eval with managed HTTPS | `https://<app>.azurewebsites.net` |
| **Azure Container Instances (ACI)** | [`aci.bicep`](./aci.bicep) | Quick, pay-per-second eval | `http://<dns>.<region>.azurecontainer.io:7456` |

Both run as a single instance (Open Design uses single-writer SQLite).

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli) (`az`), logged in with `az login`
- An API token. Generate one with `openssl rand -hex 32`; the daemon requires
  `OD_API_TOKEN` and will not start without it.

## Quick start

The wrapper script creates the resource group, generates a token if you don't
supply one, deploys the chosen template, and prints the URL:

```bash
# App Service (managed HTTPS, always on)
deploy/azure/deploy-azure.sh \
  --target app-service \
  --resource-group open-design-rg \
  --location eastus

# Azure Container Instances (serverless, pay-per-second)
deploy/azure/deploy-azure.sh \
  --target aci \
  --resource-group open-design-rg \
  --location eastus
```

First container start takes a couple of minutes while Azure pulls the image.
`deploy-azure.sh` prints the exact `Health:` URL when it finishes — poll that
until it returns `ok`:

```bash
# App Service
curl -fsS https://<app>.azurewebsites.net/api/health

# ACI (note the :7456 port)
curl -fsS http://<dns>.<region>.azurecontainer.io:7456/api/health
```

## Deploy with `az` directly

The templates are standard Bicep, so you can skip the wrapper and call `az`:

```bash
az group create --name open-design-rg --location eastus

az deployment group create \
  --resource-group open-design-rg \
  --template-file deploy/azure/app-service.bicep \
  --parameters apiToken="$(openssl rand -hex 32)"
```

Swap `app-service.bicep` for `aci.bicep` to use the ACI lane.

## Parameters

Both templates share these parameters (defaults in parentheses):

| Parameter | Description |
| --- | --- |
| `name` (`open-design`) | Base name; a unique suffix is appended to globally-scoped resources |
| `location` (resource group location) | Azure region |
| `image` (`docker.io/vanjayak/open-design:latest`) | Container image; pin to a digest for production |
| `apiToken` (**required**, secure) | API token guarding the daemon |
| `nodeOptions` (`--max-old-space-size=192`) | Node.js heap cap |
| `extraAllowedOrigins` (empty) | Extra comma-separated browser origins allowed to call `/api` |

App Service adds `appServicePlanSku` (`B1`). ACI adds `cpuCores` (`1`) and
`memoryInGb` (`1.5`).

The deployed app's own origin is always added to `OD_ALLOWED_ORIGINS`, and
`OD_PUBLIC_BASE_URL` is set to that origin so OAuth callbacks resolve correctly.
Use `extraAllowedOrigins` only if you serve the UI from an additional hostname.

## Pin a specific image

Use a digest instead of the mutable `latest` tag for reproducible deployments:

```bash
deploy/azure/deploy-azure.sh \
  --target app-service \
  --resource-group open-design-rg \
  --image docker.io/vanjayak/open-design@sha256:<digest>
```

## Security notes

- **App Service** terminates HTTPS for you (`httpsOnly` is enabled) and is the
  recommended lane for any internet-facing deployment. To restrict access
  further, layer [App Service Authentication](https://learn.microsoft.com/azure/app-service/overview-authentication-authorization)
  ("Easy Auth") or IP restrictions on top.
- **ACI** exposes the daemon's port directly over plain HTTP with no managed
  TLS. Access is still gated by `OD_API_TOKEN`, and browser traffic by
  `OD_ALLOWED_ORIGINS`, but treat this lane as evaluation / trusted-network use.
  For production with HTTPS, use App Service or place ACI behind Application
  Gateway / Front Door.
- Keep `OD_API_TOKEN` secret. It is passed as a secure parameter (and a secure
  environment variable on ACI), so it is not returned in deployment outputs.

## Updating

Re-run the same command with a newer `--image` (or the same tag after a new
push). Note that App Service / ACI store data on ephemeral local disk, so a
redeploy starts from an empty data dir.

## Tearing down

Delete the whole resource group when you're done:

```bash
az group delete --name open-design-rg --yes --no-wait
```
