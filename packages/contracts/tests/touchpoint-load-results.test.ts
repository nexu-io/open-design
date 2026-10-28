import { describe, expect, it } from 'vitest';
import { touchpointLoadBatchSchema, touchpointLoadRecordSchema, parseTouchpointLoadMetrics, touchpointUtf8Bytes } from '../src/api/touchpointLoadResults.js';
const uuid = '12345678-1234-4234-8234-123456789012';
const start = () => touchpointLoadRecordSchema.parse({ event_id: uuid, load_attempt_id: uuid, session_id: uuid, occurred_at: '2026-10-09T00:00:00.000Z', kind: 'start', placement_key: 'opend.home.campaign-modal', host_product: 'opend', host_family: 'open-design-desktop', locale: 'en-US' });
describe('CMS load DTO mirror', () => {
  it('allows request-before-decision and authenticated Test null decision without fabricated fields', () => {
    const record = start();
    expect(record.decision_outcome).toBeNull(); expect(record.decision_id).toBeNull(); expect(record.mount_ms).toBeNull();
    expect(touchpointLoadRecordSchema.safeParse({ ...record, kind: 'terminal', result: 'visible', decision_outcome: 'eligible', activity_id: 'activity', deployment_id: 'deployment', content_version_id: 'content' }).success).toBe(true);
    expect(touchpointLoadRecordSchema.safeParse({ ...record, kind: 'terminal', result: 'failed', failure_stage: 'decision', error_code: 'network_error' }).success).toBe(true);
  });
  it('rejects caller authority, unknown keys, invalid placement/family, UUID, kind and nonfinite timing', () => {
    const record = start();
    for (const fields of [{ actor: 'member' }, { env: 'production' }, { behavior_id: uuid }, { placement_key: 'unknown' }, { host_family: 'vela-web' }, { event_id: 'bad' }, { result: 'visible' }, { decision_request_ms: NaN }, { mount_ms: -1 }]) expect(touchpointLoadRecordSchema.safeParse({ ...record, ...fields }).success).toBe(false);
    expect(touchpointLoadBatchSchema.safeParse({ contractVersion: 1, records: Array(101).fill(record) }).success).toBe(false);
  });
  it('rejects hostile/oversized metadata while preserving nullable and genuinely zero values', () => {
    expect(parseTouchpointLoadMetrics('{"version":1,"public_transfer_ms":0}')?.public_transfer_ms).toBe(0);
    expect(parseTouchpointLoadMetrics('{"version":1}')?.server_version).toBeNull();
    for (const value of ['bad', '{"version":2}', '{"version":1,"url":"secret"}', '{"version":1,"mount_ms":1}', '{"version":1,"public_transfer_ms":-1}', ' '.repeat(2049)]) expect(parseTouchpointLoadMetrics(value)).toBeNull();
    expect(touchpointUtf8Bytes('你好😀\ud800')).toBe(13);
  });
  it('matches the frozen flat version-1 metadata wire and 2048 UTF-8 byte limit', () => {
    const minimal = { version: 1, resource_read_ms: 0, server_version: 'cms:1.2.3' };
    expect(parseTouchpointLoadMetrics(JSON.stringify(minimal))).toMatchObject({ ...minimal, local_transfer_ms: null, decoded_resource_bytes: null });
    expect(parseTouchpointLoadMetrics(JSON.stringify({ ...minimal, local_transfer_ms: null, held_content_locale: 'zh-Hant-TW', public_response_bytes: Number.MAX_SAFE_INTEGER, public_transfer_ms: 86400000 }))).not.toBeNull();
    for (const fields of [{ local_transfer_ms: 86400001 }, { resource_read_ms: 86400001 }, { public_response_bytes: Number.MAX_SAFE_INTEGER + 1 }, { decoded_resource_bytes: -1 }, { daemon_version: 'bad/token' }, { held_content_locale: '1a' }, { held_content_locale: 'en--US' }, { held_content_locale: 'abcdefghi' }, { held_content_locale: 'en-' + 'a'.repeat(33) }, { unknown: null }]) {
      expect(parseTouchpointLoadMetrics(JSON.stringify({ ...minimal, ...fields }))).toBeNull();
    }
    const wire = JSON.stringify(minimal);
    expect(parseTouchpointLoadMetrics(wire + ' '.repeat(2048 - touchpointUtf8Bytes(wire)))).not.toBeNull();
    expect(parseTouchpointLoadMetrics(wire + ' '.repeat(2049 - touchpointUtf8Bytes(wire)))).toBeNull();
    // JSON whitespace U+0020 is valid, multibyte text still counts in bytes.
    const unicode = JSON.stringify({ version: 1, held_content_locale: '你好' });
    expect(parseTouchpointLoadMetrics(unicode)).toBeNull();
  });
});
