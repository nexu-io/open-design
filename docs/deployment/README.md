# Deployment Guides

Use these guides to run Open Design outside the local development loop.

| Guide | Best for |
|-------|----------|
| [Docker and Docker Compose](docker.md) | Local self-hosting, one server, and the simplest production baseline |
| [Azure Container Instances](cloud/azure.md) | Azure ACI with Azure Files persistence and a trusted reverse proxy |
| [Alibaba Cloud](cloud/aliyun.md) | Mainland China and Asia-Pacific deployments on ECS or ACK |
| [Tencent Cloud](cloud/tencent.md) | Mainland China deployments on CVM or TKE |

Most first-time self-hosted deployments should start with Docker Compose, then
move to a cloud-specific guide when you need cloud networking, managed storage,
or repeatable infrastructure.
