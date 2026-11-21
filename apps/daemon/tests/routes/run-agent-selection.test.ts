import { describe, expect, it } from 'vitest';

import { resolveOmittedRunAgentId } from '../../src/routes/runs.js';

describe('resolveOmittedRunAgentId', () => {
  it('preserves the configured agent when its probe reports unavailable', () => {
    expect(resolveOmittedRunAgentId('pi', [
      { id: 'pi', available: false },
      { id: 'byok-opencode', available: true },
    ])).toBe('pi');
  });

  it('uses the first available agent only when no agent is configured', () => {
    expect(resolveOmittedRunAgentId(null, [
      { id: 'pi', available: false },
      { id: 'byok-opencode', available: true },
      { id: 'claude', available: true },
    ])).toBe('byok-opencode');
  });

  it('returns null when there is neither configured intent nor an available agent', () => {
    expect(resolveOmittedRunAgentId('', [
      { id: 'pi', available: false },
    ])).toBeNull();
  });
});
