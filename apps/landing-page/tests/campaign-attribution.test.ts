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

test('campaign attribution carries the consented device id across Pricing → Cloud', () => {
  // Desktop badge stamps od_device_id; Pricing must not drop it on the next hop.
  assert.match(tracker, /inbound\.get\('od_device_id'\)/);
  assert.match(tracker, /device_id:\s*inboundDeviceId/);
  assert.match(tracker, /attribution\.device_id/);
  assert.match(tracker, /searchParams\.set\('od_device_id'/);
});

test('campaign membership is explicit on each click, not inherited from a stale inbound id', () => {
  // A desktop-badge URL can outlive the campaign window. Pricing then passes
  // campaignId only while campaignActive; the helper must not fall back to
  // inbound od_campaign_id and re-attach the closed campaign to the payment.
  assert.match(tracker, /campaign_id:\s*campaignId\s*\|\|\s*undefined/);
  assert.doesNotMatch(
    tracker,
    /campaign_id:\s*campaignId\s*\|\|\s*\(inbound\s*&&\s*inbound\.get\('od_campaign_id'\)\)/,
  );
});
