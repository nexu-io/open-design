# Alibaba Cloud (阿里云) Deployment

This guide covers self-hosting Open Design on Alibaba Cloud for users in mainland China and the broader Asia-Pacific region. It documents the supported deployment paths, image-pull optimisations, and ICP filing considerations for public-facing instances.

> **Status:** This is a docs-only guide. The flows below follow Alibaba Cloud's published product behaviour and the existing [`docs/deployment/docker.md`](../docker.md) and [`docs/install-guide.md`](../../install-guide.md) container model. Live ROS templates, one-click scripts, and verification screenshots are tracked as a follow-up under issue #1025; contributions from operators with active Alibaba Cloud accounts are welcome.

## Why Alibaba Cloud?

For users in mainland China, deploying Open Design to Alibaba Cloud (阿里云) instead of an overseas provider gives you:

- **Lower latency** for users on China Telecom, China Unicom, and China Mobile networks.
- **Image acceleration** via Alibaba Cloud Container Registry (容器镜像服务 ACR) — Docker Hub pulls from the mainland are unreliable; ACR mirrors solve this.
- **Compliant public hosting** through ICP filing (备案), required for any internet-facing service on a `.cn` domain or a domain pointed at a mainland China IP.

If your users are outside mainland China, AWS, GCP, or Azure are typically simpler. This guide is targeted at the mainland use case.

## Deployment paths

| Path | Best for | Complexity | Cost shape |
|------|----------|------------|------------|
| **A. ECS (云服务器 ECS)** | Single-machine self-host, small teams, evaluation | Low | Pay-as-you-go or subscription, fixed per VM |
| **B. ACK (容器服务 ACK)** | Multi-tenant teams, autoscaling, HA | Medium-High | Cluster + node pool + load balancer |
| **C. ROS (资源编排 ROS)** | Repeatable infra-as-code provisioning | Medium | Same as the underlying ECS/ACK resources |

Most first-time deployments should start with **Path A (ECS)**.

## Prerequisites

