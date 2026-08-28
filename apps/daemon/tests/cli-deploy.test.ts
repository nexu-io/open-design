// Contract test for the `od deploy` CLI surface. Verifies that the subcommand
// is registered in SUBCOMMAND_MAP, that flags are parsed correctly, and that
// exactly the right HTTP body is sent to POST /api/projects/:id/deploy.
//
// Mirrors the stub-server + runCli pattern from cli-templates.test.ts so the
// harness is familiar to reviewers and consistent with the repo standard.
//
// ASSUMPTION (Cloudflare flags): The CLI is expected to accept three flags to
// populate the `cloudflarePages` body field (matching CloudflarePagesDeploySelection
// from packages/contracts):
//   --cf-zone-id <id>        → cloudflarePages.zoneId
//   --cf-zone-name <name>    → cloudflarePages.zoneName
//   --cf-domain-prefix <p>   → cloudflarePages.domainPrefix
// The implementer should honor this assumption; if the flag names change, update
// the case 7 assertions accordingly.

import http from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve as pathResolve } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const DAEMON_ROOT = pathResolve(__dirname, '..');
const REPO_ROOT = pathResolve(__dirname, '../../..');
const CLI_SRC = pathResolve(__dirname, '../src/cli.ts');
const TSX_CLI = pathResolve(REPO_ROOT, 'node_modules/tsx/dist/cli.mjs');

interface CapturedRequest {
  method: string;
  url: string;
  body: string;
  headers: http.IncomingHttpHeaders;
}

interface StubServer {
  baseUrl: string;
  requests: CapturedRequest[];
  setResponder: (
    fn: (req: CapturedRequest) => { status: number; body: unknown } | null,
  ) => void;
  close: () => Promise<void>;
}

async function startStubServer(): Promise<StubServer> {
  const requests: CapturedRequest[] = [];
  let responder:
    | ((req: CapturedRequest) => { status: number; body: unknown } | null)
    | null = null;

  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      const captured: CapturedRequest = {
        method: req.method ?? '',
        url: req.url ?? '',
        body: raw,
        headers: req.headers,
      };
      requests.push(captured);
      const response = responder?.(captured) ?? { status: 200, body: { ok: true } };
      res.statusCode = response.status;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(response.body));
    });
  });

  await new Promise<void>((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
  const addr = server.address();
  if (!addr || typeof addr === 'string') throw new Error('stub server has no address');
  const baseUrl = `http://127.0.0.1:${addr.port}`;

  return {
    baseUrl,
    requests,
    setResponder: (fn) => {
      responder = fn;
    },
    close: () =>
      new Promise<void>((resolveClose, rejectClose) => {
        server.close((err) => (err ? rejectClose(err) : resolveClose()));
      }),
  };
}

async function runCli(
  args: string[],
  options: { env?: NodeJS.ProcessEnv } = {},
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
  };
  delete env.NODE_OPTIONS;
  try {
    const { stdout, stderr } = await execFileP(
      process.execPath,
      [TSX_CLI, CLI_SRC, ...args],
      {
        cwd: DAEMON_ROOT,
        env,
        timeout: 15_000,
        maxBuffer: 4 * 1024 * 1024,
      },
    );
    return { stdout, stderr, code: 0 };
  } catch (err) {
    const failed = err as { stdout?: string; stderr?: string; code?: number | null };
    return {
      stdout: failed.stdout ?? '',
      stderr: failed.stderr ?? '',
      code: failed.code ?? 1,
    };
  }
}

// A minimal DeploymentInfo response that the stub returns for success cases.
// Fields match DeploymentInfo + DeployProjectFileResponse from packages/contracts.
const STUB_DEPLOYMENT = {
  id: 'deploy-abc',
  projectId: 'proj-1',
  fileName: 'index.html',
  providerId: 'vercel-self',
  url: 'https://example.vercel.app',
  deploymentCount: 1,
  target: 'production' as const,
  status: 'ready' as const,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_001,
};

