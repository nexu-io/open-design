import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { resolveSidecarClientEndpoint, type SidecarStamp } from '@open-design/sidecar';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ensureMcpDaemonUrl, type McpDaemonBootstrapPlan } from '../../../apps/daemon/src/mcp-bootstrap.js';
import { managedMcpRegistrationEnv } from '../../../apps/daemon/src/mcp-managed-registration.js';
import { buildMcpInstallPayload } from '../../../apps/daemon/src/mcp-install-info.js';

afterEach(() => vi.useRealTimers());

describe('Windows packaged MCP registration', () => {
  it.each(['runtime', 'headless'])('connects across modes with a snippet registered in %s mode', async (mode) => {
    // Load this app under its own type boundary, as the packaged launcher
    // integration tests do; e2e uses stricter compiler flags than packaged.
    const { resolvePackagedMcpBootstrapLaunch } = await import(
      new URL('../../../apps/packaged/src/headless-runtime.ts', import.meta.url).href
    ) as {
      resolvePackagedMcpBootstrapLaunch(options: {
        currentExecutablePath: string;
        installedLaunchPath: string;
        platform: NodeJS.Platform;
        managed?: boolean;
      }): { command: string; args: string[] };
    };
    vi.useFakeTimers({ toFake: ['Date'] });
    const stamp: SidecarStamp = {
      app: 'daemon', channel: 'stable', namespace: `mcp-${randomUUID()}`, source: 'packaged', mode,
    };
    const bootstrap = resolvePackagedMcpBootstrapLaunch({
      currentExecutablePath: process.execPath,
      installedLaunchPath: process.execPath,
      platform: 'win32',
      // The GUI passes false; the separate headless entry omits this option.
      ...(mode === 'runtime' ? { managed: false } : {}),
    });
    const bootstrapEnv = {
      OD_MCP_BOOTSTRAP_COMMAND: bootstrap.command,
      OD_MCP_BOOTSTRAP_ARGS: JSON.stringify(bootstrap.args),
    };
    const payload = buildMcpInstallPayload({
      cliPath: join(tmpdir(), 'od-cli.js'), cliExists: true,
      execPath: process.execPath, nodeExists: true, port: 7456,
      platform: 'win32', dataDir: join(tmpdir(), stamp.namespace),
      electronAsNode: true, isSidecarMode: true,
      sidecarEnv: {
        ...bootstrapEnv,
        OD_SIDECAR_CLIENT_ENDPOINT: resolveSidecarClientEndpoint(stamp),
        ...managedMcpRegistrationEnv(bootstrapEnv, () => stamp),
      },
    });
    let activeMode: string | null = null;
    let daemonUrl = 'http://127.0.0.1:51000';
    const spawnBootstrap = vi.fn(async (_plan: Extract<McpDaemonBootstrapPlan, { action: 'spawn' }>) => {
      activeMode = 'headless';
    });
    const statusAtEndpoint = vi.fn(async (endpoint: string) => (
      activeMode != null && endpoint === resolveSidecarClientEndpoint({ ...stamp, mode: activeMode })
        ? { state: 'running', url: daemonUrl } as never
        : null
    ));
    const connect = () => ensureMcpDaemonUrl({
      env: payload.env,
      timeoutMs: 1_000,
      probeDaemon: async (url) => url === daemonUrl,
      spawnBootstrap,
      statusAtEndpoint,
      // The legacy path only knows the endpoint of the registering mode.
      discoverTargetDaemonUrl: async () => activeMode === mode ? daemonUrl : null,
      sleep: async (ms) => { vi.setSystemTime(Date.now() + ms); },
    });

    // The same install payload feeds Settings snippets and one-click installation.
    expect(payload.args).not.toContain('--daemon-url');
    await expect(connect()).resolves.toBe(daemonUrl);
    await expect(connect()).resolves.toBe(daemonUrl);
    expect(spawnBootstrap).toHaveBeenCalledTimes(1);
    expect(spawnBootstrap.mock.calls[0]?.[0].env).not.toHaveProperty('ELECTRON_RUN_AS_NODE');
    expect(spawnBootstrap.mock.calls[0]?.[0].env).not.toHaveProperty('OD_SIDECAR_CLIENT_ENDPOINT');

    // Opening the GUI replaces the Windows headless owner. A new MCP session
    // must discover that owner without launching another background runtime.
    activeMode = 'runtime';
    daemonUrl = 'http://127.0.0.1:51001';
    await expect(connect()).resolves.toBe(daemonUrl);
    expect(spawnBootstrap).toHaveBeenCalledTimes(1);
  });
});
