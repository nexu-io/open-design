import { randomUUID, createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { runFundingCommand } from './funding-runner.ts';
import { readConcurrencyFixture } from './workspace-concurrency-fixture.ts';
import { verifyFundingLease, withFundingLease } from './workspace-funding-lease.ts';
import { T } from '../timeouts.ts';

// Capacity is controlled by the server owner's immutable test helper. This
// entrypoint only borrows its canonical lease and runs the actual browser spec.
async function main() {
  const fixture = await readConcurrencyFixture();
  const output = process.env.OD_FUNDING_EVIDENCE_DIR;
  if (!output || !isAbsolute(output)) throw new Error('Fresh absolute evidence directory required');
  await mkdir(output, { recursive: false, mode: 0o700 });
  const attemptId = randomUUID();
  const selected = process.env.F04_SURFACE;
  if (selected && selected !== 'home' && selected !== 'project') throw new Error('F04_SURFACE must be home or project');
  const surfaces = selected ? [selected] : ['home', 'project'];
  const releaseOne = process.env.F04_RELEASE_ONE === '1';
  if (releaseOne && (surfaces.length !== 1 || surfaces[0] !== 'home')) throw new Error('Single-release witness requires F04_SURFACE=home');
  const fixturePath = process.env.OD_FUNDING_FIXTURE!;
  const fixtureSha256 = createHash('sha256').update(await readFile(fixturePath)).digest('hex');
  const receipts: unknown[] = [];
  let ownershipVerified = false;
  let cleanupVerified = false;
  let commandsPassed = false;
  try {
    await withFundingLease(async phase => {
      const result = await verifyFundingLease(fixture, phase === 'pre' ? 720_000 : 0);
      receipts.push({ phase, ...result.safe });
      ownershipVerified = phase === 'post';
    }, async () => {
      const e2eRoot = fileURLToPath(new URL('../..', import.meta.url));
      const sourceOptions = { cwd: dirname(e2eRoot), timeout: T.long };
      await promisify(execFile)('git', ['diff', '--quiet', 'HEAD', '--'], sourceOptions);
      const result = await promisify(execFile)('git', ['rev-parse', 'HEAD'], sourceOptions);
      const paths = ['lib/playwright/concurrency-runner.ts', 'lib/playwright/concurrency.config.ts',
        'lib/playwright/workspace-concurrency-fixture.ts', 'lib/playwright/funding-runner.ts',
        'lib/playwright/workspace-funding-fixture.ts', 'lib/playwright/workspace-funding-lease.ts',
        'ui/workspace-concurrency-sandbox.test.ts'];
      await promisify(execFile)('git', ['ls-files', '--error-unmatch', ...paths.map(path => `e2e/${path}`)], sourceOptions);
      const sourceHashes = await Promise.all(paths.map(async path => ({ path,
        sha256: createHash('sha256').update(await readFile(join(e2eRoot, path))).digest('hex') })));
      receipts.push({ odHead: result.stdout.trim(), sourceHashes, attemptId, runId: fixture.isolation.runId,
        fixtureSha256, workspaceId: fixture.concurrency!.space.workspaceId, surfaces, releaseOne });
      const environment = { ...process.env, OD_CONCURRENCY_OWNER_RUNNER: 'active',
        OD_CONCURRENCY_ATTEMPT_ID: attemptId, F04_OD_SHA: result.stdout.trim(), YANG_UI_EVIDENCE_DIR: output,
        YANG_UI_ACTOR: 'od', YANG_UI_SPACE: 'concurrency',
        API001_ONLY: '0', API001_READBACK_ONLY: '0', F04_RETRY_ONLY: '0' };
      const helperArgs = [fixture.concurrency!.coordinator.helperPath,
        '--fixture', fixturePath, '--evidence-dir', output, '--run-id', fixture.isolation.runId,
        '--attempt-id', attemptId, '--surfaces', surfaces.join(','), '--fixture-sha256', fixtureSha256];
      if (releaseOne) helperArgs.push('--release-one');
      const results = await Promise.allSettled([
        runFundingCommand(helperArgs, fixture.owner.sourceRoot, environment, join(output, 'coordinator.private.log'), 'python3'),
        runFundingCommand(['pnpm', 'exec', 'playwright', 'test', '-c', 'lib/playwright/concurrency.config.ts'],
          e2eRoot, environment, join(output, 'playwright.private.log')),
      ]);
      receipts.push({ commands: results.map(result => result.status === 'fulfilled' ? result.value : { exitCode: 1, error: 'Child launch failed; inspect private logs' }) });
      // The browser finally records its exact owned daemon/web runtime. A failed
      // business assertion does not by itself mean cleanup succeeded or failed.
      const stopped = JSON.parse(await readFile(join(output, 'owner-runtime-stopped.json'), 'utf8'));
      cleanupVerified = stopped.status === 'not-running'
        && ['daemon', 'web', 'desktop'].every(app => !stopped.apps?.[app]?.pid && stopped.apps?.[app]?.state === 'idle');
      receipts.push({ cleanupVerified, ownedRuntime: stopped });
      commandsPassed = results.every(result => result.status === 'fulfilled' && result.value.exitCode === 0);
      if (!commandsPassed || !cleanupVerified) throw new Error('Concurrency command or owned cleanup failed');
    });
  } finally {
    await writeFile(join(output, 'ownership.safe.json'), JSON.stringify({ attemptId, receipts, ownershipVerified,
      cleanupVerified, commandsPassed, wholeQaCasesPassed: 0 }, null, 2), { mode: 0o600 });
  }
}

main().catch(() => {
  process.stderr.write('Concurrency sandbox failed closed; inspect the private evidence directory.\n');
  process.exitCode = 1;
});