- An Alibaba Cloud account with a verified payment method.
- For mainland China regions (e.g. `cn-hangzhou`, `cn-shanghai`, `cn-beijing`): a real-name verified (实名认证) account.
- For public domains served from a mainland China region: an [ICP filing](#icp-filing-备案) for the domain.
- Local install of the [Alibaba Cloud CLI (`aliyun`)](https://www.alibabacloud.com/help/en/cli) if you plan to script provisioning.

## Path A — Deploy to ECS

This path puts Open Design on a single ECS instance using the same Docker Compose stack documented in [`docs/deployment/docker.md`](../docker.md).

### Step 1: Create the ECS instance

Use the Alibaba Cloud console or the CLI. A reasonable starting shape for evaluation:

| Setting | Recommended value | Notes |
|---------|------------------|-------|
| Instance type | `ecs.t6-c1m2.large` (2 vCPU / 4 GiB) | Lightweight; bump to `ecs.c7` for production |
| Image | Ubuntu 24.04 LTS 64-bit | Open Design's Docker image is `linux/amd64` and `linux/arm64` |
| Storage | 40 GiB ESSD | Enough for the image, agent CWDs, and SQLite |
| Network | VPC with a public IP or EIP | Required if users will reach the instance directly |
| Security group | Inbound `22/tcp` (your IP only), outbound all | Add `443/tcp` only behind a reverse proxy — see [Network exposure](#network-exposure) |

CLI equivalent (replace placeholders):

```bash
aliyun ecs RunInstances \
  --RegionId cn-hangzhou \
  --ImageId ubuntu_24_04_x64_20G_alibase \
  --InstanceType ecs.t6-c1m2.large \
  --SecurityGroupId sg-xxxxxxxx \
  --VSwitchId vsw-xxxxxxxx \
  --InstanceChargeType PostPaid \
  --SystemDisk.Category cloud_essd \
  --SystemDisk.Size 40
```

### Step 2: Install Docker

SSH in and install Docker Engine plus the Compose plugin:

```bash
# Aliyun's mirrored Docker install script (faster from mainland China than get.docker.com)
curl -fsSL https://mirrors.aliyun.com/docker-ce/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://mirrors.aliyun.com/docker-ce/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo usermod -aG docker $USER
```

Log out and back in so the group change takes effect.

### Step 3: Configure image acceleration (镜像加速)

Pulling from `docker.io` directly inside mainland China is slow and intermittently fails. Configure ACR's free public mirror:

```bash
sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json > /dev/null <<EOF
{
  "registry-mirrors": [
    "https://<your-acr-prefix>.mirror.aliyuncs.com"
  ]
}
EOF
sudo systemctl restart docker
```

Get your personal mirror prefix from the Alibaba Cloud console under **Container Registry → Image Tools → Image Accelerator** (容器镜像服务 → 镜像工具 → 镜像加速器).

### Step 4: Run Open Design

From this point the flow matches [`docs/install-guide.md`](../../install-guide.md):

```bash
git clone https://github.com/nexu-io/open-design.git
cd open-design
bash deploy/scripts/install.sh --non-interactive --port 7456
```

### Step 5: Put a reverse proxy in front

Open Design binds to `127.0.0.1:7456` by design — the daemon is never directly exposed to the network. For public access, terminate TLS at Nginx or an Alibaba Cloud SLB / ALB and forward to `127.0.0.1:7456`. Do not expose port 7456 directly through the security group. See the network section of [`docs/install-guide.md`](../../install-guide.md) for the full rationale.

A minimal Nginx block:

```nginx
server {
  listen 443 ssl http2;
  server_name design.example.cn;

  ssl_certificate     /etc/letsencrypt/live/design.example.cn/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/design.example.cn/privkey.pem;

  location / {
    proxy_pass http://127.0.0.1:7456;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";

    # Forward the bearer token to the daemon. The Compose stack always
    # generates an OD_API_TOKEN and binds the daemon to 0.0.0.0 inside
    # the container, so every /api/* call coming through Nginx must
    # carry Authorization: Bearer <token>. Only /api/health,
    # /api/version, and /api/daemon/status are exempt. The loopback
    # short-circuit in the daemon checks the TCP peer address, not the
    # X-Forwarded-For header, so reverse-proxy traffic never gets the
    # localhost bypass.
    proxy_set_header Authorization "Bearer <OD_API_TOKEN from deploy/.env>";
  }
}
```

Set `OPEN_DESIGN_ALLOWED_ORIGINS` in `deploy/.env` to the public URL so CORS clears the proxy. The `OD_API_TOKEN` referenced in the Nginx block above is generated automatically by `deploy/scripts/install.sh` and written into `deploy/.env`; copy that value (or wire `proxy_set_header Authorization` to read it from a secrets manager) so the proxy authenticates on every request.

## Path B — Deploy to ACK

[Container Service for Kubernetes (容器服务 ACK)](https://www.alibabacloud.com/product/kubernetes) is the right choice when you need:

- Horizontal scaling beyond a single VM.
- High availability across availability zones.
- Standard Kubernetes tooling (`kubectl`, Helm) for ops.

Open Design does not yet ship an official Helm chart. The minimal manifest below is a starting point — production users should harden it (resource limits, PodDisruptionBudget, NetworkPolicy, persistent storage class).

> **Required env for Kubernetes:** the daemon defaults to `OD_BIND_HOST=127.0.0.1`, which makes the readiness probe (and the Service) unable to reach the container. To make the Pod reachable inside the cluster you must set `OD_BIND_HOST=0.0.0.0`, and the daemon's bound-API-token guard then requires `OD_API_TOKEN` to be set whenever it binds to a non-loopback interface. Both env vars are reflected in the manifest below.
>
> Also note that the daemon reads `OD_ALLOWED_ORIGINS` directly. The `OPEN_DESIGN_ALLOWED_ORIGINS` name documented in `deploy/.env.example` is a Compose-only alias mapped in `deploy/docker-compose.yml`; for the direct-container ACK path you must set `OD_ALLOWED_ORIGINS` instead.

Create the API-token secret first:

```bash
# Generate a random token and store it in the cluster
kubectl create secret generic open-design-secrets \
  --from-literal=api-token="$(openssl rand -hex 32)"
```

Then apply the manifest:

```yaml
# open-design.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: open-design
spec:
  replicas: 1  # Open Design uses local SQLite; multi-replica needs shared storage
  selector:
    matchLabels: { app: open-design }
  template:
    metadata:
      labels: { app: open-design }
    spec:
      containers:
        - name: open-design
          image: registry.cn-hangzhou.aliyuncs.com/<your-namespace>/open-design:latest
          ports:
            - containerPort: 7456
          env:
            # Storage env vars are intentionally omitted here.
            # Before setting them, you MUST read root AGENTS.md -> Daemon data directory contract.
            - name: OD_BIND_HOST
              value: "0.0.0.0"            # required so the readinessProbe and Service can reach the daemon
            - name: OD_API_TOKEN
              valueFrom:
                secretKeyRef:
                  name: open-design-secrets
                  key: api-token            # required whenever OD_BIND_HOST is non-loopback
            - name: OD_ALLOWED_ORIGINS
              value: "https://design.example.cn"  # set when fronting with an Ingress; daemon reads OD_*, not OPEN_DESIGN_*
          # Storage volume mounts are intentionally omitted here.
          # Before adding them, you MUST read root AGENTS.md -> Daemon data directory contract.
          readinessProbe:
            httpGet: { path: /api/health, port: 7456 }
            initialDelaySeconds: 10
          resources:
            requests: { cpu: 250m, memory: 384Mi }
            limits:   { cpu: "1",   memory: 768Mi }
      volumes:
        - name: data
          persistentVolumeClaim:
            claimName: open-design-data
---
apiVersion: v1
kind: Service
metadata:
  name: open-design
spec:
  type: ClusterIP
  selector: { app: open-design }
  ports:
    - port: 80
      targetPort: 7456
```

Apply with `kubectl apply -f open-design.yaml`. Front the Service with an Ingress (NGINX Ingress Controller is preinstalled on ACK Pro) and an ACM-issued certificate. With `OD_API_TOKEN` set, every `/api/*` request from non-loopback origins must carry an `Authorization: Bearer <token>` header — wire that into your Ingress / proxy auth layer.

> **Note on `replicas: 1`:** before changing storage paths or shared persistent storage, you MUST read root [`AGENTS.md`](../../../AGENTS.md) → **Daemon data directory contract**. Running multiple replicas without shared persistent daemon storage will diverge state. A multi-replica ACK topology needs an external database; that is out of scope for this guide.

## Path C — ROS templates

Resource Orchestration Service (资源编排 ROS) provisions the same resources declaratively. There is no first-party ROS template for Open Design yet. Operators with Alibaba Cloud access are welcome to contribute one as a follow-up to this guide; the natural location is `deploy/aliyun/ros/`.

Until a template lands, treat ROS as advanced infra-as-code and use Path A or Path B above.

## Image acceleration (镜像加速)

If you have not already done it during ECS setup, configure Docker's image mirror so image pulls from `docker.io` go through Alibaba Cloud's mirror:

1. Log in to the Alibaba Cloud console.
2. Open **Container Registry → Image Tools → Image Accelerator** (容器镜像服务 → 镜像工具 → 镜像加速器).
3. Copy your personal accelerator URL (looks like `https://<prefix>.mirror.aliyuncs.com`).
4. Add it to `/etc/docker/daemon.json` under `registry-mirrors` and restart Docker.

For ACK, image acceleration is enabled by default on the cluster's node pool — no per-node config needed.

## ICP filing (备案)

Any service that serves a domain pointed at a mainland China IP, or serves a `.cn` domain, must complete ICP filing through the Ministry of Industry and Information Technology (工信部). Skipping this is a hard block — Alibaba Cloud will firewall HTTP/HTTPS on unfiled domains.

| Item | Detail |
|------|--------|
| Who files | The domain owner (个人 or 企业) |
| Where | Alibaba Cloud's ICP filing console (备案系统) |
| What you need | Real-name verified Alibaba Cloud account, hosting purchased for ≥ 3 months in a mainland region, valid Chinese ID or business licence, photo on a blue/white background (taken via the Aliyun ICP app) |
| How long | Typically 7–20 business days |
| Result | A 备案号 (ICP filing number) you must display in the site footer, e.g. `京ICP备XXXXXXX号` |

You do **not** need ICP filing if:

- You deploy to a Hong Kong, Singapore, or other non-mainland Alibaba Cloud region (no firewall on those regions for HTTP/HTTPS).
- The service is internal (no public domain, accessed only via VPN or private IP).

A practical pattern for many teams: deploy to **Hong Kong (`cn-hongkong`)** first to skip ICP, then migrate to a mainland region once filing is complete and latency to mainland users matters more than time-to-launch.

## Network exposure

Open Design's daemon binds to `127.0.0.1:7456` and is never exposed directly. Public access must go through:

1. A reverse proxy that terminates TLS (Nginx, Caddy, Alibaba Cloud SLB/ALB).
2. An ICP-filed domain (for mainland regions).
3. CORS allowlist set via `OPEN_DESIGN_ALLOWED_ORIGINS` (Compose / `deploy/.env` path) or `OD_ALLOWED_ORIGINS` (direct-container / Kubernetes path).

See [`docs/install-guide.md`](../../install-guide.md) for the full topology and reverse-proxy guidance.

## Common pitfalls

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `docker pull` hangs or times out | No image acceleration configured; pulling from `docker.io` directly | Configure ACR mirror in `/etc/docker/daemon.json` |
| HTTP/HTTPS to your domain is blocked | Domain not ICP-filed for a mainland region | Complete ICP filing, or move to a non-mainland region (HK/SG) |
| `aliyun ecs RunInstances` fails with "Real-name authentication required" | Account not 实名认证 | Complete real-name verification in the account console |
| ACK pods stuck in `ImagePullBackOff` from a private ACR repo | Cluster lacks pull credentials for the namespace | Create an `aliyun-acr-credential-helper` secret or use the cluster's ACR plugin |
| 200 from `/api/health` but UI fails to load | CORS rejecting the proxied origin, **or** the reverse proxy not forwarding the bearer token (Compose always generates `OD_API_TOKEN`; only `/api/health`, `/api/version`, `/api/daemon/status` skip auth) | Set `OPEN_DESIGN_ALLOWED_ORIGINS` (Compose / `deploy/.env`) or `OD_ALLOWED_ORIGINS` (direct container / ACK) to the public URL, **and** add `proxy_set_header Authorization "Bearer <OD_API_TOKEN>"` to the Nginx / SLB upstream config |
| ACK Pod stuck in `NotReady`, readiness probe fails | Daemon defaulting to `OD_BIND_HOST=127.0.0.1` so the kubelet can't reach it | Set `OD_BIND_HOST=0.0.0.0` and `OD_API_TOKEN` in the Pod env (the daemon refuses non-loopback binds without a token) |
| SLB health check fails | SLB hits `7456` but security group blocks intra-VPC | Allow the SLB backend CIDR on `7456/tcp` in the security group |

## Follow-up work

This guide is intentionally docs-only. Tracked under #1025, contributions welcome:

- A first-party ROS template for one-click ECS provisioning.
- An official Helm chart for ACK with multi-replica safety (external DB or shared volume topology).
- An end-to-end one-click script equivalent to `deploy/scripts/install.sh` but targeting ECS via the `aliyun` CLI.
- A Chinese-language sibling of this file at `docs/deployment/cloud/aliyun.zh-CN.md` once the English content stabilises.
- Verification screenshots under `docs/screenshots/deployment/aliyun/`, mirroring the Docker layout.

## References

- Open Design Docker deployment: [`docs/deployment/docker.md`](../docker.md)
- Open Design one-click installer: [`docs/install-guide.md`](../../install-guide.md)
- Alibaba Cloud ECS docs: <https://www.alibabacloud.com/help/en/ecs>
- Alibaba Cloud ACK docs: <https://www.alibabacloud.com/help/en/ack>
- Alibaba Cloud Container Registry docs: <https://www.alibabacloud.com/help/en/acr>
- ICP filing overview (English): <https://www.alibabacloud.com/help/en/icp-filing>
- ICP filing console (Chinese): <https://beian.aliyun.com>
