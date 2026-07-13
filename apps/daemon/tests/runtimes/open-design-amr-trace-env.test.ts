import assert from 'node:assert/strict';
import { test } from 'vitest';
import { openDesignAmrTraceEnv } from '../../src/runtimes/env.js';

test('openDesignAmrTraceEnv builds Open Design trace identity env for AMR only', () => {
  const amrEnv = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: ' run_trace_123 ',
    runAttempt: 2,
    conversationId: ' conversation_trace_456 ',
  });

  assert.equal(amrEnv.OPEN_DESIGN_RUN_ID, 'run_trace_123');
  assert.equal(amrEnv.OPEN_DESIGN_RUN_ATTEMPT, '2');
  assert.equal(amrEnv.OPEN_DESIGN_SESSION_ID, 'conversation_trace_456');

  const claudeEnv = openDesignAmrTraceEnv({
    agentId: 'claude',
    runId: 'run_trace_123',
    runAttempt: 2,
    conversationId: 'conversation_trace_456',
  });

  assert.deepEqual(claudeEnv, {});
});

test('openDesignAmrTraceEnv omits optional AMR session trace env when no conversation exists', () => {
  const env = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: 'run_trace_no_session',
    runAttempt: 0,
  });

  assert.equal(env.OPEN_DESIGN_RUN_ID, 'run_trace_no_session');
  assert.equal(env.OPEN_DESIGN_RUN_ATTEMPT, '0');
  assert.equal(env.OPEN_DESIGN_SESSION_ID, undefined);
});

test('openDesignAmrTraceEnv fails fast on invalid AMR trace inputs', () => {
  assert.throws(
    () => openDesignAmrTraceEnv({ agentId: 'amr', runId: ' ', runAttempt: 0 }),
    /OPEN_DESIGN_RUN_ID/,
  );
  assert.throws(
    () => openDesignAmrTraceEnv({ agentId: 'amr', runId: 'run_trace', runAttempt: -1 }),
    /OPEN_DESIGN_RUN_ATTEMPT/,
  );
});
