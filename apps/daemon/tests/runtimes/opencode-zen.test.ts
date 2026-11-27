import { describe, expect, it } from 'vitest';

import type { ConnectionTestErrorCode } from '@open-design/contracts';

import {
  detectOpenCodeZenOutdatedClient,
  openCodeZenOutdatedDetail,
  openCodeZenOutdatedErrorCode,
} from '../../src/runtimes/opencode-zen.js';

describe('detectOpenCodeZenOutdatedClient (#9627)', () => {
  it('matches the bare rejection text and captures the required version', () => {
    expect(
      detectOpenCodeZenOutdatedClient('OpenCode 1.18.0 or newer is required to use the free tier.'),
    ).toEqual({ requiredVersion: '1.18.0' });
  });

  it('matches inside a provider error prefix', () => {
    expect(
      detectOpenCodeZenOutdatedClient(
        'Error from provider (Console): OpenCode 1.18.0 or newer is required to use the free tier.',
      ),
    ).toEqual({ requiredVersion: '1.18.0' });
  });

  it('matches JSON-escaped event text', () => {
    const text = JSON.stringify({
      type: 'error',
      error: { data: { message: 'OpenCode v2.0 or newer is required to use the free tier.' } },
    });
    expect(detectOpenCodeZenOutdatedClient(text)).toEqual({ requiredVersion: '2.0' });
  });

  it('is case-insensitive', () => {
    expect(
      detectOpenCodeZenOutdatedClient('opencode 1.18.0 OR NEWER IS REQUIRED TO USE THE FREE TIER'),
    ).toEqual({ requiredVersion: '1.18.0' });
  });

  it('matches without a version and reports null', () => {
    expect(
      detectOpenCodeZenOutdatedClient('OpenCode or newer is required to use the free tier'),
    ).toEqual({ requiredVersion: null });
  });

  it('does not match unrelated text', () => {
    expect(detectOpenCodeZenOutdatedClient('429 Too Many Requests')).toBeNull();
    expect(detectOpenCodeZenOutdatedClient('401 Unauthorized: invalid api key')).toBeNull();
    expect(detectOpenCodeZenOutdatedClient('Node 24 or newer is required')).toBeNull();
    expect(detectOpenCodeZenOutdatedClient('a newer release is required to use the paid tier')).toBeNull();
  });
});

describe('openCodeZenOutdatedDetail', () => {
  it('explains the bundled runtime for byok-opencode', () => {
    const detail = openCodeZenOutdatedDetail('byok-opencode', '1.18.0');
    expect(detail).toContain('bundled with OpenDesign');
    expect(detail).toContain('free tier');
    expect(detail).toContain('1.18.0');
    expect(detail).toContain('own API key');
    expect(detail).toContain('OpenCode Desktop');
  });

  it('points opencode users at their own provider, not the npm v1 tag', () => {
    const detail = openCodeZenOutdatedDetail('opencode', '1.18.0');
    expect(detail).toContain('own API key');
    expect(detail).toContain('1.18.0');
    expect(detail).not.toContain('opencode-ai@latest');
  });

  it('handles an unknown required version', () => {
    for (const id of ['opencode', 'byok-opencode'] as const) {
      const detail = openCodeZenOutdatedDetail(id, null);
      expect(detail).not.toContain('null');
      expect(detail).not.toContain('undefined');
    }
  });
});

describe('openCodeZenOutdatedErrorCode (#9639)', () => {
  it('maps each OpenCode agent to its stable error code', () => {
    const byok: ConnectionTestErrorCode = openCodeZenOutdatedErrorCode('byok-opencode');
    const cli: ConnectionTestErrorCode = openCodeZenOutdatedErrorCode('opencode');
    expect(byok).toBe('opencode_zen_outdated_byok');
    expect(cli).toBe('opencode_zen_outdated_cli');
  });
});
