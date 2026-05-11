import { execFile } from 'node:child_process';
import { createServer } from 'node:net';
import { promisify } from 'node:util';

import { e2eWorkspaceRoot, type SmokeSuite } from './smoke-suite.ts';

const execFileAsync = promisify(execFile);

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
  webPort: number;
};

export async function allocateToolsDevRuntime(): Promise<ToolsDevRuntime> {
  const [daemonPort, webPort] = await Promise.all([findFreePort(), findFreePort()]);
  if (daemonPort === webPort) return await allocateToolsDevRuntime();
  return { daemonPort, webPort };
}

export async function startToolsDevWeb(suite: SmokeSuite, runtime: ToolsDevRuntime): Promise<ToolsDevStartResult> {
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
  );
}

export async function stopToolsDevWeb(suite: SmokeSuite): Promise<unknown> {
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
  );
}

export async function inspectToolsDevStatus(suite: SmokeSuite): Promise<ToolsDevStatusResult> {
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
  );
}

export async function inspectToolsDevCheck(suite: SmokeSuite): Promise<ToolsDevCheckResult> {
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
  );
}

export async function readToolsDevLogs(suite: SmokeSuite): Promise<Record<string, ToolsDevLogResult>> {
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
  );
}

async function runToolsDevJson<T>(suite: SmokeSuite, args: string[]): Promise<T> {
  const { stdout } = await execFileAsync('pnpm', ['tools-dev', ...args], {
    cwd: e2eWorkspaceRoot(),
    env: {
      ...process.env,
      CODEX_HOME: suite.codexHomeDir,
      OD_DATA_DIR: suite.dataDir,
      OD_MEDIA_CONFIG_DIR: suite.dataDir,
    },
    maxBuffer: 20 * 1024 * 1024,
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

async function findFreePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(0, '127.0.0.1', () => resolveListen());
  });
  const address = server.address();
  await new Promise<void>((resolveClose, rejectClose) => {
    server.close((error) => (error == null ? resolveClose() : rejectClose(error)));
  });
  if (address == null || typeof address === 'string') {
    throw new Error('failed to allocate a local TCP port');
  }
  return address.port;
}
