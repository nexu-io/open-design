/**
 * Synthetic adapter that emits the canonical happy-path transcript
 * (`happy-3-rounds.txt`). Used by the Phase 10 conformance harness so
 * the parser + orchestrator can be exercised end-to-end against a
 * deterministic input that has no network or model dependency.
 *
 * The harness uses this fixture two ways:
 *   1. In-process via `syntheticGoodTranscript()`, which returns the raw
 *      transcript string. Tests wrap it in an `AsyncIterable<string>`
 *      and feed `parseCritiqueStream`.
 *   2. As a child-process stub via the sibling `synthetic-good.cli.ts`
 *      script, which writes the same transcript to stdout. The CLI form
 *      lets the existing daemon CLI-spawn primitive treat this fake
 *      adapter identically to a real one (the path the plan calls out
 *      for the nightly matrix).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __filename = url.fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Path of the bundled fixture so test harnesses can `readFile` it directly. */
export const SYNTHETIC_GOOD_FIXTURE_PATH = path.join(
  __dirname,
  '..',
  'v1',
  'happy-3-rounds.txt',
);

/**
 * Read the canonical happy-path transcript synchronously. The file ships
 * with the daemon source so the call cannot fail in a packaged build.
 */
export function syntheticGoodTranscript(): string {
  return readFileSync(SYNTHETIC_GOOD_FIXTURE_PATH, 'utf8');
}

/**
 * Async-iterable wrapper used by the conformance harness so the parser
 * sees the same input shape it would from a real adapter's stdout.
 * Splits the transcript into ~512-byte chunks so the parser exercises
 * its incremental-boundary logic instead of seeing one giant chunk.
 */
export async function* syntheticGoodStream(): AsyncIterable<string> {
  const raw = syntheticGoodTranscript();
  const chunkSize = 512;
  for (let i = 0; i < raw.length; i += chunkSize) {
    yield raw.slice(i, i + chunkSize);
  }
}
