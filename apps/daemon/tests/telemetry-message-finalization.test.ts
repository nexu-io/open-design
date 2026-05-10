import { describe, expect, it } from 'vitest';

import {
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
});
