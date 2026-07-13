import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  installCodexMcp,
  probeCodexInstall,
  setCodexRunner,
  uninstallCodexMcp,
  type CodexRunner,
} from '../src/codex-cli.js';

// One-click "Install to Codex" relies on the bundled `codex` CLI's own
// `codex mcp add/remove/get` subcommands rather than rewriting
// ~/.codex/config.toml ourselves. This file pins the argv we hand it,
// the ENOENT / not-found / installed branches of the probe, and the
// shape of the spec we receive from buildMcpInstallPayload.

interface RecordedCall {
  args: string[];
  env?: Record<string, string>;
}

function makeStubRunner(impl: (call: RecordedCall) => Promise<{ exitCode: number; stdout: string; stderr: string }>): CodexRunner & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const runner = {
    calls,
    async run(args: string[], opts?: { env?: Record<string, string> }) {
      const call: RecordedCall = opts?.env ? { args, env: opts.env } : { args };
      calls.push(call);
      return impl(call);
    },
  };
  return runner;
}

afterEach(() => {
  setCodexRunner(null);
  vi.restoreAllMocks();
});

describe('codex-cli probe', () => {
  it('reports available:false when the codex binary is missing (ENOENT)', async () => {
    const runner = makeStubRunner(async () => {
      const err = new Error('spawn codex ENOENT') as NodeJS.ErrnoException;
      err.code = 'ENOENT';
      throw err;
    });
    setCodexRunner(runner);

    const status = await probeCodexInstall('open-design');
    expect(status).toEqual({ available: false, installed: false });
    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.args).toEqual(['mcp', 'get', 'open-design']);
  });

  it('reports available:true installed:false when `codex mcp get` says no such server', async () => {
    const runner = makeStubRunner(async () => ({
      exitCode: 1,
      stdout: '',
      stderr: "Error: No MCP server named 'open-design' found.\n",
    }));
    setCodexRunner(runner);

    const status = await probeCodexInstall('open-design');
    expect(status).toEqual({ available: true, installed: false });
  });

  it('reports available:true installed:true when `codex mcp get` returns the server entry', async () => {
    const runner = makeStubRunner(async () => ({
      exitCode: 0,
      stdout: 'open-design\n  enabled: true\n  transport: stdio\n',
      stderr: '',
    }));
    setCodexRunner(runner);

    const status = await probeCodexInstall('open-design');
    expect(status).toEqual({ available: true, installed: true });
  });
});

describe('codex-cli install', () => {
  it('shells out `codex mcp add` with --env pairs and -- before the command', async () => {
    const runner = makeStubRunner(async () => ({ exitCode: 0, stdout: "Added global MCP server 'open-design'.\n", stderr: '' }));
    setCodexRunner(runner);

    await installCodexMcp({
      name: 'open-design',
      command: '/path/to/node',
      args: ['/path/to/cli.js', 'mcp'],
      env: { OD_DATA_DIR: '/tmp/od', OD_SIDECAR_IPC_PATH: '/tmp/sock' },
    });

    expect(runner.calls).toHaveLength(1);
    expect(runner.calls[0]?.args).toEqual([
      'mcp',
      'add',
      'open-design',
      '--env',
      'OD_DATA_DIR=/tmp/od',
      '--env',
      'OD_SIDECAR_IPC_PATH=/tmp/sock',
      '--',
      '/path/to/node',
      '/path/to/cli.js',
      'mcp',
    ]);
  });

  it('rejects when codex exits non-zero, surfacing stderr', async () => {
    const runner = makeStubRunner(async () => ({ exitCode: 1, stdout: '', stderr: "Error: 'open-design' already exists\n" }));
    setCodexRunner(runner);

    await expect(
      installCodexMcp({ name: 'open-design', command: 'node', args: ['cli.js', 'mcp'], env: {} }),
    ).rejects.toThrow(/already exists/);
  });

  it('omits the --env block entirely when env is empty', async () => {
    const runner = makeStubRunner(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    setCodexRunner(runner);

    await installCodexMcp({ name: 'open-design', command: '/n', args: ['cli'], env: {} });
    expect(runner.calls[0]?.args).toEqual(['mcp', 'add', 'open-design', '--', '/n', 'cli']);
  });
});

describe('codex-cli uninstall', () => {
  it('shells out `codex mcp remove <name>`', async () => {
    const runner = makeStubRunner(async () => ({ exitCode: 0, stdout: '', stderr: '' }));
    setCodexRunner(runner);

    await uninstallCodexMcp('open-design');
    expect(runner.calls[0]?.args).toEqual(['mcp', 'remove', 'open-design']);
  });

  it('rejects when codex exits non-zero', async () => {
    const runner = makeStubRunner(async () => ({ exitCode: 1, stdout: '', stderr: 'Error: not found\n' }));
    setCodexRunner(runner);
    await expect(uninstallCodexMcp('open-design')).rejects.toThrow(/not found/);
  });
});
