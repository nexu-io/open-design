import { describe, expect, it } from 'vitest';

import {
  agentIdToTracking,
  feedbackAgentProviderIdToTracking,
} from '../src/analytics/events.js';

describe('agentIdToTracking', () => {
  it('maps the AMR (vela CLI) runtime to its own provider id', () => {
    // Regression: AMR's daemon agentId is `amr` (apps/daemon/src/runtimes
    // /defs/amr.ts), but the mapping had no `amr` case, so every AMR run
    // landed in the `other` catch-all and could not be told apart from
    // unmapped agents in PostHog. It must report `amr`, not `other`.
    expect(agentIdToTracking('amr')).toBe('amr');
  });

  it('keeps mapping known CLI agents and falls back to other for unknowns', () => {
    expect(agentIdToTracking('claude')).toBe('claude_code');
    expect(agentIdToTracking('opencode')).toBe('opencode');
    expect(agentIdToTracking('totally-unknown-agent')).toBe('other');
    expect(agentIdToTracking(null)).toBe('other');
    expect(agentIdToTracking(undefined)).toBe('other');
  });

  it('routes AMR feedback through the same provider id', () => {
    // feedbackAgentProviderIdToTracking falls through to agentIdToTracking
    // for non-BYOK agents, so AMR assistant feedback must also be `amr`.
    expect(feedbackAgentProviderIdToTracking('amr')).toBe('amr');
  });
});
