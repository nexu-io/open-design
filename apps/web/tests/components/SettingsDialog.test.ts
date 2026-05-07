import { describe, expect, it } from 'vitest';
import {
  agentRefreshOptionsForConfig,
  canRunProviderConnectionTest,
  deriveComposioCredentialState,
  isValidApiBaseUrl,
  shouldShowCustomModelInput,
  switchApiProtocolConfig,
  testStatusVariant,
  updateAgentCliEnvValue,
  updateCurrentApiProtocolConfig,
} from '../../src/components/SettingsDialog';
import type { AppConfig, ConnectionTestResponse } from '../../src/types';

const baseConfig: AppConfig = {
  mode: 'api',
  apiKey: 'sk-test',
  apiProtocol: 'anthropic',
  baseUrl: 'https://api.anthropic.com',
  model: 'claude-sonnet-4-5',
  apiProviderBaseUrl: 'https://api.anthropic.com',
  agentId: null,
  skillId: null,
  designSystemId: null,
};

describe('SettingsDialog API protocol switching', () => {
  it('stores the current custom protocol config while preserving custom endpoint details', () => {
    const config: AppConfig = {
      ...baseConfig,
      apiKey: 'anthropic-key',
      apiProviderBaseUrl: null,
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
    };

    const next = switchApiProtocolConfig(config, 'openai');

    expect(next).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
      apiProviderBaseUrl: null,
    });
    expect(next.apiProtocolConfigs?.anthropic).toMatchObject({
      apiKey: 'anthropic-key',
      baseUrl: 'https://my-proxy.example.com',
      model: 'my-model',
      apiProviderBaseUrl: null,
    });
  });

  it('restores each protocol draft instead of leaking shared field values', () => {
    const openai = switchApiProtocolConfig(baseConfig, 'openai');
    const openaiEdited = updateCurrentApiProtocolConfig(openai, {
      apiKey: 'openai-key',
      baseUrl: 'https://openai-proxy.example.com',
      model: 'openai-model',
      apiProviderBaseUrl: null,
    });
    const google = switchApiProtocolConfig(openaiEdited, 'google');
    const googleEdited = updateCurrentApiProtocolConfig(google, {
      apiKey: 'google-key',
      baseUrl: 'https://google-proxy.example.com',
      model: 'google-model',
      apiProviderBaseUrl: null,
    });

    const restoredOpenai = switchApiProtocolConfig(googleEdited, 'openai');

    expect(restoredOpenai).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: 'openai-key',
      baseUrl: 'https://openai-proxy.example.com',
      model: 'openai-model',
      apiProviderBaseUrl: null,
    });
    expect(restoredOpenai.apiProtocolConfigs?.google).toMatchObject({
      apiKey: 'google-key',
      baseUrl: 'https://google-proxy.example.com',
      model: 'google-model',
      apiProviderBaseUrl: null,
    });
  });

  it('loads the new protocol default on first visit', () => {
    expect(switchApiProtocolConfig(baseConfig, 'openai')).toMatchObject({
      mode: 'api',
      apiProtocol: 'openai',
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      apiProviderBaseUrl: 'https://api.openai.com/v1',
    });
  });

  it('auto-fills Google defaults when switching from a selected known provider', () => {
    expect(switchApiProtocolConfig(baseConfig, 'google')).toMatchObject({
      mode: 'api',
      apiProtocol: 'google',
      apiKey: '',
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-2.0-flash',
      apiProviderBaseUrl: 'https://generativelanguage.googleapis.com',
    });
  });

  it('keeps Azure API version in the Azure draft only', () => {
    const config: AppConfig = {
      ...baseConfig,
      apiProtocol: 'azure',
      apiKey: 'azure-key',
      model: 'deployment-one',
      apiVersion: '2024-10-21',
    };

    const next = switchApiProtocolConfig(config, 'openai');

    expect(next).toMatchObject({
      apiProtocol: 'openai',
      apiKey: '',
      apiVersion: '',
    });
    expect(next.apiProtocolConfigs?.azure).toMatchObject({
      apiKey: 'azure-key',
      model: 'deployment-one',
      apiVersion: '2024-10-21',
    });
  });
});

