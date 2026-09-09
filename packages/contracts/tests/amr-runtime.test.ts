import { describe, expect, it } from 'vitest';
import { executionProfileForRuntime } from '../src/execution-profile.js';
import { parseAmrModelResponses, resolveAmrRuntime } from '../src/api/amr-runtime.js';

describe('per-run AMR runtime selection', () => {
  it('preserves the existing default and other agents', () => {
    expect(resolveAmrRuntime('amr', undefined)).toBe('opencode');
    expect(resolveAmrRuntime('codex', undefined)).toBeUndefined();
    expect(resolveAmrRuntime('amr', 'pi')).toBe('pi');
    expect(resolveAmrRuntime('amr', 'opencode')).toBe('opencode');
  });

  it.each([null, '', 'Pi', 'claude-code', 'unknown', false, {}, ['pi']])(
    'rejects unsupported input %j instead of falling back', (value) => {
      expect(() => resolveAmrRuntime('amr', value)).toThrow(/amrRuntime/);
    },
  );

  it.each(['pi', 'codex', 'claude', 'dsh', 'none'])('accepts explicit %s without changing its identity', (runtime) => {
    expect(resolveAmrRuntime('amr', runtime)).toBe(runtime);
  });

  it('rejects runtime selection on a different agent', () => {
    expect(() => resolveAmrRuntime('pi', 'pi')).toThrow(/only supported by AMR/);
  });
});

describe('AMR catalog and backend model observations', () => {
  const response = { requestedModelId: 'gpt-6-astra-high', requestId: 'link-request', responseId: 'response', responseModelId: 'teamorouter/gpt-6-astra' };
  it('retains distinct model names and supports historical missing evidence', () => {
    expect(parseAmrModelResponses([response], response.requestedModelId)).toEqual([response]);
    expect(parseAmrModelResponses(undefined, response.requestedModelId)).toBeUndefined();
  });
  it.each([null, [], [response, response], [{ ...response, requestedModelId: 'another-model' }], [{ ...response, responseModelId: '' }]])('rejects invalid observations %j', (value) => {
    expect(() => parseAmrModelResponses(value, response.requestedModelId)).toThrow();
  });
});

it('uses the existing text artifact contract only for AMR direct-model calls', () => {
  expect(executionProfileForRuntime('amr', 'acp-json-rpc', 'none')).toBe('text_artifact');
  for (const runtime of ['opencode', 'pi', 'codex', 'claude', 'dsh'] as const) {
    expect(executionProfileForRuntime('amr', 'acp-json-rpc', runtime)).toBe('filesystem');
  }
  expect(executionProfileForRuntime('codex', 'json-event')).toBe('filesystem');
  expect(executionProfileForRuntime('custom', 'plain')).toBe('text_artifact');
});
