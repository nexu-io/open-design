import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/integrations/vela-errors.js', () => ({
  classifyAmrAccountFailure(text: string) {
    const value = String(text || '').toLowerCase();
    // Mirror the real detector's signals exercised by these tests, including
    // the Chinese vela pre-charge text (see integrations/vela-errors.test.ts).
    if (
      value.includes('insufficient balance') ||
      value.includes('预扣费额度失败') ||
      value.includes('余额不足') ||
      value.includes('额度不足')
    ) {
      return { code: 'AMR_INSUFFICIENT_BALANCE' as const };
    }
    if (value.includes('authentication required') || value.includes('not authenticated') || value.includes('unauthorized')) {
      return { code: 'AMR_AUTH_REQUIRED' as const };
    }
    return null;
  },
}));

vi.mock('../src/runtimes/auth.js', () => ({
  classifyAgentServiceFailure(text: string) {
    const value = String(text || '').toLowerCase();
    if (
      value.includes('authentication required') ||
      value.includes('not authenticated') ||
      value.includes('invalid_api_key')
    ) {
      return 'AGENT_AUTH_REQUIRED' as const;
    }
    if (value.includes('http 429') || value.includes('too many requests') || value.includes('session limit')) {
      return 'RATE_LIMITED' as const;
    }
    if (value.includes('503 upstream unavailable') || value.includes('upstream unavailable')) {
      return 'UPSTREAM_UNAVAILABLE' as const;
    }
    return null;
  },
}));

import {
  classifyRunFailure,
  type RunEventForFailureClassification,
} from '../src/run-failure-classification.js';

function errorEvent(
  code: string,
  message: string,
  retryable?: boolean,
): RunEventForFailureClassification {
  return {
    event: 'error',
    data: {
      message,
      error: {
        code,
        message,
        ...(retryable !== undefined ? { retryable } : {}),
      },
    },
  };
}

function classify(
  code: string | null,
  message = '',
  events: RunEventForFailureClassification[] = code
    ? [errorEvent(code, message)]
    : [],
) {
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: message || null,
      errorCode: code,
      exitCode: 1,
      signal: null,
    },
    ...(code ? { errorCode: code } : {}),
    agentId: 'claude',
    events,
  });
}

