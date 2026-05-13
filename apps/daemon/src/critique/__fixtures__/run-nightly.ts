/**
 * Nightly conformance entrypoint (Phase 16).
 *
 * The GitHub Actions workflow at `.github/workflows/critique-conformance.yml`
 * invokes this script once a day. It runs the conformance harness
 * against every synthetic adapter, classifies the outcome, and writes
 * one `ConformanceDay` row per adapter into the daemon's history dir.
 * The `/api/critique/conformance` route reads the rolling 14-day
 * window and the ratchet returns its promote / hold / demote
 * recommendation.
 *
 * Why synthetic-only for v1: the full production-adapter sweep needs
 * every agent CLI installable in the CI image. Wiring that is its own
 * focused follow-up. The synthetic adapters prove the cron plumbing
 * (install + build + harness invocation + history write) without the
 * dependency on third-party binaries. A real adapter is a one-line
 * addition to `ADAPTERS` below once the harness wraps its stdout.
 *
 * Exit code: 0 only when every adapter ran (regardless of outcome).
 * A thrown error or a missing fixture exits non-zero so the workflow
 * fails the job instead of uploading an empty history snapshot
 * (Codex + lefarcen P1 on PR #1499 caught the prior `|| echo` mask).
 */

import path from 'node:path';

import { runAdapterConformance } from '../conformance.js';
import { appendConformanceDay } from '../conformance-history.js';
import type { ConformanceDay } from '../ratchet.js';
import { syntheticGoodStream } from './adapters/synthetic-good.js';
import { syntheticBadStream } from './adapters/synthetic-bad.js';

interface NightlyAdapter {
  id: string;
  source: () => AsyncIterable<string>;
}

const ADAPTERS: readonly NightlyAdapter[] = [
  { id: 'synthetic-good', source: syntheticGoodStream },
  { id: 'synthetic-bad', source: syntheticBadStream },
];

/**
 * Anchor the run at the project's `.od/` data dir by default; the
 * Home Manager / NixOS / Playwright runtimes that already set
 * `OD_DATA_DIR` keep their isolation here too.
 */
function resolveDataDir(): string {
  const override = process.env.OD_DATA_DIR;
  if (override && override.length > 0) return path.resolve(override);
  return path.resolve(process.cwd(), '.od');
}

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function runOne(adapter: NightlyAdapter, dataDir: string, date: string): Promise<void> {
  const outcome = await runAdapterConformance({
    adapterId: adapter.id,
    runId: `nightly-${date}-${adapter.id}`,
    source: adapter.source(),
  });
  // shippedRate is 0 or 1 per single-run synthetic adapter; the
  // production sweep that follows will run N briefs and the rate
  // becomes a real fraction.
  const shipped = outcome.kind === 'shipped' ? 1 : 0;
  // A run is "clean" when zero parser_warning events were yielded
  // along the way. The harness already collects every event for the
  // outcome, so we walk it here rather than re-parsing.
  const hadParserWarning = outcome.events.some((e) => e.type === 'parser_warning');
  const cleanParse = hadParserWarning ? 0 : 1;
  const row: ConformanceDay = {
    date,
    adapter: adapter.id,
    shippedRate: shipped,
    cleanParseRate: cleanParse,
    totalRuns: 1,
  };
  await appendConformanceDay(dataDir, row);
  // eslint-disable-next-line no-console
  console.log(
    `[nightly] ${adapter.id} ${outcome.kind}`
      + (outcome.kind === 'degraded' || outcome.kind === 'failed'
        ? ` (${'reason' in outcome ? outcome.reason : outcome.cause})`
        : ''),
  );
}

async function main(): Promise<void> {
  const dataDir = resolveDataDir();
  const date = isoDay(new Date());
  // eslint-disable-next-line no-console
  console.log(`[nightly] writing to ${path.join(dataDir, 'conformance')} for ${date}`);
  for (const adapter of ADAPTERS) {
    await runOne(adapter, dataDir, date);
  }
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[nightly] failed:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
