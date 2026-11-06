import { describe, expect, it } from 'vitest';

import {
  agentIdToTracking,
  byokProtocolToTracking,
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

  it("keeps the native aimlapi BYOK protocol's own identity instead of folding into other", () => {
    // Regression: adding 'aimlapi' to ByokChatProtocol without registering it
    // here made every AI/ML API selection/run report as unknown/other,
    // hiding rollout and error-rate breakdowns for this provider (#7461
    // review finding).
    expect(byokProtocolToTracking('aimlapi')).toBe('aimlapi');
    // apiProtocolAgentId() (apps/web/src/utils/apiProtocol.ts) emits
    // 'aimlapi-api' as the feedback agent id for this protocol.
    expect(feedbackAgentProviderIdToTracking('aimlapi-api')).toBe('aimlapi');
  });
});
