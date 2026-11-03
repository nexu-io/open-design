import { randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { auditAnalyticsPayloadPrivacy, assertAnalyticsPayloadPrivacy } from '@/analytics/payload-privacy';
import { startLocalAnalyticsCollector } from '@/playwright/local-analytics-collector';

describe('local analytics payload privacy', () => {
  it('audits the collector HTTP capture without sending external telemetry', async () => {
    const collector = await startLocalAnalyticsCollector();
    const runtimeCredential = randomBytes(24).toString('base64url');
    try {
      const response = await fetch(`${collector.host}/batch/`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ batch: [{ event: 'page_view', properties: { page_name: 'home' } }] }),
      });
      expect(response.ok).toBe(true);
      expect(collector.events()).toHaveLength(1);
      expect(collector.auditPrivacy({ sensitiveValues: [runtimeCredential] })).toEqual({ recordCount: 1, findings: [] });
    } finally { await collector.close(); }
  });

  it('rejects exact runtime credentials, API key patterns and unredacted email without echoing them', () => {
    const credential = randomBytes(24).toString('base64url');
    const apiKey = `sk-${randomBytes(24).toString('base64url')}`;
    const email = `${randomBytes(8).toString('hex')}@example.invalid`;
    const records = [{ decoded: { nested: { credential, apiKey, email } }, decodeError: null }];
    expect(auditAnalyticsPayloadPrivacy(records, { sensitiveValues: [credential] }).findings).toEqual([
      { recordIndex: 0, kind: 'credential' }, { recordIndex: 0, kind: 'api_key_pattern' }, { recordIndex: 0, kind: 'email' },
    ]);
    let error: unknown;
    try { assertAnalyticsPayloadPrivacy(records, { sensitiveValues: [credential] }); } catch (caught) { error = caught; }
    expect(error).toBeInstanceOf(Error);
    for (const secret of [credential, apiKey, email]) expect(String(error)).not.toContain(secret);
  });

  it('cannot mark empty, undecodable or unqualified captures private', () => {
    expect(() => assertAnalyticsPayloadPrivacy([], { sensitiveValues: ['runtime-value'] })).toThrow('captured payloads');
    expect(() => assertAnalyticsPayloadPrivacy([{ decoded: {}, decodeError: null }], { sensitiveValues: [] })).toThrow('credential values');
    expect(() => assertAnalyticsPayloadPrivacy([{ decoded: null, decodeError: 'bad encoding' }], { sensitiveValues: ['runtime-value'] })).toThrow('undecodable');
  });
});
