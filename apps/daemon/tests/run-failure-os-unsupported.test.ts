// Red spec: an AMR run on a Windows build older than Bun's floor must be named
// `os_unsupported` (non-retryable), not a retryable `fatal_rpc_error`.
//
// Production evidence (Open Design 0.24.1, AMR, Windows 10 build 16299 / 1709):
// every run failed with the text below, 17 times across a week, because the
// generic card kept offering a Retry. The bundled OpenCode is a Bun-compiled
// binary and Bun requires Windows 10 1809 (build 17763) or newer
// (https://bun.com/docs/installation); on an older build the loader cannot
// resolve an imported Windows API and the process dies with
// STATUS_ENTRYPOINT_NOT_FOUND (0xC0000139) before readiness.
import { describe, expect, it } from 'vitest';

import {
  classifyRunFailure,
  type RunEventForFailureClassification,
} from '../src/run-failure-classification.js';

const PRODUCTION_MESSAGE =
  'json-rpc id 2: start opencode server: opencode exited before readiness: exit status 0xc0000139';

function classify(
  message: string,
  hostOs: { platform: string; release: string },
) {
  const events: RunEventForFailureClassification[] = [
    {
      event: 'error',
      data: { message, error: { code: 'AGENT_EXECUTION_FAILED', message } },
    },
    { event: 'diagnostic', data: { type: 'runtime_close', rpc_close_reason: 'fatal_rpc_error' } },
  ];
  return classifyRunFailure({
    result: 'failed',
    status: {
      status: 'failed',
      error: message,
      errorCode: 'AGENT_EXECUTION_FAILED',
      exitCode: 1,
      signal: null,
    },
    errorCode: 'AGENT_EXECUTION_FAILED',
    agentId: 'amr',
    events,
    hostOs,
  });
}

describe('os_unsupported (Windows older than 1809) classification', () => {
  it('names the production 0xc0000139 startup failure on build 16299 as os_unsupported', () => {
    expect(classify(PRODUCTION_MESSAGE, { platform: 'win32', release: '10.0.16299' })).toMatchObject({
      failure_category: 'process_exit',
      failure_detail: 'os_unsupported',
      failure_domain: 'client_environment',
      retryable: false,
      user_action: 'none',
    });
  });

  it('also matches the decimal exit-status rendering of STATUS_ENTRYPOINT_NOT_FOUND', () => {
    const message = 'start opencode server: opencode exited before readiness: exit status 3221225785';
    expect(classify(message, { platform: 'win32', release: '10.0.17134' })).toMatchObject({
      failure_detail: 'os_unsupported',
      retryable: false,
    });
  });

  it('does not blame the Windows version on a supported build (1809 and newer)', () => {
    for (const release of ['10.0.17763', '10.0.19045', '10.0.22631']) {
      expect(classify(PRODUCTION_MESSAGE, { platform: 'win32', release })?.failure_detail)
        .not.toBe('os_unsupported');
    }
  });

  it('does not claim 0xc0000139 outside the bundled-opencode startup wrapper', () => {
    const message = 'codex acp bridge exited: exit status 0xc0000139';
    expect(classify(message, { platform: 'win32', release: '10.0.16299' })?.failure_detail)
      .not.toBe('os_unsupported');
  });

  it('does not claim the failure on a non-Windows host', () => {
    expect(classify(PRODUCTION_MESSAGE, { platform: 'darwin', release: '24.6.0' })?.failure_detail)
      .not.toBe('os_unsupported');
  });
});
