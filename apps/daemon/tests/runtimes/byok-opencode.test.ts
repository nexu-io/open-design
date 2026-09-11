import { describe, expect, it } from 'vitest';

import { agentCapabilities } from '../../src/runtimes/capabilities.js';
import {
  BYOK_OPENCODE_API_KEY_ENV,
  BYOK_OPENCODE_PROVIDER_ID,
  bedrockModelFamily,
  buildOpenCodeByokProviderConfig,
  opencodeByokModelId,
} from '../../src/runtimes/byok-opencode.js';
import { byokOpenCodeAgentDef } from '../../src/runtimes/defs/byok-opencode.js';

describe('byok-opencode runtime config', () => {
  it('gates non-interactive permission bypass on the installed OpenCode capability', () => {
    agentCapabilities.delete('byok-opencode');
    expect(byokOpenCodeAgentDef.helpArgs).toEqual(['run', '--help']);
    expect(byokOpenCodeAgentDef.capabilityFlags).toEqual({
      '--dangerously-skip-permissions': 'skipPermissions',
    });
    expect(byokOpenCodeAgentDef.buildArgs('', [], [], {})).toEqual([
      'run',
      '--format',
      'json',
    ]);

    agentCapabilities.set('byok-opencode', { skipPermissions: true });
    try {
      expect(byokOpenCodeAgentDef.buildArgs('', [], [], { model: 'gpt-5.5' })).toEqual([
        'run',
        '--format',
        'json',
        '--dangerously-skip-permissions',
        '-m',
        'open-design-byok/gpt-5.5',
      ]);
    } finally {
      agentCapabilities.delete('byok-opencode');
    }
  });

  it('prefixes raw BYOK models with the run-scoped OpenCode provider id', () => {
    expect(opencodeByokModelId('gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('open-design-byok/gpt-4o-mini')).toBe('open-design-byok/gpt-4o-mini');
    expect(opencodeByokModelId('default')).toBeNull();
  });

  it('builds OpenAI-compatible provider config without embedding the secret in JSON', () => {
    const out = buildOpenCodeByokProviderConfig(
      {
        protocol: 'senseaudio',
        apiKey: 'sk-secret',
        baseUrl: 'https://api.senseaudio.cn',
      },
      'deepseek-v4-flash',
    );

    expect(out?.modelId).toBe('open-design-byok/deepseek-v4-flash');
    expect(out?.env).toEqual({ [BYOK_OPENCODE_API_KEY_ENV]: 'sk-secret' });
    expect(JSON.stringify(out?.config)).not.toContain('sk-secret');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.senseaudio.cn',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'deepseek-v4-flash': {
              name: 'deepseek-v4-flash',
              limit: {
                context: 128_000,
                output: 16_384,
              },
            },
          },
        },
      },
    });
  });

  it('maps native OpenAI BYOK to the OpenAI provider package', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com/v1' },
      'gpt-5.5',
    );

    expect(out?.modelId).toBe('open-design-byok/gpt-5.5');
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai',
          options: {
            baseURL: 'https://api.openai.com/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'gpt-5.5': {
              name: 'gpt-5.5',
            },
          },
        },
      },
    });
  });

  it('routes OpenAI-protocol BYOK with a non-OpenAI base URL to the OpenAI-compatible provider package', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-deepseek', baseUrl: 'https://api.deepseek.com' },
      'deepseek-v4-pro',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://api.deepseek.com',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'openai', apiKey: 'sk-openai', baseUrl: 'https://api.openai.com' },
      'deepseek-v4-pro',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/openai' } },
    });
  });

  it('normalizes origin-only native provider base URLs for OpenCode provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/anthropic',
          options: { baseURL: 'https://api.anthropic.com/v1' },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com/' },
      'gemini-3.5-flash',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/google',
          options: { baseURL: 'https://generativelanguage.googleapis.com/v1beta' },
        },
      },
    });
  });

  it.each([
    {
      name: 'MiniMax',
      baseUrl: 'https://api.minimax.io/anthropic',
      expectedBaseUrl: 'https://api.minimax.io/anthropic/v1',
    },
    {
      name: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/anthropic',
      expectedBaseUrl: 'https://api.deepseek.com/anthropic/v1',
    },
    {
      name: 'MiMo',
      baseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic',
      expectedBaseUrl: 'https://token-plan-cn.xiaomimimo.com/anthropic/v1',
    },
  ])(
    'adds the Anthropic API version to the $name compatibility base URL',
    ({ baseUrl, expectedBaseUrl }) => {
      expect(buildOpenCodeByokProviderConfig(
        {
          protocol: 'anthropic',
          apiKey: 'anthropic-compatible-key',
          baseUrl,
        },
        'anthropic-compatible-model',
      )?.config).toMatchObject({
        provider: {
          [BYOK_OPENCODE_PROVIDER_ID]: {
            npm: '@ai-sdk/anthropic',
            options: {
              baseURL: expectedBaseUrl,
            },
          },
        },
      });
    },
  );

  it('preserves an Anthropic compatibility base URL that already has a version segment', () => {
    expect(buildOpenCodeByokProviderConfig(
      {
        protocol: 'anthropic',
        apiKey: 'anthropic-compatible-key',
        baseUrl: 'https://gateway.example.com/anthropic/v2/proxy',
      },
      'anthropic-compatible-model',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/anthropic',
          options: {
            baseURL: 'https://gateway.example.com/anthropic/v2/proxy',
          },
        },
      },
    });
  });

  it.each([
    {
      name: 'query parameters',
      baseUrl: 'https://gateway.example.com/anthropic?tenant=x',
      expectedBaseUrl: 'https://gateway.example.com/anthropic/v1?tenant=x',
    },
    {
      name: 'a fragment',
      baseUrl: 'https://gateway.example.com/anthropic#route',
      expectedBaseUrl: 'https://gateway.example.com/anthropic/v1#route',
    },
  ])(
    'preserves $name when versioning an Anthropic compatibility base URL',
    ({ baseUrl, expectedBaseUrl }) => {
      expect(buildOpenCodeByokProviderConfig(
        {
          protocol: 'anthropic',
          apiKey: 'anthropic-compatible-key',
          baseUrl,
        },
        'anthropic-compatible-model',
      )?.config).toMatchObject({
        provider: {
          [BYOK_OPENCODE_PROVIDER_ID]: {
            options: {
              baseURL: expectedBaseUrl,
            },
          },
        },
      });
    },
  );

  it('maps other native BYOK protocols to provider packages', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'anthropic', apiKey: 'sk-ant', baseUrl: 'https://api.anthropic.com' },
      'claude-sonnet-4-5',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/anthropic' } },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'google', apiKey: 'AIza', baseUrl: 'https://generativelanguage.googleapis.com' },
      'gemini-2.5-flash',
    )?.config).toMatchObject({
      provider: { [BYOK_OPENCODE_PROVIDER_ID]: { npm: '@ai-sdk/google' } },
    });
  });

  it('preserves Azure deployment-based URL mode for classic Azure OpenAI resources', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com', apiVersion: '2024-10-21' },
      'gpt-4o',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/azure',
          options: {
            baseURL: 'https://example.openai.azure.com',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
            apiVersion: '2024-10-21',
            useDeploymentBasedUrls: true,
          },
          models: {
            'gpt-4o': {
              name: 'gpt-4o',
            },
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: 'https://example.openai.azure.com' },
      'deployment-one',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          options: {
            apiVersion: '2024-10-21',
            useDeploymentBasedUrls: true,
          },
        },
      },
    });
  });

  it('rejects Azure providers without a base URL', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'azure', apiKey: 'azure-key', baseUrl: '' },
      'gpt-4o',
    )).toBeNull();
  });

  it('keeps Azure OpenAI-compatible v1 paths in model-based URL mode', () => {
    expect(buildOpenCodeByokProviderConfig(
      {
        protocol: 'azure',
        apiKey: 'azure-key',
        baseUrl: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiVersion: '',
      },
      'prod',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/azure',
          options: {
            baseURL: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
        },
      },
    });
    const provider = (buildOpenCodeByokProviderConfig(
      {
        protocol: 'azure',
        apiKey: 'azure-key',
        baseUrl: 'https://resource.services.ai.azure.com/api/projects/project/openai/v1',
        apiVersion: '',
      },
      'prod',
    )?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('useDeploymentBasedUrls');
    expect(provider?.options).not.toHaveProperty('apiVersion');
  });

  it('maps Ollama Cloud to OpenCode documented OpenAI-compatible v1 config', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: 'ollama-key', baseUrl: 'https://ollama.com' },
      'gpt-oss:20b',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'https://ollama.com/v1',
            apiKey: `{env:${BYOK_OPENCODE_API_KEY_ENV}}`,
          },
          models: {
            'gpt-oss:20b': {
              name: 'gpt-oss:20b',
            },
          },
        },
      },
    });
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: 'ollama-key', baseUrl: 'https://ollama.example.com/api' },
      'llama3.1',
    )?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          options: {
            baseURL: 'https://ollama.example.com/v1',
          },
        },
      },
    });
  });

  it('allows keyless local Ollama and normalizes it to the OpenAI-compatible v1 endpoint', () => {
    const out = buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: '', baseUrl: 'http://localhost:11434' },
      'llama3.2',
    );

    expect(out?.modelId).toBe('open-design-byok/llama3.2');
    expect(out?.env).toEqual({});
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://localhost:11434/v1',
          },
        },
      },
    });
    const provider = (out?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('apiKey');
  });

  it('still requires an API key for non-local Ollama providers', () => {
    expect(buildOpenCodeByokProviderConfig(
      { protocol: 'ollama', apiKey: '', baseUrl: 'https://ollama.com' },
      'gpt-oss:20b',
    )).toBeNull();
  });

  it('allows explicit keyless OpenAI-compatible presets such as vLLM', () => {
    const out = buildOpenCodeByokProviderConfig(
      {
        protocol: 'openai',
        apiKey: '',
        baseUrl: 'http://127.0.0.1:8000/v1',
        requiresApiKey: false,
      },
      'model',
    );

    expect(out?.modelId).toBe('open-design-byok/model');
    expect(out?.env).toEqual({});
    expect(out?.config).toMatchObject({
      provider: {
        [BYOK_OPENCODE_PROVIDER_ID]: {
          npm: '@ai-sdk/openai-compatible',
          options: {
            baseURL: 'http://127.0.0.1:8000/v1',
          },
        },
      },
    });
    const provider = (out?.config.provider as Record<string, { options?: Record<string, unknown> }> | undefined)
      ?.[BYOK_OPENCODE_PROVIDER_ID];
    expect(provider?.options).not.toHaveProperty('apiKey');
  });
});

