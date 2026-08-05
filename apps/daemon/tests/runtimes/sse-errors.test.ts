import { describe, expect, it } from 'vitest';
import {
  createAmrModelUnavailablePayload,
  createSseErrorPayload,
  rewriteKnownAgentStreamError,
} from '../../src/runtimes/sse-errors.js';

describe('SSE error runtime', () => {
  it('creates the shared error envelope with retry metadata', () => {
    expect(createSseErrorPayload('AGENT_EXECUTION_FAILED', 'failed', { retryable: true }))
      .toEqual({
        message: 'failed',
        error: { code: 'AGENT_EXECUTION_FAILED', message: 'failed', retryable: true },
      });
  });

  it('rewrites the known opencode scanner failure without leaking raw output', () => {
    expect(rewriteKnownAgentStreamError(
      'opencode',
      'opencode: bufio.Scanner: token too long',
      'json-rpc id 3',
    )).toBe('The run failed due to an unknown upstream streaming error. Please retry.');
    expect(rewriteKnownAgentStreamError('claude', '  provider failed  ')).toBe('provider failed');
    expect(rewriteKnownAgentStreamError('claude', null)).toBe('Agent stream error');
  });

  it('builds the AMR unavailable contract with bounded details', () => {
    expect(createAmrModelUnavailablePayload('  model-a  ', { reason: 'catalog' }))
      .toEqual({
        message: 'AMR model "model-a" is not available from Vela. Refresh the AMR model list, choose a supported model, and retry this run.',
        error: {
          code: 'AMR_MODEL_UNAVAILABLE',
          message: 'AMR model "model-a" is not available from Vela. Refresh the AMR model list, choose a supported model, and retry this run.',
          retryable: false,
          details: { kind: 'amr_model', action: 'choose_model', model: 'model-a', reason: 'catalog' },
        },
      });
  });
});
