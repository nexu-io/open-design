import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { delimiter, dirname, join } from 'node:path';

import { expect } from 'vitest';

import {
  createToolsDevSuite,
  e2eWorkspaceRoot as resolveE2eWorkspaceRoot,
} from '../tools-dev/runtime.ts';
import type {
  ToolsDevCheckResult,
  ToolsDevLogResult,
  ToolsDevPortAllocation,
  ToolsDevStartResult,
  ToolsDevStatusResult,
} from '../tools-dev/types.ts';
import { assertRelativeReportPath, createReport, type E2eReport } from './report.ts';

export { e2eWorkspaceRoot } from '../tools-dev/runtime.ts';

export type SmokeSuite = {
  amr: SmokeSuiteAmr;
  codexHomeDir: string;
  dataDir: string;
  namespace: string;
  report: E2eReport;
  root: string;
  scratchDir: string;
  toolsDevRoot: string;
  with: SmokeSuiteWith;
  writeScratchJson: (name: string, value: unknown) => Promise<string>;
  finalize: (result: SmokeSuiteFinalizeInput) => Promise<string>;
};

export type SmokeSuiteFinalizeInput = {
  diagnostics?: unknown;
  error?: unknown;
  success: boolean;
};

export type SmokeSuiteWith = {
  env: <T>(patch: EnvPatch, run: () => Promise<T>) => Promise<T>;
  pathEntry: <T>(entry: string, run: () => Promise<T>) => Promise<T>;
  toolsDev: (
    run: (context: ToolsDevSuiteContext) => Promise<void>,
    options?: ToolsDevSuiteOptions,
  ) => Promise<string>;
};

export type EnvPatch = Record<string, string | null | undefined>;

export type SmokeSuiteAmr = {
  apiUrl: string;
  linkUrl: string;
  runtimeEnv: (overrides?: EnvPatch) => Record<string, string>;
};

export type ToolsDevSuiteContext = {
  check: () => Promise<ToolsDevCheckResult>;
  logs: () => Promise<Record<string, ToolsDevLogResult>>;
  runtime: ToolsDevPortAllocation;
  start: ToolsDevStartResult;
  status: ToolsDevStatusResult;
  webUrl: string;
};

export type ToolsDevSuiteOptions = {
  env?: Record<string, string | undefined>;
  onFailure?: (input: {
    context: ToolsDevSuiteContext | null;
    error: unknown;
    suite: SmokeSuite;
  }) => Promise<void>;
  skipFatalLogCheck?: boolean;
};

const workspaceRoot = resolveE2eWorkspaceRoot();

export async function createSmokeSuite(name: string): Promise<SmokeSuite> {
  const namespace = `e2e-${sanitizeSegment(name)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const root = join(workspaceRoot, '.tmp', 'e2e', namespace);
  const reportDir = join(root, 'report');
  const scratchDir = join(root, 'scratch');
  const codexHomeDir = join(scratchDir, 'codex-home');
  const toolsDevRoot = join(scratchDir, 'tools-dev');
  const dataDir = join(scratchDir, 'data');
  const [amrApiPort, amrLinkPort] = await allocateDistinctPorts(2);

  await mkdir(reportDir, { recursive: true });
  await mkdir(scratchDir, { recursive: true });
  const report = await createReport(reportDir);

  async function writeJson(baseDir: string, name: string, value: unknown): Promise<string> {
    const safeName = assertRelativeReportPath(name);
    const outputPath = join(baseDir, safeName);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
    return outputPath;
  }

  const suite: SmokeSuite = {
    amr: {
      apiUrl: `http://127.0.0.1:${amrApiPort}`,
      linkUrl: `http://127.0.0.1:${amrLinkPort}`,
      runtimeEnv(overrides = {}) {
        return normalizeDefinedEnv({
          VELA_API_URL: `http://127.0.0.1:${amrApiPort}`,
          VELA_LINK_URL: `http://127.0.0.1:${amrLinkPort}`,
          VELA_RUNTIME_KEY: 'fake-runtime-key',
          ...overrides,
        });
      },
    },
    codexHomeDir,
    dataDir,
    namespace,
    report,
    root,
    scratchDir,
    toolsDevRoot,
    with: {
      env: withEnv,
      pathEntry: (entry, run) => withEnv({ PATH: prependPathEntry(entry, process.env.PATH) }, run),
      toolsDev: (run, options) => runToolsDevSuite(suite, run, options),
    },
    writeScratchJson: (name, value) => writeJson(scratchDir, name, value),
    async finalize(result) {
      await report.json('suite-result.json', {
        namespace,
        reportPath: report.root,
        root,
        status: result.success ? 'success' : 'failed',
        timestamp: new Date().toISOString(),
      });

      if (result.success) {
        await rm(scratchDir, { force: true, recursive: true });
        return report.root;
      }

      await report.json('failure/preserved-site.json', {
        diagnostics: result.diagnostics ?? null,
        error: formatUnknown(result.error),
        preservedScratchDir: scratchDir,
      });
      return report.root;
    },
  };
  return suite;
}

async function allocateDistinctPorts(count: number): Promise<number[]> {
  const ports = new Set<number>();
  while (ports.size < count) {
    ports.add(await reserveFreePort());
  }
  return [...ports];
}

