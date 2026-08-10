import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReport } from '../lib/vitest/report.ts';
import {
  MAC_PACKAGED_SMOKE_SCENARIOS,
  resolvePackagedSmokeLanes,
  type PackagedSmokeScenario,
  WIN_PACKAGED_SMOKE_SCENARIOS,
} from '../lib/vitest/packaged-smoke-plan.ts';
import { resolvePackagedSmokeProfile } from '../lib/vitest/packaged-smoke-profile.ts';

type Platform = 'mac' | 'win';

const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);

async function main(): Promise<void> {
  const platform = parsePlatform(process.argv[2]);
  const spec = process.argv[3] ?? defaultSpec(platform);
  const namespace = process.env.OD_PACKAGED_E2E_NAMESPACE ?? defaultNamespace(platform);
  const reportRoot = resolveFromWorkspace(
    process.env.OD_PACKAGED_E2E_REPORT_DIR ?? join('.tmp', 'release-report', platform),
  );
  const report = await createReport(reportRoot);
  const vitestResultPath = join(report.root, 'vitest-results.json');
  const smokeProfile = resolvePackagedSmokeProfile(
    platform === 'mac'
      ? process.env.OD_PACKAGED_E2E_MAC_SMOKE_PROFILE
      : process.env.OD_PACKAGED_E2E_WIN_SMOKE_PROFILE,
  );
  const selectedLanes = resolvePackagedSmokeLanes(
    smokeProfile,
    platform === 'mac'
      ? process.env.OD_PACKAGED_E2E_MAC_SMOKE_LANES
      : process.env.OD_PACKAGED_E2E_WIN_SMOKE_LANES,
  );

  process.env.OD_PACKAGED_E2E_REPORT_DIR = report.root;

  await report.json('manifest.json', {
    ...(process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL == null
      ? {}
      : { channel: process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL }),
    ...(process.env.OD_PACKAGED_E2E_RELEASE_VERSION == null
      ? {}
      : { releaseVersion: process.env.OD_PACKAGED_E2E_RELEASE_VERSION }),
    commit: process.env.GITHUB_SHA ?? null,
    generatedAt: new Date().toISOString(),
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    namespace,
    platform,
    reportPath: report.root,
    screenshot: `screenshots/open-design-${platform}-smoke.png`,
    smokePlan: {
      profile: smokeProfile,
      selectedLanes,
      shellProof: process.env.OD_PACKAGED_E2E_SHELL_SMOKE_PROOF ?? null,
    },
    spec,
  });
  await saveRequiredSource(report, 'tools-pack.json', process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  await saveOptionalSource(report, 'tools-pack.log', process.env.OD_PACKAGED_E2E_BUILD_LOG_PATH);

  const startedAt = Date.now();
  const result = await runVitest(spec, vitestResultPath).catch((error: unknown) => ({
    exitCode: 1,
    log: formatUnknown(error),
  }));
  await report.save('vitest.log', result.log);
  await report.json('summary.json', await resolveSmokeSummary({
    platform,
    profile: smokeProfile,
    selectedLanes,
    shellProof: process.env.OD_PACKAGED_E2E_SHELL_SMOKE_PROOF ?? null,
    vitestResultPath,
  }));
  await report.json('suite-result.json', {
    durationMs: Date.now() - startedAt,
    exitCode: result.exitCode,
    namespace,
    platform,
    reportPath: report.root,
    spec,
    status: result.exitCode === 0 ? 'success' : 'failed',
    timestamp: new Date().toISOString(),
  });

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

async function saveRequiredSource(
  report: Awaited<ReturnType<typeof createReport>>,
  relpath: string,
  sourcePath: string | undefined,
): Promise<void> {
  if (sourcePath == null || sourcePath === '') {
    throw new Error(`missing source path for ${relpath}`);
  }
  const resolved = resolveFromWorkspace(sourcePath);
  if (!existsSync(resolved)) {
    throw new Error(`source file for ${relpath} does not exist: ${resolved}`);
  }
  await report.save(relpath, await readFile(resolved));
}

async function saveOptionalSource(
  report: Awaited<ReturnType<typeof createReport>>,
  relpath: string,
  sourcePath: string | undefined,
): Promise<void> {
  if (sourcePath == null || sourcePath === '') return;
  const resolved = resolveFromWorkspace(sourcePath);
  if (!existsSync(resolved)) return;
  await report.save(relpath, await readFile(resolved));
}

async function runVitest(spec: string, resultPath: string): Promise<{ exitCode: number; log: string }> {
  const chunks: string[] = [];
  const child = spawn(process.execPath, [
    join(e2eRoot, 'node_modules', 'vitest', 'vitest.mjs'),
    'run',
    '-c',
    'vitest.config.ts',
    spec,
    '--reporter=default',
    '--reporter=json',
    `--outputFile.json=${resultPath}`,
  ], {
    cwd: e2eRoot,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.stdout.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString('utf8'));
    process.stdout.write(chunk);
  });
  child.stderr.on('data', (chunk: Buffer) => {
    chunks.push(chunk.toString('utf8'));
    process.stderr.write(chunk);
  });

  const exitCode = await new Promise<number>((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code) => resolveExit(code ?? 1));
  });
  return { exitCode, log: chunks.join('') };
}