describe('SettingsDialog test status variant', () => {
  const baseResult: ConnectionTestResponse = { ok: false, kind: 'unknown', latencyMs: 0 };
  it('returns success for an ok result', () => {
    expect(testStatusVariant({ ok: true, kind: 'success', latencyMs: 12 })).toBe(
      'success',
    );
  });
  it('returns warn for rate-limit (config still looks valid)', () => {
    expect(testStatusVariant({ ...baseResult, kind: 'rate_limited' })).toBe(
      'warn',
    );
  });
  it('returns error for the failure kinds', () => {
    for (const kind of [
      'auth_failed',
      'forbidden',
      'not_found_model',
      'invalid_model_id',
      'invalid_base_url',
      'upstream_unavailable',
      'timeout',
      'agent_not_installed',
      'agent_spawn_failed',
      'unknown',
    ] as const) {
      expect(testStatusVariant({ ...baseResult, kind })).toBe('error');
    }
  });
});

describe('SettingsDialog provider connection test requirements', () => {
  it('allows Azure tests to use the daemon default API version', () => {
    expect(
      canRunProviderConnectionTest({
        apiKey: 'azure-key',
        baseUrl: 'https://my-azure.openai.azure.com',
        model: 'deployment-one',
      }),
    ).toBe(true);
  });

  it('still requires the shared provider fields', () => {
    expect(
      canRunProviderConnectionTest({ ...baseConfig, apiKey: '' }),
    ).toBe(false);
    expect(
      canRunProviderConnectionTest({ ...baseConfig, baseUrl: '' }),
    ).toBe(false);
    expect(
      canRunProviderConnectionTest({ ...baseConfig, model: '' }),
    ).toBe(false);
  });
});

describe('SettingsDialog custom model picker state', () => {
  it('keeps custom input visible while an intermediate value matches a known model', () => {
    expect(
      shouldShowCustomModelInput('gpt-5', ['gpt-5', 'o3'], true),
    ).toBe(true);
  });

  it('uses the dropdown when a known model is selected outside custom mode', () => {
    expect(
      shouldShowCustomModelInput('gpt-5', ['gpt-5', 'o3'], false),
    ).toBe(false);
  });

  it('shows custom input for unknown or empty model values', () => {
    expect(
      shouldShowCustomModelInput('gpt-5.5', ['gpt-5', 'o3'], false),
    ).toBe(true);
    expect(shouldShowCustomModelInput('', ['gpt-5', 'o3'], false)).toBe(true);
  });
});

