import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, open, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { readFundingFixture } from './workspace-funding-fixture.ts';
import { verifyFundingLease, withFundingLease } from './workspace-funding-lease.ts';
import { T } from '../timeouts.ts';

// A real external ownership wall budget, independent of CI's UI wait scaling.
const commandBudgetMs = 600_000;
const cleanupReserveMs = 120_000;

const commonFundingSources = [
  'lib/playwright/assertions.ts',
  'lib/playwright/campaign-dismissals.ts',
  'lib/playwright/funding-runner.ts',
  'lib/playwright/funding.config.ts',
  'lib/playwright/mock-factory.ts',
  'lib/playwright/runtime-identity.ts',
  'lib/playwright/runtime-lifecycle.ts',
  'lib/playwright/suite.ts',
  'lib/playwright/workspace-funding-client.ts',
  'lib/playwright/workspace-funding-fixture.ts',
  'lib/playwright/workspace-funding-lease.ts',
  'lib/playwright/workspace-funding-preflight.ts',
  'lib/timeouts.ts',
  'lib/tools-dev/cli.ts',
  'lib/tools-dev/ports.ts',
  'lib/tools-dev/runtime.ts',
  'lib/tools-dev/types.ts',
  'playwright.config.ts'
] as const;

export function fundingCasePlan(selection?: string) {
  const plans: Record<string, { config: string; sources: readonly string[]; grep?: string }> = {
    '': { config: 'lib/playwright/funding.config.ts', sources: ['ui/workspace-funding-sandbox.test.ts'] },
    bill001: { config: 'lib/playwright/funding.config.ts', sources: ['ui/qa-bill001.private.test.ts'] },
    ws005: { config: 'lib/playwright/workspace-switch.config.ts', sources: [
      'lib/playwright/workspace-switch.config.ts', 'lib/playwright/workspace-switch-fixture.ts',
      'ui/workspace-switch-billing-sandbox.test.ts',
    ] },
    view020: { config: 'lib/playwright/notice.config.ts', sources: [
      'lib/playwright/notice.config.ts', 'lib/playwright/workspace-notice-fixture.ts',
      'ui/workspace-notice-sandbox.test.ts',
    ] },
    view021: { config: 'lib/playwright/free-wallet.config.ts', sources: [
      'lib/playwright/free-wallet.config.ts', 'lib/playwright/workspace-free-wallet-fixture.ts',
      'ui/workspace-free-wallet-sandbox.test.ts',
    ], grep: 'VIEW-021 actual' },
    'view021-after': { config: 'lib/playwright/free-wallet.config.ts', sources: [
      'lib/playwright/free-wallet.config.ts', 'lib/playwright/workspace-free-wallet-fixture.ts',
      'ui/workspace-free-wallet-sandbox.test.ts',
    ], grep: 'VIEW-021 continuation' },
  };
  const filters: Record<string, string> = {
    project: 'VIEW-015 project', home: 'VIEW-015 home', dp: 'VIEW-015 cash0', inflight: 'VIEW-015 existing A task',
    'native-refusal': 'VIEW-015 native funding refusal',
  };
  const key = selection ?? '';
  const plan = Object.hasOwn(plans, key) ? plans[key] : (Object.hasOwn(filters, key)
    ? { config: 'lib/playwright/funding.config.ts', sources: ['ui/workspace-funding-sandbox.test.ts'], grep: filters[key] }
    : undefined);
  if (!plan) throw new Error('Unknown OD_FUNDING_CASE; an explicit supported case selection is required');
  return { ...plan, sources: [...commonFundingSources, ...plan.sources] };
}

export async function recordOdSource(e2eRoot: string, output: string, selection?: string) {
  const plan = fundingCasePlan(selection);
  const exec = promisify(execFile);
  const options = { cwd: dirname(e2eRoot), timeout: T.long, maxBuffer: 16 * 1024 * 1024 };
  const head = await exec('git', ['rev-parse', 'HEAD'], options);
  const diff = await exec('git', ['diff', '--binary', 'HEAD', '--'], options);
  const names = await exec('git', ['diff', '--name-only', 'HEAD', '--'], options);
  await writeFile(join(output, 'od-tracked-diff.private.patch'), diff.stdout, { mode: 0o600 });
  const hash = (body: Buffer | string) => createHash('sha256').update(body).digest('hex');
  // A fixed case manifest hashes every imported E2E source. Never skip a missing
  // required file, and never require unrelated cases that this command cannot run.
  const sources = await Promise.all(plan.sources.map(async path => ({ path, sha256: hash(await readFile(join(e2eRoot, path))) })));
  return { selection: selection ?? null, config: plan.config, odHead: head.stdout.trim(), trackedDiffPaths: names.stdout.trim().split('\n').filter(Boolean),
    trackedDiffSha256: hash(diff.stdout), sourceDigest: hash(JSON.stringify(sources)), sources };
}

