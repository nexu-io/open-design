import { describe, expect, it, vi } from 'vitest';

import {
  composeChatUserRequestForAgent,
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

  it('promotes discovery form answers above the transcript with a build-now instruction', () => {
    const currentPrompt = [
      '[form answers \u2014 discovery]',
      '- output: Dashboard / tool UI',
      '- brand: Pick a direction for me [value: pick_direction]',
    ].join('\n');
    const prompt = composeChatUserRequestForAgent(
      '## user\ninitial brief\n\n## assistant\n<form/>',
      currentPrompt,
    );

    expect(prompt).toContain('## Latest user turn - form answers submitted');
    expect(prompt).toContain(currentPrompt);
    expect(prompt).toContain('The user has answered the discovery form.');
    expect(prompt).toContain('For Branch B answers, build now instead of asking another brief.');
    expect(prompt.indexOf('## Full conversation transcript')).toBeGreaterThan(
      prompt.indexOf(currentPrompt),
    );
  });

  it('keeps non-discovery form answers active without forcing the build transition', () => {
    const prompt = composeChatUserRequestForAgent(
      '## user\ninitial brief',
      '[form answers - task-type]\n- taskType: Slide deck',
    );

    expect(prompt).toContain('The user has answered the task-type form.');
    expect(prompt).toContain('Treat these form answers as the active user turn');
    expect(prompt).not.toContain('build now instead of asking another brief');
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
