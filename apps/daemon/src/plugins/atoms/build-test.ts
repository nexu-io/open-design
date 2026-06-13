// Phase 7 entry slice / spec §10 / §22.4 — build-test atom runner.
//
// Spec-side atom contract lives in `plugins/_official/atoms/build-test/SKILL.md`.
// This module is the daemon-side shell-out implementation: given a
// project cwd + an optional command override, run typecheck + test
// commands, write `critique/build-test.json`, and return the
// signals the devloop's `until` evaluator reads
// (`build.passing`, `tests.passing`, plus the legacy `critique.score`).
//
// The runner is intentionally framework-agnostic — it prefers the
// declared override, falls back to scripts inside `package.json`,
// and otherwise emits a `tests: 'skipped'` outcome with an explicit
// reason so the agent doesn't claim success on a project it never
// actually tested.

import path from 'node:path';
import { promises as fsp } from 'node:fs';
import { spawn, type SpawnOptions } from 'node:child_process';
import type { UntilSignals } from '../until.js';

export type BuildTestStatus = 'passing' | 'failing' | 'skipped';

export interface BuildTestCommandResult {
  command:    string;
  exitCode:   number;
  durationMs: number;
  status:     BuildTestStatus;
  // Truncated combined stdout + stderr. Bounded by `logBudgetBytes`.
  log:        string;
  // When status='skipped'; explains why.
  reason?:    string;
}

export interface BuildTestReport {
  build:    BuildTestCommandResult;
  tests:    BuildTestCommandResult;
  // Signals the pipeline runner forwards into the devloop `until` eval.
  signals:  UntilSignals;
  // ISO timestamp of when the run completed.
  endedAt:  string;
}

