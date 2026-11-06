import { defineConfig, type ReporterDescription } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync } from 'node:fs';
import { join } from 'node:path';

import base from '../../playwright.config.ts';

// Trace and reports may contain authenticated local HTTP evidence.
process.umask(0o077);

const reports = (name: string) => fileURLToPath(new URL(`../../ui/reports/api-security/${name}`, import.meta.url));
const reporter: ReporterDescription[] = [
  ['list'],
  ['html', { open: 'never', outputFolder: reports('html') }],
  ['json', { outputFile: reports('results.json') }],
  ['junit', { outputFile: reports('junit.xml') }],
];
if (process.env.CI) reporter.unshift(['github']);

// Shared by the actual UI test and direct negative guard checks. This does not
// start tools-dev, execute the CLI, or issue authenticated business requests.
export function validateApiSecurityFixture() {
  assert(process.env.VELA_E2E_OWNER_TOKEN, 'VIEW016_PREFLIGHT_MISSING_OWNER');
  assert(process.env.VIEW016_RUNTIME, 'VIEW016_RUNTIME requires an explicit private fixture');
  const fixtureText = readFileSync(join(process.env.VIEW016_RUNTIME, 'view016-fixture.private.json'), 'utf8');
  const fixture = JSON.parse(fixtureText);
  assert.equal(fixture.schemaVersion, 1);
  const cfg = fixture.cfg;
  assert(typeof cfg?.name === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(cfg.name), 'explicit canonical sandbox name required');
  const amrRoot = realpathSync(cfg.sourceRoot);
  const odRoot = realpathSync(fileURLToPath(new URL('../../../', import.meta.url)));
  assert(process.env.E2E_DATABASE_URL, 'E2E_DATABASE_URL required');
  for (const service of ['api', 'link', 'web']) {
    const origin = new URL(cfg.urls?.[service]);
    assert(origin.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(origin.hostname)
      && !origin.username && !origin.password && origin.pathname === '/' && !origin.search && !origin.hash,
      'VIEW016_PREFLIGHT_WRONG_TARGET: exact credential-free loopback origin required');
  }
  const verifyOwner = () => execFileSync('python3', ['e2e/helper/e2e_ownership.py', 'verify-inherited'], { cwd: amrRoot, stdio: 'pipe' });
  // The real inherited owner must be live before any canonical runtime inspection.
  verifyOwner();

  const database = `vela_sandbox_${cfg.name.replaceAll('-', '_')}`;
  assert(cfg.database === database && new URL(cfg.databaseUrl).pathname === `/${database}`, 'VIEW016_PREFLIGHT_WRONG_TARGET: name-derived database mismatch');
  assert(process.env.E2E_DATABASE_URL === cfg.databaseUrl, 'VIEW016_PREFLIGHT_WRONG_TARGET: inherited database URL mismatch');
  const statusArgs = ['sandbox/cli.py', 'status', cfg.name];
  const canonicalStatus = JSON.parse(execFileSync('python3', [...statusArgs, '--json'], { cwd: amrRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }));
  assert.equal(canonicalStatus.name, cfg.name);
  assert.equal(realpathSync(canonicalStatus.sourceRoot), amrRoot, 'VIEW016_PREFLIGHT_WRONG_TARGET: source root mismatch');
  assert.equal(canonicalStatus.database, database, 'VIEW016_PREFLIGHT_WRONG_TARGET: canonical database mismatch');
  assert.equal(canonicalStatus.state, 'running');
  assert.equal(canonicalStatus.inspection?.status, 'ready');
  assert.equal(canonicalStatus.dataPlaneReady, true);
  assert.deepEqual(canonicalStatus.urls, cfg.urls, 'VIEW016_PREFLIGHT_WRONG_TARGET: canonical URLs mismatch');
  for (const service of ['api', 'link', 'web']) assert.equal(canonicalStatus.readiness?.[service]?.status, 'ready');
  // The safe --json inspection intentionally redacts databaseUrl. Obtain the
  // actual URL from the same CLI's private lifecycle projection, never infer it.
  const lifecycle = execFileSync('python3', statusArgs, { cwd: amrRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const canonicalDatabaseUrl = lifecycle.split('\n').find((line) => line.startsWith('databaseUrl='))?.slice('databaseUrl='.length);
  assert(canonicalDatabaseUrl === cfg.databaseUrl && canonicalDatabaseUrl === process.env.E2E_DATABASE_URL, 'VIEW016_PREFLIGHT_WRONG_TARGET: actual canonical database URL mismatch');
  if (canonicalStatus.databaseUrl != null) assert(canonicalStatus.databaseUrl === canonicalDatabaseUrl, 'canonical database projections disagree');
  const git = (root: string, args: string[]) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const actualHeads = { amr: git(amrRoot, ['rev-parse', 'HEAD']), od: git(odRoot, ['rev-parse', 'HEAD']) };
  assert.deepEqual(actualHeads, fixture.sourceBinding, 'Private fixture must bind exact checked-out test heads');
  for (const key of ['amr', 'open-design', 'od-landing']) assert(typeof fixture.sourceTuple?.[key] === 'string' && /^[a-f0-9]{40}$/.test(fixture.sourceTuple[key]), 'runtime sourceTuple requires all frozen product bases');
  const productionPaths = {
    amr: ['services/api/src', 'services/link/cmd', 'services/link/internal', 'apps/cli', 'apps/web/src', 'packages/shared/src', 'db/migrations', ':(exclude,glob)**/*_test.go', ':(exclude,glob)**/tests/**'],
    od: ['apps', 'packages', 'tools', 'shells', 'scripts', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', ':(exclude,glob)**/tests/**', ':(exclude,glob)**/*.test.ts', ':(exclude,glob)**/*.test.tsx', ':(exclude,glob)**/*_test.go'],
  };
  for (const [role, root, base, paths] of [
    ['amr', amrRoot, fixture.sourceTuple.amr, productionPaths.amr],
    ['od', odRoot, fixture.sourceTuple['open-design'], productionPaths.od],
  ] as const) {
    git(root, ['merge-base', '--is-ancestor', base, 'HEAD']);
    git(root, ['diff', '--quiet', base, '--', ...paths]);
    assert.equal(git(root, ['ls-files', '--others', '--exclude-standard', '--', ...paths]), '', `${role} untracked production source differs from frozen base`);
  }
  verifyOwner();
  const deviceBytes = readFileSync(join(process.env.VIEW016_RUNTIME, 'view016-device.private.json'));
  assert.equal(createHash('sha256').update(deviceBytes).digest('hex'), fixture.runtime?.cliDeviceReceiptSha256, 'exact new production device receipt binding required');
  const cliDevice = JSON.parse(deviceBytes.toString());
  assert.equal(cliDevice.caseName, 'view016');
  assert.equal(cliDevice.provenance?.source, 'cli_device');
  assert.equal(cliDevice.provenance?.status, 'active');
  assert.equal(cliDevice.provenance?.user_id, fixture.actors['view016-owner'].userId);
  assert.equal(cliDevice.initialSelectedWorkspaceId, fixture.spaces['free-a'].workspaceId);
  assert.equal(cliDevice.targetBinding?.actualHead, actualHeads.amr);
  assert.deepEqual(cliDevice.targetBinding?.productionTuple, fixture.sourceTuple);
  assert(cliDevice.tokens?.runtimeKey && cliDevice.tokens?.controlKey, 'real device-issued credentials required');
  return { fixture, fixtureText, actualHeads, canonicalStatus, verifyOwner, cliDevice, sourceRoles: { amr: { productionBase: fixture.sourceTuple.amr, testHead: actualHeads.amr }, od: { productionBase: fixture.sourceTuple['open-design'], testHead: actualHeads.od }, landing: { productionBase: fixture.sourceTuple['od-landing'], execution: 'metadata_only' } } };
}

// Explicit real-AMR lane. The private fixture and live ownership are required;
// this test is excluded from the ordinary hermetic functional pool.
export default defineConfig({
  ...base,
  testDir: fileURLToPath(new URL('../../ui', import.meta.url)),
  outputDir: reports('artifacts'),
  reporter,
  testMatch: 'api-security-view016.test.ts',
  testIgnore: [],
  workers: 1,
  fullyParallel: false,
  retries: 0,
  use: { ...base.use, trace: 'on', screenshot: 'only-on-failure' },
});