describe('classifyRunFailure', () => {
  it('does not classify successful runs as failures', () => {
    expect(
      classifyRunFailure({
        result: 'success',
        status: { status: 'succeeded' },
      }),
    ).toBeUndefined();
  });

  it('classifies user cancellation separately from failures', () => {
    expect(
      classifyRunFailure({
        result: 'cancelled',
        status: { status: 'canceled' },
      }),
    ).toEqual({
      failure_category: 'user_cancel',
      failure_detail: 'user_cancelled',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });
  });


  it('prefers user cancellation over timeout-flavored status text when the run result is cancelled', () => {
    expect(
      classifyRunFailure({
        result: 'cancelled',
        status: {
          status: 'canceled',
          error: 'Agent stalled without emitting any new output for 120s.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: 'AGENT_SIGNAL_SIGTERM',
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        events: [
          errorEvent(
            'AGENT_SIGNAL_SIGTERM',
            'Agent stalled without emitting any new output for 120s.',
            true,
          ),
        ],
      }),
    ).toEqual({
      failure_category: 'user_cancel',
      failure_detail: 'user_cancelled',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });
  });

  it('uses phase evidence for cancelled runs with tool activity', () => {
    expect(
      classifyRunFailure({
        result: 'cancelled',
        status: { status: 'canceled' },
        events: [
          { event: 'agent', data: { type: 'text_delta', delta: 'working' } },
          { event: 'agent', data: { type: 'tool_use', id: 'tool-1', name: 'Read' } },
        ],
      }),
    ).toMatchObject({
      failure_category: 'user_cancel',
      failure_stage: 'tool_execution',
    });
  });

  it('prefers structured model-unavailable codes over timeout-like free text', () => {
    expect(
      classify(
        'AMR_MODEL_UNAVAILABLE',
        'Model selection timed out while the provider reported the model was unavailable.',
      ),
    ).toMatchObject({
      failure_category: 'model_unavailable',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });
  });

  it('prefers prompt-too-large codes over empty-output fallback text', () => {
    expect(
      classify(
        'AGENT_PROMPT_TOO_LARGE',
        'The agent completed without producing any output because the context window exceeded the limit.',
      ),
    ).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'reduce_context',
    });
  });

  it('maps auth-required failures to login guidance', () => {
    expect(classify('AGENT_AUTH_REQUIRED')).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'auth_required',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });
  });


  it('lets explicit auth classification win over a generic execution-failed code', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Authentication required before starting the session.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'auth_required',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });
  });

  it('maps auth subtypes from profile and token text', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Claude Code may be using a different or stale local profile than your terminal.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'stale_profile',
      user_action: 'login',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Your access token could not be refreshed because your refresh token was already used.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'refresh_token_reused',
      user_action: 'login',
    });
  });

  it('recognizes model-not-found text even when the outer error code is generic', () => {
    expect(
      classify('AGENT_EXECUTION_FAILED', 'Model not found: vela/deepseek-v3-2'),
    ).toMatchObject({
      failure_category: 'model_unavailable',
      failure_detail: 'model_not_found',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });
  });

  it('recovers rate-limit and session-limit signals from generic error codes', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        "You've hit your session limit; resets at 3:10am.",
      ),
    ).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'hard_quota',
      retryable: false,
      user_action: 'none',
    });
  });

  it('treats ordinary 429 rate limits as retryable', () => {
    expect(classify('RATE_LIMITED', 'HTTP 429: too many requests')).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'rate_limit_429',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps upstream failures to retry guidance', () => {
    expect(classify('UPSTREAM_UNAVAILABLE', 'HTTP 503 upstream unavailable')).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_5xx',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps stream disconnects to upstream detail', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Reconnecting... 1/5 (stream disconnected before completion: tls handshake eof)',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      retryable: true,
      user_action: 'retry',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'json-rpc id 4: opencode event stream: opencode session error: {"sessionID":"ses_17838b40effecRNQTUFyauY0zL","error":{"name":"UnknownError","data":{"message":"\\"[code=upstream_error] Error reading stream: http2: response body closed\\""}}}',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'json-rpc id 4: Cannot connect to API: The socket connection was closed unexpectedly. For more information, pass `verbose: true` in the second argument to fetch()',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('promotes AMR exit 130 connection resets into upstream stream disconnects', () => {
    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 4: Connection reset by server',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('promotes opencode API 4xx session errors out of process-exit fallback', () => {
    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 4: opencode event stream: opencode session error: {"sessionID":"ses_16a081173ffeQy9mUJTmYowj5p","error":{"name":"APIError","data":{"message":"Not Found","statusCode":404,"isRetryable":false,"responseBody":"<html><head><title>404 Not Found</title></head>"}}}',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });

    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 4: opencode event stream: opencode session error: {"error":{"name":"APIError","data":{"message":"Bad Request","statusCode":400,"isRetryable":false,"responseBody":"<html><head><title>400 Bad Request</title></head>"}}}',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      retryable: false,
      user_action: 'none',
    });
  });

  it('uses structured opencode API error data when raw error text is sparse', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: null,
          errorCode: 'AGENT_EXIT_130',
          exitCode: 130,
          signal: null,
        },
        errorCode: 'AGENT_EXIT_130',
        agentId: 'opencode',
        events: [
          {
            event: 'error',
            data: {
              error: {
                name: 'APIError',
                data: {
                  message: 'Not Found',
                  statusCode: 404,
                  isRetryable: false,
                },
              },
            },
          },
        ],
      }),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });
  });

  it('maps AMR model catalog outages to provider routing failures', () => {
    expect(
      classify(
        'AGENT_EXIT_130',
        'json-rpc id 2: AMR model catalog is unavailable.',
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'provider_routing_error',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps AMR model catalog credential failures to auth instead of retryable routing', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        [
          'json-rpc id 2: AMR model catalog is unavailable.',
          'Error: list Link models: API request failed with status 401: invalid_api_key',
        ].join('\n'),
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'auth_required',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });
  });

  it('maps AMR insufficient balance to recharge guidance', () => {
    expect(
      classify('AMR_INSUFFICIENT_BALANCE', 'insufficient wallet balance'),
    ).toMatchObject({
      failure_category: 'insufficient_balance',
      failure_detail: 'amr_insufficient_balance',
      retryable: false,
      user_action: 'recharge',
    });
  });

  it('maps unavailable model errors to switch-model guidance', () => {
    expect(classify('AMR_MODEL_UNAVAILABLE', 'model is not available')).toMatchObject({
      failure_category: 'model_unavailable',
      failure_detail: 'model_not_found',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });
  });

  it('maps prompt-size failures to reduce-context guidance', () => {
    expect(classify('AGENT_PROMPT_TOO_LARGE', 'context window exceeded')).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_detail: 'prompt_too_large',
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'reduce_context',
    });
  });

  it('maps empty output to an explicit retryable category', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Agent completed without producing any output.',
        [errorEvent('AGENT_EXECUTION_FAILED', 'Agent completed without producing any output.', true)],
      ),
    ).toMatchObject({
      failure_category: 'empty_output',
      failure_detail: 'empty_output',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps signal exits and stall text to timeout', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Agent stalled without emitting any new output for 120s.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: null,
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        events: [],
      }),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });


  it('honors the latest explicit non-retryable hint for timeout failures', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Agent stalled without emitting any new output for 120s.',
          signal: 'SIGTERM',
          exitCode: null,
          errorCode: null,
        },
        errorCode: 'AGENT_SIGNAL_SIGTERM',
        agentId: 'claude',
        events: [
          errorEvent('AGENT_EXECUTION_FAILED', 'transient upstream hiccup', true),
          errorEvent(
            'AGENT_SIGNAL_SIGTERM',
            'Agent stalled without emitting any new output for 120s.',
            false,
          ),
        ],
      }),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      failure_stage: 'first_token_wait',
      retryable: false,
      user_action: 'none',
    });
  });

  it('uses the latest retryable hint for tool execution failures', () => {
    expect(
      classifyRunFailure({
        result: 'failed',
        status: {
          status: 'failed',
          error: 'Tool error: MCP connector failed while listing files.',
          exitCode: 1,
          signal: null,
          errorCode: 'AGENT_EXECUTION_FAILED',
        },
        errorCode: 'AGENT_EXECUTION_FAILED',
        agentId: 'claude',
        events: [
          errorEvent('AGENT_EXECUTION_FAILED', 'tool bootstrap failed', false),
          errorEvent(
            'AGENT_EXECUTION_FAILED',
            'Tool error: MCP connector failed while listing files.',
            true,
          ),
        ],
      }),
    ).toMatchObject({
      failure_category: 'tool_error',
      failure_detail: 'tool_error',
      failure_stage: 'tool_execution',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps invalid agent config to fix-config guidance', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Error loading config.toml: unknown variant `priority`, expected `fast` or `flex`\nin `service_tier`',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_config_invalid',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'fix_config',
    });
  });

  it('maps fabricated role marker termination to a retryable protocol guard detail', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Run terminated: model emitted fabricated role marker (`## user`). No further tokens or tool calls accepted from this turn.',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'fabricated_role_marker',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('maps missing generated plugin artifacts to artifact-write tool failures', () => {
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Plugin authoring ended before generating the required generated-plugin artifacts.',
      ),
    ).toMatchObject({
      failure_category: 'tool_error',
      failure_detail: 'plugin_artifact_missing',
      failure_stage: 'artifact_write',
      retryable: false,
      user_action: 'none',
    });
  });

  it('keeps process exits as an explicit fallback category', () => {
    expect(classify('AGENT_EXIT_1', 'process exited with code 1')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'exit_code',
      failure_stage: 'child_close',
      retryable: false,
      user_action: 'none',
    });
  });

  it('adds process-exit details for spawn and protocol failures', () => {
    expect(classify('AGENT_EXECUTION_FAILED', 'spawn failed: spawn ENOEXEC')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'spawn_enoexec',
    });
    expect(classify('AGENT_EXECUTION_FAILED', 'json-rpc id 2: Internal error')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
    });
    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'json-rpc id 4: opencode event stream: reply opencode permission: opencode POST /session/ses_17891e641ffe507UiYkoj7Qb5w/permissions/per_e876f835100166WeTqK11P7ZvV returned HTTP 404: {"_tag":"PermissionNotFoundError","requestID":"per_e876f835100166WeTqK11P7ZvV","message":"Permission request not found: per_e876f835100166WeTqK11P7ZvV"}',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'permission_request_not_found',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });
    expect(classify('AGENT_EXECUTION_FAILED', 'stdin: write EOF')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'stdin_write_eof',
    });
  });

  it('falls back to unknown when no meaningful signal is available', () => {
    expect(classify('SOMETHING_NEW', '')).toMatchObject({
      failure_category: 'unknown',
      failure_detail: 'unknown',
      failure_stage: 'finalize',
      retryable: false,
      user_action: 'none',
    });
  });
});

