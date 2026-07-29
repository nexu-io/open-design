import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod-v3';

import {
  generateStructuredJson,
  StructuredJsonError,
  type StructuredJsonTextRequest,
} from '../src/structured-json.js';
import {
  generateConfiguredJsonText,
  generateConfiguredJsonTextWithMetadata,
} from '../src/memory-llm.js';
import { writeAppConfig } from '../src/app-config.js';

const ExampleSchema = z.object({
  title: z.string().min(1),
}).strict();

describe('generateStructuredJson', () => {
  it('validates provider JSON against the requested schema', async () => {
    const result = await generateStructuredJson({
      system: 'Return one object.',
      user: 'Create a title.',
      schema: ExampleSchema,
    }, {
      generateText: async () => '```json\n{"title":"Focus"}\n```',
    });

    expect(result).toEqual({ title: 'Focus' });
  });

  it('asks the same provider to repair malformed output at most once', async () => {
    const requests: StructuredJsonTextRequest[] = [];
    const generateText = vi.fn(async (request: StructuredJsonTextRequest) => {
      requests.push(request);
      return requests.length === 1
        ? '{"title":42}'
        : '{"title":"Repaired"}';
    });

    await expect(generateStructuredJson({
      system: 'Return one object.',
      user: 'Create a title.',
      schema: ExampleSchema,
      chatAgentId: 'claude',
    }, { generateText })).resolves.toEqual({ title: 'Repaired' });

    expect(generateText).toHaveBeenCalledTimes(2);
    expect(requests[1]).toMatchObject({ chatAgentId: 'claude' });
    expect(requests[1]?.user).toContain('Repair the previous response');
    expect(requests[1]?.user).toContain('{"title":42}');
  });

  it('returns INVALID_PROVIDER_RESPONSE after one failed repair and redacts secrets', async () => {
    const secret = 'sk-provider-secret-1234567890';
    const generateText = vi.fn(async () => (
      `{"apiKey":"${secret}","title":42}`
    ));

    let caught: unknown;
    try {
      await generateStructuredJson({
        system: 'Return one object.',
        user: 'Create a title.',
        schema: ExampleSchema,
      }, { generateText });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(StructuredJsonError);
    expect(caught).toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
      rawSummary: expect.stringContaining('[REDACTED]'),
    });
    expect(String((caught as Error).message)).not.toContain(secret);
    expect((caught as StructuredJsonError).rawSummary).not.toContain(secret);
    expect(generateText).toHaveBeenCalledTimes(2);
  });

  it('redacts exact non-OpenAI provider secrets from invalid-output summaries', async () => {
    const apiKey = 'AIza-provider-secret-without-sk-prefix';

    await expect(generateStructuredJson({
      system: 'Return one object.',
      user: 'Create a title.',
      schema: ExampleSchema,
    }, {
      sensitiveValues: [apiKey],
      generateText: async () => `{"leaked":"${apiKey}","title":42}`,
    })).rejects.toMatchObject({
      code: 'INVALID_PROVIDER_RESPONSE',
      message: expect.not.stringContaining(apiKey),
      rawSummary: expect.not.stringContaining(apiKey),
    });
  });

  it('uses transport-discovered secrets when constructing repair prompts and failures', async () => {
    const secret = 'AIza-runtime-provider-value';
    const requests: StructuredJsonTextRequest[] = [];

    let caught: unknown;
    try {
      await generateStructuredJson({
        system: 'Return one object.',
        user: 'Create a title.',
        schema: ExampleSchema,
      }, {
        generateText: async (request) => {
          requests.push(request);
          return {
            text: `{"leaked":"${secret}","title":42}`,
            sensitiveValues: [secret],
          };
        },
      });
    } catch (error) {
      caught = error;
    }

    expect(requests).toHaveLength(2);
    expect(requests[1]?.user).not.toContain(secret);
    expect(requests[1]?.user).toContain('[REDACTED]');
    expect(String((caught as Error).message)).not.toContain(secret);
    expect((caught as StructuredJsonError).rawSummary).not.toContain(secret);
  });

  it('rejects otherwise valid structured results that contain a discovered secret', async () => {
    const secret = 'runtime-secret-in-valid-result';
    const outputs = [
      { text: `{"title":"${secret}"}`, sensitiveValues: [secret] },
      { text: '{"title":"Safe"}', sensitiveValues: [secret] },
    ];
    const generateText = vi.fn(async (
      _request: StructuredJsonTextRequest,
    ) => outputs.shift() ?? null);

    await expect(generateStructuredJson({
      system: 'Return one object.',
      user: 'Create a title.',
      schema: ExampleSchema,
    }, { generateText })).resolves.toEqual({ title: 'Safe' });
    expect(generateText).toHaveBeenCalledTimes(2);
    expect(generateText.mock.calls[1]?.[0].user).not.toContain(secret);
  });

  it('returns PROVIDER_NOT_CONFIGURED when the configured provider resolver has no provider', async () => {
    await expect(generateStructuredJson({
      system: 'Return one object.',
      user: 'Create a title.',
      schema: ExampleSchema,
    }, {
      generateText: async () => null,
    })).rejects.toMatchObject({ code: 'PROVIDER_NOT_CONFIGURED' });
  });
});

