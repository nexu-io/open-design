# Azure Container Instances

This guide deploys the Docker image to Azure Container Instances (ACI) with persistent Open Design data. Before choosing or documenting any daemon data mount, read root `AGENTS.md` → **Daemon data directory contract**. That section is mandatory and must not be restated here.

ACI is the daemon upstream in this topology. The browser-facing app URL must be served by an authenticated TLS reverse proxy that forwards traffic to ACI, injects the daemon bearer token on `/api/*` requests, and sends a browser origin listed in `OD_ALLOWED_ORIGINS`.

## Before You Start

- Azure CLI installed and signed in
- Permission to create a resource group, storage account, file share, and container group
- A public Docker image, or an image in a registry that ACI can pull

## Step 1: Choose Names

```bash
export RESOURCE_GROUP=open-design-aci
export LOCATION=eastus
export DEPLOYMENT_NAME=open-design-aci
export DNS_LABEL=open-design-$RANDOM
export BROWSER_ORIGIN=https://od.example.com
export OD_API_TOKEN="$(openssl rand -hex 32)"
```

The DNS label must be unique in the Azure region. `BROWSER_ORIGIN` is the HTTPS origin users will open after a trusted proxy is in front of the daemon. The API token is required because the daemon binds to `0.0.0.0` inside the container; keep this token in your proxy or deployment secrets and do not expose it to browser code.

## Step 2: Create The Resource Group

```bash
az group create \
  --name "$RESOURCE_GROUP" \
  --location "$LOCATION"
```

## Step 3: Deploy The Bicep Template

Run this from the repository root:

```bash
az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file deploy/azure/container-instance.bicep \
  --parameters \
    location="$LOCATION" \
    dnsNameLabel="$DNS_LABEL" \
    allowedOrigins="$BROWSER_ORIGIN" \
    odApiToken="$OD_API_TOKEN"
```

The template creates:

- Azure Storage account
- Azure Files share for persistent daemon storage. Before choosing or documenting its mount, you MUST read root `AGENTS.md` → **Daemon data directory contract**.
- Linux Azure Container Instances container group
- Public upstream DNS name and TCP port `7456`
- Liveness probe against `/api/health`

## Step 4: Fetch The ACI Upstream

Fetch the daemon upstream host for your reverse proxy:

```bash
export ACI_FQDN="$(az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.daemonFqdn.value" \
  --output tsv)"
export ACI_UPSTREAM_URL="http://${ACI_FQDN}:7456"
```

Do not open this URL directly in a browser. The daemon requires `Authorization: Bearer <OD_API_TOKEN>` on non-loopback `/api/*` requests, and the web UI does not put that secret in browser requests.

## Step 5: Put A Trusted Proxy In Front

Serve `BROWSER_ORIGIN` from a TLS reverse proxy that authenticates users before forwarding traffic to the ACI upstream. The proxy must add the daemon token to API requests:

```nginx
upstream open_design_aci {
  server <aci-fqdn>:7456;
}

server {
  listen 443 ssl;
  server_name od.example.com;

  # Add your organization's authentication layer here before proxying.

  location /api/ {
    proxy_set_header Authorization "Bearer <OD_API_TOKEN>";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    gzip off;
    proxy_pass http://open_design_aci;
  }

  location / {
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_pass http://open_design_aci;
  }
}
```

Replace `<aci-fqdn>` with `ACI_FQDN`, replace `<OD_API_TOKEN>` with the same secret passed to the Bicep deployment, and keep `BROWSER_ORIGIN` equal to the origin served by the proxy. Keep the `/api/` buffering, gzip, HTTP/1.1, and timeout directives in place so streamed generation responses are not cut off by nginx. After the proxy is configured, open `BROWSER_ORIGIN` in your browser.

## Optional Parameters

```bash
az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file deploy/azure/container-instance.bicep \
  --parameters \
    odApiToken="$OD_API_TOKEN" \
    dnsNameLabel="$DNS_LABEL" \
    allowedOrigins="$BROWSER_ORIGIN" \
    image="docker.io/vanjayak/open-design:latest" \
    cpuCores=1 \
    memoryInGB=1 \
    fileShareQuotaGB=10
```

Set `allowedOrigins` to the comma-separated browser origins served by trusted proxies. A direct public ACI browser URL is not supported because browser API calls cannot safely carry the daemon token.

## Azure DevOps

Use `deploy/azure/azure-pipelines.yml` as a starting point.

Before running it:

- Create an Azure Resource Manager service connection.
- Set `OD_API_TOKEN` as a secret pipeline variable.
- Update `resourceGroupName`, `location`, `openDesignImage`, and `browserOrigin`.
- Replace `<your-azure-service-connection>` with your service connection name.

## Operations

View logs:

```bash
az container logs \
  --resource-group "$RESOURCE_GROUP" \
  --name open-design
```

Restart the container group:

```bash
az container restart \
  --resource-group "$RESOURCE_GROUP" \
  --name open-design
```

Delete all Azure resources created by this guide:

```bash
az group delete \
  --name "$RESOURCE_GROUP"
```

## Security Notes

- Do not expose the raw ACI endpoint as the browser-facing app URL. Use it as the upstream for a trusted proxy or for token-authenticated operational checks.
- Keep `OD_API_TOKEN` secret. The proxy may use it upstream, but browser clients must not receive it. Rotate it by redeploying with a new value.
- Keep `allowedOrigins` aligned with the browser-visible proxy origin; otherwise the daemon origin guard will reject browser API requests.
- The Azure Files share persists project data after container restarts and image updates.
