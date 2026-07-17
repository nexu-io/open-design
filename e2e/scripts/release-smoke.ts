import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createReport } from '../lib/vitest/report.ts';
import {
  buildReleaseGatesEvidence,
  collectArtifactHashes,
  RELEASE_GATES_EVIDENCE_FILE,
  RELEASE_GATES_PARTIAL_FILE,
  type ReleaseGateEvidence,
} from '../lib/vitest/release-gates-evidence.ts';

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

  process.env.OD_PACKAGED_E2E_REPORT_DIR = report.root;

  const profile = resolveProfile(platform);

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
    ...(profile == null ? {} : { profile }),
    reportPath: report.root,
    screenshot: `screenshots/open-design-${platform}-smoke.png`,
    spec,
  });
  await saveRequiredSource(report, 'tools-pack.json', process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  await saveOptionalSource(report, 'tools-pack.log', process.env.OD_PACKAGED_E2E_BUILD_LOG_PATH);

  const startedAt = Date.now();
  const result = await runVitest(spec).catch((error: unknown) => ({
    exitCode: 1,
    log: formatUnknown(error),
  }));
  await report.save('vitest.log', result.log);
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

  // --- Release-gate evidence (G6–G10) -------------------------------------
  // Artifact SHA-256 (G10) comes from the tools-pack build JSON. Gate results
  // G6–G9 come from the spec, written as a partial when the platform smoke ran.
  const artifacts = await collectArtifactHashes(process.env.OD_PACKAGED_E2E_BUILD_JSON_PATH);
  const partialGates = await readPartialGates(report.root);
  const skipReason =
    result.exitCode === 0
      ? `platform smoke skipped (process.platform !== '${platform}')`
      : `platform smoke did not complete (vitest exit ${result.exitCode})`;
  const evidence = buildReleaseGatesEvidence({
    platform,
    channel: process.env.OD_PACKAGED_E2E_RELEASE_CHANNEL ?? null,
    releaseVersion: process.env.OD_PACKAGED_E2E_RELEASE_VERSION ?? null,
    commit: process.env.GITHUB_SHA ?? null,
    githubRunId: process.env.GITHUB_RUN_ID ?? null,
    githubRunAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
    namespace,
    profile,
    reportPath: report.root,
    artifacts,
    partialGates,
    skipReason,
  });
  await report.json(RELEASE_GATES_EVIDENCE_FILE, evidence);

  if (result.exitCode !== 0) {
    process.exitCode = result.exitCode;
  }
}

async function readPartialGates(reportRoot: string): Promise<Record<string, ReleaseGateEvidence> | null> {
  const path = join(reportRoot, RELEASE_GATES_PARTIAL_FILE);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as Record<string, ReleaseGateEvidence>;
  } catch {
    return null;
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

async function runVitest(spec: string): Promise<{ exitCode: number; log: string }> {
  const chunks: string[] = [];
  const child = spawn(process.execPath, [join(e2eRoot, 'node_modules', 'vitest', 'vitest.mjs'), 'run', '-c', 'vitest.config.ts', spec], {
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

function resolveProfile(platform: Platform): string | null {
  if (platform === 'win') return process.env.OD_PACKAGED_E2E_WIN_SMOKE_PROFILE ?? null;
  return process.env.OD_PACKAGED_E2E_MAC_SMOKE_PROFILE ?? null;
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
