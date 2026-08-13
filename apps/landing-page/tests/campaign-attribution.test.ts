import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const tracker = readFileSync(
  new URL('../app/_lib/posthog-analytics.ts', import.meta.url),
  'utf8',
);

test('campaign attribution preserves first touch and records the checkout touch separately', () => {
  assert.match(tracker, /inbound\.get\('od_entry_id'\)/);
  assert.match(tracker, /inbound\.get\('od_entry_source'\)/);
  assert.match(tracker, /entry_id:\s*inboundEntryId\s*\|\|/);
  assert.match(tracker, /source_detail:\s*inboundEntrySource\s*\|\|/);
  assert.match(tracker, /conversion_source:\s*String\(sourceDetail/);
  assert.match(tracker, /od_conversion_source/);
  assert.match(tracker, /od_campaign_id/);
});