// Regression coverage for the signal/interrupt mis-attribution bug: process
// crashes (SIGKILL/SIGSEGV/...), daemon shutdowns (SIGTERM), and cancellations
// (SIGINT / exit 130) must NOT be laundered into a retryable `timeout`. Each
// has a non-retryable home so the safe-retry policy never re-spawns an
// OOM/crash that is near-certain to reproduce.
describe('classifyRunFailure — signal and interrupt attribution', () => {
  function classifySignal(
    signal: string,
    message = '',
    exitCode: number | null = null,
  ) {
    const errorCode = `AGENT_SIGNAL_${signal}`;
    return classifyRunFailure({
      result: 'failed',
      status: {
        status: 'failed',
        error: message || null,
        signal,
        exitCode,
        errorCode: null,
      },
      errorCode,
      agentId: 'claude',
      events: [],
    });
  }

  function classifyExit(
    exitCode: number,
    message = '',
  ) {
    const errorCode = `AGENT_EXIT_${exitCode}`;
    return classifyRunFailure({
      result: 'failed',
      status: {
        status: 'failed',
        error: message || null,
        signal: null,
        exitCode,
        errorCode: null,
      },
      errorCode,
      agentId: 'claude',
      events: [],
    });
  }

  it('classifies SIGKILL as a non-retryable process kill, not a timeout', () => {
    expect(classifySignal('SIGKILL', 'Killed')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'signal_killed',
      retryable: false,
      user_action: 'none',
    });
  });

  it('classifies hard crash signals as non-retryable process crashes', () => {
    for (const signal of ['SIGSEGV', 'SIGABRT', 'SIGILL', 'SIGTRAP', 'SIGBUS']) {
      expect(classifySignal(signal, 'core dumped')).toMatchObject({
        failure_category: 'process_exit',
        failure_detail: 'process_crashed',
        retryable: false,
        user_action: 'none',
      });
    }
  });

  it('classifies SIGINT as a non-retryable interruption', () => {
    expect(classifySignal('SIGINT', 'Interrupted')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'interrupted',
      retryable: false,
      user_action: 'none',
    });
  });

  it('classifies exit code 130 (128+SIGINT) as a non-retryable interruption', () => {
    expect(classifyExit(130, 'Request was cancelled')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'interrupted',
      retryable: false,
      user_action: 'none',
    });
  });

  it('routes an interrupted run whose text names a stream disconnect to upstream', () => {
    expect(
      classifyExit(130, 'stream disconnected before completion'),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      retryable: true,
      user_action: 'retry',
    });
    expect(
      classifySignal('SIGINT', 'Upstream request failed; aborting stream'),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('classifies a plain SIGTERM (not inactivity) as a non-retryable termination', () => {
    expect(classifySignal('SIGTERM', 'Terminated')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'terminated_unknown',
      retryable: false,
      user_action: 'none',
    });
  });

  it('still classifies an inactivity-driven SIGTERM as a retryable timeout', () => {
    expect(
      classifySignal(
        'SIGTERM',
        'Agent stalled without emitting any new output for 120s.',
      ),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_detail: 'inactivity_timeout',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });
  });

  it('uses artifact phase evidence for timeout after artifact output', () => {
    expect(
      classify('TIMEOUT', 'Agent timed out.', [
        { event: 'agent', data: { type: 'text_delta', delta: 'done' } },
        { event: 'agent', data: { type: 'artifact', path: 'index.html' } },
        errorEvent('TIMEOUT', 'Agent timed out.', true),
      ]),
    ).toMatchObject({
      failure_category: 'timeout',
      failure_stage: 'artifact_write',
      retryable: true,
    });
  });

  it('classifies high-confidence Langfuse unknown samples into stable fields', () => {
    expect(classify(null, 'Invalid API Key')).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'invalid_api_key',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'login',
    });

    expect(classify(null, 'Missing environment variable: `OPENAI_API_KEY`.')).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'missing_api_key',
      user_action: 'login',
    });

    expect(
      classify(
        null,
        'Your workspace is out of credits. Ask your workspace owner to refill in order to continue.',
      ),
    ).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'workspace_credits_exhausted',
      failure_stage: 'session_init',
      retryable: false,
      user_action: 'recharge',
    });

    expect(
      classify(
        null,
        'Agent "Claude Code" (`claude`) is not installed or not on PATH. Install it and refresh the agent list (GET /api/agents) before retrying.',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'cli_not_installed',
      failure_stage: 'spawn',
      retryable: false,
      user_action: 'install_cli',
    });

    expect(
      classify(
        null,
        'Claude Code on Windows requires git-bash (https://git-scm.com/download/win). If installed but not in PATH, set CLAUDE_CODE_GIT_BASH_PATH.',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'git_bash_missing',
      failure_stage: 'spawn',
      retryable: false,
      user_action: 'install_cli',
    });

    expect(classify(null, 'spawn failed: spawn EPERM')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'spawn_eperm',
      failure_stage: 'spawn',
      retryable: false,
      user_action: 'install_cli',
    });

    expect(classify(null, "error: unknown option '--trust'")).toMatchObject({
      failure_category: 'model_unavailable',
      failure_detail: 'cli_version_incompatible',
      failure_stage: 'model_select',
      retryable: false,
      user_action: 'switch_model',
    });

    expect(
      classify(null, 'Selected model is at capacity. Please try a different model.'),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'provider_high_demand',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });

    expect(
      classify(null, 'json-rpc id 2: AMR model catalog is temporarily unavailable. Please retry.'),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'provider_routing_error',
      failure_stage: 'first_token_wait',
      retryable: true,
      user_action: 'retry',
    });

    expect(classify(null, 'Qoder run failed: stop_sequence')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'qoder_stop_sequence',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });

    expect(classify(null, 'ACP session exited before completion (code=1, signal=none)')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'agent_protocol_error',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });

    expect(
      classify(
        'AGENT_CONNECTION_DROPPED',
        'Claude Code lost its connection to the Anthropic API before the response finished.',
        [
          { event: 'agent', data: { type: 'text_delta', delta: 'working' } },
          errorEvent(
            'AGENT_CONNECTION_DROPPED',
            'Claude Code lost its connection to the Anthropic API before the response finished.',
            true,
          ),
        ],
      ),
    ).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'stream_disconnected',
      failure_stage: 'child_close',
      retryable: true,
      user_action: 'retry',
    });

    expect(classify('AGENT_EXECUTION_FAILED', 'Unexpected server error. Check server logs for details.')).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_5xx',
      retryable: true,
      user_action: 'retry',
    });

    expect(classify('AGENT_EXECUTION_FAILED', 'NotFoundError: OpenAIException - {"detail":"Not Found"}')).toMatchObject({
      failure_category: 'upstream_unavailable',
      failure_detail: 'upstream_client_error',
      retryable: false,
      user_action: 'none',
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'No payment method. Add a payment method here: https://opencode.ai/workspace/wrk_123/billing',
      ),
    ).toMatchObject({
      failure_category: 'rate_limit',
      failure_detail: 'workspace_credits_exhausted',
      retryable: false,
      user_action: 'recharge',
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'request (34421 tokens) exceeds the available context size (32768 tokens), try increasing it',
      ),
    ).toMatchObject({
      failure_category: 'prompt_too_large',
      failure_detail: 'prompt_too_large',
      failure_stage: 'prompt_send',
      retryable: false,
      user_action: 'reduce_context',
    });

    expect(classify('AGENT_EXECUTION_FAILED', 'Codex CLI was not found. Please update or reinstall OpenAI Codex.')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'cli_not_installed',
      failure_stage: 'spawn',
      retryable: false,
      user_action: 'install_cli',
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'Error: Missing optional dependency @openai/codex-win32-x64. Reinstall Codex: npm install -g @openai/codex@latest',
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'cli_not_installed',
      retryable: false,
      user_action: 'install_cli',
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        'No auth type is selected. Please configure an auth type before running in non-interactive mode.',
      ),
    ).toMatchObject({
      failure_category: 'auth',
      failure_detail: 'auth_required',
      retryable: false,
      user_action: 'login',
    });

    expect(
      classify(
        'AGENT_EXECUTION_FAILED',
        [
          '============================================================',
          'Bun v1.3.10 (30e609e0) Windows x64 (baseline)',
          'panic(main thread): Illegal instruction',
          'oh no: Bun has crashed.',
        ].join('\n'),
      ),
    ).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'process_crashed',
      retryable: false,
      user_action: 'none',
    });
  });
});

