import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { extname } from 'node:path';
import { promisify } from 'node:util';

import { e2eWorkspaceRoot, type SmokeSuite } from './smoke-suite.ts';

const execFileAsync = promisify(execFile);
const pnpmCommand = process.env.OD_E2E_PNPM_COMMAND ?? 'pnpm';
const pnpmExecPath = process.env.npm_execpath;
const nodeLoadablePackageManagerExtensions = new Set(['.js', '.cjs', '.mjs']);

export type ToolsDevAppStatus = {
  pid?: number;
  state?: string;
  title?: string | null;
  updatedAt?: string;
  url?: string | null;
  windowVisible?: boolean;
};

export type ToolsDevStartResult = {
  daemon?: {
    app: 'daemon';
    created: boolean;
    logPath: string;
    pid?: number;
    status: ToolsDevAppStatus;
  };
  web?: {
    app: 'web';
    created: boolean;
    logPath: string;
    pid?: number;
    status: ToolsDevAppStatus;
  };
};

export type ToolsDevStatusResult = {
  apps?: Record<string, ToolsDevAppStatus | null>;
  namespace?: string;
  status?: string;
};

export type ToolsDevLogResult = {
  lines: string[];
  logPath: string;
};

export type ToolsDevCheckResult = {
  apps?: Record<string, ToolsDevAppStatus | null>;
  diagnostics?: unknown;
  logs?: Record<string, ToolsDevLogResult>;
  namespace?: string;
};

export type ToolsDevRuntime = {
  daemonPort: number;
  release: () => Promise<void>;
  webPort: number;
};

export async function allocateToolsDevRuntime(): Promise<ToolsDevRuntime> {
  const [daemonPort, webPort] = await Promise.all([reserveFreePort(), reserveFreePort()]);
  if (daemonPort.port === webPort.port) {
    await Promise.all([daemonPort.release(), webPort.release()]);
    return await allocateToolsDevRuntime();
  }
  let released = false;
  return {
    daemonPort: daemonPort.port,
    webPort: webPort.port,
    async release() {
      if (released) return;
      released = true;
      await Promise.all([daemonPort.release(), webPort.release()]);
    },
  };
}

export async function startToolsDevWeb(
  suite: SmokeSuite,
  runtime: ToolsDevRuntime,
  env: Record<string, string | undefined> = {},
): Promise<ToolsDevStartResult> {
  // Keep both ports reserved until immediately before tools-dev starts so
  // parallel Vitest workers do not race each other for the same "free" port.
  await runtime.release();
  return await runToolsDevJson<ToolsDevStartResult>(
    suite,
    [
      'start',
      'web',
      '--namespace',
      suite.namespace,
      '--tools-dev-root',
      suite.toolsDevRoot,
      '--daemon-port',
      String(runtime.daemonPort),
      '--web-port',
      String(runtime.webPort),
      '--json',
    ],
    env,
  );
}

export async function stopToolsDevWeb(
  suite: SmokeSuite,
  env: Record<string, string | undefined> = {},
): Promise<unknown> {
  return await runToolsDevJson<unknown>(
    suite,
    [
      'stop',
      'web',
      '--namespace',
      suite.namespace,
      '--tools-dev-root',
      suite.toolsDevRoot,
      '--json',
    ],
    env,
  );
}

export async function inspectToolsDevStatus(
  suite: SmokeSuite,
  env: Record<string, string | undefined> = {},
): Promise<ToolsDevStatusResult> {
  return await runToolsDevJson<ToolsDevStatusResult>(
    suite,
    [
      'status',
      '--namespace',
      suite.namespace,
      '--tools-dev-root',
      suite.toolsDevRoot,
      '--json',
    ],
    env,
  );
}

export async function inspectToolsDevCheck(
  suite: SmokeSuite,
  env: Record<string, string | undefined> = {},
): Promise<ToolsDevCheckResult> {
  return await runToolsDevJson<ToolsDevCheckResult>(
    suite,
    [
      'check',
      '--namespace',
      suite.namespace,
      '--tools-dev-root',
      suite.toolsDevRoot,
      '--json',
    ],
    env,
  );
}

export async function readToolsDevLogs(
  suite: SmokeSuite,
  env: Record<string, string | undefined> = {},
): Promise<Record<string, ToolsDevLogResult>> {
  return await runToolsDevJson<Record<string, ToolsDevLogResult>>(
    suite,
    [
      'logs',
      '--namespace',
      suite.namespace,
      '--tools-dev-root',
      suite.toolsDevRoot,
      '--json',
    ],
    env,
  );
}

export function isToolsDevPortConflict(error: unknown): boolean {
  const text = error instanceof Error
    ? `${error.message}\n${error.stack ?? ''}`
    : String(error);
  return text.includes('EADDRINUSE') ||
    (text.includes('is already running in namespace') && text.includes('stop it or choose another namespace'));
}

async function runToolsDevJson<T>(
  suite: SmokeSuite,
  args: string[],
  extraEnv: Record<string, string | undefined> = {},
): Promise<T> {
  const useNpmExecPathWithNode = process.env.OD_E2E_PNPM_COMMAND == null
    && pnpmExecPath != null
    && nodeLoadablePackageManagerExtensions.has(extname(pnpmExecPath).toLowerCase());
  const command = useNpmExecPathWithNode
    ? process.execPath
    : (process.env.OD_E2E_PNPM_COMMAND == null && pnpmExecPath ? pnpmExecPath : pnpmCommand);
  const commandArgs = useNpmExecPathWithNode
    ? [pnpmExecPath, 'tools-dev', ...args]
    : ['tools-dev', ...args];
  const { stdout } = await execFileAsync(command, commandArgs, {
    cwd: e2eWorkspaceRoot(),
    env: {
      ...process.env,
      ...extraEnv,
      CODEX_HOME: suite.codexHomeDir,
      OD_DATA_DIR: suite.dataDir,
      OD_MEDIA_CONFIG_DIR: suite.dataDir,
    },
    maxBuffer: 20 * 1024 * 1024,
    shell: process.platform === 'win32' && command !== process.execPath,
  });
  return parseJsonOutput<T>(stdout);
}

function parseJsonOutput<T>(stdout: string): T {
  const trimmed = stdout.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T;
  }
  const objectStart = stdout.lastIndexOf('\n{');
  const arrayStart = stdout.lastIndexOf('\n[');
  const jsonStart = Math.max(objectStart, arrayStart);
  if (jsonStart < 0) {
    throw new Error(`Expected JSON output from tools-dev, got: ${stdout}`);
  }
  return JSON.parse(stdout.slice(jsonStart + 1)) as T;
}

async function reserveFreePort(): Promise<{ port: number; release: () => Promise<void> }> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  if (address == null || typeof address === 'string') {
    await new Promise<void>((resolveClose, rejectClose) => {
      server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
    });
    throw new Error('failed to allocate a local TCP port');
  }
  let released = false;
  return {
    port: address.port,
    async release() {
      if (released) return;
      released = true;
      await new Promise<void>((resolveClose, rejectClose) => {
        server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
      });
    },
  };
}
