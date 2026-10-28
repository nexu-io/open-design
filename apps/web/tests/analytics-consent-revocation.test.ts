// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.clear();
  sessionStorage.clear();
});

it('keeps the real SDK opted out after clearing identity, then restores capture on consent', async () => {
  vi.resetModules();
  vi.useFakeTimers();
  localStorage.clear();
  sessionStorage.clear();
  // Only the transport is stubbed. In particular reset(), consent persistence,
  // capture(), identify() and super-properties use the lockfile-pinned SDK.
  vi.spyOn(XMLHttpRequest.prototype, 'send').mockImplementation(() => {});
  vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
    expect(String(input)).toBe('/api/analytics/config');
    return new Response(JSON.stringify({
      enabled: true,
      key: 'phc_local_consent_regression',
      host: 'http://127.0.0.1:27021',
      installationId: 'installation-before-revocation',
      env: 'local_test',
    }));
  }));
  const analytics = await import('../src/analytics/client');
  const sdk = await analytics.getAnalyticsClient({
    anonymousId: 'anonymous-test', sessionId: 'session-test',
    clientType: 'web', locale: 'en', appVersion: '1.2.3',
  });
  expect(sdk).not.toBeNull();
  if (!sdk) throw new Error('real SDK did not initialize');

  // Control: this SDK version removes its opt-out key during identity reset.
  sdk.opt_out_capturing();
  expect(sdk.has_opted_out_capturing()).toBe(true);
  sdk.reset();
  expect(sdk.has_opted_out_capturing()).toBe(false);

  analytics.applyConsent(true);
  analytics.applyIdentity('installation-consented');
  expect(sdk.get_distinct_id()).toBe('installation-consented');
  expect(sdk.capture('consent_positive_control')).toBeDefined();
  analytics.applyConsent(false);
  expect(sdk.get_distinct_id()).not.toBe('installation-consented');
  expect(analytics.getResolvedDeviceId()).toBeNull();
  expect(sdk.has_opted_out_capturing()).toBe(true);
  expect(sdk.has_opted_in_capturing()).toBe(false);
  // Direct SDK callers and the wrapper must both respect the same gate.
  expect(sdk.capture('surface_view', { event_id: 'fresh-revoked-view' })).toBeUndefined();
  const originalBeforeSend = sdk.config.before_send;
  if (typeof originalBeforeSend !== 'function') throw new Error('missing scrub callback');
  const beforeSend = vi.fn(originalBeforeSend);
  sdk.set_config({ before_send: beforeSend });
  analytics.capture(sdk, {
    event: 'ui_click', properties: {}, insertId: 'fresh-revoked-click',
  });
  expect(beforeSend).not.toHaveBeenCalled();

  analytics.applyConsent(true);
  analytics.applyIdentity('installation-after-revocation');
  expect(sdk.has_opted_in_capturing()).toBe(true);
  const resumed = sdk.capture('consent_resumed_control');
  expect(resumed?.properties).toMatchObject({
    distinct_id: 'installation-after-revocation',
    device_id: 'installation-after-revocation',
    session_id: 'session-test', locale: 'en', app_version: '1.2.3',
    configure_type: 'unknown',
  });
  expect(sdk.config.session_recording).toMatchObject({
    maskAllInputs: true, maskTextSelector: '*', blockSelector: 'iframe',
  });
  analytics.applyConsent(false);
});
