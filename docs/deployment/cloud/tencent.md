# Tencent Cloud (腾讯云) Deployment

This guide covers self-hosting Open Design on Tencent Cloud for users in mainland China. It focuses on a practical CVM path, a TKE Kubernetes path using the shipped Helm values override, and the current status of TIC / Terraform-style infrastructure templates.

> **Status:** This is a docs-only guide for issue #1026. It follows the existing [`docs/deployment/docker.md`](../docker.md), [`docs/install-guide.md`](../../install-guide.md), and [`tools/pack/helm/open-design/values-tencent.yaml`](../../../tools/pack/helm/open-design/values-tencent.yaml) deployment model. A first-party Tencent Cloud TIC / Terraform template is not shipped yet; contributions from operators with active Tencent Cloud accounts are welcome.

## Why Tencent Cloud?

For mainland China users, Tencent Cloud gives Open Design operators:

- **Lower latency** for teams and customers on mainland networks.
- **Native VM and Kubernetes paths** through CVM (云服务器) and TKE (容器服务).
- **Managed storage options** through CBS for block storage and CFS for shared file storage.
- **Cloud-native perimeter controls** through CLB, security groups, CAM, and SSM.
- **ICP filing support** for public services hosted on mainland China IP addresses.

If your users are outside mainland China, an overseas region or another cloud may be simpler. This guide targets mainland China hosting and compliance.

## Deployment Paths

| Path | Best for | Complexity | Cost shape |
|------|----------|------------|------------|
| **A. CVM (云服务器 CVM)** | One VM, small teams, first Tencent Cloud deployment | Low | VM + disk + bandwidth |
| **B. TKE (容器服务 TKE)** | Kubernetes operators, managed ingress, future HA work | Medium | Cluster + nodes + storage + CLB |
| **C. TIC / Terraform template** | Repeatable infrastructure-as-code provisioning | Medium | Same as underlying CVM / TKE resources |

Most first-time deployments should start with **Path A (CVM)**.

## Prerequisites

- A Tencent Cloud account with billing enabled.
- Real-name verification (实名认证) when using mainland China resources.
- A domain and ICP filing (备案) before serving a public mainland China site.
- Tencent Cloud CLI (`tccli`) if you plan to script resource creation.
- Docker Engine 24+ and Docker Compose v2 for the CVM path.
- Helm 3 and `kubectl` for the TKE path.

## Path A - Deploy To CVM

This path runs the existing Docker Compose stack on one Cloud Virtual Machine.

### Step 1: Create The CVM Instance

Create the CVM instance from the Tencent Cloud console, or script it with `tccli`. A reasonable evaluation baseline:

| Setting | Recommended value | Notes |
|---------|-------------------|-------|
| Region | `ap-guangzhou`, `ap-shanghai`, or the closest mainland region | Pick the region matching your ICP and users |
| Image | Ubuntu Server 24.04 LTS 64-bit | The Open Design image supports `linux/amd64` and `linux/arm64` |
| Instance | 2 vCPU / 4 GiB memory | Raise memory for large exports or concurrent agent runs |
| System disk | 50 GiB CBS | Stores Docker layers and runtime data |
| Public access | Public IP or CLB in front of the VM | Prefer CLB + TLS for production |
| Security group | Inbound `22/tcp` from your IP only | Do not expose `7456/tcp` directly |

Example CLI shape, with placeholders:

```bash
tccli cvm RunInstances \
  --Placement '{"Zone":"ap-guangzhou-7"}' \
  --ImageId img-xxxxxxxx \
  --InstanceType S5.MEDIUM4 \
  --SystemDisk '{"DiskType":"CLOUD_BSSD","DiskSize":50}' \
  --VirtualPrivateCloud '{"VpcId":"vpc-xxxxxxxx","SubnetId":"subnet-xxxxxxxx"}' \
  --SecurityGroupIds '["sg-xxxxxxxx"]' \
  --InstanceChargeType POSTPAID_BY_HOUR
```

Tencent Cloud image IDs vary by region and image family. Use the console or `tccli cvm DescribeImages` to select the Ubuntu image available in your region.

### Step 2: Install Docker

SSH into the VM, then install Docker Engine and the Compose plugin:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg |
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" |
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker "$USER"
```

Log out and back in so the `docker` group membership is active.

### Step 3: Configure Image Pulls

Docker Hub pulls can be slow or unreliable from mainland China. Use one of these approaches:

- Mirror `docker.io/vanjayak/open-design:latest` into Tencent Container Registry (TCR), then pass that image to the installer.
- Configure a registry mirror on the CVM through `/etc/docker/daemon.json`.

Example mirror configuration:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com"
  ]
}
EOF
sudo systemctl restart docker
```

