import { describe, expect, it } from 'vitest';
import { resolveAmrRuntime } from '../src/api/amr-runtime.js';

describe('per-run AMR runtime selection', () => {
  it('preserves the existing default and other agents', () => {
    expect(resolveAmrRuntime('amr', undefined)).toBe('opencode');
    expect(resolveAmrRuntime('codex', undefined)).toBeUndefined();
    expect(resolveAmrRuntime('amr', 'pi')).toBe('pi');
    expect(resolveAmrRuntime('amr', 'opencode')).toBe('opencode');
  });

  it.each([null, '', 'Pi', 'claude', 'codex', false, {}, ['pi']])(
    'rejects unsupported input %j instead of falling back', (value) => {
      expect(() => resolveAmrRuntime('amr', value)).toThrow(/amrRuntime/);
    },
  );

  it('rejects runtime selection on a different agent', () => {
    expect(() => resolveAmrRuntime('pi', 'pi')).toThrow(/only supported by AMR/);
  });
});
