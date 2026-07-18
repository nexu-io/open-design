// Open Design on Azure App Service for Containers (evaluation deployment).
//
// Single-instance Linux web app behind Azure's managed HTTPS. State lives on
// the container's local disk, which is EPHEMERAL — it is reset on restart,
// redeploy, or scale. This lane is for evaluation and demos, not durable data.
//
// Why no persistent volume: Open Design stores SQLite under OD_DATA_DIR, and
// SQLite needs real file locking. App Service's persistent storage is backed
// by Azure Files (SMB), where SQLite WAL/locking is unsupported and corrupts.
// So we deliberately keep the data dir on the container's local filesystem.

@description('Base name for the deployment. A globally-unique suffix is appended to the web app.')
param name string = 'open-design'

@description('Azure region. Defaults to the resource group location.')
param location string = resourceGroup().location

@description('Container image to run. Pin to a digest (image@sha256:...) for production.')
param image string = 'docker.io/vanjayak/open-design:latest'

@description('App Service plan SKU. B1 is the smallest tier that supports Always On and health checks.')
param appServicePlanSku string = 'B1'

@secure()
@minLength(32)
@description('Required API token guarding the daemon. Generate one with: openssl rand -hex 32')
param apiToken string

@description('Node.js heap cap passed to the container via NODE_OPTIONS.')
param nodeOptions string = '--max-old-space-size=192'

@description('Extra browser origins allowed to call /api, comma-separated. The App Service default hostname is always allowed.')
param extraAllowedOrigins string = ''

// Runtime invariants of the image, not user-facing knobs.
var containerPort = 7456
var dataDir = '/app/.od'

// Default App Service hostname is deterministic, so we derive the public URL up
// front and avoid a circular reference on the site's own appSettings.
var webAppName = '${name}-${uniqueString(resourceGroup().id)}'
var publicBaseUrl = 'https://${webAppName}.azurewebsites.net'
var allowedOrigins = empty(extraAllowedOrigins) ? publicBaseUrl : '${publicBaseUrl},${extraAllowedOrigins}'

resource plan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: '${name}-plan'
  location: location
  kind: 'linux'
  sku: {
    name: appServicePlanSku
    capacity: 1
  }
  properties: {
    reserved: true // required for Linux plans
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux,container'
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'DOCKER|${image}'
      alwaysOn: true
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      http20Enabled: true
      healthCheckPath: '/api/health'
      numberOfWorkers: 1 // SQLite is single-writer: keep one worker.
      appSettings: [
        {
          name: 'WEBSITES_PORT' // route inbound traffic to the container port
          value: '${containerPort}'
        }
        {
          // Keep the data dir on the container's local disk (real file
          // locking). Azure Files-backed storage corrupts SQLite.
          name: 'WEBSITES_ENABLE_APP_SERVICE_STORAGE'
          value: 'false'
        }
        {
          name: 'WEBSITES_CONTAINER_START_TIME_LIMIT'
          value: '230'
        }
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
          name: 'OD_API_TOKEN'
          value: apiToken
        }
        {
          name: 'NODE_ENV'
          value: 'production'
        }
        {
          name: 'NODE_OPTIONS'
          value: nodeOptions
        }
      ]
    }
  }
}

@description('Public HTTPS URL of the deployed app.')
output appUrl string = publicBaseUrl

@description('Health endpoint to poll after deployment.')
output healthUrl string = '${publicBaseUrl}/api/health'

@description('Generated web app name (includes the unique suffix).')
output webAppName string = webAppName
