import { afterEach, describe, expect, it } from 'vitest';

import { buildTracePayload } from '../src/langfuse-trace.js';

const ORIGINAL_OD_TELEMETRY_ENV = process.env.OD_TELEMETRY_ENV;

afterEach(() => {
  if (ORIGINAL_OD_TELEMETRY_ENV === undefined) {
    delete process.env.OD_TELEMETRY_ENV;
  } else {
    process.env.OD_TELEMETRY_ENV = ORIGINAL_OD_TELEMETRY_ENV;
  }
});

describe('langfuse telemetry environment', () => {
  it('stamps trace metadata with env', () => {
    process.env.OD_TELEMETRY_ENV = 'local_development';

    const batch = buildTracePayload({
      installationId: 'install-1',
      projectId: 'project-1',
      conversationId: 'conversation-1',
      agentId: 'codex',
      run: {
        runId: 'run-1',
        status: 'succeeded',
        startedAt: Date.now() - 1000,
        endedAt: Date.now(),
      },
      message: {
        messageId: 'message-1',
        prompt: 'Build a page',
        output: 'Done',
      },
      artifacts: [],
      eventsSummary: {
        toolCalls: 0,
        errors: 0,
        durationMs: 1000,
      },
      prefs: {
        metrics: true,
        content: true,
      },
    });

    expect((batch[0] as any).body.metadata.env).toBe('local_development');
  });
});
