import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  openDesignAmrRunAttempt,
  openDesignAmrTraceEnv,
} from '../../src/runtimes/env.js';

test('openDesignAmrRunAttempt counts automatic retries and manual recharge resumes', () => {
  assert.equal(
    openDesignAmrRunAttempt({
      retryAttemptCount: 2,
      manualResumeAttemptCount: 1,
    }),
    3,
  );
  assert.equal(
    openDesignAmrRunAttempt({
      manualResumeAttemptCount: 1,
    }),
    1,
  );
});

test('openDesignAmrTraceEnv builds OpenDesign trace identity env for AMR only', () => {
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

// Vela's workspace-credit isolation (spec: workspace-scoped wallet and
// credit isolation) attributes an AMR spend by the OPEN_DESIGN_WORKSPACE_ID
// env the daemon forwards to the vela CLI, which the CLI turns into
// `X-Open-Design-Workspace-Id` + `x-vela-workspace-id` request headers.
test('openDesignAmrTraceEnv forwards an exact persisted workspace id for AMR runs', () => {
  const env = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: 'run_trace_team',
    runAttempt: 0,
    workspaceId: ' workspace_team_123 ',
  });

  assert.equal(env.OPEN_DESIGN_WORKSPACE_ID, 'workspace_team_123');
});

test('openDesignAmrTraceEnv forwards a persisted Personal workspace id too', () => {
  const env = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: 'run_trace_personal',
    runAttempt: 0,
    workspaceId: ' workspace_personal_123 ',
  });
  assert.equal(env.OPEN_DESIGN_WORKSPACE_ID, 'workspace_personal_123');
});

// Null/undefined/blank means the caller found no persisted binding at all.
// Only that genuinely unbound historical-project case omits the env var.
test('openDesignAmrTraceEnv omits OPEN_DESIGN_WORKSPACE_ID only without a persisted binding', () => {
  const withNull = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: 'run_trace_unbound',
    runAttempt: 0,
    workspaceId: null,
  });
  assert.equal('OPEN_DESIGN_WORKSPACE_ID' in withNull, false);

  const withUndefined = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: 'run_trace_unbound_2',
    runAttempt: 0,
  });
  assert.equal('OPEN_DESIGN_WORKSPACE_ID' in withUndefined, false);

  const withBlank = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: 'run_trace_unbound_3',
    runAttempt: 0,
    workspaceId: '   ',
  });
  assert.equal('OPEN_DESIGN_WORKSPACE_ID' in withBlank, false);
});

test('openDesignAmrTraceEnv never forwards workspaceId for non-AMR agents', () => {
  const env = openDesignAmrTraceEnv({
    agentId: 'claude',
    runId: 'run_trace_123',
    runAttempt: 0,
    workspaceId: 'workspace_team_123',
  });
  assert.deepEqual(env, {});
});

test('openDesignAmrTraceEnv forwards only bounded plugin correlation to Vela', () => {
  const env = openDesignAmrTraceEnv({
    agentId: 'amr',
    runId: 'run_trace_plugin',
    runAttempt: 0,
    externalPluginAnalytics: {
      pluginWorkflowId: '018f6f2e-4444-7444-8444-444444444444',
      logicalRequestDigest: 'a'.repeat(64),
      logicalRequestDigestVersion: 1,
      externalPluginId: 'open-design',
      externalPluginVersion: '0.4.0',
      distributionMechanism: 'git_marketplace',
      publisherClass: 'open_design_first_party',
      apiKey: 'must-not-forward',
      accountId: 'must-not-forward',
    },
  });

  assert.equal(
    env.OPEN_DESIGN_PLUGIN_WORKFLOW_ID,
    '018f6f2e-4444-7444-8444-444444444444',
  );
  assert.equal(env.OPEN_DESIGN_LOGICAL_REQUEST_DIGEST, 'a'.repeat(64));
  assert.equal(env.OPEN_DESIGN_LOGICAL_REQUEST_DIGEST_VERSION, '1');
  assert.equal(env.OPEN_DESIGN_EXTERNAL_PLUGIN_ID, 'open-design');
  assert.equal(env.OPEN_DESIGN_EXTERNAL_PLUGIN_VERSION, '0.4.0');
  assert.equal(env.OPEN_DESIGN_DISTRIBUTION_MECHANISM, 'git_marketplace');
  assert.equal(
    env.OPEN_DESIGN_PUBLISHER_CLASS,
    'open_design_first_party',
  );
  assert.equal(env.OPEN_DESIGN_API_KEY, undefined);
  assert.equal(env.OPEN_DESIGN_ACCOUNT_ID, undefined);
});
