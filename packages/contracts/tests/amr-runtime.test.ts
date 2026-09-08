import { describe, expect, it } from 'vitest';
import { executionProfileForRuntime } from '../src/execution-profile.js';
import { resolveAmrRuntime } from '../src/api/amr-runtime.js';

describe('per-run AMR runtime selection', () => {
  it('preserves the existing default and other agents', () => {
    expect(resolveAmrRuntime('amr', undefined)).toBe('opencode');
    expect(resolveAmrRuntime('codex', undefined)).toBeUndefined();
    expect(resolveAmrRuntime('amr', 'pi')).toBe('pi');
    expect(resolveAmrRuntime('amr', 'opencode')).toBe('opencode');
  });

  it.each([null, '', 'Pi', 'claude', 'unknown', false, {}, ['pi']])(
    'rejects unsupported input %j instead of falling back', (value) => {
      expect(() => resolveAmrRuntime('amr', value)).toThrow(/amrRuntime/);
    },
  );

  it.each(['pi', 'codex', 'dsh', 'none'])('accepts explicit %s without changing its identity', (runtime) => {
    expect(resolveAmrRuntime('amr', runtime)).toBe(runtime);
  });

  it('rejects runtime selection on a different agent', () => {
    expect(() => resolveAmrRuntime('pi', 'pi')).toThrow(/only supported by AMR/);
  });
});

it('uses the existing text artifact contract only for AMR direct-model calls', () => {
  expect(executionProfileForRuntime('amr', 'acp-json-rpc', 'none')).toBe('text_artifact');
  for (const runtime of ['opencode', 'pi', 'codex', 'dsh'] as const) {
    expect(executionProfileForRuntime('amr', 'acp-json-rpc', runtime)).toBe('filesystem');
  }
  expect(executionProfileForRuntime('codex', 'json-event')).toBe('filesystem');
  expect(executionProfileForRuntime('custom', 'plain')).toBe('text_artifact');
});