export interface BuildTestRunOptions {
  // Project cwd. The atom shells out inside this directory; the
  // caller is responsible for staging the imported repo here.
  cwd: string;
  // Explicit overrides (highest priority). Either OR both can be
  // null — the atom skips the matching half cleanly.
  buildCommand?: string | null;
  testCommand?:  string | null;
  // Per-command timeout (ms). Default 5 min.
  timeoutMs?:    number;
  // Cap on how many bytes of combined stdout/stderr we keep per
  // command. Default 1 MiB.
  logBudgetBytes?: number;
  // Pluggable child-process spawner so unit tests don't actually
  // shell out. Production passes node:child_process.spawn.
  spawnFn?: (cmd: string, args: string[], opts: SpawnOptions) => ReturnType<typeof spawn>;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000;
const DEFAULT_LOG_BUDGET = 1 * 1024 * 1024;

export async function runBuildTest(opts: BuildTestRunOptions): Promise<BuildTestReport> {
  const cwd = path.resolve(opts.cwd);
  const inferred = await inferCommands(cwd);
  const buildCmd = opts.buildCommand !== undefined ? opts.buildCommand : inferred.build;
  const testCmd  = opts.testCommand  !== undefined ? opts.testCommand  : inferred.test;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const logBudget = opts.logBudgetBytes ?? DEFAULT_LOG_BUDGET;

  const build = await runCommandOrSkip({
    label: 'build',
    command: buildCmd,
    cwd,
    timeoutMs,
    logBudget,
    spawnFn: opts.spawnFn,
    skipReason: 'no build / typecheck command resolved (set --build-command or add `typecheck` to package.json scripts)',
  });
  const tests = await runCommandOrSkip({
    label: 'tests',
    command: testCmd,
    cwd,
    timeoutMs,
    logBudget,
    spawnFn: opts.spawnFn,
    skipReason: 'no test command resolved (set --test-command or add `test` to package.json scripts)',
  });

  const signals = computeSignals({ build, tests });
  return { build, tests, signals, endedAt: new Date().toISOString() };
}

// Persist the report under the project cwd in the canonical layout the
// SKILL.md fragment locks. Returns the file paths so the caller can
// echo them on the run's SSE stream.
export async function writeBuildTestReport(args: {
  cwd:    string;
  report: BuildTestReport;
}): Promise<{ jsonPath: string; logPath: string }> {
  const dir = path.join(args.cwd, 'critique');
  await fsp.mkdir(dir, { recursive: true });
  const jsonPath = path.join(dir, 'build-test.json');
  const logPath  = path.join(dir, 'build-test.log');
  const json = {
    build:        statusOnly(args.report.build),
    tests:        statusOnly(args.report.tests),
    durationMs:   args.report.build.durationMs + args.report.tests.durationMs,
    commandsRun:  [args.report.build.command, args.report.tests.command].filter(Boolean),
    failures:     [args.report.build, args.report.tests]
                    .filter((c) => c.status === 'failing')
                    .map((c) => ({ command: c.command, exitCode: c.exitCode })),
    endedAt:      args.report.endedAt,
    signals:      args.report.signals,
  };
  await fsp.writeFile(jsonPath, JSON.stringify(json, null, 2) + '\n', 'utf8');
  const logBody = [
    `# build (${args.report.build.status}) — ${args.report.build.command || '<skipped>'}`,
    args.report.build.log,
    '',
    `# tests (${args.report.tests.status}) — ${args.report.tests.command || '<skipped>'}`,
    args.report.tests.log,
  ].join('\n');
  await fsp.writeFile(logPath, logBody, 'utf8');
  return { jsonPath, logPath };
}

interface InferredCommands {
  build: string | null;
  test:  string | null;
}

async function inferCommands(cwd: string): Promise<InferredCommands> {
  try {
    const raw = await fsp.readFile(path.join(cwd, 'package.json'), 'utf8');
    const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
    const scripts = pkg.scripts ?? {};
    const pmRunner = await detectPackageManager(cwd);
    const buildScript = scripts.typecheck ?? scripts.build ?? null;
    const testScript  = scripts.test ?? null;
    return {
      build: buildScript ? `${pmRunner} run ${pickScriptName(scripts, ['typecheck', 'build'])}` : null,
      test:  testScript  ? `${pmRunner} run test`                                                : null,
    };
  } catch {
    return { build: null, test: null };
  }
}

function pickScriptName(scripts: Record<string, string>, preferred: string[]): string {
  for (const name of preferred) if (scripts[name]) return name;
  return preferred[0]!;
}

async function detectPackageManager(cwd: string): Promise<'pnpm' | 'npm' | 'yarn'> {
  if (await pathExists(path.join(cwd, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await pathExists(path.join(cwd, 'yarn.lock')))      return 'yarn';
  return 'npm';
}

async function pathExists(p: string): Promise<boolean> {
  try { await fsp.access(p); return true; } catch { return false; }
}

interface RunCommandArgs {
  label:       'build' | 'tests';
  command:     string | null | undefined;
  cwd:         string;
  timeoutMs:   number;
  logBudget:   number;
  spawnFn:     BuildTestRunOptions['spawnFn'];
  skipReason:  string;
}

async function runCommandOrSkip(args: RunCommandArgs): Promise<BuildTestCommandResult> {
  if (!args.command) {
    return {
      command:    '',
      exitCode:   0,
      durationMs: 0,
      status:     'skipped',
      log:        '',
      reason:     args.skipReason,
    };
  }
  return runShell({
    command:   args.command,
    cwd:       args.cwd,
    timeoutMs: args.timeoutMs,
    logBudget: args.logBudget,
    spawnFn:   args.spawnFn,
  });
}

interface RunShellArgs {
  command:   string;
  cwd:       string;
  timeoutMs: number;
  logBudget: number;
  spawnFn?:  BuildTestRunOptions['spawnFn'];
}

function runShell(args: RunShellArgs): Promise<BuildTestCommandResult> {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const launcher = args.spawnFn ?? spawn;
    const child = launcher('sh', ['-c', args.command], {
      cwd: args.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let buffer = '';
    let truncated = false;
    const onChunk = (chunk: Buffer | string) => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const remaining = args.logBudget - buffer.length;
      if (remaining <= 0) { truncated = true; return; }
      buffer += text.length > remaining ? text.slice(0, remaining) : text;
      if (text.length > remaining) truncated = true;
    };
    child.stdout?.on('data', onChunk);
    child.stderr?.on('data', onChunk);
    const timer = setTimeout(() => {
      try { child.kill('SIGTERM'); } catch { /* already dead */ }
    }, args.timeoutMs);
    timer.unref?.();
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      const exitCode = typeof code === 'number' ? code : (signal ? 124 : 1);
      const status: BuildTestStatus = exitCode === 0 ? 'passing' : 'failing';
      resolve({
        command:    args.command,
        exitCode,
        durationMs: Date.now() - startedAt,
        status,
        log:        truncated ? buffer + '\n…[truncated]' : buffer,
      });
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        command:    args.command,
        exitCode:   1,
        durationMs: Date.now() - startedAt,
        status:     'failing',
        log:        `[spawn-error] ${err.message ?? String(err)}`,
      });
    });
  });
}

function statusOnly(c: BuildTestCommandResult) {
  const out: Record<string, unknown> = {
    command:    c.command,
    status:     c.status,
    exitCode:   c.exitCode,
    durationMs: c.durationMs,
  };
  if (c.reason) out.reason = c.reason;
  return out;
}

function computeSignals({ build, tests }: { build: BuildTestCommandResult; tests: BuildTestCommandResult }): UntilSignals {
  const buildPassing = build.status === 'passing' || build.status === 'skipped';
  const testsPassing = tests.status === 'passing' || tests.status === 'skipped';
  // Legacy critique.score axis: 5 when both pass, 3 when only build
  // passes, 1 otherwise. spec §22.4 says the scoring is meant for
  // pipelines that already read critique.score; new pipelines should
  // read build.passing / tests.passing directly.
  const score = buildPassing && testsPassing ? 5
              : buildPassing                ? 3
              : 1;
  return {
    'build.passing':  buildPassing,
    'tests.passing':  testsPassing,
    'critique.score': score,
  };
}
