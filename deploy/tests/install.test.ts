import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, '../..');
const installScript  = join(repoRoot, 'deploy/scripts/install.sh');
const uninstallScript = join(repoRoot, 'deploy/scripts/uninstall.sh');
const updateScript   = join(repoRoot, 'deploy/scripts/update.sh');

// Skip entire suite if Docker is not available
function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('docker', ['info'], { timeout: 5000 }, (err) => resolve(!err));
  });
}

const dockerAvailable = await isDockerAvailable();

// Test port — use a high unprivileged port to avoid conflicts
const TEST_PORT = 17456;
const TEST_CONTAINER = `open-design-test-${TEST_PORT}`;

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
  let tmpDir = '';
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'od-install-test-'));

    // Copy deploy directory into tmpDir so we don't pollute the real one
    await execFileAsync('cp', ['-r', join(repoRoot, 'deploy/.'), tmpDir]);

    const script = join(tmpDir, 'scripts/install.sh');
    const { stdout, stderr } = await execFileAsync('bash', [
      script,
      '--non-interactive',
      `--port=${TEST_PORT}`,
      '--no-systemd',
    ], { timeout: 120_000 });

    // .env should be generated
    const envContent = await readFile(join(tmpDir, '.env'), 'utf8');
    assert.match(envContent, new RegExp(`OPEN_DESIGN_PORT=${TEST_PORT}`));

    // Container should be healthy
    const healthy = await waitForHealth(TEST_PORT, 60_000);
    assert.ok(healthy, 'daemon did not become healthy within 60s');

  } finally {
    // Clean up: stop container and remove tmp dir
    await execFileAsync('bash', [
      join(tmpDir || repoRoot, 'scripts/uninstall.sh'),
      '--non-interactive',
    ]).catch(() => {});
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
});

test('update.sh restarts service and remains healthy', { skip: !dockerAvailable ? 'Docker not available' : false }, async () => {
  let tmpDir = '';
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'od-update-test-'));
    await execFileAsync('cp', ['-r', join(repoRoot, 'deploy/.'), tmpDir]);

    // Install first
    await execFileAsync('bash', [
      join(tmpDir, 'scripts/install.sh'),
      '--non-interactive',
      `--port=${TEST_PORT + 1}`,
      '--no-systemd',
    ], { timeout: 120_000 });

    await waitForHealth(TEST_PORT + 1, 30_000);

    // Update
    await execFileAsync('bash', [
      join(tmpDir, 'scripts/update.sh'),
    ], { timeout: 120_000, cwd: tmpDir });

    const healthy = await waitForHealth(TEST_PORT + 1, 30_000);
    assert.ok(healthy, 'daemon not healthy after update');

  } finally {
    await execFileAsync('bash', [
      join(tmpDir || repoRoot, 'scripts/uninstall.sh'),
      '--non-interactive',
    ]).catch(() => {});
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
});

test('uninstall.sh removes containers and .env', { skip: !dockerAvailable ? 'Docker not available' : false }, async () => {
  let tmpDir = '';
  try {
    tmpDir = await mkdtemp(join(tmpdir(), 'od-uninstall-test-'));
    await execFileAsync('cp', ['-r', join(repoRoot, 'deploy/.'), tmpDir]);

    // Install
    await execFileAsync('bash', [
      join(tmpDir, 'scripts/install.sh'),
      '--non-interactive',
      `--port=${TEST_PORT + 2}`,
      '--no-systemd',
    ], { timeout: 120_000 });

    // Uninstall
    await execFileAsync('bash', [
      join(tmpDir, 'scripts/uninstall.sh'),
      '--non-interactive',
    ], { timeout: 60_000 });

    // .env should be gone
    const envGone = await readFile(join(tmpDir, '.env'), 'utf8').catch(() => null);
    assert.equal(envGone, null, '.env should have been removed');

    // Container should not be running
    const { stdout: containers } = await execFileAsync('docker', ['ps', '--format', '{{.Names}}']);
    assert.ok(!containers.includes('open-design'), 'container should not be running after uninstall');

  } finally {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
  }
});