describe('configured structured JSON provider transport', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('returns env-provider and Local CLI app-config secrets as transport metadata', async () => {
    const envSecret = 'custom-env-provider-value';
    vi.stubEnv('OPENAI_API_KEY', envSecret);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"title":"Remote"}' } }],
    }), { status: 200 })));

    await expect(generateConfiguredJsonTextWithMetadata({
      system: 'Return JSON.',
      user: 'Create a title.',
    })).resolves.toEqual({
      text: '{"title":"Remote"}',
      sensitiveValues: [envSecret],
    });

    const dataDir = await mkdtemp(path.join(os.tmpdir(), 'od-structured-json-'));
    const cliSecret = 'custom-cli-app-config-value';
    const inheritedCliSecret = 'custom-inherited-cli-token';
    const inheritedCredential = 'custom-cloud-credential-value';
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', inheritedCliSecret);
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', inheritedCredential);
    try {
      await writeAppConfig(dataDir, {
        agentCliEnv: {
          claude: { ANTHROPIC_API_KEY: cliSecret },
        },
      });
      await expect(generateConfiguredJsonTextWithMetadata({
        system: 'Return JSON.',
        user: 'Create a title.',
        chatAgentId: 'claude',
      }, {
        dataDir,
        localCliRunner: async () => `{"title":"${cliSecret}"}`,
      })).resolves.toEqual({
        text: `{"title":"${cliSecret}"}`,
        sensitiveValues: expect.arrayContaining([
          cliSecret,
          inheritedCliSecret,
          inheritedCredential,
        ]),
      });
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });

  it('uses the selected supported Local CLI before remote credentials', async () => {
    const localCliRunner = vi.fn(async () => '{"title":"Local"}');

    await expect(generateConfiguredJsonText({
      system: 'Return JSON.',
      user: 'Create a title.',
      chatAgentId: 'claude',
    }, {
      projectRoot: process.cwd(),
      localCliRunner,
    })).resolves.toBe('{"title":"Local"}');

    expect(localCliRunner).toHaveBeenCalledWith(expect.objectContaining({
      agentId: 'claude',
      system: 'Return JSON.',
      user: 'Create a title.',
    }));
  });

  it('uses an existing BYOK chat provider and redacts its key from provider errors', async () => {
    const apiKey = 'sk-byok-secret-1234567890';
    const fetchMock = vi.fn(async (
      _input: string | URL | Request,
      _init?: RequestInit,
    ) => new Response(
      `request rejected for ${apiKey}`,
      { status: 401 },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(generateConfiguredJsonText({
      system: 'Return JSON.',
      user: 'Create a title.',
    }, {
      chatProvider: {
        provider: 'openai',
        apiKey,
        model: 'gpt-test',
        baseUrl: 'https://provider.example/v1',
      },
    })).rejects.not.toThrow(apiKey);

    expect(fetchMock).toHaveBeenCalledOnce();
    const request = fetchMock.mock.calls[0];
    expect(request?.[0]).toBe('https://provider.example/v1/chat/completions');
  });
});
