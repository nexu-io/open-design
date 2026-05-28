# Azure Container Instances

This guide deploys the Docker image to Azure Container Instances (ACI) with an Azure Files share mounted at `/app/.od` for persistent Open Design data.

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
export OD_API_TOKEN="$(openssl rand -hex 32)"
```

The DNS label must be unique in the Azure region. The API token is required because this deployment exposes the daemon on `0.0.0.0` inside the container.

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
    odApiToken="$OD_API_TOKEN"
```

The template creates:

- Azure Storage account
- Azure Files share for `/app/.od`
- Linux Azure Container Instances container group
- Public DNS name and TCP port `7456`
- Liveness probe against `/api/health`

## Step 4: Open Open Design

Fetch the deployment URL:

```bash
az deployment group show \
  --resource-group "$RESOURCE_GROUP" \
  --name "$DEPLOYMENT_NAME" \
  --query "properties.outputs.url.value" \
  --output tsv
```

Open the returned URL in your browser.

## Optional Parameters

```bash
az deployment group create \
  --name "$DEPLOYMENT_NAME" \
  --resource-group "$RESOURCE_GROUP" \
  --template-file deploy/azure/container-instance.bicep \
  --parameters \
    odApiToken="$OD_API_TOKEN" \
    dnsNameLabel="$DNS_LABEL" \
    image="docker.io/vanjayak/open-design:latest" \
    cpuCores=1 \
    memoryInGB=1 \
    fileShareQuotaGB=10 \
    allowedOrigins="https://od.example.com"
```

Use `allowedOrigins` only when a custom domain or reverse proxy serves the browser from an origin different from the ACI endpoint.

## Azure DevOps

Use `deploy/azure/azure-pipelines.yml` as a starting point.

Before running it:

- Create an Azure Resource Manager service connection.
- Set `OD_API_TOKEN` as a secret pipeline variable.
- Update `resourceGroupName`, `location`, and `openDesignImage`.
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

- ACI's direct public endpoint is plain HTTP. Put it behind Azure Front Door, Application Gateway, or another TLS-terminating reverse proxy before using it beyond short-lived evaluation.
- Keep `OD_API_TOKEN` secret. Rotate it by redeploying with a new value.
- The Azure Files share persists project data after container restarts and image updates.
