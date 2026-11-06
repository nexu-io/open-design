import { describe, expect, it } from 'vitest';
import { resolveVelaConsoleOrigin } from '../src/integrations/vela.js';

// The vela web console origin is the one piece of an internal AMR deployment
// the web runtime needs and cannot infer: wallet / plans / upgrade links point
// at it. Internal environments are not public, so the origin is injected into
// packaged builds at build time (OD_VELA_WEB_URL) and reported to the client
// through GET /api/integrations/vela/status instead of living in web source.
describe('resolveVelaConsoleOrigin', () => {
  it('reports the configured origin with any trailing slash removed', () => {
    expect(
      resolveVelaConsoleOrigin({ OD_VELA_WEB_URL: 'https://vela.example.invalid' }),
    ).toBe('https://vela.example.invalid');
    expect(
      resolveVelaConsoleOrigin({ OD_VELA_WEB_URL: ' https://vela.example.invalid/ ' }),
    ).toBe('https://vela.example.invalid');
  });

  it('reports nothing when the runtime was never given an origin', () => {
    expect(resolveVelaConsoleOrigin({})).toBeUndefined();
    expect(resolveVelaConsoleOrigin({ OD_VELA_WEB_URL: '   ' })).toBeUndefined();
  });

  it('uses the selected profile origin instead of the packaged profile origin', () => {
    const packagedEnv = {
      OPEN_DESIGN_AMR_PROFILE: 'test',
      OD_VELA_WEB_URL: 'https://test.example.invalid',
      OD_VELA_WEB_URLS: JSON.stringify({
        prod: 'https://prod.example.invalid',
        test: 'https://test.example.invalid',
        'feature-test': 'https://feature.example.invalid',
      }),
    };

    expect(resolveVelaConsoleOrigin(packagedEnv, {
      OPEN_DESIGN_AMR_PROFILE: 'prod',
    })).toBe('https://prod.example.invalid');
    expect(resolveVelaConsoleOrigin(packagedEnv, {
      OPEN_DESIGN_AMR_PROFILE: 'feature-test',
    })).toBe('https://feature.example.invalid');
  });

  // The publicly named profiles resolve without any build injection, so their
  // literals in PUBLIC_ORIGINS are the shipped value. vela moved the test Cloud
  // entry off `vela.powerformer.net` onto `open-design.powerformer.net/cloud`
  // (vela #1922 prepare / #1929 finalize); that host maps `/cloud*` and `/amr*`
  // to the Web origin, and the legacy hostname is explicitly no longer a mapped
  // test route, so a stale value here sends every console link off-environment.
  it('resolves the public console origin for a runtime profile selection', () => {
    expect(resolveVelaConsoleOrigin({}, { OPEN_DESIGN_AMR_PROFILE: 'test' })).toBe(
      'https://open-design.powerformer.net/cloud',
    );
    expect(resolveVelaConsoleOrigin({}, { OPEN_DESIGN_AMR_PROFILE: 'prod' })).toBe(
      'https://open-design.ai/cloud',
    );
    expect(resolveVelaConsoleOrigin({}, { OPEN_DESIGN_AMR_PROFILE: 'local' })).toBe(
      'http://localhost:5173',
    );
  });

  // feature-test is deliberately NOT in the public table: its deployment
  // hostname is internal, and this repository ships publicly. It arrives only
  // through OD_VELA_WEB_URLS / OD_VELA_WEB_URL at packaging time, so with no
  // injection the runtime reports nothing rather than guessing a hostname.
  it('has no public origin for the internal feature-test profile', () => {
    expect(
      resolveVelaConsoleOrigin({}, { OPEN_DESIGN_AMR_PROFILE: 'feature-test' }),
    ).toBeUndefined();
  });

  it('never reuses the packaged origin after switching to an unmapped profile', () => {
    expect(resolveVelaConsoleOrigin({
      OPEN_DESIGN_AMR_PROFILE: 'test',
      OD_VELA_WEB_URL: 'https://test.example.invalid',
    }, {
      OPEN_DESIGN_AMR_PROFILE: 'feature-test',
    })).toBeUndefined();
  });
});
