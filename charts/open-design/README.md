<!--- app-name: Open Design -->

## Introduction
This chart bootstraps an [Open Design](https://github.com/nexu-io/open-design) deployment on a [Kubernetes](https://kubernetes.io) cluster using the [Helm](https://helm.sh) package manager.

## Prerequisites
- Kubernetes 1.23+
- Helm 3.8.0+
- PV provisioner support in the underlying infrastructure (if persistence is enabled)

## Installing the Chart
To install the chart with the release name `my-release`:

```console
helm install my-release ./charts/open-design
```

These commands deploy an Open Design application on the Kubernetes cluster in the default configuration.

> **Tip**: List all releases using `helm list`

### Architecture and Configuration Notes

#### SQLite State & Concurrency Limitations
The current Open Design runtime stores state in local files and SQLite. Before
documenting or changing persistent daemon storage, you MUST read root
[`AGENTS.md`](../../AGENTS.md) → **Daemon data directory contract**. This chart
README MUST NOT restate it. Because SQLite does not support concurrent writes
from multiple network replicas, **this chart is strictly limited to 1 replica**.

Horizontal Pod Autoscaling (HPA) is disabled by default. Do not enable HPA or scale the deployment beyond `replicas: 1` unless you have modified the application to externalize the state to a standalone database.

#### Server-Sent Events (SSE) and Ingress
Open Design relies on Server-Sent Events (SSE) for real-time streaming. If you enable the Ingress resource, it is critical to disable reverse-proxy buffering. If you are using the NGINX Ingress Controller, this chart automatically applies the required annotations by default:

```yaml
nginx.ingress.kubernetes.io/proxy-buffering: "off"
nginx.ingress.kubernetes.io/proxy-read-timeout: "600"
nginx.ingress.kubernetes.io/proxy-send-timeout: "600"
```

**Path configuration**: Set `config.webBasePath` to one fixed browser-visible
prefix such as `/open-design`. When the default ingress path is `/`, the chart
uses that configured prefix automatically; custom ingress paths must match it.
The prefix cannot begin with the application-owned `/api`, `/_next`,
`/artifacts`, or `/frames` namespaces.
The stock `ghcr.io/nexu-io/od:latest` image is built for the root path. A
non-root deployment must build and publish its own image with the same
`OD_WEB_BASE_PATH`, select that image in the chart, and declare the baked-in
path through `image.webBasePath`. Helm rejects a mismatch before creating the
Deployment, while the daemon also verifies the image's build manifest when it
starts. Set `config.publicBaseUrl` to the full canonical URL, including the
prefix.

Example, from the repository root:

```bash
docker build \
  --file deploy/Dockerfile \
  --build-arg OD_WEB_BASE_PATH=/open-design \
  --tag registry.example.com/open-design:open-design .

OD_HELM_SMOKE_IMAGE=registry.example.com/open-design:open-design \
OD_HELM_SMOKE_WEB_BASE_PATH=/open-design \
node --experimental-strip-types --test \
  charts/open-design/tests/base-path-image-runtime.test.ts

docker push registry.example.com/open-design:open-design

helm upgrade --install open-design ./charts/open-design \
  --set-string image.repository=registry.example.com/open-design \
  --set-string image.tag=open-design \
  --set-string image.webBasePath=/open-design \
  --set-string config.webBasePath=/open-design \
  --set-string config.publicBaseUrl=https://example.com/open-design \
  --set ingress.enabled=true \
  --set ingress.hosts[0].host=example.com \
  --set ingress.hosts[0].paths[0].path=/open-design
```

The chart keeps the root API routes for compatibility while adding the
prefix-aware proxy location. Ingress and proxy buffering must remain disabled
for SSE, as shown in the default annotations.

#### Authentication Proxy
An authentication proxy (NGINX) is introduced to front the application. This proxy runs as a mandatory sidecar container alongside the main application. The Kubernetes Service routes traffic to the proxy, which handles authentication for the API and health checks, proxying valid requests to the application.

#### Security Context
This chart adheres to strict security defaults:
- Runs as non-root user `1001`.
- Drops all kernel capabilities (`ALL`).
- Enforces a `readOnlyRootFilesystem`.
- Prevents privilege escalation.

## Parameters

### Global & Image Parameters

| Name               | Description                               | Value                        |
| ------------------ | ----------------------------------------- | ---------------------------- |
| `commonLabels`     | Custom labels injected into all resources | `{app.kubernetes.io/environment: production}`  |
| `image.repository` | Open Design image repository              | `ghcr.io/nexu-io/od`        |
| `image.pullPolicy` | Image pull policy                         | `IfNotPresent`               |
| `image.tag`        | Image tag (overrides AppVersion)          | `latest`                     |
| `image.webBasePath` | Browser path baked into the selected image through `OD_WEB_BASE_PATH`; must match `config.webBasePath` | `""` |

### Application Configuration

| Name                   | Description                                                                                                   | Value                                |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| `config.nodeEnv`       | Node.js environment (`production` or `development`)                                                           | `production`                         |
| `config.allowedOrigins`| CORS allowed origins. Mandatory if service.type is LoadBalancer or NodePort to prevent 403 render failures.   | `""`                                 |
| `config.publicBaseUrl` | Public base URL used by the application (derived dynamically if empty)                                        | `""`                                 |
| `config.webBasePath` | Fixed browser-visible Web path; the image must be built with the same `OD_WEB_BASE_PATH` | `""` |
| `config.nodeOptions`   | V8 engine memory optimizations                                                                                | `--max-old-space-size=192`           |
| `config.webPort`       | Web server listening port                                                                                     | `7456`                               |
| `config.bindHost`      | Host to bind the web server to                                                                                | `"127.0.0.1"`                        |
| `config.apiToken`      | API authentication token (must be changed from default)                                                       | `"secure-default-token-change-me"`   |

### Auth Proxy Parameters

| Name                                   | Description                                       | Value                                            |
| -------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| `authProxy.image`                      | NGINX proxy image                                 | `nginxinc/nginx-unprivileged:1.25-alpine-slim`   |
| `authProxy.port`                       | Proxy server port inside the container            | `8080`                                           |
| `authProxy.securityContext`            | Security context for the proxy container          | `{...}`                                          |

### Health Check Parameters

| Name                                        | Description                                        | Value  |
| ------------------------------------------- | -------------------------------------------------- | ------ |
| `livenessProbe.enabled`                     | Enable liveness probe                              | `true` |
| `livenessProbe.initialDelaySeconds`         | Initial delay seconds for liveness probe           | `20`   |
| `livenessProbe.periodSeconds`               | Period seconds for liveness probe                  | `30`   |
| `livenessProbe.timeoutSeconds`              | Timeout seconds for liveness probe                 | `5`    |
| `livenessProbe.failureThreshold`            | Failure threshold for liveness probe               | `3`    |
| `readinessProbe.enabled`                    | Enable readiness probe                             | `true` |
| `readinessProbe.initialDelaySeconds`        | Initial delay seconds for readiness probe          | `5`    |
| `readinessProbe.periodSeconds`              | Period seconds for readiness probe                 | `10`   |
| `readinessProbe.timeoutSeconds`             | Timeout seconds for readiness probe                | `5`    |
| `readinessProbe.failureThreshold`           | Failure threshold for readiness probe              | `3`    |

### Network & Ingress Parameters

| Name                                    | Description                                                  | Value                      |
| --------------------------------------- | ------------------------------------------------------------ | -------------------------- |
| `service.type`                          | Kubernetes Service type                                      | `ClusterIP`                |
| `service.port`                          | Service HTTP port                                            | `80`                       |
| `ingress.enabled`                       | Enable ingress record generation                             | `false`                    |
| `ingress.className`                     | Ingress class name                                           | `nginx`                    |
| `ingress.annotations`                   | Additional custom annotations for Ingress (e.g., SSE fixes)  | `{...}`                    |
| `ingress.hosts[0].host`                 | Hostname for the ingress record                              | `open-design.local`        |
| `ingress.tls`                           | TLS configuration for ingress records                        | `[]`                       |

### Persistence Parameters

| Name                       | Description                                                  | Value           |
| -------------------------- | ------------------------------------------------------------ | --------------- |
| `persistence.enabled`      | Enable PVC for SQLite and file state                         | `true`          |
| `persistence.storageClass` | Storage class (leave empty to use cluster default)           | `""`            |
| `persistence.accessMode`   | PVC Access Mode                                              | `ReadWriteOnce` |
| `persistence.size`         | PVC Storage Request                                          | `10Gi`          |

### Resources & Autoscaling Parameters

| Name                                | Description                                                     | Value     |
| ----------------------------------- | --------------------------------------------------------------- | --------- |
| `replicaCount`                      | Number of application replicas                                  | `1`       |
| `resources.limits.cpu`              | CPU limits for the container                                    | `1000m`   |
| `resources.limits.memory`           | Memory limits for the container                                 | `1024Mi`  |
| `resources.requests.cpu`            | CPU requests for the container                                  | `200m`    |
| `resources.requests.memory`         | Memory requests for the container                               | `256Mi`   |
| `hpa.enabled`                       | Enable Horizontal Pod Autoscaler (WARNING: Breaks SQLite)       | `false`   |

### Security & Scheduling Parameters

| Name                                                              | Description                                     | Value              |
| ----------------------------------------------------------------- | ----------------------------------------------- | ------------------ |
| `podSecurityContext.fsGroupChangePolicy`                          | Set filesystem group change policy              | `Always`           |
| `podSecurityContext.sysctls`                                      | Set kernel settings using the sysctl interface  | `[]`               |
| `podSecurityContext.supplementalGroups`                           | Set filesystem extra groups                     | `[]`               |
| `podSecurityContext.fsGroup`                                      | Group ID for the persistent volume              | `1001`             |
| `containerSecurityContext.seLinuxOptions`                         | Set SELinux options in container                | `{}`               |
| `containerSecurityContext.runAsUser`                              | Run the application as this UID                 | `1001`             |
| `containerSecurityContext.runAsGroup`                             | Run the application as this GID                 | `1001`             |
| `containerSecurityContext.runAsNonRoot`                           | Set container's Security Context runAsNonRoot   | `true`             |
| `containerSecurityContext.privileged`                             | Set container's Security Context privileged     | `false`            |
| `containerSecurityContext.readOnlyRootFilesystem`                 | Enforce read-only root FS                       | `true`             |
| `containerSecurityContext.allowPrivilegeEscalation`               | Set container's Security Context allowPrivilegeEscalation | `false`            |
| `containerSecurityContext.capabilities.drop`                      | List of capabilities to be dropped              | `["ALL"]`          |
| `containerSecurityContext.seccompProfile.type`                    | Set container's Security Context seccomp profile| `"RuntimeDefault"` |
| `nodeSelector`                                                    | Node labels for pod assignment                  | `{}`               |
| `tolerations`                                                     | Tolerations for pod assignment                  | `[]`               |
| `affinity`                                                        | Affinity rules for pod assignment               | `{}`               |
| `initContainers`                                                  | Additional init containers to add to the pod    | `[]`               |
| `sidecars`                                                        | Additional sidecar containers to add to the pod | `[]`               |

Specify each parameter using the `--set key=value[,key=value]` argument to `helm install`. For example,

```console
helm install my-release --set config.nodeEnv=development ./charts/open-design
```

The above command sets the Open Design node environment to `development`.

Alternatively, a YAML file that specifies the values for the parameters can be provided while installing the chart. For example,

```console
helm install my-release -f values.yaml ./charts/open-design
```

> **Tip**: You can use the default [values.yaml](values.yaml)