function runtimeCloseEvent(reason: string): RunEventForFailureClassification {
  return { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: reason } };
}

describe('execution_failed close-reason refinement', () => {
  // A generic AGENT_EXECUTION_FAILED whose text matched no pattern, plus the
  // runtime_close diagnostic the daemon stamps at finalize time.
  const withCloseReason = (reason: string | null) =>
    classify('AGENT_EXECUTION_FAILED', '', [
      errorEvent('AGENT_EXECUTION_FAILED', ''),
      ...(reason ? [runtimeCloseEvent(reason)] : []),
    ]);

  it('promotes a mid-stream agent error to stream_error', () => {
    expect(withCloseReason('stream_error')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'stream_error',
    });
  });

  it('promotes a bare non-zero exit to exit_nonzero', () => {
    expect(withCloseReason('exit_nonzero')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'exit_nonzero',
    });
  });

  it('promotes an ACP fatal close to fatal_rpc_error', () => {
    expect(withCloseReason('fatal_rpc_error')).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'fatal_rpc_error',
    });
  });

  it('keeps the opaque execution_failed label when no runtime_close diagnostic is present', () => {
    expect(withCloseReason(null)).toMatchObject({ failure_detail: 'execution_failed' });
  });

  it('keeps the opaque label for close reasons outside the three known shapes', () => {
    expect(withCloseReason('unknown')).toMatchObject({ failure_detail: 'execution_failed' });
  });

  it('does not override an already-specific process_exit detail with the close reason', () => {
    // AGENT_EXIT_1 classifies to the specific `exit_code` detail; a stream_error
    // close reason must not relabel it — only the opaque bucket is refined.
    expect(
      classify('AGENT_EXIT_1', '', [
        errorEvent('AGENT_EXIT_1', ''),
        runtimeCloseEvent('stream_error'),
      ]),
    ).toMatchObject({ failure_category: 'process_exit', failure_detail: 'exit_code' });
  });
});