describe('byok-opencode Bedrock provider config', () => {
  it('runs Bedrock under OpenCode\'s own amazon-bedrock provider id in API-key mode', () => {
    const config = buildOpenCodeByokProviderConfig(
      {
        protocol: 'bedrock',
        apiKey: 'ABSKbedrock-key',
        baseUrl: 'https://bedrock-runtime.eu-west-1.amazonaws.com',
      },
      'amazon.nova-2-lite-v1:0',
    );
    expect(config).not.toBeNull();
    expect(config?.providerId).toBe('amazon-bedrock');
    expect(config?.modelId).toBe('amazon-bedrock/amazon.nova-2-lite-v1:0');
    // The bearer token travels through the environment OpenCode's loader reads,
    // never through the JSON config; the region comes from the endpoint host.
    expect(config?.env).toEqual({
      AWS_REGION: 'eu-west-1',
      AWS_BEARER_TOKEN_BEDROCK: 'ABSKbedrock-key',
    });
    expect(JSON.stringify(config?.config)).not.toContain('ABSKbedrock-key');
    expect(config?.config).toMatchObject({
      provider: {
        'amazon-bedrock': {
          npm: '@ai-sdk/amazon-bedrock',
          options: { region: 'eu-west-1' },
          models: { 'amazon.nova-2-lite-v1:0': expect.any(Object) },
        },
      },
    });
    const options = (config?.config as { provider: Record<string, { options: Record<string, unknown> }> })
      .provider['amazon-bedrock']?.options ?? {};
    expect(options.endpoint).toBeUndefined();
    expect(options.profile).toBeUndefined();
  });

  it('routes Anthropic models onto the Bedrock Anthropic Messages endpoint in API-key mode', () => {
    const config = buildOpenCodeByokProviderConfig(
      {
        protocol: 'bedrock',
        apiKey: 'ABSKbedrock-key',
        baseUrl: 'https://bedrock-runtime.eu-west-1.amazonaws.com',
      },
      'global.anthropic.claude-sonnet-5',
    );
    expect(config?.providerId).toBe('open-design-bedrock-anthropic');
    expect(config?.modelId).toBe('open-design-bedrock-anthropic/global.anthropic.claude-sonnet-5');
    expect(config?.env).toEqual({
      AWS_REGION: 'eu-west-1',
      OPEN_DESIGN_BYOK_API_KEY: 'ABSKbedrock-key',
    });
    expect(JSON.stringify(config?.config)).not.toContain('ABSKbedrock-key');
    expect(config?.config).toMatchObject({
      provider: {
        'open-design-bedrock-anthropic': {
          npm: '@ai-sdk/anthropic',
          options: {
            baseURL: 'https://bedrock-runtime.eu-west-1.amazonaws.com/anthropic/v1',
            apiKey: '{env:OPEN_DESIGN_BYOK_API_KEY}',
          },
          models: { 'global.anthropic.claude-sonnet-5': expect.any(Object) },
        },
      },
    });
  });

  it('routes OpenAI models onto the Bedrock OpenAI Responses endpoint in API-key mode', () => {
    const config = buildOpenCodeByokProviderConfig(
      {
        protocol: 'bedrock',
        apiKey: 'ABSKbedrock-key',
        baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
      },
      'us.openai.gpt-6-astra',
    );
    expect(config?.providerId).toBe('open-design-bedrock-openai');
    expect(config?.modelId).toBe('open-design-bedrock-openai/us.openai.gpt-6-astra');
    expect(config?.config).toMatchObject({
      provider: {
        'open-design-bedrock-openai': {
          npm: '@ai-sdk/openai',
          options: {
            baseURL: 'https://bedrock-runtime.us-east-1.amazonaws.com/openai/v1',
            apiKey: '{env:OPEN_DESIGN_BYOK_API_KEY}',
          },
        },
      },
    });
  });

  it('keeps a custom endpoint as the base of the family routes', () => {
    const config = buildOpenCodeByokProviderConfig(
      {
        protocol: 'bedrock',
        apiKey: 'ABSKbedrock-key',
        baseUrl: 'https://bedrock-runtime.eu-west-1.vpce-0abc123.amazonaws.com/',
      },
      'eu.anthropic.claude-sonnet-5',
    );
    expect(config?.config).toMatchObject({
      provider: {
        'open-design-bedrock-anthropic': {
          options: { baseURL: 'https://bedrock-runtime.eu-west-1.vpce-0abc123.amazonaws.com/anthropic/v1' },
        },
      },
    });
  });

  it('keeps Anthropic and OpenAI models on Converse in AWS-profile mode', () => {
    for (const model of ['global.anthropic.claude-sonnet-5', 'us.openai.gpt-6-astra']) {
      const config = buildOpenCodeByokProviderConfig(
        {
          protocol: 'bedrock',
          apiKey: '',
          awsProfile: 'sandbox',
          baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        },
        model,
      );
      expect(config?.providerId, model).toBe('amazon-bedrock');
      expect(config?.modelId, model).toBe(`amazon-bedrock/${model}`);
      expect(config?.env, model).toEqual({ AWS_REGION: 'us-east-1' });
    }
  });

  it('recognises the vendor of plain, cross-region and ARN model ids', () => {
    expect(bedrockModelFamily('anthropic.claude-sonnet-5')).toBe('anthropic');
    expect(bedrockModelFamily('global.anthropic.claude-sonnet-5')).toBe('anthropic');
    expect(bedrockModelFamily('us-gov.anthropic.claude-sonnet-5')).toBe('anthropic');
    expect(bedrockModelFamily('openai.gpt-oss-120b')).toBe('openai');
    expect(bedrockModelFamily('us.openai.gpt-6-astra')).toBe('openai');
    expect(
      bedrockModelFamily('arn:aws:bedrock:eu-west-1:123456789012:inference-profile/eu.anthropic.claude-sonnet-5'),
    ).toBe('anthropic');
    expect(bedrockModelFamily('amazon.nova-2-lite-v1:0')).toBe('other');
    expect(bedrockModelFamily('meta.llama4-maverick-17b-instruct-v1:0')).toBe('other');
  });

  it('does not double-prefix an already qualified family provider model id', () => {
    expect(opencodeByokModelId('open-design-bedrock-openai/us.openai.gpt-6-astra')).toBe(
      'open-design-bedrock-openai/us.openai.gpt-6-astra',
    );
  });

  it('declares text, image and pdf input for the Anthropic and OpenAI families', () => {
    const base = { protocol: 'bedrock' as const, apiKey: 'ABSKbedrock-key', baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com' };
    const modalitiesOf = (model: string, providerId: string) =>
      (buildOpenCodeByokProviderConfig(base, model)?.config as {
        provider: Record<string, { models: Record<string, { modalities?: unknown }> }>;
      }).provider[providerId]?.models[model]?.modalities;
    const expected = { input: ['text', 'image', 'pdf'], output: ['text'] };
    expect(modalitiesOf('global.anthropic.claude-sonnet-5', 'open-design-bedrock-anthropic')).toEqual(expected);
    expect(modalitiesOf('us.openai.gpt-6-astra', 'open-design-bedrock-openai')).toEqual(expected);
    expect(modalitiesOf('amazon.nova-2-lite-v1:0', 'amazon-bedrock')).toBeUndefined();
  });


  it('sizes the model window by family so Claude prompts do not trip OpenCode compaction', () => {
    const limitOf = (config: ReturnType<typeof buildOpenCodeByokProviderConfig>, providerId: string, model: string) =>
      (config?.config as { provider: Record<string, { models: Record<string, { limit: unknown }> }> })
        .provider[providerId]?.models[model]?.limit;
    const base = { protocol: 'bedrock' as const, baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com' };
    expect(
      limitOf(
        buildOpenCodeByokProviderConfig({ ...base, apiKey: 'ABSKbedrock-key' }, 'global.anthropic.claude-sonnet-5'),
        'open-design-bedrock-anthropic',
        'global.anthropic.claude-sonnet-5',
      ),
    ).toEqual({ context: 200_000, output: 32_000 });
    expect(
      limitOf(
        buildOpenCodeByokProviderConfig({ ...base, apiKey: '', awsProfile: 'sandbox' }, 'global.anthropic.claude-sonnet-5'),
        'amazon-bedrock',
        'global.anthropic.claude-sonnet-5',
      ),
    ).toEqual({ context: 200_000, output: 32_000 });
    expect(
      limitOf(
        buildOpenCodeByokProviderConfig({ ...base, apiKey: 'ABSKbedrock-key' }, 'us.openai.gpt-6-astra'),
        'open-design-bedrock-openai',
        'us.openai.gpt-6-astra',
      ),
    ).toEqual({ context: 400_000, output: 32_000 });
    expect(
      limitOf(
        buildOpenCodeByokProviderConfig({ ...base, apiKey: 'ABSKbedrock-key' }, 'amazon.nova-2-lite-v1:0'),
        'amazon-bedrock',
        'amazon.nova-2-lite-v1:0',
      ),
    ).toEqual({ context: 128_000, output: 16_384 });
  });

  it('passes the AWS profile to OpenCode and exports no bearer token in profile mode', () => {
    const config = buildOpenCodeByokProviderConfig(
      {
        protocol: 'bedrock',
        apiKey: '',
        awsProfile: 'sandbox',
        baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com',
        requiresApiKey: false,
      },
      'amazon.nova-lite-v1:0',
    );
    expect(config?.env).toEqual({ AWS_REGION: 'us-east-1' });
    expect(config?.config).toMatchObject({
      provider: {
        'amazon-bedrock': { options: { region: 'us-east-1', profile: 'sandbox' } },
      },
    });
  });

  it('forwards a custom Bedrock endpoint (VPC endpoint) and keeps its region', () => {
    const config = buildOpenCodeByokProviderConfig(
      {
        protocol: 'bedrock',
        apiKey: 'ABSK',
        baseUrl: 'https://bedrock-runtime.eu-west-1.vpce-0abc123.amazonaws.com/',
      },
      'amazon.nova-lite-v1:0',
    );
    expect(config?.config).toMatchObject({
      provider: {
        'amazon-bedrock': {
          options: {
            region: 'eu-west-1',
            endpoint: 'https://bedrock-runtime.eu-west-1.vpce-0abc123.amazonaws.com',
          },
        },
      },
    });
  });

  it('rejects a Bedrock config with neither a key nor a profile', () => {
    expect(
      buildOpenCodeByokProviderConfig(
        { protocol: 'bedrock', apiKey: '', baseUrl: 'https://bedrock-runtime.us-east-1.amazonaws.com' },
        'amazon.nova-lite-v1:0',
      ),
    ).toBeNull();
  });

  it('does not double-prefix an already qualified amazon-bedrock model id', () => {
    expect(opencodeByokModelId('amazon-bedrock/amazon.nova-lite-v1:0')).toBe(
      'amazon-bedrock/amazon.nova-lite-v1:0',
    );
    expect(opencodeByokModelId('amazon.nova-lite-v1:0', 'bedrock')).toBe(
      'amazon-bedrock/amazon.nova-lite-v1:0',
    );
  });
});