If your account uses TCR Enterprise or a private TCR namespace, log in before running the installer:

```bash
docker login ccr.ccs.tencentyun.com
```

### Step 4: Run Open Design

Clone the repository and use the existing installer:

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
bash deploy/scripts/install.sh --non-interactive --port 7456
```

If you mirrored the image into TCR, pass the private image reference:

```bash
bash deploy/scripts/install.sh \
  --non-interactive \
  --port 7456 \
  --image ccr.ccs.tencentyun.com/<namespace>/open-design:latest
```

The installer writes `deploy/.env`, generates an `OD_API_TOKEN` if needed, starts Docker Compose, and waits for `/api/health`.

### Step 5: Put A Trusted Proxy In Front

The Compose stack binds the host port to `127.0.0.1`, so Open Design is not exposed directly. For remote access, terminate TLS through Nginx, Caddy, or Tencent Cloud CLB and forward to `127.0.0.1:7456`.

Do not open `7456/tcp` to the internet in the CVM security group.

Minimal Nginx example:

```nginx
server {
  listen 443 ssl http2;
  server_name design.example.cn;

  ssl_certificate     /etc/letsencrypt/live/design.example.cn/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/design.example.cn/privkey.pem;

  location /api/ {
    proxy_pass http://127.0.0.1:7456;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization "Bearer <OD_API_TOKEN from deploy/.env>";
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 1h;
    proxy_send_timeout 1h;
    gzip off;
  }

  location / {
    proxy_pass http://127.0.0.1:7456;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

Set `OPEN_DESIGN_ALLOWED_ORIGINS=https://design.example.cn` in `deploy/.env` and restart:

```bash
docker compose -f deploy/docker-compose.yml up -d
```

Only `/api/health`, `/api/version`, and `/api/daemon/status` skip bearer-token auth. All other non-loopback `/api/*` requests must carry `Authorization: Bearer <OD_API_TOKEN>`, so keep that token in the proxy or a Tencent Cloud secret store; never expose it to browser code.

## Path B - Deploy To TKE

Use TKE when your team already operates Kubernetes or needs managed ingress, node pools, and cloud storage integration.

Open Design ships a generic Helm chart plus a Tencent values override:

- Chart: [`tools/pack/helm/open-design`](../../../tools/pack/helm/open-design)
- Tencent values: [`tools/pack/helm/open-design/values-tencent.yaml`](../../../tools/pack/helm/open-design/values-tencent.yaml)

### Step 1: Prepare Cluster Access

Create or choose a TKE cluster, then configure `kubectl` from the Tencent Cloud console or CLI:

```bash
kubectl version --client
kubectl get nodes
helm version
```

### Step 2: Prepare Storage Classes

The Tencent override expects:

- `cfs` for `/data/od` project data.
- `cbs` for `/data/config` configuration data.

Check storage classes:

```bash
kubectl get storageclass
```

If your cluster uses different storage class names, copy `values-tencent.yaml` and edit `persistence.data.storageClass` and `persistence.config.storageClass` before installing.

### Step 3: Install With Helm

Generate an API token and install from the repository root:

```bash
export OD_API_TOKEN="$(openssl rand -hex 32)"

helm install open-design tools/pack/helm/open-design \
  -f tools/pack/helm/open-design/values-tencent.yaml \
  --set secrets.apiToken="$OD_API_TOKEN" \
  --set env.OD_ALLOWED_ORIGINS="https://design.example.cn" \
  --set ingress.enabled=false
```

Keep `ingress.enabled=false` for the first install until the Pod is healthy and the Service is reachable inside the cluster.

### Step 4: Verify The Deployment

```bash
kubectl rollout status deployment/open-design
kubectl get pods -l app.kubernetes.io/name=open-design
kubectl port-forward svc/open-design 7456:7456
curl -i http://127.0.0.1:7456/api/health
```

Success is an HTTP `200 OK` health response.

### Step 5: Add Ingress Or CLB

For production, front the Service with Tencent Cloud Load Balancer and TLS. Keep these constraints:

- Browser origin must match `env.OD_ALLOWED_ORIGINS`.
- The upstream proxy or ingress layer must inject `Authorization: Bearer <OD_API_TOKEN>` for protected `/api/*` requests.
- The raw Service should stay private inside the VPC.

If using an NGINX Ingress Controller, add an auth-injection or external-auth layer rather than sending the daemon token to browser clients.

> **Replica note:** Open Design currently uses local app state under `.od`. Keep `replicaCount=1` unless you have explicitly designed shared database and storage behavior for the daemon. Multiple replicas with independent local state will diverge.

## Path C - TIC / Terraform Templates

Issue #1026 calls out TIC / infrastructure-as-code templates for repeatable Tencent Cloud provisioning. Open Design does not currently ship a first-party Tencent Cloud template.

Until that lands, use one of these practical paths:

- CVM + `deploy/scripts/install.sh` for a small single-host deployment.
- TKE + Helm for Kubernetes environments.
- A private Terraform / TIC template in your organization that provisions CVM or TKE, then runs the same install or Helm steps from this guide.

The natural follow-up location for first-party Tencent Cloud infrastructure templates is `deploy/tencent/`.

## ICP Filing (备案)

Any public service hosted from a mainland China region generally needs ICP filing before HTTP/HTTPS traffic to a custom domain is allowed. Tencent Cloud provides an ICP filing console and review flow.

| Item | Detail |
|------|--------|
| Who files | The domain owner or operating organization |
| Where | Tencent Cloud ICP filing console |
| What you need | Real-name verified account, eligible mainland cloud resources, domain ownership, and identity or business-license material |
| Timing | Commonly several business days; plan before launch |
| Result | An ICP filing number that must be displayed on the public site |

You generally do not need ICP filing for private VPC-only access, VPN-only access, or non-mainland regions such as Hong Kong, but confirm the current Tencent Cloud and MIIT requirements for your launch context.

## Security Checklist

- Keep CVM security groups closed to `7456/tcp`; expose only SSH from trusted IPs and HTTPS through a proxy or CLB.
- Set `OPEN_DESIGN_ALLOWED_ORIGINS` for Compose deployments or `env.OD_ALLOWED_ORIGINS` / `OD_ALLOWED_ORIGINS` for Kubernetes deployments.
- Keep `OD_API_TOKEN` in Nginx, CLB auth configuration, Kubernetes Secret, or Tencent Cloud SSM. Do not send it to browser JavaScript.
- Use CAM least-privilege policies for TCR, CVM, TKE, CFS, CBS, and SSM operators.
- Pin the Docker image tag or digest for production rollouts.
- Back up the Docker volume, CBS disk, or CFS data before upgrades.

## Common Pitfalls

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `docker pull` is very slow or times out | Pulling from Docker Hub directly from mainland China | Mirror the image into TCR or configure a registry mirror |
| Browser loads HTML but API calls fail | Missing allowed origin or missing proxy-injected bearer token | Set `OPEN_DESIGN_ALLOWED_ORIGINS` / `OD_ALLOWED_ORIGINS` and inject `Authorization: Bearer <OD_API_TOKEN>` upstream |
| CVM is reachable on SSH but not HTTPS | Security group or CLB listener not configured | Open `443/tcp` to the proxy only and attach the certificate |
| Public domain cannot serve HTTP/HTTPS | ICP filing incomplete for a mainland region | Complete ICP filing or use a non-mainland region while filing is pending |
| TKE Pod is stuck pending | Expected CFS / CBS storage class name is missing | Edit the Tencent values file to match `kubectl get storageclass` output |
| TKE Pod is healthy but Ingress fails | Ingress origin, TLS, or API-token forwarding is not configured | Align `env.OD_ALLOWED_ORIGINS`, TLS host, and auth forwarding |

## Follow-Up Work

This guide intentionally does not claim one-click Tencent Cloud support is finished. Remaining #1026 slices:

- First-party `deploy/tencent/` template for CVM.
- TIC / Terraform template that provisions VPC, CVM or TKE, storage, CLB, and secrets.
- Verified TKE walkthrough screenshots using a real Tencent Cloud account.
- Chinese-language sibling guide at `docs/deployment/cloud/tencent.zh-CN.md`.
- Optional TCR image mirror workflow and CI publishing notes.

## References

- Open Design Docker deployment: [`docs/deployment/docker.md`](../docker.md)
- Open Design one-click installer: [`docs/install-guide.md`](../../install-guide.md)
- Open Design Tencent Helm values: [`tools/pack/helm/open-design/values-tencent.yaml`](../../../tools/pack/helm/open-design/values-tencent.yaml)
- Tencent Cloud CVM docs: <https://www.tencentcloud.com/document/product/213>
- Tencent Kubernetes Engine docs: <https://www.tencentcloud.com/document/product/457>
- Tencent Cloud CFS docs: <https://www.tencentcloud.com/document/product/582>
- Tencent Cloud CBS docs: <https://www.tencentcloud.com/document/product/362>
- Tencent Cloud CLB docs: <https://www.tencentcloud.com/document/product/214>
- Tencent Cloud SSM docs: <https://www.tencentcloud.com/document/product/1078/38591>
- Tencent Cloud ICP filing docs: <https://cloud.tencent.com/document/product/243/97668>