describe('od deploy CLI', () => {
  let stub: StubServer;

  beforeAll(async () => {
    stub = await startStubServer();
  });

  afterAll(async () => {
    await stub.close();
  });

  beforeEach(() => {
    stub.requests.length = 0;
    stub.setResponder(() => ({ status: 200, body: STUB_DEPLOYMENT }));
  });

  afterEach(() => {
    stub.setResponder(() => ({ status: 200, body: STUB_DEPLOYMENT }));
  });

  // Case 1: --target preview → body.target === 'preview', exit 0
  it('POSTs to /api/projects/:id/deploy with target=preview when --target preview is given', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--target',
      'preview',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const req = stub.requests[0]!;
    expect(req.method).toBe('POST');
    expect(req.url).toBe('/api/projects/proj-1/deploy');
    const body = JSON.parse(req.body);
    expect(body.target).toBe('preview');
    expect(body.fileName).toBe('index.html');
  });

  // Case 2: --target production → body.target === 'production', exit 0
  it('POSTs with target=production when --target production is given', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--target',
      'production',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const body = JSON.parse(stub.requests[0]!.body);
    expect(body.target).toBe('production');
  });

  // Case 3: omitted --target → body must NOT contain a `target` key at all
  // (so the endpoint applies its own production default server-side)
  it('omits the target key entirely from the POST body when --target is not supplied', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const body = JSON.parse(stub.requests[0]!.body);
    expect('target' in body).toBe(false);
    expect(body.fileName).toBe('index.html');
  });

  // Case 4: invalid --target value → CLI rejects locally (no HTTP request made)
  it('rejects --target staging locally and makes no HTTP request', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--target',
      'staging',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(stub.requests).toHaveLength(0);
    // stderr should mention the invalid value so the user understands what went wrong
    expect(result.stderr).toMatch(/staging/);
  });

  // Case 5: --json → stdout is the raw parseable JSON from the daemon
  it('outputs the raw daemon JSON response to stdout under --json', async () => {
    const stubResponse = { ...STUB_DEPLOYMENT, url: 'https://example-json.vercel.app' };
    stub.setResponder(() => ({ status: 200, body: stubResponse }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toMatchObject({
      id: stubResponse.id,
      url: stubResponse.url,
      target: stubResponse.target,
      status: stubResponse.status,
    });
  });

  // Case 6a: daemon returns 400 → CLI exits non-zero and surfaces the error message
  it('exits non-zero and surfaces the error message when the daemon returns 400', async () => {
    stub.setResponder(() => ({
      status: 400,
      body: { error: 'fileName required' },
    }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/fileName required/);
  });

  // Case 6b: daemon returns 500 → CLI exits non-zero
  it('exits non-zero when the daemon returns 500', async () => {
    stub.setResponder(() => ({
      status: 500,
      body: { error: 'internal error' },
    }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).not.toBe(0);
  });

  // Case 7: --provider cloudflare-pages with CF flags → body includes providerId and cloudflarePages
  // ASSUMPTION: Cloudflare-specific flags are --cf-zone-id, --cf-zone-name, --cf-domain-prefix
  // matching CloudflarePagesDeploySelection { zoneId, zoneName, domainPrefix }
  it('sends providerId=cloudflare-pages and cloudflarePages object when --provider cloudflare-pages is given with CF flags', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { ...STUB_DEPLOYMENT, providerId: 'cloudflare-pages' },
    }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'cloudflare-pages',
      '--cf-zone-id',
      'zone-abc',
      '--cf-zone-name',
      'example.com',
      '--cf-domain-prefix',
      'my-project',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    const body = JSON.parse(stub.requests[0]!.body);
    expect(body.providerId).toBe('cloudflare-pages');
    expect(body.cloudflarePages).toMatchObject({
      zoneId: 'zone-abc',
      zoneName: 'example.com',
      domainPrefix: 'my-project',
    });
  });

  it('sends display.dev artifact and access selections from CLI flags', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: { ...STUB_DEPLOYMENT, providerId: 'displaydev-self' },
    }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-name',
      'Review draft',
      '--displaydev-visibility',
      'private',
      '--displaydev-shared-with',
      'alice@example.com, bob@example.com',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    expect(JSON.parse(stub.requests[0]!.body)).toMatchObject({
      providerId: 'displaydev-self',
      displayDev: {
        name: 'Review draft',
        visibility: 'private',
        sharedWith: ['alice@example.com', 'bob@example.com'],
      },
    });
  });

  it('uses a named environment variable for one display.dev publish without requesting persistence', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: {
        ...STUB_DEPLOYMENT,
        providerId: 'displaydev-self',
        displayDev: {
          mode: 'authenticated',
          shortId: 'authenticated-1',
          visibility: 'company',
          sharedWith: [],
        },
      },
    }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-api-key-env',
      'OD_TEST_DISPLAYDEV_API_KEY',
      '--displaydev-name',
      'Authenticated draft',
      '--displaydev-visibility',
      'company',
      '--daemon-url',
      stub.baseUrl,
    ], {
      env: { OD_TEST_DISPLAYDEV_API_KEY: 'displaydev-key-from-env' },
    });

    expect(result.code).toBe(0);
    expect(stub.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: '/api/projects/proj-1/deploy' },
    ]);
    expect(JSON.parse(stub.requests[0]!.body)).toMatchObject({
      providerId: 'displaydev-self',
      displayDev: {
        name: 'Authenticated draft',
        visibility: 'company',
        authentication: {
          mode: 'api-key',
          apiKey: 'displaydev-key-from-env',
        },
      },
    });
    expect(JSON.parse(stub.requests[0]!.body).displayDev.authentication)
      .not.toHaveProperty('save');
  });

  it('uses the current environment value on each invocation without saving rotated keys', async () => {
    for (const token of ['displaydev-key-before-rotation', 'displaydev-key-after-rotation']) {
      const result = await runCli([
        'deploy',
        'proj-1',
        '--file',
        'index.html',
        '--provider',
        'displaydev-self',
        '--displaydev-api-key-env',
        'OD_TEST_DISPLAYDEV_ROTATED_API_KEY',
        '--daemon-url',
        stub.baseUrl,
      ], {
        env: { OD_TEST_DISPLAYDEV_ROTATED_API_KEY: token },
      });
      expect(result.code).toBe(0);
    }

    expect(stub.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: '/api/projects/proj-1/deploy' },
      { method: 'POST', url: '/api/projects/proj-1/deploy' },
    ]);
    expect(stub.requests.map((request) => (
      JSON.parse(request.body).displayDev.authentication
    ))).toEqual([
      {
        mode: 'api-key',
        apiKey: 'displaydev-key-before-rotation',
      },
      {
        mode: 'api-key',
        apiKey: 'displaydev-key-after-rotation',
      },
    ]);
  });

  it('does not replace the saved display.dev key when the publish fails', async () => {
    stub.setResponder((request) => request.url === '/api/projects/proj-1/deploy'
      ? {
          status: 502,
          body: {
            error: {
              code: 'UPSTREAM_UNAVAILABLE',
              message: 'display.dev is unavailable',
            },
          },
        }
      : { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'unexpected request' } } });

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-api-key-env',
      'OD_TEST_DISPLAYDEV_FAILED_API_KEY',
      '--daemon-url',
      stub.baseUrl,
    ], {
      env: { OD_TEST_DISPLAYDEV_FAILED_API_KEY: 'displaydev-key-that-must-not-be-saved' },
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/display\.dev is unavailable/i);
    expect(stub.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'POST', url: '/api/projects/proj-1/deploy' },
    ]);
    expect(JSON.parse(stub.requests[0]!.body)).toMatchObject({
      displayDev: {
        authentication: {
          mode: 'api-key',
          apiKey: 'displaydev-key-that-must-not-be-saved',
        },
      },
    });
    expect(JSON.parse(stub.requests[0]!.body).displayDev.authentication)
      .not.toHaveProperty('save');
  });

  it('publishes anonymously without requesting a saved display.dev key change', async () => {
    stub.setResponder((request) => {
      if (request.url === '/api/projects/proj-1/deployments') {
        return { status: 200, body: { deployments: [] } };
      }
      return {
        status: 200,
        body: {
          ...STUB_DEPLOYMENT,
          providerId: 'displaydev-self',
          displayDev: {
            mode: 'anonymous',
            shortId: 'anonymous-1',
            claimUrl: 'https://app.display.dev/claim?code=claim-1',
          },
        },
      };
    });

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-anonymous',
      '--displaydev-name',
      'Anonymous draft',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(stub.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'GET', url: '/api/projects/proj-1/deployments' },
      { method: 'POST', url: '/api/projects/proj-1/deploy' },
    ]);
    expect(JSON.parse(stub.requests[1]!.body)).toMatchObject({
      providerId: 'displaydev-self',
      displayDev: {
        name: 'Anonymous draft',
        authentication: { mode: 'anonymous' },
      },
    });
    expect(JSON.parse(stub.requests[1]!.body).displayDev.authentication)
      .not.toHaveProperty('save');
  });

  it('documents that display.dev authentication flags do not mutate the saved API key', async () => {
    const result = await runCli(['deploy', '--help']);

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(0);
    expect(result.stdout).toMatch(/--displaydev-api-key-env[^\n]*without changing the saved API key/);
    expect(result.stdout).toMatch(/--displaydev-anonymous[^\n]*without changing the saved API key/);
  });

  it('does not clear the saved key when anonymous mode targets an owned display.dev artifact', async () => {
    stub.setResponder((request) => request.url === '/api/projects/proj-1/deployments'
      ? {
          status: 200,
          body: {
            deployments: [{
              ...STUB_DEPLOYMENT,
              fileName: 'index.html',
              providerId: 'displaydev-self',
              displayDev: { mode: 'authenticated', shortId: 'owned-1' },
            }],
          },
        }
      : { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'unexpected request' } } });

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-anonymous',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(2);
    expect(result.stderr).toMatch(/owned display\.dev artifact/i);
    expect(stub.requests.map(({ method, url }) => ({ method, url }))).toEqual([
      { method: 'GET', url: '/api/projects/proj-1/deployments' },
    ]);
  });

  it.each([
    ['API key environment selection', ['--displaydev-api-key-env', 'OD_TEST_DISPLAYDEV_CONFLICT_KEY']],
    ['visibility selection', ['--displaydev-visibility', 'private']],
    ['recipient selection', ['--displaydev-shared-with', 'alice@example.com']],
  ])('rejects anonymous mode combined with %s before making a request', async (_label, extraArgs) => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-anonymous',
      ...extraArgs,
      '--daemon-url',
      stub.baseUrl,
    ], {
      env: { OD_TEST_DISPLAYDEV_CONFLICT_KEY: 'unused-key' },
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/displaydev-anonymous/i);
    expect(stub.requests).toHaveLength(0);
  });

  it.each([
    ['vercel-self', ['--displaydev-api-key-env', 'OD_TEST_DISPLAYDEV_NON_PROVIDER_KEY']],
    ['cloudflare-pages', ['--displaydev-anonymous']],
    ['vercel-self', ['--displaydev-name', 'Wrong provider']],
  ])('rejects display.dev flags for the %s provider before making a request', async (provider, extraArgs) => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      provider,
      ...extraArgs,
      '--daemon-url',
      stub.baseUrl,
    ], {
      env: { OD_TEST_DISPLAYDEV_NON_PROVIDER_KEY: 'unused-key' },
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/provider displaydev-self/i);
    expect(stub.requests).toHaveLength(0);
  });

  it('rejects an empty API key environment variable before making a request', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-api-key-env',
      'OD_TEST_DISPLAYDEV_MISSING_API_KEY',
      '--daemon-url',
      stub.baseUrl,
    ], {
      env: { OD_TEST_DISPLAYDEV_MISSING_API_KEY: '   ' },
    });

    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('OD_TEST_DISPLAYDEV_MISSING_API_KEY');
    expect(stub.requests).toHaveLength(0);
  });

  it('keeps workspace headers on the display.dev deploy request', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-api-key-env',
      'OD_TEST_DISPLAYDEV_WORKSPACE_API_KEY',
      '--workspace',
      'workspace-a',
      '--workspace-member',
      'member-a',
      '--daemon-url',
      stub.baseUrl,
    ], {
      env: { OD_TEST_DISPLAYDEV_WORKSPACE_API_KEY: 'workspace-key' },
    });

    expect(result.code).toBe(0);
    expect(stub.requests).toHaveLength(1);
    for (const request of stub.requests) {
      expect(request.headers).toMatchObject({
        'x-od-workspace-id': 'workspace-a',
        'x-od-workspace-member-id': 'member-a',
      });
    }
  });

  it('warns on stderr when authenticated access settings cannot be hydrated', async () => {
    const response = {
      ...STUB_DEPLOYMENT,
      providerId: 'displaydev-self',
      displayDev: {
        mode: 'authenticated',
        shortId: 'authenticated-1',
        accessSettingsMissing: true,
      },
    };
    stub.setResponder(() => ({ status: 200, body: response }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--json',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toMatch(/warning:.*access settings could not be loaded/i);
    expect(result.stdout).toBe(`${JSON.stringify(response)}\n`);
    expect(JSON.parse(result.stdout)).toEqual(response);
  });

  it('prints the claim URL for an anonymous display.dev publish', async () => {
    stub.setResponder(() => ({
      status: 200,
      body: {
        ...STUB_DEPLOYMENT,
        providerId: 'displaydev-self',
        displayDev: {
          mode: 'anonymous',
          shortId: 'anonymous-1',
          claimUrl: 'https://app.display.dev/claim?code=claim-1',
          expiresAt: '2026-09-25T00:00:00.000Z',
        },
      },
    }));

    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Claim URL → https://app.display.dev/claim?code=claim-1');
    expect(result.stdout).toContain('Expires → 2026-09-25T00:00:00.000Z');
  });

  it('rejects an invalid display.dev visibility before making a request', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--provider',
      'displaydev-self',
      '--displaydev-visibility',
      'publik',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/displaydev-visibility/i);
    expect(stub.requests).toHaveLength(0);
  });

  // Default provider is vercel-self when --provider is omitted
  it('defaults to providerId=vercel-self when --provider is not given', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--file',
      'index.html',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).toBe(0);
    const body = JSON.parse(stub.requests[0]!.body);
    expect(body.providerId).toBe('vercel-self');
  });

  // Missing required --file flag → CLI should reject locally without HTTP
  it('exits non-zero and emits no HTTP request when --file is missing', async () => {
    const result = await runCli([
      'deploy',
      'proj-1',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(stub.requests).toHaveLength(0);
    expect(result.stderr).toMatch(/--file/i);
  });

  // Missing positional projectId → CLI should reject locally without HTTP
  it('exits non-zero and emits no HTTP request when projectId is missing', async () => {
    const result = await runCli([
      'deploy',
      '--file',
      'index.html',
      '--daemon-url',
      stub.baseUrl,
    ]);

    expect(result.code).not.toBe(0);
    expect(stub.requests).toHaveLength(0);
  });
});
