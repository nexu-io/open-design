import { describe, expect, it } from 'vitest';

import { resolveVelaControlPlaneApiUrl } from '../src/integrations/vela.js';

// Regression coverage for #9453: on desktop, `vela login` persists the
// daemon-local IPv4 fallback proxy as the profile apiUrl, so a control-plane
// read built as `new URL('/api/v1/...', apiUrl)` pointed the daemon back at
// itself (404) and the Settings model picker hung on "Loading…" forever.
describe('resolveVelaControlPlaneApiUrl', () => {
  it('re-origins a loopback api-proxy apiUrl onto the real AMR control plane', () => {
    const proxyUrl = 'http://127.0.0.1:52431/api/integrations/vela/api-proxy';
    const resolved = resolveVelaControlPlaneApiUrl(proxyUrl);

    // The directory read must leave the daemon, not loop back into it.
    expect(new URL('/api/v1/workspaces', resolved).toString())
      .toBe('https://amr-api.open-design.ai/api/v1/workspaces');
  });

  it.each([
    'http://localhost:52431/api/integrations/vela/api-proxy',
    'http://[::1]:52431/api/integrations/vela/api-proxy',
  ])('covers every loopback host form (%s)', (proxyUrl) => {
    expect(resolveVelaControlPlaneApiUrl(proxyUrl))
      .toBe('https://amr-api.open-design.ai');
  });

  it('leaves a real cloud apiUrl untouched', () => {
    const cloud = 'https://amr-api.open-design.ai';
    expect(resolveVelaControlPlaneApiUrl(cloud)).toBe(cloud);
  });

  it('leaves a non-proxy local endpoint untouched (local profile is a real AMR)', () => {
    // A loopback host alone must not trigger re-origination — only the daemon's
    // own api-proxy path does, so a `local` profile keeps talking to its AMR.
    const localAmr = 'http://localhost:18080';
    expect(resolveVelaControlPlaneApiUrl(localAmr)).toBe(localAmr);
  });

  it('returns an unparseable apiUrl verbatim rather than throwing', () => {
    expect(resolveVelaControlPlaneApiUrl('not a url')).toBe('not a url');
  });
});