export async function runFundingCommand(args: string[], cwd: string, env: NodeJS.ProcessEnv, logPath: string, executable = 'corepack') {
  const log = await open(logPath, 'wx', 0o600);
  const child = spawn(executable, args, { cwd, env, detached: process.platform !== 'win32',
    stdio: ['ignore', log.fd, log.fd] });
  let timedOut = false;
  let interrupted = false;
  let killTimer: ReturnType<typeof setTimeout> | undefined;
  const kill = (signal: NodeJS.Signals) => {
    if (!child.pid) return;
    try {
      if (process.platform === 'win32') child.kill(signal);
      else process.kill(-child.pid, signal); // only this runner's new process group
    } catch { /* Already terminal. */ }
  };
  const terminate = () => {
    kill('SIGTERM');
    killTimer ??= setTimeout(() => kill('SIGKILL'), T.short);
  };
  const interrupt = () => { interrupted = true; terminate(); };
  process.on('SIGINT', interrupt);
  process.on('SIGTERM', interrupt);
  const timer = setTimeout(() => { timedOut = true; terminate(); }, commandBudgetMs);
  try {
    const exitCode = await new Promise<number>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', code => resolve(code ?? 1));
    });
    return { pid: child.pid, timedOut, interrupted,
      exitCode: timedOut || interrupted ? 1 : exitCode };
  } finally {
    clearTimeout(timer);
    if (killTimer) clearTimeout(killTimer);
    process.off('SIGINT', interrupt);
    process.off('SIGTERM', interrupt);
    await log.close();
  }
}

// This explicit entrypoint borrows an existing canonical server-owner lease.
// It never controls AMR lifecycle and never acquires a replacement lock.
async function main() {
  const fixture = await readFundingFixture();
  const output = process.env.OD_FUNDING_EVIDENCE_DIR;
  if (!output || !isAbsolute(output)) throw new Error('Explicit absolute OD_FUNDING_EVIDENCE_DIR required');
  await mkdir(output, { recursive: false, mode: 0o700 });
  const receipts: unknown[] = [];
  let ownerEnv: Record<string, string> = {};
  let childExit: number | null = null;
  let ownershipVerified = false;
  let cleanupVerified = false;
  try {
    await withFundingLease(async phase => {
      try {
        const verified = await verifyFundingLease(fixture, phase === 'pre' ? commandBudgetMs + cleanupReserveMs : 0);
        ownerEnv = verified.env;
        receipts.push({ phase, ...verified.safe });
        ownershipVerified = phase === 'post';
      } catch (error) {
        receipts.push({ phase, exitCode: 1, ownershipVerified: false });
        await writeFile(join(output, `${phase}-guard-failure.private.log`),
          error instanceof Error ? error.stack ?? error.message : 'Canonical guard rejected', { mode: 0o600 });
        throw error;
      }
    }, async () => {
      const e2eRoot = fileURLToPath(new URL('../..', import.meta.url));
      const selection = process.env.OD_FUNDING_CASE;
      const plan = fundingCasePlan(selection);
      const args = ['pnpm', 'exec', 'playwright', 'test', '-c', plan.config];
      if (plan.grep) args.push('--grep', plan.grep);
      receipts.push({ entrypoint: 'lib/playwright/funding-runner.ts',
        command: ['corepack', ...args], ...await recordOdSource(e2eRoot, output, selection) });
      const child = await runFundingCommand(args, e2eRoot,
        { ...process.env, ...ownerEnv, OD_FUNDING_OWNER_RUNNER: 'active' },
        join(output, 'playwright.private.log'));
      receipts.push({ browserCommand: child });
      childExit = child.exitCode;
      cleanupVerified = child.exitCode === 0 && !child.timedOut && !child.interrupted;
      receipts.push({ cleanupVerified,
        cleanupEvidence: cleanupVerified ? 'Case finally checks asserted all owned runtime PIDs terminal'
          : 'Not verified: inspect preserved owned-runtime-identity.safe.json namespaces; killing the child group does not prove detached daemon cleanup' });
      if (childExit !== 0) throw new Error('Browser command failed or exceeded its owned budget');
    });
  } finally {
    await writeFile(join(output, 'ownership.safe.json'), JSON.stringify({ receipts, childExit,
      ownershipVerified, cleanupVerified,
      ownedBrowserCommandPassed: ownershipVerified && cleanupVerified && childExit === 0,
      wholeQaCasesPassed: 0 }, null, 2), { mode: 0o600 });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  // Child output and capability details remain private; errors never print
  // inherited DB URLs, tokens, or arbitrary command stderr into public logs.
  process.stderr.write('Funding sandbox run failed closed; inspect the private evidence directory.\n');
  process.exitCode = 1;
});
