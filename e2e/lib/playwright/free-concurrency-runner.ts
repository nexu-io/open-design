import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runFundingCommand } from './funding-runner.ts';
import { readFreeConcurrencyFixture } from './workspace-free-concurrency-fixture.ts';
import { verifyFundingLease, withFundingLease } from './workspace-funding-lease.ts';

async function main() {
  const fixture = await readFreeConcurrencyFixture();
  const output = process.env.OD_FUNDING_EVIDENCE_DIR;
  if (!output || !isAbsolute(output)) throw new Error('Fresh absolute evidence directory required');
  await mkdir(output, { recursive: false, mode: 0o700 });
  const fixturePath = process.env.OD_FUNDING_FIXTURE!;
  const fixtureSha256 = createHash('sha256').update(await readFile(fixturePath)).digest('hex');
  const receipts: unknown[] = [];
  let commandsPassed = false;
  let ownershipVerified = false;
  try {
    await withFundingLease(async phase => {
      const result = await verifyFundingLease(fixture, phase === 'pre' ? 720_000 : 0);
      receipts.push({ phase, ...result.safe }); ownershipVerified = phase === 'post';
    }, async () => {
      const verified = await verifyFundingLease(fixture, 720_000);
      const env = { ...process.env, ...verified.env, OD_FUNDING_OWNER_RUNNER: 'active',
        OD_FREE_CONCURRENCY_RUNNER: 'active', OD_MANUAL_RETRY_RUNNER: fixture.freeConcurrency.manualRetry ? 'active' : '',
        OD_CONCURRENCY_ATTEMPT_ID: fixture.freeConcurrency.attemptId };
      const e2eRoot = fileURLToPath(new URL('../..', import.meta.url));
      const sources = ['free-concurrency-runner.ts', 'free-concurrency.config.ts', 'workspace-free-concurrency-fixture.ts',
        'workspace-funding-client.ts', 'workspace-funding-fixture.ts', 'workspace-funding-lease.ts'];
      receipts.push({ fixtureSha256, sources: await Promise.all(sources.map(async path => ({ path,
        sha256: createHash('sha256').update(await readFile(join(e2eRoot, 'lib/playwright', path))).digest('hex') }))),
        testSha256: createHash('sha256').update(await readFile(join(e2eRoot, fixture.freeConcurrency.manualRetry
          ? 'ui/workspace-manual-retry-sandbox.test.ts' : 'ui/workspace-free-concurrency-sandbox.test.ts'))).digest('hex') });
      const commands = await Promise.allSettled([
        runFundingCommand([(fixture.freeConcurrency.manualRetry?.coordinator ?? fixture.freeConcurrency.coordinator).helperPath, '--fixture', fixturePath,
          '--evidence-dir', output, '--run-id', fixture.isolation.runId, '--attempt-id', fixture.freeConcurrency.attemptId,
          '--fixture-sha256', fixtureSha256], fixture.owner.sourceRoot, env, join(output, 'coordinator.private.log'), 'python3'),
        runFundingCommand(['pnpm', 'exec', 'playwright', 'test', '-c', 'lib/playwright/free-concurrency.config.ts'],
          e2eRoot, env, join(output, 'playwright.private.log')),
      ]);
      receipts.push({ commands });
      commandsPassed = commands.every(r => r.status === 'fulfilled' && r.value.exitCode === 0);
      if (!commandsPassed) throw new Error('Actual Free concurrency command failed; preserve first red');
    });
  } finally {
    await writeFile(join(output, 'ownership.safe.json'), JSON.stringify({ receipts, commandsPassed, ownershipVerified,
      wholeQaCasesPassed: 0 }, null, 2), { mode: 0o600 });
  }
}
main().catch(() => { process.stderr.write('Free concurrency lane failed closed; inspect private evidence.\n'); process.exitCode = 1; });
