import { describe, expect, it } from 'vitest';

import { classifyRunFailure } from '../../src/run-failure-classification.js';
import {
  createToolPermissionRejectionTracker,
  toolPermissionRejectionMessage,
} from '../../src/runtimes/tool-permission-rejection.js';

const DENIAL = 'The user rejected permission to use this specific tool call.';

describe('tool permission rejection tracker', () => {
  it('remembers the denied tool and its target', () => {
    const tracker = createToolPermissionRejectionTracker();
    tracker.observe({ type: 'tool_use', id: 'a', name: 'bash', input: { command: 'cat /tmp/frame.png' } });
    tracker.observe({ type: 'tool_result', toolUseId: 'a', content: DENIAL, isError: true });
    expect(tracker.latest()).toEqual({ tool: 'bash', target: 'cat /tmp/frame.png' });
  });

  it('reads JSON-string inputs and ignores ordinary tool errors', () => {
    const tracker = createToolPermissionRejectionTracker();
    tracker.observe({ type: 'tool_use', id: 'a', name: 'read', input: '{"filePath":"/x/y.md"}' });
    tracker.observe({ type: 'tool_result', toolUseId: 'a', content: 'ENOENT', isError: true });
    expect(tracker.latest()).toBeNull();
    tracker.observe({ type: 'tool_result', toolUseId: 'a', content: DENIAL, isError: true });
    expect(tracker.latest()).toEqual({ tool: 'read', target: '/x/y.md' });
  });

  it('classifies the named denial as a non-retryable tool permission failure', () => {
    const failure = classifyRunFailure({
      result: 'failed',
      status: {
        status: 'failed',
        error: toolPermissionRejectionMessage({ tool: 'read', target: '/x/y.md' }),
        errorCode: 'AGENT_EXECUTION_FAILED',
        exitCode: 0,
        signal: null,
      },
      errorCode: 'AGENT_EXECUTION_FAILED',
      agentId: 'byok-opencode',
      events: [{ event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'empty_output' } }],
    });
    expect(failure).toMatchObject({
      failure_category: 'tool_error',
      failure_detail: 'tool_permission_rejected',
      retryable: false,
    });
  });
});
