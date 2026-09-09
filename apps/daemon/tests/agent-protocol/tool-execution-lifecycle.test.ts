import { describe, expect, it } from 'vitest';

import {
  projectToolExecutionLifecycleDiagnostic,
  sanitizeToolExecutionLifecycleUpdate,
} from '../../src/agent-protocol/acp/tool-execution-lifecycle.js';

describe('tool execution lifecycle ACP diagnostics', () => {
  it('rebuilds the v1 allowlist with bounded events and error chains', () => {
    const events = Array.from({ length: 70 }, (_, index) => ({
      phase: 'kill_failed',
      at_ms: 1_700_000_000_000 + index,
      elapsed_ms: index,
      target: 'group',
      mechanism: 'process_group',
      error: Array.from({ length: 8 }, () => ({
        type: 'SystemError',
        code: 'EPERM',
        errno: 1,
        message: 'secret message',
        path: '/private/secret',
      })),
      command: 'cat /private/secret',
      output: 'OPENAI_API_KEY=secret',
    }));
    const diagnostic = sanitizeToolExecutionLifecycleUpdate({
      sessionUpdate: 'tool_execution_lifecycle',
      schema: 'vela.tool_execution_lifecycle',
      version: 1,
      toolCallId: 'secret-shaped-tool-id',
      status: 'failed',
      phase: 'kill_failed',
      execution: {
        version: 1,
        requested_timeout_ms: 1_000,
        effective_timeout_ms: Number.POSITIVE_INFINITY,
        trigger: 'untrusted-trigger',
        terminal: 'failed',
        events,
        dropped_events: 6,
        command: 'cat /private/secret',
      },
      toolTerminal: {
        source: 'tool_error',
        confirmed: true,
        error: [{ type: 'SqliteError', code: 'SQLITE_BUSY', message: 'database secret' }],
      },
      headers: { authorization: 'Bearer secret' },
      metadata: { rawOutput: 'secret output' },
    });

    expect(diagnostic).toMatchObject({
      schema: 'vela.tool_execution_lifecycle',
      version: 1,
      status: 'failed',
      phase: 'kill_failed',
      executionVersion: 1,
      terminal: 'failed',
      requestedTimeoutMs: 1_000,
      droppedEvents: 6,
      toolTerminal: {
        source: 'tool_error',
        confirmed: true,
        error: [{ type: 'SqliteError', code: 'SQLITE_BUSY' }],
      },
    });
    expect(diagnostic?.events).toHaveLength(64);
    expect((diagnostic?.events as Array<{ error?: unknown[] }>)[0]?.error).toHaveLength(4);
    expect(diagnostic).not.toHaveProperty('trigger');
    expect(diagnostic).not.toHaveProperty('effectiveTimeoutMs');
    const serialized = JSON.stringify(diagnostic);
    for (const forbidden of ['secret', '/private', 'command', 'output', 'headers', 'message']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('rejects unknown schemas and revalidates persisted Langfuse projections', () => {
    expect(sanitizeToolExecutionLifecycleUpdate({
      sessionUpdate: 'tool_execution_lifecycle',
      schema: 'vela.tool_execution_lifecycle',
      version: 2,
      toolCallId: 'tool-1',
      execution: { version: 1, terminal: 'returned' },
    })).toBeNull();

    expect(sanitizeToolExecutionLifecycleUpdate({
      sessionUpdate: 'tool_execution_lifecycle',
      schema: 'vela.tool_execution_lifecycle',
      version: 1,
      toolCallId: '😀'.repeat(2_000),
      execution: { version: 1, terminal: 'returned' },
    })).toBeNull();

    expect(projectToolExecutionLifecycleDiagnostic({
      type: 'diagnostic',
      name: 'tool_execution_lifecycle',
      source: 'amr-opencode',
      schema: 'vela.tool_execution_lifecycle',
      version: 1,
      toolCallIdHash: 'raw-private-tool-id',
      trigger: 'deadline',
      command: 'cat /private/secret',
    })).toBeNull();
  });
});