describe('SettingsDialog API Base URL validation', () => {
  it('accepts public http/https URLs and loopback local providers', () => {
    expect(isValidApiBaseUrl('https://api.openai.com/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://localhost:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://127.0.0.1:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://[::1]:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('http://[::ffff:127.0.0.1]:11434/v1')).toBe(true);
    expect(isValidApiBaseUrl('  https://resource.openai.azure.com  ')).toBe(true);

    expect(isValidApiBaseUrl('ddddd')).toBe(false);
    expect(isValidApiBaseUrl('api.openai.com/v1')).toBe(false);
    expect(isValidApiBaseUrl('ftp://api.example.com')).toBe(false);
    expect(isValidApiBaseUrl('http:api.example.com')).toBe(false);
    expect(isValidApiBaseUrl('https://')).toBe(false);
    expect(isValidApiBaseUrl('http://10.0.0.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://169.254.1.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://172.16.0.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://192.168.1.5:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://[fd00::1]:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://[fe80::1]:11434/v1')).toBe(false);
    expect(isValidApiBaseUrl('http://[::ffff:192.168.1.5]:11434/v1')).toBe(false);
  });
});

describe('SettingsDialog agent CLI env settings', () => {
  it('updates supported per-agent CLI env values without dropping sibling agents', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    };

    const next = updateAgentCliEnvValue(
      config,
      'claude',
      'CLAUDE_CONFIG_DIR',
      '  ~/.claude-2  ',
    );

    expect(next.agentCliEnv).toEqual({
      claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
      codex: { CODEX_HOME: '~/.codex-alt' },
    });
  });

  it('updates additional Codex CLI env values without dropping sibling Codex fields', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    };

    const next = updateAgentCliEnvValue(
      config,
      'codex',
      'CODEX_BIN',
      '  ~/bin/codex-next  ',
    );

    expect(next.agentCliEnv).toEqual({
      codex: { CODEX_HOME: '~/.codex-alt', CODEX_BIN: '~/bin/codex-next' },
    });
  });

  it('removes empty per-agent CLI env entries', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-2' },
        codex: { CODEX_HOME: '~/.codex-alt' },
      },
    };

    const next = updateAgentCliEnvValue(
      config,
      'claude',
      'CLAUDE_CONFIG_DIR',
      '',
    );

    expect(next.agentCliEnv).toEqual({
      codex: { CODEX_HOME: '~/.codex-alt' },
    });
  });

  it('passes pending CLI env prefs through agent rescan options', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-pending' },
      },
    };

    expect(agentRefreshOptionsForConfig(config)).toEqual({
      throwOnError: true,
      agentCliEnv: {
        claude: { CLAUDE_CONFIG_DIR: '~/.claude-pending' },
      },
    });
  });

  it('passes an empty CLI env object through agent rescan after fields are cleared', () => {
    const config: AppConfig = {
      ...baseConfig,
      mode: 'daemon',
      agentCliEnv: {},
    };

    expect(agentRefreshOptionsForConfig(config)).toEqual({
      throwOnError: true,
      agentCliEnv: {},
    });
  });
});

describe('deriveComposioCredentialState', () => {
  // Issue #741: when a Composio API key is already saved and the user
  // starts typing a draft replacement, the saved-key indicator must
  // stay visible. The previous code conflated `saved + draft` with
  // `draft only` and made the badge vanish on the first keystroke.

  it('returns "empty" when nothing is configured and the field is empty', () => {
    expect(deriveComposioCredentialState({})).toBe('empty');
    expect(deriveComposioCredentialState(null)).toBe('empty');
    expect(deriveComposioCredentialState(undefined)).toBe('empty');
    expect(deriveComposioCredentialState({ apiKey: '' })).toBe('empty');
    expect(deriveComposioCredentialState({ apiKey: '   ' })).toBe('empty');
  });

  it('returns "saved" when a key is configured and no draft is being typed', () => {
    expect(
      deriveComposioCredentialState({ apiKeyConfigured: true }),
    ).toBe('saved');
    expect(
      deriveComposioCredentialState({ apiKey: '', apiKeyConfigured: true }),
    ).toBe('saved');
    expect(
      deriveComposioCredentialState({ apiKey: '   ', apiKeyConfigured: true }),
    ).toBe('saved');
  });

  it('returns "pending-new" when only a draft is being typed (no saved key)', () => {
    expect(deriveComposioCredentialState({ apiKey: 'sk-draft' })).toBe('pending-new');
    expect(
      deriveComposioCredentialState({ apiKey: 'sk-draft', apiKeyConfigured: false }),
    ).toBe('pending-new');
  });

  it('returns "saved-pending" when a key is saved AND a draft is being typed', () => {
    // Regression: this is the state that previously masqueraded as
    // "pending-new" and made the saved-key badge disappear.
    expect(
      deriveComposioCredentialState({ apiKey: 'sk-replacement', apiKeyConfigured: true }),
    ).toBe('saved-pending');
  });

  it('treats whitespace-only drafts as no draft so the badge is anchored on "saved"', () => {
    expect(
      deriveComposioCredentialState({ apiKey: '   \t\n', apiKeyConfigured: true }),
    ).toBe('saved');
  });
});
