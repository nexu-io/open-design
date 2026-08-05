import { describe, expect, it } from 'vitest';
import { runMcp, type McpCliDeps } from '../src/mcp/cli.js';

function makeDeps(overrides: Partial<McpCliDeps> = {}): McpCliDeps {
  return {
    resolveDaemonUrl: async () => 'http://127.0.0.1:7456/',
    runMcpStdio: async () => undefined,
    writeStderr: () => undefined,
    printHelp: () => undefined,
    exit: (code) => { throw new Error(`exit ${code}`); },
    ...overrides,
  };
}

describe('mcp CLI', () => {
  it('resolves the daemon URL and starts the stdio server', async () => {
    let resolvedFlags;
    let serverInput;
    await runMcp(['--daemon-url', 'http://example.test:7456/'], makeDeps({
      resolveDaemonUrl: async (flags) => {
        resolvedFlags = flags;
        return 'http://example.test:7456/';
      },
      runMcpStdio: async (input) => { serverInput = input; },
    }));

    expect(resolvedFlags).toEqual({ 'daemon-url': 'http://example.test:7456/' });
    expect(serverInput).toEqual({ daemonUrl: 'http://example.test:7456/' });
  });

  it('prints help without resolving or starting the server', async () => {
    let helpCalls = 0;
    let resolveCalls = 0;
    let serverCalls = 0;
    await runMcp(['--help'], makeDeps({
      resolveDaemonUrl: async () => { resolveCalls++; return ''; },
      runMcpStdio: async () => { serverCalls++; },
      printHelp: () => { helpCalls++; },
    }));

    expect(helpCalls).toBe(1);
    expect(resolveCalls).toBe(0);
    expect(serverCalls).toBe(0);
  });

  it('rejects unknown flags with a usage error', async () => {
    const errors: string[] = [];
    await expect(runMcp(['--typo'], makeDeps({
      writeStderr: (text) => errors.push(text),
    }))).rejects.toThrow('exit 2');

    expect(errors[0]).toContain('unknown flag: --typo');
  });
});