type VitestJsonResult = {
  testResults?: Array<{
    assertionResults?: Array<{
      duration?: number;
      status?: string;
      title?: string;
    }>;
  }>;
};

async function resolveSmokeSummary(input: {
  platform: Platform;
  profile: string;
  selectedLanes: string[];
  shellProof: string | null;
  vitestResultPath: string;
}): Promise<Record<string, unknown>> {
  const scenarios = Object.values(
    input.platform === 'mac'
      ? MAC_PACKAGED_SMOKE_SCENARIOS
      : WIN_PACKAGED_SMOKE_SCENARIOS,
  );
  const byTitle = new Map<string, PackagedSmokeScenario>(
    scenarios.map((scenario) => [scenario.title, scenario]),
  );
  let parsed: VitestJsonResult = {};
  if (existsSync(input.vitestResultPath)) {
    parsed = JSON.parse(await readFile(input.vitestResultPath, 'utf8')) as VitestJsonResult;
  }
  const existingSummaryPath = join(dirname(input.vitestResultPath), 'summary.json');
  const existingSummary = existsSync(existingSummaryPath)
    ? JSON.parse(await readFile(existingSummaryPath, 'utf8')) as Record<string, unknown>
    : {};
  const timings = (parsed.testResults ?? [])
    .flatMap((result) => result.assertionResults ?? [])
    .flatMap((assertion) => {
      const scenario = assertion.title == null ? null : byTitle.get(assertion.title);
      if (scenario == null) return [];
      return [{
        domains: scenario.domains,
        durationMs: Math.max(0, Math.round(assertion.duration ?? 0)),
        lane: scenario.lane,
        status: normalizeVitestStatus(assertion.status),
        step: scenario.id,
        title: scenario.title,
      }];
    });
  return {
    ...existingSummary,
    plan: {
      profile: input.profile,
      selectedLanes: input.selectedLanes,
      shellProof: input.shellProof,
    },
    schemaVersion: 1,
    timings,
  };
}

function normalizeVitestStatus(status: string | undefined): string {
  if (status === 'passed') return 'success';
  if (status === 'failed') return 'failed';
  if (status === 'pending' || status === 'skipped' || status === 'todo') return 'skipped';
  return status ?? 'unknown';
}

function parsePlatform(value: string | undefined): Platform {
  if (value === 'mac' || value === 'win') return value;
  throw new Error('usage: tsx scripts/release-smoke.ts <mac|win> [spec]');
}

function defaultSpec(platform: Platform): string {
  return platform === 'mac' ? 'specs/mac.spec.ts' : 'specs/win.spec.ts';
}

function defaultNamespace(platform: Platform): string {
  return platform === 'mac' ? 'release-beta' : 'release-beta-win';
}

function resolveFromWorkspace(path: string): string {
  return isAbsolute(path) ? path : resolve(workspaceRoot, path);
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

await main();
