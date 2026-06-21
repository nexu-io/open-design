import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { isToolsDevPortConflict, runToolsDevJson } from './cli.ts';
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

export function e2eWorkspaceRoot(): string {
  return workspaceRoot;
}

export function createToolsDevSuite(spec: ToolsDevSuiteSpec): ToolsDevSuite {
  let currentPortAllocation: ToolsDevPortAllocation | null = null;
  let currentDaemonUrl: string | null = null;
  let currentWebUrl: string | null = null;

  async function command<T>(args: string[], env?: Record<string, string | undefined>): Promise<T> {
    return await runToolsDevJson<T>(workspaceRoot, spec, args, env);
  }

  async function startWeb(env: Record<string, string | undefined> = {}): Promise<ToolsDevStartResult> {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      currentPortAllocation = await allocateToolsDevPorts();
      try {
        // Keep both ports reserved until immediately before tools-dev starts so
        // parallel workers do not race each other for the same "free" port.
        await currentPortAllocation.release();
        const result = await command<ToolsDevStartResult>(
          [
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
          ],
          env,
        );
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
