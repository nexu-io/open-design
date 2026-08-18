import { createHash } from 'node:crypto';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createLocalMcpBriefStore,
  handleMcpToolCall,
  issuePluginWorkflowId,
  logicalPluginRequestDigest,
  mapMcpHostProduct,
  McpObservabilitySession,
  mcpDeliveryFacts,
  mcpFailureFacts,
  normalizeExternalPluginRunAnalyticsHints,
  resolvePluginGenerationSloWindowMs,
  validateExternalPluginContext,
  validateMcpToolArgs,
} from '../src/mcp.js';

describe('local MCP plugin observability contract', () => {
  const originalFetch = globalThis.fetch;
  const pluginContext = {
    id: 'open-design',
    version: '0.5.0',
    distributionMechanism: 'git_marketplace',
    publisherClass: 'open_design_first_party',
  } as const;

  afterEach(() => {
    vi.unstubAllGlobals();
    globalThis.fetch = originalFetch;
  });

  it('accepts the bounded Open Design context and rejects extra or secret fields', () => {
    expect(validateExternalPluginContext(pluginContext)).toEqual(pluginContext);

    expect(() => validateExternalPluginContext({
      ...pluginContext,
      id: 'open-design-cloud',
    })).toThrow(/PLUGIN_CONTRACT_REJECTED/u);

    expect(() =>
      validateExternalPluginContext({
        ...pluginContext,
        apiKey: 'must-never-cross-mcp',
      }),
    ).toThrow(/PLUGIN_CONTRACT_REJECTED/u);

    expect(() =>
      validateExternalPluginContext({
        ...pluginContext,
        telemetrySchemaVersion: 2,
      }),
    ).toThrow(/PLUGIN_CONTRACT_REJECTED/u);
  });

  it('issues plugin workflow ids server-side and rejects caller-created ids', () => {
    expect(issuePluginWorkflowId(undefined)).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
    expect(() =>
      issuePluginWorkflowId(
        '018f6f2e-4444-7444-8444-444444444444',
      ),
    ).toThrow(/must be omitted/u);
  });

  it('executes the published tool schema as a runtime boundary for plugin calls', () => {
    expect(() => validateMcpToolArgs('collect_brief', {
      artifactType: 'website',
      externalPluginContext: pluginContext,
    })).not.toThrow();

    expect(() => validateMcpToolArgs('start_run', {
      project: 'Demo',
      prompt: 'Create a launch page',
      requestId: '018f6f2e-5555-7555-8555-555555555555',
      pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
    })).not.toThrow();

    expect(() => validateMcpToolArgs('start_run', {
      project: 'Demo',
      prompt: 'Create a launch page',
      requestId: '018f6f2e-5555-7555-8555-555555555555',
      pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
      apiKey: 'must-never-cross-mcp',
    })).toThrow(/PLUGIN_CONTRACT_REJECTED/u);
  });

  it('keeps Codex host variants bounded until a real host smoke proves a stable split', () => {
    expect(mapMcpHostProduct({ name: 'codex', version: '1.2.3' })).toBe(
      'codex_unknown',
    );
    expect(
      mapMcpHostProduct({ name: 'Codex Desktop', version: '1.2.3' }),
    ).toBe('codex_unknown');
    expect(mapMcpHostProduct({ name: 'claude-code', version: '1.2.3' })).toBe(
      'claude_code',
    );
    expect(mapMcpHostProduct({ name: 'mystery-host', version: '1.2.3' })).toBe(
      'unknown',
    );
  });

  it('runtime-validates plugin run attribution and derives correlation quality server-side', () => {
    const requestId = '018f6f2e-5555-7555-8555-555555555555';
    const logical = logicalPluginRequestDigest(requestId);
    const input = {
      entrySurface: 'external_mcp',
      hostProduct: 'codex_unknown',
      externalPluginId: 'open-design',
      externalPluginVersion: '0.5.0',
      distributionMechanism: 'git_marketplace',
      publisherClass: 'open_design_first_party',
      attributionQuality: 'session_correlated',
      pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
      logicalRequestDigest: logical.digest,
      logicalRequestDigestVersion: logical.version,
      briefState: 'confirmed',
    };

    expect(normalizeExternalPluginRunAnalyticsHints(input, {
      clientRequestId: requestId,
      analyticsContext: {
        deviceId: 'device-1',
        sessionId: 'session-1',
        clientType: 'external_mcp',
        locale: 'en',
        requestId,
        entrySurface: 'external_mcp',
        hostProduct: 'codex_unknown',
        externalPluginId: 'open-design',
        externalPluginVersion: '0.5.0',
        distributionMechanism: 'git_marketplace',
        publisherClass: 'open_design_first_party',
        attributionQuality: 'self_reported',
      },
    })).toEqual({
      ...input,
      attributionQuality: 'session_correlated',
    });

    expect(() => normalizeExternalPluginRunAnalyticsHints({
      ...input,
      logicalRequestDigest: 'b'.repeat(64),
    }, {
      clientRequestId: requestId,
      analyticsContext: null,
    })).toThrow(/PLUGIN_CONTRACT_REJECTED/u);

    expect(() => normalizeExternalPluginRunAnalyticsHints({
      ...input,
      externalPluginSecret: 'must-not-cross',
    }, {
      clientRequestId: requestId,
      analyticsContext: null,
    })).toThrow(/PLUGIN_CONTRACT_REJECTED/u);
  });

  it('derives a versioned lower-case SHA-256 logical request digest', () => {
    const requestId = '018f6f2e-1111-7111-8111-111111111111';
    const expected = createHash('sha256')
      .update(`od-plugin-logical-request:v1:${requestId}`)
      .digest('hex');

    expect(logicalPluginRequestDigest(requestId)).toEqual({
      version: 1,
      digest: expected,
    });
  });

  it('freezes a bounded generation SLO window above the active inactivity timeout', () => {
    expect(
      resolvePluginGenerationSloWindowMs({
        inactivityTimeoutMs: 30 * 60 * 1000,
        configuredValue: undefined,
      }),
    ).toBe(45 * 60 * 1000);
    expect(
      resolvePluginGenerationSloWindowMs({
        inactivityTimeoutMs: 60 * 60 * 1000,
        configuredValue: String(10 * 60 * 1000),
      }),
    ).toBe(61 * 60 * 1000);
    expect(
      resolvePluginGenerationSloWindowMs({
        inactivityTimeoutMs: 30 * 60 * 1000,
        configuredValue: 'not-a-number',
      }),
    ).toBe(45 * 60 * 1000);
  });

  it('binds plugin workflow context to a brief draft and inherits it on confirmation', () => {
    const store = createLocalMcpBriefStore();
    const collected = store.collect({
      artifactType: 'website',
      skip: true,
      pluginWorkflowId: '018f6f2e-2222-7222-8222-222222222222',
      externalPluginContext: pluginContext,
    });

    const confirmed = store.confirm({
      briefDraftId: collected.briefDraftId,
      nonce: collected.nonce,
      answers: {},
    });

    expect(confirmed).toMatchObject({
      pluginWorkflowId: '018f6f2e-2222-7222-8222-222222222222',
      externalPluginContext: pluginContext,
    });
    expect(
      store.briefStateForWorkflow(
        '018f6f2e-2222-7222-8222-222222222222',
      ),
    ).toBe('skipped');
  });

  it('records a confirmed brief state without retaining answers in analytics', () => {
    const store = createLocalMcpBriefStore();
    const collected = store.collect({
      artifactType: 'website',
      pluginWorkflowId: '018f6f2e-6666-7666-8666-666666666666',
      externalPluginContext: pluginContext,
    });
    const answers = Object.fromEntries(
      collected.questionForm.questions.map((question) => [
        question.id,
        [question.defaultValue],
      ]),
    );

    store.confirm({
      briefDraftId: collected.briefDraftId,
      nonce: collected.nonce,
      answers,
    });

    expect(
      store.briefStateForWorkflow(
        '018f6f2e-6666-7666-8666-666666666666',
      ),
    ).toBe('confirmed');
  });

  it('does not leak plugin attribution into the next ordinary brief', () => {
    const store = createLocalMcpBriefStore();
    store.collect({
      artifactType: 'website',
      skip: true,
      pluginWorkflowId: '018f6f2e-3333-7333-8333-333333333333',
      externalPluginContext: pluginContext,
    });

    const ordinary = store.collect({
      artifactType: 'website',
      skip: true,
    });

    expect(ordinary).not.toHaveProperty('pluginWorkflowId');
    expect(ordinary).not.toHaveProperty('externalPluginContext');
  });

  it('keeps ordinary MCP tools un-attributed while correlating the accepted run object', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/api/analytics/mcp/context')) {
        return new Response(JSON.stringify({
          enabled: false,
          deviceId: null,
          locale: 'en',
        }), { status: 200 });
      }
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const session = await McpObservabilitySession.create(
      'http://127.0.0.1:17456',
      { name: 'codex', version: '1.0.0' },
    );
    const store = createLocalMcpBriefStore();
    const collectArgs = {
      artifactType: 'website',
      skip: true,
      externalPluginContext: pluginContext,
    };
    const attribution = await session.resolveAttribution(
      'collect_brief',
      collectArgs,
      store,
    );
    expect(attribution).not.toBeNull();
    expect(
      await session.resolveAttribution('list_projects', {}, store),
    ).toBeNull();

    session.rememberRun('run-1', 'project-1', attribution!);
    await expect(
      session.resolveAttribution('get_run', { runId: 'run-1' }, store),
    ).resolves.toEqual(attribution);
    await expect(
      session.resolveAttribution('get_project', { project: 'project-1' }, store),
    ).resolves.toBeNull();
  });

  it('keeps MCP transport failures and delivery completeness as separate facts', () => {
    expect(mcpFailureFacts('start_run', {
      isError: true,
      content: [{ type: 'text', text: 'cannot reach the Open Design daemon' }],
    })).toEqual({
      error_code: 'DAEMON_UNREACHABLE',
      failure_stage: 'run_accept',
      failure_source: 'open_design_daemon',
      failure_category: 'availability',
      retryable: true,
      user_action: 'start_open_design',
    });

    expect(mcpDeliveryFacts('get_run', {
      content: [{ type: 'text', text: '{}' }],
    }, {
      status: 'running',
    }, 2)).toEqual({
      poll_state: 'non_terminal',
    });

    expect(mcpDeliveryFacts('get_run', {
      content: [{ type: 'text', text: '{}' }],
    }, {
      status: 'succeeded',
      deliverableValid: true,
      deliverableValidation: 'valid',
      deliverableEntryFile: 'index.html',
      previewUrl: 'http://127.0.0.1:17456/artifacts/index.html',
      entryFile: 'index.html',
    }, 3)).toEqual({
      poll_state: 'terminal',
      delivery_kind: 'preview_studio_reference',
      delivery_result: 'complete',
      deliverable_validation: 'valid',
      poll_attempt_count: 3,
    });

    expect(mcpDeliveryFacts('get_run', {
      content: [{ type: 'text', text: '{}' }],
    }, {
      status: 'succeeded',
      artifactCount: 1,
      deliverableValid: true,
      deliverableValidation: 'valid',
      deliverableEntryFile: 'report.pdf',
      studioUrl:
        'http://127.0.0.1:3000/projects/project-1/conversations/conv-1',
    }, 4)).toEqual({
      poll_state: 'terminal',
      delivery_kind: 'preview_studio_reference',
      delivery_result: 'complete',
      deliverable_validation: 'valid',
      poll_attempt_count: 4,
    });

    expect(mcpDeliveryFacts('get_run', {
      content: [{ type: 'text', text: '{}' }],
    }, {
      status: 'succeeded',
      artifactCount: 1,
      deliverableValid: false,
      deliverableValidation: 'entry_missing',
      studioUrl:
        'http://127.0.0.1:3000/projects/project-1/conversations/conv-1',
    }, 5)).toMatchObject({
      poll_state: 'terminal',
      delivery_result: 'failed',
      deliverable_validation: 'invalid',
      error_code: 'DELIVERABLE_MISSING',
    });

    expect(mcpDeliveryFacts('get_run', {
      content: [{ type: 'text', text: '{}' }],
    }, {
      status: 'succeeded',
      artifactCount: 0,
      studioUrl:
        'http://127.0.0.1:3000/projects/project-1/conversations/conv-1',
    }, 6)).toMatchObject({
      poll_state: 'terminal',
      delivery_result: 'failed',
      deliverable_validation: 'invalid',
      error_code: 'DELIVERABLE_MISSING',
    });

    expect(mcpDeliveryFacts('start_run', {
      content: [{ type: 'text', text: '{}' }],
    }, {
      runId: 'run-1',
      analyticsAttributionMismatch: true,
    })).toEqual({
      correlation_status: 'run_mismatch',
      error_code: 'PLUGIN_ATTRIBUTION_MISMATCH',
    });
  });

  it('requires a stable plugin request id and forwards bounded attribution to the run', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/api/projects')) {
        return new Response(
          JSON.stringify({ projects: [{ id: 'project-1', name: 'Demo' }] }),
          { status: 200 },
        );
      }
      if (url.endsWith('/api/mcp/install-info')) {
        return new Response(JSON.stringify({ webBaseUrl: null }), {
          status: 200,
        });
      }
      return new Response(
        JSON.stringify({ runId: 'run-plugin', conversationId: 'conv-1' }),
        { status: 202 },
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    const missingRequest = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'start_run',
      {
        project: 'Demo',
        prompt: 'Create a launch page',
        pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
      },
      {
        pluginAttribution: {
          pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
          context: pluginContext,
        },
      },
    );
    expect(missingRequest).toMatchObject({ isError: true });
    expect(missingRequest.content[0]?.text).toContain(
      'PLUGIN_CONTRACT_REJECTED',
    );
    expect(missingRequest.content[0]?.text).toContain(
      'requestId is required for attributed start_run calls',
    );
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url).endsWith('/api/runs'),
      ),
    ).toBe(false);

    const invalidRequest = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'start_run',
      {
        project: 'Demo',
        prompt: 'Create a launch page',
        requestId: 'od-mscwn4y2-tlnx02dig7',
        pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
      },
      {
        pluginAttribution: {
          pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
          context: pluginContext,
        },
      },
    );
    expect(invalidRequest).toMatchObject({ isError: true });
    expect(invalidRequest.content[0]?.text).toContain(
      'requestId must be a canonical UUID or ULID',
    );
    expect(invalidRequest.content[0]?.text).not.toContain(
      'pluginWorkflowId must be a canonical UUID or ULID',
    );
    expect(
      fetchMock.mock.calls.some(
        ([url]) => String(url).endsWith('/api/runs'),
      ),
    ).toBe(false);

    const requestId = '018f6f2e-5555-7555-8555-555555555555';
    const result = await handleMcpToolCall(
      'http://127.0.0.1:17456',
      'start_run',
      {
        project: 'Demo',
        prompt: 'Create a launch page',
        requestId,
        pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
      },
      {
        analyticsHeaders: {
          'x-od-analytics-device-id': 'installation-1',
          'x-od-analytics-client-type': 'external_mcp',
          'x-od-analytics-host-product': 'codex_cli',
        },
        pluginAttribution: {
          pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
          context: pluginContext,
        },
        briefState: 'confirmed',
      },
    );

    expect(result).not.toHaveProperty('isError');
    const runCall = fetchMock.mock.calls.find(
      ([url, init]) =>
        String(url).endsWith('/api/runs')
        && (init as RequestInit | undefined)?.method === 'POST',
    );
    const body = JSON.parse(String((runCall?.[1] as RequestInit)?.body));
    expect(body.analyticsHints).toMatchObject({
      entrySurface: 'external_mcp',
      hostProduct: 'codex_cli',
      externalPluginId: 'open-design',
      externalPluginVersion: '0.5.0',
      pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
      logicalRequestDigestVersion: 1,
      briefState: 'confirmed',
    });
    expect(body.analyticsHints.logicalRequestDigest).toMatch(/^[0-9a-f]{64}$/u);
    expect((runCall?.[1] as RequestInit).headers).toMatchObject({
      'x-od-analytics-client-type': 'external_mcp',
      'x-od-analytics-device-id': 'installation-1',
    });
  });
});
