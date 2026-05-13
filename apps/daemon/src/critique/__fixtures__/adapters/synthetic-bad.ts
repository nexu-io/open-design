/**
 * Synthetic adapter that emits a malformed transcript
 * (`malformed-unbalanced.txt`). Used by the Phase 10 conformance harness
 * to assert that the parser raises `MalformedBlockError` and the
 * orchestrator transitions the run to `critique.degraded` with the
 * adapter marked degraded for the 24h TTL window.
 *
 * Pair with `synthetic-good.ts` so any future change to the orchestrator
 * is forced to maintain the good ⇒ shipped / bad ⇒ degraded contract
 * the nightly matrix relies on.
 */

import { readFileSync } from 'node:fs';
import url from 'node:url';

/**
 * Module-URL-anchored fixture path (mirrors `synthetic-good.ts`; see
 * lefarcen P2 on PR #1317 for the rationale).
 */
export const SYNTHETIC_BAD_FIXTURE_URL = new URL(
  '../v1/malformed-unbalanced.txt',
  import.meta.url,
);

export const SYNTHETIC_BAD_FIXTURE_PATH = url.fileURLToPath(
  SYNTHETIC_BAD_FIXTURE_URL,
);

export function syntheticBadTranscript(): string {
  return readFileSync(SYNTHETIC_BAD_FIXTURE_URL, 'utf8');
}

export async function* syntheticBadStream(): AsyncIterable<string> {
  const raw = syntheticBadTranscript();
  const chunkSize = 512;
  for (let i = 0; i < raw.length; i += chunkSize) {
    yield raw.slice(i, i + chunkSize);
  }
}
