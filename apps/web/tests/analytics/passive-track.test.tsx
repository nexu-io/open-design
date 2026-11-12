// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnalyticsProvider, useAnalytics, useAppVersion } from '../../src/analytics/provider';
import { observeAnalytics } from '../../src/analytics/observe';

const sink = vi.hoisted(() => ({ client: vi.fn(), capture: vi.fn() }));
vi.mock('../../src/i18n', () => ({ useI18n: () => ({ locale: 'en' }) }));
vi.mock('../../src/analytics/identity', () => ({
  getAnonymousId: () => 'device-test', getSessionId: () => 'session-test',
  detectClientType: () => 'web', isFirstSession: () => false,
}));
vi.mock('../../src/analytics/client', () => ({
  getAnalyticsClient: sink.client, capture: sink.capture,
  getResolvedAnonymousId: () => null,
  applyConsent: vi.fn(), applyIdentity: vi.fn(), bootstrapExceptionTracking: vi.fn(),
  setAnalyticsUserId: vi.fn(), setConfigureGlobals: vi.fn(),
}));
vi.mock('../../src/analytics/error-tracking', () => ({ patchExceptionTrackingAppVersion: vi.fn() }));

function Action() {
  const analytics = useAnalytics();
  const version = useAppVersion();
  const [status, setStatus] = useState('idle');
  return <button onClick={() => {
    observeAnalytics(() => analytics.track('surface_view', { area: 'share_guide' }));
    void fetch('/api/business', { method: 'POST', headers: { 'x-product': 'kept' }, body: 'payload' })
      .then(() => setStatus('done'));
  }}>{version}:{status}</button>;
}

const request = vi.fn<typeof fetch>();
beforeEach(() => {
  vi.clearAllMocks();
  sink.client.mockResolvedValue({ register: vi.fn() });
  request.mockImplementation(async input => String(input) === '/api/version'
    ? Response.json({ version: { version: '1.2.3' } }) : Response.json({ ok: true }));
  vi.stubGlobal('fetch', request);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('real provider passive track task', () => {
  it.each(['disabled', 'enabled', 'rejected', 'pending'] as const)(
    'does not change or delay a business request with %s measurement', async mode => {
      render(<AnalyticsProvider><Action /></AnalyticsProvider>);
      await screen.findByRole('button', { name: '1.2.3:idle' });
      await act(async () => { await Promise.resolve(); });
      const originalFetch = window.fetch;
      if (mode === 'disabled') sink.client.mockResolvedValue(null);
      if (mode === 'rejected') sink.client.mockRejectedValue(new Error('measurement failure'));
      if (mode === 'pending') sink.client.mockReturnValue(new Promise(() => {}));
      fireEvent.click(screen.getByRole('button', { name: '1.2.3:idle' }));
      await screen.findByRole('button', { name: '1.2.3:done' });
      expect(window.fetch).toBe(originalFetch);
      expect(request.mock.calls.filter(([url]) => url === '/api/business')).toEqual([
        ['/api/business', { method: 'POST', headers: { 'x-product': 'kept' }, body: 'payload' }],
      ]);
      if (mode === 'enabled') await waitFor(() => expect(sink.capture).toHaveBeenCalledOnce());
      else if (mode === 'disabled') expect(sink.capture).toHaveBeenCalledWith(null, expect.any(Object));
      else expect(sink.capture).not.toHaveBeenCalled();
    },
  );
});
