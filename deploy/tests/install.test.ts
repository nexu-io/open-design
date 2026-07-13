import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, '../..');
const installScript = join(repoRoot, 'deploy/scripts/install.sh');
const uninstallScript = join(repoRoot, 'deploy/scripts/uninstall.sh');
const updateScript = join(repoRoot, 'deploy/scripts/update.sh');

// Skip entire suite if Docker is not available
function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('docker', ['info'], { timeout: 5000 }, (err) => resolve(!err));
  });
}

const dockerAvailable = await isDockerAvailable();

// Unique test identifier to isolate from real deployments
const TEST_ID = `od-test-${process.pid}`;

async function waitForHealth(port: number, timeoutMs = 30000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`http://127.0.0.1:${port}/api/health`);
      if (resp.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 1000));
  }
  return false;
}

interface TestContext {
  tmpDir: string;
  port: number;
  projectName: string;
  containerName: string;
  volumeName: string;
}

async function setupTestDir(port: number): Promise<TestContext> {
  const projectName = `${TEST_ID}-${port}`;
  const containerName = projectName;
  const volumeName = `${projectName}-data`;

  const tmpDir = await mkdtemp(join(tmpdir(), `${TEST_ID}-`));
  await execFileAsync('cp', ['-r', join(repoRoot, 'deploy/.'), tmpDir]);

  // Write a compose override that replaces the hardcoded names
  const override = {
    name: projectName,
    services: {
      'open-design': {
        container_name: containerName,
        volumes: [`${volumeName}:/app/.od`],
      },
    },
    volumes: {
      [volumeName]: {},
    },
  };
  await writeFile(
    join(tmpDir, 'docker-compose.override.yml'),
    JSON.stringify(override),
  );

  return { tmpDir, port, projectName, containerName, volumeName };
}

function testEnv(ctx: TestContext): Record<string, string> {
  return {
    ...process.env as Record<string, string>,
    COMPOSE_PROJECT_NAME: ctx.projectName,
  };
}

async function teardownTestDir(ctx: TestContext): Promise<void> {
  const script = join(ctx.tmpDir, 'scripts/uninstall.sh');
  const override = join(ctx.tmpDir, 'docker-compose.override.yml');

  // Run uninstall with the same override file so it targets the test container
  try {
    await readFile(override);
    await execFileAsync('bash', [script, '--non-interactive'], {
      timeout: 60_000,
      env: testEnv(ctx),
    });
  } catch {}

  // Force-remove the named volume as a safety net
  try {
    await execFileAsync('docker', ['volume', 'rm', '-f', ctx.volumeName], {
      timeout: 10_000,
    });
  } catch {}

  if (ctx.tmpDir) await rm(ctx.tmpDir, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// help flag tests — do not require Docker
// ---------------------------------------------------------------------------
test('install.sh --help exits 0', async () => {
  const { stdout } = await execFileAsync('bash', [installScript, '--help']);
  assert.match(stdout, /Usage/);
  assert.match(stdout, /--non-interactive/);
  assert.match(stdout, /--port/);
});

test('uninstall.sh --help exits 0', async () => {
  const { stdout } = await execFileAsync('bash', [uninstallScript, '--help']);
  assert.match(stdout, /Usage/);
  assert.match(stdout, /--keep-data/);
});

test('update.sh --help exits 0', async () => {
  const { stdout } = await execFileAsync('bash', [updateScript, '--help']);
  assert.match(stdout, /Usage/);
  assert.match(stdout, /--image/);
});

// ---------------------------------------------------------------------------
// Docker integration tests — skipped when Docker is unavailable
// ---------------------------------------------------------------------------
test('install.sh --non-interactive creates .env and starts container', { skip: !dockerAvailable ? 'Docker not available' : false }, async () => {
  const ctx = await setupTestDir(17456);
  try {
    const script = join(ctx.tmpDir, 'scripts/install.sh');
    await execFileAsync('bash', [
      script,
      '--non-interactive',
      `--port=${ctx.port}`,
      '--no-systemd',
    ], {
      timeout: 120_000,
      env: testEnv(ctx),
    });

    // .env should contain the port
    const envContent = await readFile(join(ctx.tmpDir, '.env'), 'utf8');
    assert.match(envContent, new RegExp(`OPEN_DESIGN_PORT=${ctx.port}`));

    // Container should be healthy
    const healthy = await waitForHealth(ctx.port, 60_000);
    assert.ok(healthy, 'daemon did not become healthy within 60s');
  } finally {
    await teardownTestDir(ctx);
  }
});

test('update.sh restarts service and remains healthy', { skip: !dockerAvailable ? 'Docker not available' : false }, async () => {
  const ctx = await setupTestDir(17457);
  try {
    const installRun = join(ctx.tmpDir, 'scripts/install.sh');
    await execFileAsync('bash', [
      installRun,
      '--non-interactive',
      `--port=${ctx.port}`,
      '--no-systemd',
    ], {
      timeout: 120_000,
      env: testEnv(ctx),
    });

    await waitForHealth(ctx.port, 30_000);

    // Update
    await execFileAsync('bash', [
      join(ctx.tmpDir, 'scripts/update.sh'),
    ], {
      timeout: 120_000,
      cwd: ctx.tmpDir,
      env: testEnv(ctx),
    });

    const healthy = await waitForHealth(ctx.port, 30_000);
    assert.ok(healthy, 'daemon not healthy after update');
  } finally {
    await teardownTestDir(ctx);
  }
});

test('uninstall.sh removes containers and .env', { skip: !dockerAvailable ? 'Docker not available' : false }, async () => {
  const ctx = await setupTestDir(17458);
  try {
    const installRun = join(ctx.tmpDir, 'scripts/install.sh');
    await execFileAsync('bash', [
      installRun,
      '--non-interactive',
      `--port=${ctx.port}`,
      '--no-systemd',
    ], {
      timeout: 120_000,
      env: testEnv(ctx),
    });

    // Uninstall
    await execFileAsync('bash', [
      join(ctx.tmpDir, 'scripts/uninstall.sh'),
      '--non-interactive',
    ], {
      timeout: 60_000,
      env: testEnv(ctx),
    });

    // .env should be gone
    const envGone = await readFile(join(ctx.tmpDir, '.env'), 'utf8').catch(() => null);
    assert.equal(envGone, null, '.env should have been removed');

    // Container should not be running
    const { stdout: containers } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}']);
    assert.ok(!containers.includes(ctx.containerName), 'container should not be running after uninstall');
  } finally {
    await teardownTestDir(ctx);
  }
});
