import { describe, expect, it } from 'vitest';
import {
  blockingByokDraftFields,
  cleanByokApiKey,
  normalizeByokBaseUrl,
  resolveByokModelPreference,
  validateByokDraft,
} from '../../src/components/byok/validation';

describe('BYOK draft validation', () => {
  it('cleans pasted API keys without changing the stored value itself', () => {
    expect(cleanByokApiKey(' \u200Bsk-ant-test\n\t')).toBe('sk-ant-test');
  });

  it('normalizes base URL drafts for future field commits', () => {
    expect(normalizeByokBaseUrl('api.openai.com/', 'openai')).toEqual({
      value: 'https://api.openai.com/v1',
      changed: true,
      addedProtocol: true,
      addedOpenAiVersionPath: true,
    });
    expect(normalizeByokBaseUrl('https://api.anthropic.com/', 'anthropic')).toEqual({
      value: 'https://api.anthropic.com',
      changed: true,
      addedProtocol: false,
      addedOpenAiVersionPath: false,
    });
  });

  it('blocks missing required fields before a provider connection test', () => {
    const validation = validateByokDraft('anthropic', {
      apiKey: '',
      baseUrl: '',
      model: '',
    });

    expect(validation.ok).toBe(false);
    expect(blockingByokDraftFields(validation)).toEqual([
      'api_key',
      'base_url',
      'model',
    ]);
  });

  it('detects obvious API keys pasted into the wrong first-party tab', () => {
    const anthropic = validateByokDraft('anthropic', {
      apiKey: 'sk-openai-key',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-sonnet-4-5',
    });
    expect(anthropic.ok).toBe(false);
    expect(anthropic.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'api_key',
          level: 'error',
          code: 'api_key_wrong_protocol',
          detectedProtocol: 'openai',
        }),
      ]),
    );

    const openai = validateByokDraft('openai', {
      apiKey: 'sk-ant-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
    expect(openai.ok).toBe(false);
    expect(openai.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'api_key',
          level: 'error',
          code: 'api_key_wrong_protocol',
          detectedProtocol: 'anthropic',
        }),
      ]),
    );
  });

  it('does not over-block third-party compatible gateways', () => {
    expect(
      validateByokDraft('anthropic', {
        apiKey: 'sk-deepseek-key',
        baseUrl: 'https://api.deepseek.com/anthropic',
        model: 'deepseek-chat',
      }).ok,
    ).toBe(true);
    expect(
      validateByokDraft('openai', {
        apiKey: 'minimax-enterprise-key',
        baseUrl: 'https://api.minimax.io/v1',
        model: 'MiniMax-M1',
      }).ok,
    ).toBe(true);
    expect(
      validateByokDraft('google', {
        apiKey: 'enterprise-gemini-key',
        baseUrl: 'https://gemini.internal.example.com/v1beta',
        model: 'gemini-2.0-flash',
      }).ok,
    ).toBe(true);
  });

  it('can enforce first-party key shape when the first-party Base URL looks mistyped', () => {
    const withoutHint = validateByokDraft('anthropic', {
      apiKey: 'sk-openai-key',
      baseUrl: 'https://api.anthropic.comsssss',
      model: 'claude-sonnet-4-5',
    });
    expect(withoutHint.issues).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'api_key',
          code: 'api_key_wrong_protocol',
        }),
      ]),
    );

    const withHint = validateByokDraft(
      'anthropic',
      {
        apiKey: 'sk-openai-key',
        baseUrl: 'https://api.anthropic.comsssss',
        model: 'claude-sonnet-4-5',
      },
      { keyValidationBaseUrl: 'https://api.anthropic.com' },
    );
    expect(withHint.ok).toBe(false);
    expect(withHint.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'api_key',
          level: 'error',
          code: 'api_key_wrong_protocol',
          detectedProtocol: 'openai',
        }),
      ]),
    );
  });

  it('rejects Anthropic/OpenAI base URLs on the Google Gemini tab', () => {
    const anthropicHost = validateByokDraft('google', {
      apiKey: 'AQ.TestKeyForUnitTests01234567890123456789012',
      baseUrl: 'https://api.anthropic.com',
      model: 'gemini-2.0-flash',
    });
    expect(anthropicHost.ok).toBe(false);
    expect(anthropicHost.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'base_url',
          code: 'base_url_invalid',
        }),
      ]),
    );
  });

  it('accepts Google Gemini AQ. service-account-bound keys on the first-party endpoint', () => {
    expect(
      validateByokDraft('google', {
        apiKey: 'AQ.TestKeyForUnitTests01234567890123456789012',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-2.0-flash',
      }).ok,
    ).toBe(true);
    expect(
      validateByokDraft('google', {
        apiKey: 'AIzaSyD-Aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa1',
        baseUrl: 'https://generativelanguage.googleapis.com',
        model: 'gemini-2.0-flash',
      }).ok,
    ).toBe(true);
  });

  it('still enforces key shape on first-party OpenAI and Google endpoints', () => {
    const openai = validateByokDraft('openai', {
      apiKey: 'enterprise-openai-key',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
    });
    expect(openai.ok).toBe(false);
    expect(openai.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'api_key',
          level: 'error',
          code: 'api_key_malformed',
        }),
      ]),
    );

    const google = validateByokDraft('google', {
      apiKey: 'sk-openai-key',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.0-flash',
    });
    expect(google.ok).toBe(false);
    expect(google.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          field: 'api_key',
          level: 'error',
          code: 'api_key_wrong_protocol',
          detectedProtocol: 'openai',
        }),
      ]),
    );
  });

  it('blocks invalid base URLs and can validate model-fetch drafts without a model', () => {
    const invalid = validateByokDraft('openai', {
      apiKey: 'sk-openai-key',
      baseUrl: 'api.openai.com/v1',
      model: 'gpt-4o',
    });
    expect(invalid.ok).toBe(false);
    expect(blockingByokDraftFields(invalid)).toEqual(['base_url']);

    const modelFetchDraft = validateByokDraft(
      'openai',
      {
        apiKey: 'sk-openai-key',
        baseUrl: 'https://api.openai.com/v1',
        model: '',
      },
      { requireModel: false },
    );
    expect(modelFetchDraft.ok).toBe(true);
  });

  it('defines the model preference order for later model-fetch PRs', () => {
    expect(
      resolveByokModelPreference({
        currentModel: 'custom-model',
        accountModels: [{ id: 'account-model', label: 'Account model' }],
        providerDefaultModel: 'provider-model',
      }),
    ).toEqual({ model: 'custom-model', source: 'explicit' });

    expect(
      resolveByokModelPreference({
        currentModel: '',
        accountModels: [{ id: 'account-model', label: 'Account model' }],
        providerDefaultModel: 'provider-model',
      }),
    ).toEqual({ model: 'account-model', source: 'account' });

    expect(
      resolveByokModelPreference({
        currentModel: '',
        accountModels: [],
        providerDefaultModel: 'provider-model',
      }),
    ).toEqual({ model: 'provider-model', source: 'provider_default' });
  });
});
