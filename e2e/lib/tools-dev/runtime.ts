import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isToolsDevPortConflict,
  runToolsDevJson,
  type RunToolsDevJsonOptions,
} from './cli.ts';
import { allocateToolsDevPorts } from './ports.ts';
import type {
  ToolsDevCheckResult,
  ToolsDevLogResult,
  ToolsDevPortAllocation,
  ToolsDevStartResult,
  ToolsDevStatusResult,
  ToolsDevSuite,
  ToolsDevSuiteSpec,
} from './types.ts';

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspaceRoot = dirname(e2eRoot);
const TOOLS_DEV_START_TIMEOUT_MS = 180_000;
const TOOLS_DEV_STOP_TIMEOUT_MS = 30_000;

type RunToolsDevJson = <T>(
  workspaceRoot: string,
  suite: ToolsDevSuiteSpec,
  args: string[],
  extraEnv?: Record<string, string | undefined>,
  options?: RunToolsDevJsonOptions,
) => Promise<T>;

export type ToolsDevRuntimeDependencies = {
  allocatePorts: typeof allocateToolsDevPorts;
  runJson: RunToolsDevJson;
};

export function e2eWorkspaceRoot(): string {
  return workspaceRoot;
}

export function createToolsDevSuite(
  spec: ToolsDevSuiteSpec,
  dependencies: Partial<ToolsDevRuntimeDependencies> = {},
): ToolsDevSuite {
  const allocatePorts = dependencies.allocatePorts ?? allocateToolsDevPorts;
  const runJson = dependencies.runJson ?? runToolsDevJson;
  let currentPortAllocation: ToolsDevPortAllocation | null = null;
  let currentDaemonUrl: string | null = null;
  let currentWebUrl: string | null = null;

  async function command<T>(
    args: string[],
    env?: Record<string, string | undefined>,
    options?: RunToolsDevJsonOptions,
  ): Promise<T> {
    return await runJson<T>(workspaceRoot, spec, args, env, options);
  }

  async function startWeb(env: Record<string, string | undefined> = {}): Promise<ToolsDevStartResult> {
    if (spec.ownerPid != null) {
      // A Playwright replacement worker reuses the same logical parallel slot.
      // Clear any previous incarnation before allocating ports or starting new
      // processes so the declared worker count remains a hard runtime bound.
      await stopWeb(env);
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      currentPortAllocation = await allocatePorts();
      try {
        // Keep both ports reserved until immediately before tools-dev starts so
        // parallel workers do not race each other for the same "free" port.
        await currentPortAllocation.release();
        const args = [
          'start',
          'web',
          '--namespace',
          spec.namespace,
          '--tools-dev-root',
          spec.toolsDevRoot,
          '--daemon-port',
          String(currentPortAllocation.daemonPort),
          '--web-port',
          String(currentPortAllocation.webPort),
          '--json',
        ];
        if (spec.ownerPid != null) {
          args.push('--parent-pid', String(spec.ownerPid));
        }
        const result = await command<ToolsDevStartResult>(args, env, {
          timeoutMs: TOOLS_DEV_START_TIMEOUT_MS,
        });
        currentDaemonUrl = assertRuntimeUrl(result.daemon?.status.url, 'daemon');
        currentWebUrl = assertRuntimeUrl(result.web?.status.url, 'web');
        return result;
      } catch (error) {
        lastError = error;
        if (attempt === 3 || !isToolsDevPortConflict(error)) throw error;
        await stopWeb(env).catch(() => {});
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  async function stopWeb(env: Record<string, string | undefined> = {}): Promise<unknown> {
    const result = await command<unknown>(
      [
        'stop',
        'web',
        '--namespace',
        spec.namespace,
        '--tools-dev-root',
        spec.toolsDevRoot,
        '--json',
      ],
      env,
      { timeoutMs: TOOLS_DEV_STOP_TIMEOUT_MS },
    );
    currentDaemonUrl = null;
    currentWebUrl = null;
    return result;
  }

  function requireUrl(value: string | null, app: 'daemon' | 'web'): string {
    if (value == null) throw new Error(`${app} runtime has not started`);
    return value;
  }

  function appendPath(base: string, path = '/'): string {
    const url = new URL(base);
    url.pathname = path.startsWith('/') ? path : `/${path}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  }

  return {
    ...spec,
    get daemonPort() {
      return currentPortAllocation?.daemonPort ?? null;
    },
    get daemonUrl() {
      return currentDaemonUrl;
    },
    get portAllocation() {
      return currentPortAllocation;
    },
    url: {
      api: (path = '/') => appendPath(requireUrl(currentDaemonUrl, 'daemon'), path),
      daemon: (path = '/') => appendPath(requireUrl(currentDaemonUrl, 'daemon'), path),
      web: (path = '/') => appendPath(requireUrl(currentWebUrl, 'web'), path),
    },
    get webPort() {
      return currentPortAllocation?.webPort ?? null;
    },
    get webUrl() {
      return currentWebUrl;
    },
    check: (env) =>
      command<ToolsDevCheckResult>(
        ['check', '--namespace', spec.namespace, '--tools-dev-root', spec.toolsDevRoot, '--json'],
        env,
      ),
    logs: (env) =>
      command<Record<string, ToolsDevLogResult>>(
        ['logs', '--namespace', spec.namespace, '--tools-dev-root', spec.toolsDevRoot, '--json'],
        env,
      ),
    startWeb,
    status: (env) =>
      command<ToolsDevStatusResult>(
        ['status', '--namespace', spec.namespace, '--tools-dev-root', spec.toolsDevRoot, '--json'],
        env,
      ),
    stopWeb,
  };
}

function assertRuntimeUrl(value: string | null | undefined, app: string): string {
  if (typeof value !== 'string' || !value.startsWith('http://')) {
    throw new Error(`${app} runtime did not expose status URL: ${String(value)}`);
  }
  return value;
}
