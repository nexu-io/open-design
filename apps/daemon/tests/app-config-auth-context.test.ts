import type http from 'node:http';
import { promises as fsp } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEFAULT_TRUSTED_EMAIL_HEADER } from '../src/auth-context.js';
import { startServer } from '../src/server.js';

interface StartedServer {
  url: string;
  server: http.Server;
}

interface AppConfigBody {
  config: {
    onboardingCompleted?: boolean;
    customInstructions?: string | null;
  };
}

interface AgentsBody {
  agents: Array<{ id: string; available: boolean }>;
}

interface AnalyticsConfigBody {
  enabled: boolean;
  env: string;
  key: string | null;
  host: string | null;
  installationId?: string | null;
}

const dataDir = process.env.OD_DATA_DIR as string;

function authHeaders(email: string): Record<string, string> {
  return { [DEFAULT_TRUSTED_EMAIL_HEADER]: email };
}

function jsonAuthHeaders(email: string): Record<string, string> {
  return {
    ...authHeaders(email),
    'content-type': 'application/json',
  };
}

async function readAppConfigRoute(baseUrl: string, email: string): Promise<AppConfigBody> {
  const response = await fetch(`${baseUrl}/api/app-config`, {
    headers: authHeaders(email),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as AppConfigBody;
}

async function withAppConfigOnlyFakeClaude<T>(run: (claudeBin: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(tmpdir(), 'od-agents-auth-bin-'));
  const oldPath = process.env.PATH;
  const oldClaudeBin = process.env.CLAUDE_BIN;
  const oldAgentHome = process.env.OD_AGENT_HOME;
  const claudeBin = path.join(dir, 'claude');
  const script = `
if (process.argv.includes('--version')) {
  console.log('claude-code 0.0.0');
  process.exit(0);
}
process.exit(0);
`;
  try {
    await fsp.writeFile(claudeBin, `#!${process.execPath}\n${script}`);
    await fsp.chmod(claudeBin, 0o755);
    process.env.PATH = '';
    delete process.env.CLAUDE_BIN;
    process.env.OD_AGENT_HOME = dir;
    return await run(claudeBin);
  } finally {
    process.env.PATH = oldPath;
    if (oldClaudeBin === undefined) delete process.env.CLAUDE_BIN;
    else process.env.CLAUDE_BIN = oldClaudeBin;
    if (oldAgentHome === undefined) delete process.env.OD_AGENT_HOME;
    else process.env.OD_AGENT_HOME = oldAgentHome;
    await fsp.rm(dir, { recursive: true, force: true });
  }
}

describe('app-config auth context', () => {
  let server: http.Server;
  let baseUrl: string;
  let originalMultitenant: string | undefined;
  let originalPosthogKey: string | undefined;
  let originalPosthogHost: string | undefined;

  beforeAll(async () => {
    if (!dataDir) throw new Error('OD_DATA_DIR is required for daemon route tests');
    originalMultitenant = process.env.OD_MULTITENANT;
    originalPosthogKey = process.env.POSTHOG_KEY;
    originalPosthogHost = process.env.POSTHOG_HOST;
    process.env.OD_MULTITENANT = '1';
    const started = (await startServer({
      port: 0,
      returnServer: true,
    })) as StartedServer;
    baseUrl = started.url;
    server = started.server;
  });

  afterAll(async () => {
    if (originalMultitenant === undefined) delete process.env.OD_MULTITENANT;
    else process.env.OD_MULTITENANT = originalMultitenant;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(async () => {
    await fsp.rm(path.join(dataDir, 'users'), { recursive: true, force: true });
    await fsp.rm(path.join(dataDir, 'app-config.json'), { force: true });
  });

  afterEach(() => {
    if (originalPosthogKey === undefined) delete process.env.POSTHOG_KEY;
    else process.env.POSTHOG_KEY = originalPosthogKey;
    if (originalPosthogHost === undefined) delete process.env.POSTHOG_HOST;
    else process.env.POSTHOG_HOST = originalPosthogHost;
  });

  it('stores user-facing app config under the authenticated user data dir', async () => {
    const aliceWrite = await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({
        onboardingCompleted: true,
        customInstructions: 'Alice prefers terse answers.',
      }),
    });
    expect(aliceWrite.status).toBe(200);

    const bobBefore = await readAppConfigRoute(baseUrl, 'bob@example.com');
    expect(bobBefore.config.onboardingCompleted).toBeUndefined();
    expect(bobBefore.config.customInstructions).toBeUndefined();

    const bobWrite = await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({
        customInstructions: 'Bob prefers detailed answers.',
      }),
    });
    expect(bobWrite.status).toBe(200);

    const aliceAfter = await readAppConfigRoute(baseUrl, 'alice@example.com');
    expect(aliceAfter.config).toMatchObject({
      onboardingCompleted: true,
      customInstructions: 'Alice prefers terse answers.',
    });

    const bobAfter = await readAppConfigRoute(baseUrl, 'bob@example.com');
    expect(bobAfter.config).toMatchObject({
      customInstructions: 'Bob prefers detailed answers.',
    });
    expect(bobAfter.config.onboardingCompleted).toBeUndefined();
  });

  it('uses the authenticated user app config when probing agents', async () => {
    await withAppConfigOnlyFakeClaude(async (claudeBin) => {
      const aliceWrite = await fetch(`${baseUrl}/api/app-config`, {
        method: 'PUT',
        headers: jsonAuthHeaders('alice@example.com'),
        body: JSON.stringify({
          agentCliEnv: { claude: { CLAUDE_BIN: claudeBin } },
        }),
      });
      expect(aliceWrite.status).toBe(200);

      const aliceAgentsRes = await fetch(`${baseUrl}/api/agents`, {
        headers: authHeaders('alice@example.com'),
      });
      expect(aliceAgentsRes.status).toBe(200);
      const aliceAgents = (await aliceAgentsRes.json()) as AgentsBody;
      expect(aliceAgents.agents.find((agent) => agent.id === 'claude')?.available).toBe(true);

      const bobAgentsRes = await fetch(`${baseUrl}/api/agents`, {
        headers: authHeaders('bob@example.com'),
      });
      expect(bobAgentsRes.status).toBe(200);
      const bobAgents = (await bobAgentsRes.json()) as AgentsBody;
      expect(bobAgents.agents.find((agent) => agent.id === 'claude')?.available).not.toBe(true);
    });
  });

  it('uses the authenticated user app config for analytics consent', async () => {
    process.env.POSTHOG_KEY = 'phc_test_key';
    process.env.POSTHOG_HOST = 'https://posthog.example.test/';

    const aliceWrite = await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: jsonAuthHeaders('alice@example.com'),
      body: JSON.stringify({
        installationId: 'alice-installation',
        telemetry: { metrics: true, content: true },
      }),
    });
    expect(aliceWrite.status).toBe(200);

    const bobWrite = await fetch(`${baseUrl}/api/app-config`, {
      method: 'PUT',
      headers: jsonAuthHeaders('bob@example.com'),
      body: JSON.stringify({
        installationId: 'bob-installation',
        telemetry: { metrics: false, content: false },
      }),
    });
    expect(bobWrite.status).toBe(200);

    const aliceRes = await fetch(`${baseUrl}/api/analytics/config`, {
      headers: authHeaders('alice@example.com'),
    });
    expect(aliceRes.status).toBe(200);
    const aliceConfig = (await aliceRes.json()) as AnalyticsConfigBody;
    expect(aliceConfig).toEqual({
      enabled: true,
      env: 'development',
      key: 'phc_test_key',
      host: 'https://posthog.example.test',
      installationId: 'alice-installation',
    });

    const bobRes = await fetch(`${baseUrl}/api/analytics/config`, {
      headers: authHeaders('bob@example.com'),
    });
    expect(bobRes.status).toBe(200);
    const bobConfig = (await bobRes.json()) as AnalyticsConfigBody;
    expect(bobConfig).toEqual({
      enabled: false,
      env: 'development',
      key: 'phc_test_key',
      host: 'https://posthog.example.test',
      installationId: 'bob-installation',
    });
  });
});
