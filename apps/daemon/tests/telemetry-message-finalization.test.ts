import { describe, expect, it, vi } from 'vitest';

import {
  createFinalizedMessageTelemetryReporter,
  shouldReportRunCompletedFromMessage,
  telemetryPromptFromRunRequest,
} from '../src/server.js';

describe('Langfuse message finalization gate', () => {
  const terminalMessage = {
    id: 'assistant-1',
    role: 'assistant',
    content: 'final answer',
    runId: 'run-1',
    runStatus: 'succeeded',
  };

  it('does not report when only terminal runStatus has been persisted', () => {
    expect(
      shouldReportRunCompletedFromMessage(terminalMessage, {
        ...terminalMessage,
      }),
    ).toBe(false);
  });

  it('reports only on the final telemetry-marked message write', () => {
    expect(
      shouldReportRunCompletedFromMessage(terminalMessage, {
        ...terminalMessage,
        producedFiles: [],
        telemetryFinalized: true,
      }),
    ).toBe(true);
  });

  it('ignores non-terminal run statuses even if marked finalized', () => {
    expect(
      shouldReportRunCompletedFromMessage(
        { ...terminalMessage, runStatus: 'running' },
        { telemetryFinalized: true },
      ),
    ).toBe(false);
  });

  it('uses the explicit current prompt for telemetry instead of the full transcript', () => {
    expect(
      telemetryPromptFromRunRequest(
        '## user\npre-consent brief\n\n## assistant\ndraft\n\n## user\npost-consent revision',
        'post-consent revision',
      ),
    ).toBe('post-consent revision');
  });

  it('falls back to the legacy message when currentPrompt is absent', () => {
    expect(telemetryPromptFromRunRequest('legacy prompt', undefined)).toBe(
      'legacy prompt',
    );
  });

  it('invokes Langfuse reporting once when the final message write is marked', () => {
    const run = {
      id: 'run-1',
      projectId: 'project-1',
      conversationId: 'conv-1',
      assistantMessageId: 'assistant-1',
      status: 'succeeded',
      createdAt: 1,
      updatedAt: 2,
      events: [],
    };
    const report = vi.fn();
    const reporter = createFinalizedMessageTelemetryReporter({
      design: { runs: { get: vi.fn(() => run) } },
      db: 'db',
      dataDir: '/tmp/od-data',
      reportedRuns: new Set<string>(),
      getAppVersion: () => ({ version: '0.7.0', channel: 'beta', packaged: true }),
      report,
    });

    reporter(
      { ...terminalMessage, endedAt: 1234 },
      { telemetryFinalized: true },
    );
    reporter(
      { ...terminalMessage, endedAt: 1234 },
      { telemetryFinalized: true },
    );

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith({
      db: 'db',
      dataDir: '/tmp/od-data',
      run,
      persistedRunStatus: 'succeeded',
      persistedEndedAt: 1234,
      appVersion: { version: '0.7.0', channel: 'beta', packaged: true },
    });
  });
});
