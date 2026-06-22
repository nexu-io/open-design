import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const execFileAsync = promisify(execFile);
const repoRoot = join(import.meta.dirname, '../..');

function isDockerAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('docker', ['info'], { timeout: 5000 }, (err) => resolve(!err));
  });
}

const dockerAvailable = await isDockerAvailable();

interface EnvLines {
  lines: string[];
  get(key: string): string | undefined;
}

function parseEnvLines(stdout: string): EnvLines {
  const lines = stdout.split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('OD_'));
  return {
    lines,
    get(key: string): string | undefined {
      const found = lines.find((l) => l.startsWith(key));
      if (!found) return undefined;
      // List format: "      - OD_FOO=bar" or "- OD_FOO='bar'" or "- OD_FOO=\"bar\""
      const listMatch = found.match(new RegExp(`${key}=(.*)$`));
      if (listMatch) return listMatch[1].replace(/^['"](.*)['"]$/, '$1');
      // YAML mapping format: "      OD_FOO: bar" or "OD_FOO: \"bar\"" or "OD_FOO: 'bar'"
      const yamlMatch = found.match(new RegExp(`${key}:\\s*(.*)$`));
      if (yamlMatch) return yamlMatch[1].replace(/^['"](.*)['"]$/, '$1');
      return undefined;
    },
  };
}

async function setupTempDir(): Promise<string> {
  const tmpDir = await mkdtemp(join(tmpdir(), 'od-compose-config-test-'));
  await cp(join(repoRoot, 'deploy', 'docker-compose.yml'), join(tmpDir, 'docker-compose.yml'));
  const override = {
    name: `od-config-test-${process.pid}`,
    services: {
      'open-design': {
        image: 'alpine:3.21',
        entrypoint: ['echo', 'config-only-test'],
      },
    },
  };
  await writeFile(join(tmpDir, 'docker-compose.override.yml'), JSON.stringify(override));
  return tmpDir;
}

async function runComposeConfig(tmpDir: string, extraEnv?: Record<string, string>): Promise<string> {
  const { stdout } = await execFileAsync(
    'docker',
    ['compose', 'config'],
    { cwd: tmpDir, timeout: 30_000, env: { ...process.env, ...extraEnv } as Record<string, string> },
  );
  return stdout;
}

test(
  'docker-compose.yml defaults auth disabled and private-subnet enabled when no .env',
  { skip: !dockerAvailable ? 'Docker not available' : false },
  async () => {
    const tmpDir = await setupTempDir();
    try {
      const stdout = await runComposeConfig(tmpDir);
      const env = parseEnvLines(stdout);

      assert.equal(env.get('OD_DISABLE_API_AUTH'), '1', 'expected OD_DISABLE_API_AUTH=1 by default');
      assert.equal(env.get('OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET'), '1', 'expected OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET=1 by default');
      assert.equal(env.get('OD_BIND_HOST'), '0.0.0.0', 'expected OD_BIND_HOST=0.0.0.0');
      assert.equal(env.get('OD_API_TOKEN'), '', 'expected OD_API_TOKEN to resolve to empty string');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  },
);

test(
  'OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET can be overridden to 0 via env',
  { skip: !dockerAvailable ? 'Docker not available' : false },
  async () => {
    const tmpDir = await setupTempDir();
    try {
      const stdout = await runComposeConfig(tmpDir, { OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET: '0' });
      const env = parseEnvLines(stdout);

      assert.equal(env.get('OD_BOOTSTRAP_ALLOW_PRIVATE_SUBNET'), '0', 'should resolve to 0 when env is set');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  },
);

test(
  'OD_DISABLE_API_AUTH can be overridden to 0 via env (opt into token auth)',
  { skip: !dockerAvailable ? 'Docker not available' : false },
  async () => {
    const tmpDir = await setupTempDir();
    try {
      const stdout = await runComposeConfig(tmpDir, { OD_DISABLE_API_AUTH: '0' });
      const env = parseEnvLines(stdout);

      assert.equal(env.get('OD_DISABLE_API_AUTH'), '0', 'should resolve to 0 when env is set');
    } finally {
      await rm(tmpDir, { recursive: true, force: true });
    }
  },
);
