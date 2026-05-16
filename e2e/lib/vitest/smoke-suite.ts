import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { expect } from 'vitest';

import { assertRelativeReportPath, createReport, type E2eReport } from './report.ts';
import type {
  ToolsDevCheckResult,
  ToolsDevLogResult,
  ToolsDevRuntime,
  ToolsDevStartResult,
  ToolsDevStatusResult,
} from './tools-dev.ts';

export type SmokeSuite = {
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
  toolsDev: (
    run: (context: ToolsDevSuiteContext) => Promise<void>,
    options?: ToolsDevSuiteOptions,
  ) => Promise<string>;
};

export type ToolsDevSuiteContext = {
  check: () => Promise<ToolsDevCheckResult>;
  logs: () => Promise<Record<string, ToolsDevLogResult>>;
  runtime: ToolsDevRuntime;
  start: ToolsDevStartResult;
  status: ToolsDevStatusResult;
  webUrl: string;
};

export type ToolsDevSuiteOptions = {
  onFailure?: (input: {
    context: ToolsDevSuiteContext | null;
    error: unknown;
    suite: SmokeSuite;
  }) => Promise<void>;
  skipFatalLogCheck?: boolean;
};

const e2eRoot = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const workspaceRoot = dirname(e2eRoot);

export function e2eWorkspaceRoot(): string {
  return workspaceRoot;
}

export async function createSmokeSuite(name: string): Promise<SmokeSuite> {
  const namespace = `e2e-${sanitizeSegment(name)}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const root = join(workspaceRoot, '.tmp', 'e2e', namespace);
  const reportDir = join(root, 'report');
  const scratchDir = join(root, 'scratch');
  const codexHomeDir = join(scratchDir, 'codex-home');
  const toolsDevRoot = join(scratchDir, 'tools-dev');
  const dataDir = join(scratchDir, 'data');

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
    codexHomeDir,
    dataDir,
    namespace,
    report,
    root,
    scratchDir,
    toolsDevRoot,
    with: {
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

async function runToolsDevSuite(
  suite: SmokeSuite,
  run: (context: ToolsDevSuiteContext) => Promise<void>,
  options: ToolsDevSuiteOptions = {},
): Promise<string> {
  const toolsDev = await import('./tools-dev.ts');
  const runtime = await toolsDev.allocateToolsDevRuntime();
  let context: ToolsDevSuiteContext | null = null;
  let diagnostics: unknown = null;
  let caughtError: unknown = null;
  let success = false;

  try {
    const start = await toolsDev.startToolsDevWeb(suite, runtime);
    const webUrl = assertRuntimeUrl(start.web?.status.url, 'web');
    const status = await toolsDev.inspectToolsDevStatus(suite);
    assertToolsDevStatus(suite, status);

    context = {
      check: () => toolsDev.inspectToolsDevCheck(suite),
      logs: () => toolsDev.readToolsDevLogs(suite),
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
    diagnostics = await toolsDev.inspectToolsDevCheck(suite).catch((diagnosticError: unknown) => ({
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
    // startToolsDevWeb may have spawned namespace processes even if it threw before
    // resolving, so cleanup must run unconditionally — otherwise orphans poison the
    // next smoke run on a shared CI runner.
    let stopError: unknown = null;
    try {
      await toolsDev.stopToolsDevWeb(suite);
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
