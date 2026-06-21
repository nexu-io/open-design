import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const readAppConfigMock = vi.fn();
const listMessagesMock = vi.fn();
const reportRunCompletedMock = vi.fn();

vi.mock('../src/app-config.js', () => ({
  readAppConfig: readAppConfigMock,
}));

vi.mock('../src/db.js', () => ({
  listMessages: listMessagesMock,
}));

vi.mock('../src/langfuse-trace.js', () => ({
  readTelemetrySinkConfig: vi.fn(() => ({ kind: 'langfuse' })),
  reportRunCompleted: reportRunCompletedMock,
  reportRunFeedback: vi.fn(),
}));

vi.mock('../src/redact.js', () => ({
  redactSecrets: (value: string) => value,
}));

vi.mock('../src/run-analytics-observability.js', () => ({
  hasExplicitRequestedModelForAnalytics: (value: unknown): value is string =>
    typeof value === 'string' && value.trim().length > 0 && value.trim() !== 'default',
  scanRunEventsForUsageAnalytics: vi.fn(() => ({
    cache_token_source: 'unavailable',
    token_count_source: 'unknown',
    agent_reported_model: null,
  })),
  summarizeRunTimingAnalytics: vi.fn(() => ({
    tool_call_count: 0,
    total_duration_ms: 0,
  })),
}));

vi.mock('../src/run-failure-classification.js', () => ({
  classifyRunFailure: vi.fn(() => undefined),
}));

vi.mock('../src/run-result.js', () => ({
  deriveRunErrorCode: vi.fn(() => null),
  runResultFromStatus: vi.fn(() => 'success'),
}));

const { reportRunCompletedFromDaemon } = await import('../src/langfuse-bridge.js');

function makeRun(overrides: Record<string, unknown> = {}) {
  const now = 1_700_000_000_000;
  return {
    id: 'run-id-1',
    projectId: 'proj-1',
    conversationId: 'conv-1',
    assistantMessageId: 'msg-1',
    agentId: 'claude',
    status: 'succeeded',
    createdAt: now - 1000,
    updatedAt: now,
    events: [],
    userPrompt: 'design a coffee landing page',
    ...overrides,
  };
}

describe('langfuse-bridge non-blocking behavior', () => {
  beforeEach(() => {
    readAppConfigMock.mockResolvedValue({
      installationId: 'install-1',
      telemetry: { metrics: true, content: true },
    });
    listMessagesMock.mockReset();
    reportRunCompletedMock.mockReset();
    reportRunCompletedMock.mockResolvedValue({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('warns but still resolves when assistant-message lookup throws', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    listMessagesMock.mockImplementation(() => {
      throw new Error('db unavailable');
    });

    await expect(
      reportRunCompletedFromDaemon({
        db: {},
        dataDir: '/tmp/od-test',
        run: makeRun() as any,
        fetchImpl: vi.fn() as any,
      }),
    ).resolves.toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'accepted',
    });

    expect(reportRunCompletedMock).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      '[langfuse-bridge] message read failed:',
      'Error: db unavailable',
    );
    const ctx = reportRunCompletedMock.mock.calls[0]?.[0];
    expect(ctx.message.output).toBe('');
  });

  it('warns but does not throw when reportRunCompleted rejects', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    listMessagesMock.mockReturnValue([]);
    reportRunCompletedMock.mockRejectedValue(new Error('langfuse sink offline'));

    await expect(
      reportRunCompletedFromDaemon({
        db: {},
        dataDir: '/tmp/od-test',
        run: makeRun() as any,
        fetchImpl: vi.fn() as any,
      }),
    ).resolves.toEqual({
      langfuse_expected: true,
      langfuse_delivery_status: 'failed',
      langfuse_drop_reason: 'network_error',
    });

    expect(warnSpy).toHaveBeenCalledWith(
      '[langfuse-bridge] report failed:',
      'Error: langfuse sink offline',
    );
  });
});