// Reclassify AMR/vela upstream failures that currently fall into the opaque
// `execution_failed` bucket. These carry the generic `AGENT_EXECUTION_FAILED`
// error code, and the real cause is only in the (often Chinese) upstream error
// text, so the English-only detectors miss them. Real production texts were
// sampled from Langfuse (#3408 P1). Each must land in its true product-view
// category instead of the engineering-view opaque bucket.
describe('classifyRunFailure — AMR/vela reclassification out of execution_failed', () => {
  it('classifies a vela Chinese pre-charge (insufficient balance) failure as insufficient_balance', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      '预扣费额度失败, 用户[141283]剩余额度: 💰0.040000, 需要预扣费额度: 💰0.060000 (request id: B202606220543379765673248268d9d6vVKaiRPCMA)',
    );
    expect(result?.failure_category).toBe('insufficient_balance');
    expect(result?.failure_detail).toBe('amr_insufficient_balance');
    expect(result?.user_action).toBe('recharge');
  });

  it('classifies a Chinese 429 rate-limit text as a retryable rate_limit_429', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      '429 您的账户已达到速率限制，请您控制请求频率',
    );
    expect(result?.failure_category).toBe('rate_limit');
    expect(result?.failure_detail).toBe('rate_limit_429');
    expect(result?.retryable).toBe(true);
  });

  it('classifies a vela "model not in allowed list" rejection as model_unavailable', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'API Error: 400 model deepseek-v4-pro-202606 not in allowed list',
    );
    expect(result?.failure_category).toBe('model_unavailable');
    expect(result?.failure_detail).toBe('model_not_found');
    expect(result?.user_action).toBe('switch_model');
  });
});

