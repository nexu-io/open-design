import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Guards the Azure Bicep templates against drifting from the Open Design
// runtime contract. Source-level checks run without the Azure CLI; the extra
// `bicep build` pass runs only when the bicep binary is on PATH.

const repoRoot = join(import.meta.dirname, '../..');
const azureDir = join(repoRoot, 'deploy/azure');
const appServicePath = join(azureDir, 'app-service.bicep');
const aciPath = join(azureDir, 'aci.bicep');

// Must match deploy/docker-compose.yml and charts/open-design.
const CONTAINER_PORT = '7456';
const DATA_DIR = '/app/.od';
const HEALTH_PATH = '/api/health';

// Env vars the daemon reads (apps/daemon/src).
const REQUIRED_ENV = [
  'OD_BIND_HOST',
  'OD_PORT',
  'OD_WEB_PORT',
  'OD_DATA_DIR',
  'OD_PUBLIC_BASE_URL',
  'OD_ALLOWED_ORIGINS',
  'OD_API_TOKEN',
  'NODE_ENV',
  'NODE_OPTIONS',
];

async function read(path: string): Promise<string> {
  return readFile(path, 'utf8');
}

for (const [label, path] of [
  ['app-service.bicep', appServicePath],
  ['aci.bicep', aciPath],
] as const) {
  test(`${label}: pins the runtime port and data dir`, async () => {
    const src = await read(path);
    assert.match(src, new RegExp(`var containerPort = ${CONTAINER_PORT}\\b`), 'container port must be 7456');
    assert.match(src, new RegExp(`var dataDir = '${DATA_DIR}'`), 'data dir must be /app/.od');
  });

  test(`${label}: requires a secure API token of at least 32 chars`, async () => {
    const src = await read(path);
    assert.match(src, /@secure\(\)\s*\n\s*@minLength\(32\)\s*\n\s*@description\([^)]*\)\s*\nparam apiToken string/);
  });

  test(`${label}: wires every required daemon env var`, async () => {
    const src = await read(path);
    for (const name of REQUIRED_ENV) {
      assert.ok(src.includes(`'${name}'`), `${label} is missing env var ${name}`);
    }
  });

  test(`${label}: probes the health endpoint`, async () => {
    const src = await read(path);
    assert.ok(src.includes(HEALTH_PATH), `${label} must reference ${HEALTH_PATH}`);
  });

  test(`${label}: keeps SQLite off Azure Files (SMB breaks SQLite locking)`, async () => {
    const src = await read(path);
    // The data dir holds app.sqlite + its WAL files; an Azure Files (SMB) mount
    // corrupts SQLite. The data dir must stay on the container's local disk.
    assert.doesNotMatch(src, /azureFile|azureStorageAccounts/i, `${label} must not mount the data dir to Azure Files`);
    assert.doesNotMatch(src, /Microsoft\.Storage\/storageAccounts\/fileServices\/shares/, `${label} must not declare a SQLite data file share`);
  });

  test(`${label}: derives allowed origins from the public base URL`, async () => {
    const src = await read(path);
    assert.match(src, /var allowedOrigins = empty\(extraAllowedOrigins\)/);
  });
}

test('app-service.bicep: enforces HTTPS and a single SQLite writer', async () => {
  const src = await read(appServicePath);
  assert.match(src, /httpsOnly:\s*true/, 'App Service must be HTTPS-only');
  assert.match(src, /numberOfWorkers:\s*1/, 'App Service must run a single worker for SQLite');
  assert.match(src, /capacity:\s*1/, 'App Service plan must be pinned to one instance');
  assert.ok(src.includes("'WEBSITES_PORT'"), 'App Service must set WEBSITES_PORT so traffic reaches the container');
  // Forces the data dir onto the container's local disk (Azure Files breaks SQLite).
  assert.match(src, /'WEBSITES_ENABLE_APP_SERVICE_STORAGE'\s*\n\s*value:\s*'false'/, 'App Service must disable Azure Files-backed storage');
});

test('aci.bicep: passes the API token as a secure value and always restarts', async () => {
  const src = await read(aciPath);
  assert.match(src, /name:\s*'OD_API_TOKEN'\s*\n\s*secureValue:\s*apiToken/, 'ACI must pass OD_API_TOKEN as a secureValue');
  assert.match(src, /restartPolicy:\s*'Always'/, 'ACI container should restart on failure');
});

// Compile the templates when a bicep binary is on PATH; skipped otherwise.
function findBicep(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile('bicep', ['--version'], { timeout: 10_000 }, (err) => resolve(err ? null : 'bicep'));
  });
}

const bicepBin = await findBicep();

for (const [label, path] of [
  ['app-service.bicep', appServicePath],
  ['aci.bicep', aciPath],
] as const) {
  test(`${label}: compiles with bicep build`, { skip: bicepBin ? false : 'bicep CLI not installed' }, async () => {
    await new Promise<void>((resolve, reject) => {
      execFile('bicep', ['build', path, '--stdout'], { timeout: 60_000 }, (err, _stdout, stderr) => {
        if (err) {
          reject(new Error(`bicep build failed for ${label}: ${stderr || err.message}`));
          return;
        }
        // bicep prints lint warnings to stderr; treat any as a failure.
        assert.equal(stderr.trim(), '', `bicep emitted warnings for ${label}: ${stderr}`);
        resolve();
      });
    });
  });
}
