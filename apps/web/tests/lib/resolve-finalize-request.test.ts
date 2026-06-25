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

  it('allows default provider finalize configs without a base URL', () => {
    const config = {
      ...DEFAULT_CONFIG,
      mode: 'api' as const,
      apiProtocol: 'anthropic' as const,
      apiKey: 'anthropic-key',
      baseUrl: '',
      model: 'claude-sonnet-4-5',
    };

    expect(isFinalizeByokConfigured(config)).toBe(true);
    expect(buildFinalizeRequest(config)).toMatchObject({
      protocol: 'anthropic',
      credentialSource: 'user',
      apiKey: 'anthropic-key',
      model: 'claude-sonnet-4-5',
    });
    expect(buildFinalizeRequest(config)).not.toHaveProperty('baseUrl');
  });

  it('builds deployment-sourced OpenAI finalize requests without browser credentials', () => {
    const request = buildFinalizeRequest({
      ...DEFAULT_CONFIG,
      mode: 'api',
      apiProtocol: 'openai',
      apiCredentialSource: 'deployment',
      apiKey: 'stale-browser-key',
      baseUrl: 'https://stale.example.test/v1',
      model: 'gpt-routed',
    });

    expect(request).toMatchObject({
      protocol: 'openai',
      credentialSource: 'deployment',
      model: 'gpt-routed',
    });
    expect(request).not.toMatchObject({
      apiKey: 'stale-browser-key',
      baseUrl: 'https://stale.example.test/v1',
    });
    expect(isFinalizeByokConfigured({
      ...DEFAULT_CONFIG,
      mode: 'api',
      apiProtocol: 'openai',
      apiCredentialSource: 'deployment',
      apiKey: '',
      baseUrl: '',
      model: 'gpt-routed',
    })).toBe(true);
  });

  it('uses the live deployment model instead of the preserved OpenAI BYOK draft', () => {
    const config = {
      ...DEFAULT_CONFIG,
      mode: 'api' as const,
      apiProtocol: 'openai' as const,
      apiCredentialSource: 'deployment' as const,
      apiKey: '',
      baseUrl: '',
      model: 'gpt-routed',
      apiProtocolConfigs: {
        openai: {
          apiKey: 'user-openai-key',
          baseUrl: 'https://api.openai.com/v1',
          model: 'gpt-user',
          apiCredentialSource: 'user' as const,
        },
      },
    };

    expect(buildFinalizeRequest(config)).toMatchObject({
      protocol: 'openai',
      credentialSource: 'deployment',
      model: 'gpt-routed',
    });
    expect(isFinalizeByokConfigured(config)).toBe(true);
    expect(buildFinalizeRequest({
      ...config,
      model: '',
    })).toBeNull();
    expect(isFinalizeByokConfigured({
      ...config,
      model: '',
    })).toBe(false);
  });

  it('rejects deployment-sourced finalize requests for non-OpenAI protocols', () => {
    expect(buildFinalizeRequest({
      ...DEFAULT_CONFIG,
      mode: 'api',
      apiProtocol: 'anthropic',
      apiCredentialSource: 'deployment',
      apiKey: '',
      baseUrl: '',
      model: 'claude-sonnet-4-5',
    })).toBeNull();
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