async function reserveFreePort(): Promise<number> {
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

export type PackagedSmokePlatform = 'linux' | 'mac' | 'win';

export function resolvePackagedSmokeNamespace(
  platform: PackagedSmokePlatform,
  env: Record<string, string | undefined> = process.env,
): string {
  if (env.OD_PACKAGED_E2E_NAMESPACE != null && env.OD_PACKAGED_E2E_NAMESPACE.trim() !== '') {
    return env.OD_PACKAGED_E2E_NAMESPACE;
  }
  switch (platform) {
    case 'linux':
      return 'ci-pr-linux';
    case 'mac':
      return 'release-beta';
    case 'win':
      return 'release-beta-win';
  }
}

async function withEnv<T>(patch: EnvPatch, run: () => Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
  }
  applyEnvPatch(process.env, patch);
  try {
    return await run();
  } finally {
    const restorePatch: EnvPatch = {};
    for (const [key, value] of previous) {
      restorePatch[key] = value;
    }
    applyEnvPatch(process.env, restorePatch);
  }
}

function applyEnvPatch(target: NodeJS.ProcessEnv, patch: EnvPatch): void {
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) delete target[key];
    else target[key] = value;
  }
}

function prependPathEntry(entry: string, currentPath: string | undefined): string {
  return currentPath == null || currentPath === ''
    ? entry
    : `${entry}${delimiter}${currentPath}`;
}

function normalizeDefinedEnv(patch: EnvPatch): Record<string, string> {
  return Object.fromEntries(
    Object.entries(patch).filter((entry): entry is [string, string] => entry[1] != null),
  );
}

async function runToolsDevSuite(
  suite: SmokeSuite,
  run: (context: ToolsDevSuiteContext) => Promise<void>,
  options: ToolsDevSuiteOptions = {},
): Promise<string> {
  const toolsDev = createToolsDevSuite({
    codexHomeDir: suite.codexHomeDir,
    dataDir: suite.dataDir,
    namespace: suite.namespace,
    root: suite.root,
    toolsDevRoot: suite.toolsDevRoot,
  });
  let context: ToolsDevSuiteContext | null = null;
  let diagnostics: unknown = null;
  let caughtError: unknown = null;
  let success = false;

  try {
    const start = await toolsDev.startWeb(options.env);
    const runtime = toolsDev.portAllocation;
    if (runtime == null) throw new Error('tools-dev did not expose its allocated ports');
    const webUrl = assertRuntimeUrl(start.web?.status.url, 'web');
    const status = await toolsDev.status(options.env);
    assertToolsDevStatus(suite, status);

    context = {
      check: () => toolsDev.check(options.env),
      logs: () => toolsDev.logs(options.env),
      runtime,
      start,
      status,
      webUrl,
    };

    await run(context);
    if (options.skipFatalLogCheck !== true) {
      assertNoFatalLogs(await context.logs());
    }
    success = true;
  } catch (error) {
    caughtError = error;
    diagnostics = await toolsDev.check(options.env).catch((diagnosticError: unknown) => ({
      error: diagnosticError instanceof Error ? diagnosticError.message : String(diagnosticError),
    }));
    await options.onFailure?.({ context, error, suite }).catch((failureHookError: unknown) => {
      diagnostics = {
        diagnostics,
        failureHookError: failureHookError instanceof Error ? failureHookError.message : String(failureHookError),
      };
    });
    throw error;
  } finally {
    // tools-dev may have spawned namespace processes even if startWeb threw before
    // resolving, so cleanup must run unconditionally — otherwise orphans poison the
    // next smoke run on a shared CI runner.
    let stopError: unknown = null;
    try {
      await toolsDev.stopWeb(options.env);
    } catch (error) {
      stopError = error;
    }
    if (stopError != null) {
      diagnostics = {
        diagnostics,
        stopError: stopError instanceof Error ? stopError.message : String(stopError),
      };
      // If the test body already failed, the catch block rethrew it; treat the stop
      // failure as a side effect. If the body succeeded, the stop failure is the
      // test failure — silent leaks are worse than a noisy assertion.
      if (caughtError == null) {
        success = false;
        caughtError = stopError;
      }
    }
    await suite.finalize({ diagnostics, error: caughtError, success });
    if (stopError != null && caughtError === stopError) {
      throw stopError;
    }
  }
  return suite.report.root;
}

function assertRuntimeUrl(value: string | null | undefined, app: string): string {
  if (typeof value !== 'string' || !value.startsWith('http://')) {
    throw new Error(`${app} runtime did not expose an http URL: ${String(value)}`);
  }
  return value;
}

function assertToolsDevStatus(suite: SmokeSuite, status: ToolsDevStatusResult): void {
  expect(status.namespace).toBe(suite.namespace);
  expect(status.apps?.daemon?.state).toBe('running');
  expect(status.apps?.web?.state).toBe('running');
}

function assertNoFatalLogs(logs: Record<string, { lines: string[] }>): void {
  const combined = Object.values(logs)
    .flatMap((entry) => entry.lines)
    .join('\n');
  expect(combined).not.toMatch(/ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING/);
  expect(combined).not.toMatch(/standalone Next\.js server exited/i);
  expect(combined).not.toMatch(/packaged runtime failed/i);
  expect(combined).not.toMatch(/Agent completed without producing any output/i);
}

function sanitizeSegment(value: string): string {
  const safe = value.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return safe || 'suite';
}

function formatUnknown(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Error) {
    return value.stack ?? value.message;
  }
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
