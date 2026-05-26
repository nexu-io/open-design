import { describe, expect, it } from 'vitest';

import {
  buildFinalizeCredentialsMissingToast,
  buildFinalizeRequest,
  isFinalizeByokConfigured,
} from '../../src/lib/resolve-finalize-request';
import { DEFAULT_CONFIG } from '../../src/state/config';

describe('resolve-finalize-request', () => {
  it('returns null when BYOK credentials are missing', () => {
    expect(
      buildFinalizeRequest({
        ...DEFAULT_CONFIG,
        mode: 'daemon',
        apiKey: '',
        model: 'claude-sonnet-4-5',
      }),
    ).toBeNull();
    expect(isFinalizeByokConfigured(DEFAULT_CONFIG)).toBe(false);
  });

  it('resolves credentials from apiProtocolConfigs when top-level fields are empty', () => {
    const request = buildFinalizeRequest({
      ...DEFAULT_CONFIG,
      mode: 'daemon',
      apiProtocol: 'google',
      apiKey: '',
      baseUrl: '',
      model: '',
      apiProtocolConfigs: {
        google: {
          apiKey: 'google-key',
          baseUrl: 'https://generativelanguage.googleapis.com',
          model: 'gemini-2.5-pro',
        },
      },
    });

    expect(request).toMatchObject({
      protocol: 'google',
      apiKey: 'google-key',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.5-pro',
    });
    expect(isFinalizeByokConfigured({
      ...DEFAULT_CONFIG,
      mode: 'daemon',
      apiProtocol: 'google',
      apiKey: '',
      model: '',
      apiProtocolConfigs: {
        google: {
          apiKey: 'google-key',
          baseUrl: 'https://generativelanguage.googleapis.com',
          model: 'gemini-2.5-pro',
        },
      },
    })).toBe(true);
  });

  it('surfaces a Local CLI-specific toast when finalize lacks BYOK settings', () => {
    expect(
      buildFinalizeCredentialsMissingToast({
        ...DEFAULT_CONFIG,
        mode: 'daemon',
      }).message,
    ).toContain('Local CLI login is used for chat only');
  });

  it('surfaces the generic BYOK toast when execution mode is api', () => {
    expect(
      buildFinalizeCredentialsMissingToast({
        ...DEFAULT_CONFIG,
        mode: 'api',
      }).message,
    ).toBe('Bad request — check the API key and model.');
  });
});
