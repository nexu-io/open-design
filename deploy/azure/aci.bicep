// Open Design on Azure Container Instances (ACI) — evaluation deployment.
//
// Single serverless container group with a public FQDN. State lives on the
// container's local disk, which is EPHEMERAL — it is reset whenever the group
// is restarted or recreated. This lane is for evaluation and demos.
//
// Why no persistent volume: Open Design stores SQLite under OD_DATA_DIR, and
// SQLite needs real file locking. ACI's only persistent volume type is Azure
// Files (SMB), where SQLite WAL/locking is unsupported and corrupts. So we
// keep the data dir on the container's local filesystem.
//
// SECURITY: ACI exposes the port over plain HTTP (no managed TLS). Access is
// gated by OD_API_TOKEN and browser traffic by OD_ALLOWED_ORIGINS. For
// internet-facing HTTPS use app-service.bicep.

@description('Base name for the deployment. A globally-unique suffix is appended to the DNS label.')
param name string = 'open-design'

@description('Azure region. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Container image to run. Pin to a digest (image@sha256:...) for production.')
param image string = 'docker.io/vanjayak/open-design:latest'

@secure()
@minLength(32)
@description('Required API token guarding the daemon. Generate one with: openssl rand -hex 32')
param apiToken string

@description('vCPU cores allocated to the container.')
param cpuCores int = 1

@description('Memory (GiB) allocated to the container. Raise for large exports or concurrent agent runs.')
param memoryInGb string = '1.5'

@description('Node.js heap cap passed to the container via NODE_OPTIONS.')
param nodeOptions string = '--max-old-space-size=192'

@description('Extra browser origins allowed to call /api, comma-separated. The container FQDN is always allowed.')
param extraAllowedOrigins string = ''

// Runtime invariants of the image, not user-facing knobs.
var containerPort = 7456
var dataDir = '/app/.od'

// ACI exposes the port verbatim (no 80 -> 7456 mapping), so the base URL
// carries the container port.
var dnsNameLabel = '${name}-${uniqueString(resourceGroup().id)}'
var fqdn = '${dnsNameLabel}.${toLower(location)}.azurecontainer.io'
var publicBaseUrl = 'http://${fqdn}:${containerPort}'
var allowedOrigins = empty(extraAllowedOrigins) ? publicBaseUrl : '${publicBaseUrl},${extraAllowedOrigins}'

resource containerGroup 'Microsoft.ContainerInstance/containerGroups@2023-05-01' = {
  name: '${name}-aci'
  location: location
  properties: {
    osType: 'Linux'
    restartPolicy: 'Always'
    ipAddress: {
      type: 'Public'
      dnsNameLabel: dnsNameLabel
      ports: [
        {
          protocol: 'TCP'
          port: containerPort
        }
      ]
    }
    containers: [
      {
        name: 'open-design'
        properties: {
          image: image
          ports: [
            {
              protocol: 'TCP'
              port: containerPort
            }
          ]
          resources: {
            requests: {
              cpu: cpuCores
              memoryInGB: json(memoryInGb)
            }
          }
          environmentVariables: [
            {
              name: 'OD_BIND_HOST'
              value: '0.0.0.0'
            }
            {
              name: 'OD_PORT'
              value: '${containerPort}'
            }
            {
              name: 'OD_WEB_PORT'
              value: '${containerPort}'
            }
            {
              name: 'OD_DATA_DIR'
              value: dataDir
            }
            {
              name: 'OD_PUBLIC_BASE_URL'
              value: publicBaseUrl
            }
            {
              name: 'OD_ALLOWED_ORIGINS'
              value: allowedOrigins
            }
            {
              name: 'NODE_ENV'
              value: 'production'
            }
            {
              name: 'NODE_OPTIONS'
              value: nodeOptions
            }
            {
              name: 'OD_API_TOKEN'
              secureValue: apiToken
            }
          ]
          livenessProbe: {
            httpGet: {
              path: '/api/health'
              port: containerPort
              scheme: 'HTTP'
            }
            initialDelaySeconds: 20
            periodSeconds: 30
            failureThreshold: 3
          }
        }
      }
    ]
  }
}

@description('Public URL of the deployed container (plain HTTP, port included).')
output appUrl string = publicBaseUrl

@description('Health endpoint to poll after deployment.')
output healthUrl string = '${publicBaseUrl}/api/health'

@description('Fully-qualified domain name assigned to the container group.')
output fqdn string = fqdn
