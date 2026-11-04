import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it } from 'vitest';
import { NativeInputStore } from '../../src/main/input-native-store.js';

it('N03 commits small records atomically and retains them after worker restart', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'od-input-store-'));
  let store = new NativeInputStore(join(dir, 'state.sqlite'));
  try {
    expect(await store.read()).toEqual([]);
    await store.write([['meta', JSON.stringify({ version: 2, identity: '', lastTime: 1, nextSendAt: 2, stopped: null })], ['completed', '[]']], []);
    await expect(store.write([['completed', '["saved"]'], ['unexpected', '{}']], [])).rejects.toThrow();
    expect(new Map(await store.read()).get('completed')).toBe('[]');
    await store.close(); store = new NativeInputStore(join(dir, 'state.sqlite'));
    expect(new Map(await store.read()).get('meta')).toContain('"version":2');
    await store.write([['completed', '["saved"]']], []);
    expect(new Map(await store.read()).get('completed')).toBe('["saved"]');
    await expect(store.write([['completed', JSON.stringify(Array.from({ length: 2049 }, () => 'x'))]], [])).rejects.toThrow();
    expect(new Map(await store.read()).get('completed')).toBe('["saved"]');
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
});

it('N04 projects active summaries before storage, including a collector tail field', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'od-input-active-'));
  const store = new NativeInputStore(join(dir, 'state.sqlite'));
  try {
    const summary = { event_schema_version: 4, metric_schema_version: 1, event_id: 'summary-1', device_id: 'device-1',
      app_session_id: 'session-1', client_type: 'desktop', capture_source: 'web/input-aggregation', env: 'test', channel: 'development',
      app_version: '0.25.1', client_version: '0.25.1', platform: null, os_version: null, arch: null,
      occurred_at: '2026-11-04T00:00:00Z', reported_at: '2026-11-04T00:00:00Z', telemetry_capability: 'supported',
      area: 'settings', window_ms: 30000, aggregation_page_id: 'page-1', period_ms: 300000,
      window_start: '2026-11-04T00:00:00Z', window_end: '2026-11-04T00:05:00Z', flush_reason: 'window',
      source_event_count: 1, source_window_ms: 30000, input_attempt_count: 1, qualified_sample_count: 0,
      over_500ms_count: 0, max_input_to_presentation_ms: null, max_queue_delay_ms: null, sample_floor_ms: 16,
      content: 'must never persist' };
    await store.write([['active:summary-1', JSON.stringify(summary)]], []);
    const actual = JSON.parse(new Map(await store.read()).get('active:summary-1')!);
    expect(actual.source_window_ms).toBe(30000);
    expect(actual).not.toHaveProperty('window_ms'); expect(actual).not.toHaveProperty('content');
  } finally { await store.close(); await rm(dir, { recursive: true, force: true }); }
});
