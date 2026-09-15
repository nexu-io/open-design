import { describe, expect, it, vi } from 'vitest';

import {
  composeBedrockModelOptions,
  listBedrockModels,
  type BedrockCatalog,
} from '../../src/integrations/bedrock-models.js';
import type { CliRunResult, CliRunner } from '../../src/integrations/bedrock-aws-cli.js';

const CATALOG: BedrockCatalog = {
  modelSummaries: [
    {
      modelId: 'anthropic.claude-sonnet-5',
      modelName: 'Claude Sonnet 5',
      providerName: 'Anthropic',
      inputModalities: ['TEXT', 'IMAGE'],
      outputModalities: ['TEXT'],
      inferenceTypesSupported: ['INFERENCE_PROFILE'],
      modelLifecycle: { status: 'ACTIVE' },
    },
    {
      modelId: 'amazon.nova-lite-v1:0',
      modelName: 'Nova Lite',
      providerName: 'Amazon',
      inputModalities: ['TEXT', 'IMAGE', 'VIDEO'],
      outputModalities: ['TEXT'],
      inferenceTypesSupported: ['ON_DEMAND', 'INFERENCE_PROFILE'],
      modelLifecycle: { status: 'ACTIVE' },
    },
    {
      modelId: 'amazon.nova-lite-v1:0:24k',
      modelName: 'Nova Lite',
      providerName: 'Amazon',
      inputModalities: ['TEXT'],
      outputModalities: ['TEXT'],
      inferenceTypesSupported: ['PROVISIONED'],
      modelLifecycle: { status: 'ACTIVE' },
    },
    {
      modelId: 'cohere.rerank-v3-5:0',
      modelName: 'Rerank 3.5',
      providerName: 'Cohere',
      inputModalities: ['TEXT'],
      outputModalities: ['TEXT'],
      inferenceTypesSupported: ['ON_DEMAND'],
      modelLifecycle: { status: 'LEGACY' },
    },
    {
      modelId: 'amazon.titan-embed-text-v2:0',
      modelName: 'Titan Embed',
      providerName: 'Amazon',
      inputModalities: ['TEXT'],
      outputModalities: ['EMBEDDING'],
      inferenceTypesSupported: ['ON_DEMAND'],
      modelLifecycle: { status: 'ACTIVE' },
    },
  ],
  inferenceProfileSummaries: [
    {
      inferenceProfileId: 'global.anthropic.claude-sonnet-5',
      inferenceProfileName: 'Global Anthropic Claude Sonnet 5',
      status: 'ACTIVE',
      type: 'SYSTEM_DEFINED',
      models: [{ modelArn: 'arn:aws:bedrock:us-east-1::foundation-model/anthropic.claude-sonnet-5' }],
    },
    {
      inferenceProfileId: 'eu.anthropic.claude-sonnet-5',
      inferenceProfileName: 'EU Anthropic Claude Sonnet 5',
      status: 'ACTIVE',
      type: 'SYSTEM_DEFINED',
      models: [{ modelArn: 'arn:aws:bedrock:eu-west-1::foundation-model/anthropic.claude-sonnet-5' }],
    },
    {
      inferenceProfileId: 'eu.amazon.nova-lite-v1:0',
      inferenceProfileName: 'EU Nova Lite',
      status: 'ACTIVE',
      type: 'SYSTEM_DEFINED',
      models: [{ modelArn: 'arn:aws:bedrock:eu-west-1::foundation-model/amazon.nova-lite-v1:0' }],
    },
    {
      inferenceProfileId: 'eu.stability.stable-image-core-v1:1',
      inferenceProfileName: 'EU Stable Image Core',
      status: 'ACTIVE',
      type: 'SYSTEM_DEFINED',
      models: [{ modelArn: 'arn:aws:bedrock:eu-west-1::foundation-model/stability.stable-image-core-v1:1' }],
    },
  ],
};

describe('composeBedrockModelOptions', () => {
  it('lists global profiles, then regional profiles, then on-demand models, text-only and active-only', () => {
    const options = composeBedrockModelOptions(CATALOG);
    expect(options.map((o) => o.id)).toEqual([
      'global.anthropic.claude-sonnet-5',
      'eu.anthropic.claude-sonnet-5',
      'eu.amazon.nova-lite-v1:0',
      'amazon.nova-lite-v1:0',
    ]);
    expect(options[0]?.label).toBe('Claude Sonnet 5 (global)');
    expect(options[1]?.label).toBe('Claude Sonnet 5 (EU cross-region)');
    // Provisioned-only variants, embeddings, legacy models and profiles whose
    // model is not a text model never reach the picker.
    expect(options.some((o) => o.id.includes(':24k'))).toBe(false);
    expect(options.some((o) => o.id.includes('embed'))).toBe(false);
    expect(options.some((o) => o.id.includes('stability'))).toBe(false);
  });
});