// The agent binary being absent at its resolved path also leaks into the opaque
// execution_failed bucket (#3408 P1). Real production texts sampled from
// Langfuse. These are an install/PATH problem, not an opaque engine failure.
describe('classifyRunFailure — binary-not-found reclassification out of execution_failed', () => {
  it('classifies a Windows "is not recognized as an internal or external command" as cli_not_installed', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      "'node' is not recognized as an internal or external command, operable program or batch file.",
    );
    expect(result?.failure_category).toBe('process_exit');
    expect(result?.failure_detail).toBe('cli_not_installed');
  });

  it('classifies a "spawn <path> ENOENT" (missing executable) as cli_not_installed', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'Error: spawn /opt/homebrew/lib/node_modules/@openai/codex/codex ENOENT',
    );
    expect(result?.failure_category).toBe('process_exit');
    expect(result?.failure_detail).toBe('cli_not_installed');
  });
});

// Batch A: more named causes that currently leak into execution_failed, routed
// to existing categories. Real production texts sampled from Langfuse (#3408 P1).
describe('classifyRunFailure — batch A reclassification out of execution_failed', () => {
  it('classifies a local-runtime "Prefill context too large" as prompt_too_large', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'MLX prefill memory guard rejected this prompt: Prefill context too large for available memory (preflight safety margin)',
    );
    expect(result?.failure_category).toBe('prompt_too_large');
    expect(result?.failure_detail).toBe('prompt_too_large');
  });

  it('classifies an ACP "thread/start failed" as agent_protocol_error', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'Reading prompt from stdin... Error: thread/start: thread/start failed: failed to start session',
    );
    expect(result?.failure_category).toBe('process_exit');
    expect(result?.failure_detail).toBe('agent_protocol_error');
  });

  it('classifies a vela "login fail: carry the API secret key" as an auth failure', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      "login fail: Please carry the API secret key in the 'Authorization' field of the request header (1004)",
    );
    expect(result?.failure_category).toBe('auth');
  });

  it('classifies a local model server with no model loaded (LM Studio) as local_model_not_loaded', () => {
    // opencode pointed at a local LM Studio provider that has no model loaded.
    // Independent of the model name we pass: the user must load a model first.
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      "No models loaded. Please load a model in the developer page or use the 'lms load' command.",
    );
    expect(result?.failure_category).toBe('model_unavailable');
    expect(result?.failure_detail).toBe('local_model_not_loaded');
    expect(result?.user_action).toBe('switch_model');
  });

  it('classifies a stale Claude session resume as a retryable session_resume_expired', () => {
    // The daemon already cleared the stale session id; the next turn starts
    // fresh. This is recoverable, not an opaque engine crash.
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'The previous Claude session could not be resumed (it may have expired). Resend your message to continue with a fresh session.',
    );
    expect(result?.failure_category).toBe('process_exit');
    expect(result?.failure_detail).toBe('session_resume_expired');
    expect(result?.retryable).toBe(true);
    expect(result?.user_action).toBe('retry');
  });

  it('classifies the raw Claude CLI "no conversation found with session id" as session_resume_expired', () => {
    const result = classify(
      'AGENT_EXECUTION_FAILED',
      'no conversation found with session id 1d2c3b4a-0000-0000-0000-000000000000',
    );
    expect(result?.failure_category).toBe('process_exit');
    expect(result?.failure_detail).toBe('session_resume_expired');
  });
});
