import express from 'express';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { writeAppConfig } from '../src/app-config.js';
import { setCodexRunner, type CodexRunner } from '../src/codex-cli.js';
import { registerMcpRoutes, type RegisterMcpRoutesDeps } from '../src/mcp-routes.js';

// #5734: the one-click "Install in Codex" flow starts its own `codex`
// process. It must run that process with the Codex settings saved in
// Settings (executable path, CODEX_HOME), the same env the agent runtime
// spawns Codex with. Without them it resolves whatever `codex` is first on
// PATH — on Windows that can be a broken version-manager shim — and
// registers the MCP server in a different config.toml than the agent reads.

interface RecordedCall {
  args: string[];
  env?: Record<string, string>;
}

let dataDir: string;
let server: Server;
let baseUrl: string;
let calls: RecordedCall[];

beforeEach(async () => {
  dataDir = mkdtempSync(path.join(os.tmpdir(), 'od-mcp-codex-routes-'));
  // computeInstallPayload refuses to install unless the `od` CLI entry exists.
  const odBin = path.join(dataDir, 'od-cli.js');
  writeFileSync(odBin, '');
  calls = [];
  const runner: CodexRunner = {
    async run(args, opts) {
      calls.push(opts?.env ? { args, env: opts.env } : { args });
      return { exitCode: 0, stdout: '', stderr: '' };
    },
  };
  setCodexRunner(runner);

  const app = express();
  registerMcpRoutes(app, {
    http: {
      isLocalSameOrigin: () => true,
      resolvedPortRef: { current: 7456 },
      sendApiError: (res: express.Response, status: number, code: string, message: string) =>
        res.status(status).json({ error: { code, message } }),
    },
    paths: { OD_BIN: odBin, RUNTIME_DATA_DIR: dataDir, PROJECTS_DIR: path.join(dataDir, 'projects') },
    mcp: {
      pendingAuth: new Map(),
      daemonUrlRef: { current: 'http://127.0.0.1:7456' },
      inheritedEnvironment: () => ({}),
    },
  } as unknown as RegisterMcpRoutesDeps);
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  setCodexRunner(null);
  await new Promise<void>((resolve) => server.close(() => resolve()));
  rmSync(dataDir, { recursive: true, force: true });
});

function codexSettings(): Record<string, string> {
  return {
    CODEX_BIN: path.join(dataDir, 'tools', 'codex', 'codex.cmd'),
    CODEX_HOME: path.join(dataDir, 'codex-home'),
  };
}

describe('Install in Codex routes use the Codex settings from Settings (#5734)', () => {
  it('registers the MCP server through the configured Codex executable and home', async () => {
    await writeAppConfig(dataDir, { agentCliEnv: { codex: codexSettings() } });

    const resp = await fetch(`${baseUrl}/api/mcp/install/codex`, { method: 'POST' });

    expect(resp.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.args.slice(0, 3)).toEqual(['mcp', 'add', 'open-design']);
    expect(calls[0]!.env).toEqual(codexSettings());
  });

  it('probes the install status through the configured Codex executable and home', async () => {
    await writeAppConfig(dataDir, { agentCliEnv: { codex: codexSettings() } });

    const resp = await fetch(`${baseUrl}/api/mcp/install/codex/status`);

    expect(resp.status).toBe(200);
    expect(calls).toEqual([{ args: ['mcp', 'get', 'open-design'], env: codexSettings() }]);
  });

  it('uninstalls through the configured Codex executable and home', async () => {
    await writeAppConfig(dataDir, { agentCliEnv: { codex: codexSettings() } });

    const resp = await fetch(`${baseUrl}/api/mcp/install/codex`, { method: 'DELETE' });

    expect(resp.status).toBe(200);
    expect(calls).toEqual([{ args: ['mcp', 'remove', 'open-design'], env: codexSettings() }]);
  });

  it('keeps running the PATH-resolved codex when no Codex settings are saved', async () => {
    const resp = await fetch(`${baseUrl}/api/mcp/install/codex`, { method: 'POST' });

    expect(resp.status).toBe(200);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.env).toBeUndefined();
  });
});
