#!/usr/bin/env node
// Sync apps/web/src/state/litellm-models.json from BerriAI/litellm.
//
// LiteLLM (MIT, https://github.com/BerriAI/litellm) maintains the de-facto
// community catalog of model context/output caps and pricing across every
// major provider. We vendor a filtered slice (chat-mode max_output_tokens
// only) so the web client can default `max_tokens` per model without an
// extra network call at runtime.
//
// Usage:
//   node --experimental-strip-types scripts/sync-litellm-models.ts
//
// Re-run periodically (or when a new model the user cares about lands) and
// commit the regenerated JSON. Coverage gaps (e.g. mimo-v2.5-pro) are
// filled by the hand-maintained override table in maxTokens.ts.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_PATH = path.resolve(
  __dirname,
  '..',
  'apps/web/src/state/litellm-models.json',
);

interface LiteLLMEntry {
  mode?: string;
  max_tokens?: number | string;
  max_output_tokens?: number | string;
}

async function main() {
  console.log(`fetching ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`fetch ${res.status}: ${res.statusText}`);
  const raw = (await res.json()) as Record<string, unknown>;

  const out: Record<string, number> = {};
  let scanned = 0;
  for (const [id, value] of Object.entries(raw)) {
    if (id === 'sample_spec') continue;
    if (!value || typeof value !== 'object') continue;
    const entry = value as LiteLLMEntry;
    if (entry.mode !== 'chat') continue;
    scanned++;
    const candidate = entry.max_output_tokens ?? entry.max_tokens;
    if (typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0) {
      out[id] = candidate;
    }
  }

  // Sort keys so diffs stay readable when models churn.
  const sorted = Object.fromEntries(
    Object.entries(out).sort(([a], [b]) => a.localeCompare(b)),
  );

  const payload = {
    _source: SOURCE_URL,
    _generated_at: new Date().toISOString().slice(0, 10),
    _license:
      'BerriAI/litellm is MIT-licensed; see https://github.com/BerriAI/litellm/blob/main/LICENSE',
    models: sorted,
  };

  const json = JSON.stringify(payload, null, 2) + '\n';
  writeFileSync(OUT_PATH, json);
  console.log(
    `wrote ${OUT_PATH} (${Object.keys(sorted).length} models / ${scanned} chat-mode scanned)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