describe('listBedrockModels (API key)', () => {
  it('calls the bedrock control plane with the bearer token and follows nextToken', async () => {
    const calls: string[] = [];
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      calls.push(url.toString());
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer ABSKtest');
      if (url.pathname === '/foundation-models') {
        expect(url.searchParams.get('byOutputModality')).toBe('TEXT');
        return new Response(JSON.stringify({ modelSummaries: CATALOG.modelSummaries }), { status: 200 });
      }
      if (url.pathname === '/inference-profiles') {
        if (!url.searchParams.get('nextToken')) {
          return new Response(
            JSON.stringify({ inferenceProfileSummaries: CATALOG.inferenceProfileSummaries.slice(0, 2), nextToken: 'p2' }),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify({ inferenceProfileSummaries: CATALOG.inferenceProfileSummaries.slice(2) }),
          { status: 200 },
        );
      }
      return new Response('not found', { status: 404 });
    }) as unknown as typeof fetch;

    const result = await listBedrockModels(
      { region: 'eu-west-1', apiKey: 'ABSKtest' },
      { fetchImpl },
    );

    expect(result.ok).toBe(true);
    expect(result.models?.map((m) => m.id)).toContain('eu.amazon.nova-lite-v1:0');
    expect(calls.every((u) => u.startsWith('https://bedrock.eu-west-1.amazonaws.com/'))).toBe(true);
    expect(calls.filter((u) => u.includes('/inference-profiles'))).toHaveLength(2);
  });

  it('maps a rejected bearer to auth_failed without leaking the key', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ Message: 'Authentication failed: Please make sure your API Key is valid.' }), { status: 403 }),
    ) as unknown as typeof fetch;

    const result = await listBedrockModels(
      { region: 'us-east-1', apiKey: 'ABSKsecret' },
      { fetchImpl },
    );

    expect(result).toMatchObject({ ok: false, kind: 'auth_failed', status: 403 });
    expect(result.detail).toContain('API Key is valid');
    expect(JSON.stringify(result)).not.toContain('ABSKsecret');
  });
});

describe('listBedrockModels (AWS profile)', () => {
  const ok = (stdout: string): CliRunResult => ({ code: 0, signal: null, stdout, stderr: '', timedOut: false });

  it('lists through the AWS CLI with the profile and region', async () => {
    const calls: string[][] = [];
    const runCli: CliRunner = vi.fn(async (_bin, args) => {
      calls.push(args);
      if (args.includes('list-foundation-models')) return ok(JSON.stringify({ modelSummaries: CATALOG.modelSummaries }));
      return ok(JSON.stringify({ inferenceProfileSummaries: CATALOG.inferenceProfileSummaries }));
    });

    const result = await listBedrockModels(
      { region: 'eu-west-1', apiKey: '', awsProfile: 'sandbox' },
      { resolveAwsCli: () => '/usr/local/bin/aws', runCli },
    );

    expect(result.ok).toBe(true);
    expect(result.models).toHaveLength(4);
    for (const args of calls) {
      expect(args).toEqual(expect.arrayContaining(['--profile', 'sandbox', '--region', 'eu-west-1', 'bedrock']));
    }
    expect(calls.some((a) => a.includes('list-inference-profiles') && a.includes('SYSTEM_DEFINED'))).toBe(true);
  });

  it('reports an expired SSO session as auth_failed pointing at Test connection, and never runs sso login', async () => {
    const runCli: CliRunner = vi.fn(async (_bin, args) => {
      expect(args).not.toContain('sso');
      return { code: 255, signal: null, stdout: '', stderr: 'Error when retrieving token from sso: Token has expired and refresh failed', timedOut: false };
    });

    const result = await listBedrockModels(
      { region: 'eu-west-1', apiKey: '', awsProfile: 'sandbox' },
      { resolveAwsCli: () => '/usr/local/bin/aws', runCli },
    );

    expect(result).toMatchObject({ ok: false, kind: 'auth_failed' });
    expect(result.detail).toContain('Test connection');
  });

  it('reports agent_not_installed without the AWS CLI', async () => {
    const result = await listBedrockModels(
      { region: 'eu-west-1', apiKey: '', awsProfile: 'sandbox' },
      { resolveAwsCli: () => null, runCli: vi.fn<CliRunner>() },
    );
    expect(result).toMatchObject({ ok: false, kind: 'agent_not_installed' });
  });
});
