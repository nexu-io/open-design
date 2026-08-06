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
});
