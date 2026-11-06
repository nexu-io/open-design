import { afterEach, describe, expect, it } from 'vitest';

import {
  __resetWorkspaceAuthorityMetricsForTests,
  recordWorkspaceAuthorityDecision,
  recordWorkspaceAuthorityInvalidation,
  recordWorkspaceAuthorityRealtimeTransition,
  recordWorkspaceAuthorityRevocationClear,
  recordWorkspaceAuthoritySuppressedRequest,
} from '../../src/metrics/workspace-authority.js';
import { register } from '../../src/metrics/index.js';

afterEach(() => __resetWorkspaceAuthorityMetricsForTests());

describe('workspace authority metrics', () => {
  it('exports bounded decision, suppression, invalidation, health, age, and revocation series', async () => {
    recordWorkspaceAuthorityDecision({
      mode: 'legacy',
      source: 'cache',
      reason: 'lease_hit',
      outcome: 'allow',
      ageMs: 1_250,
    });
    recordWorkspaceAuthoritySuppressedRequest({
      mode: 'legacy',
      source: 'directory',
      reason: 'lease_hit',
    });
    recordWorkspaceAuthorityInvalidation({
      mode: 'adaptive',
      source: 'current',
      reason: 'auth_reject',
    });
    recordWorkspaceAuthorityRealtimeTransition({
      mode: 'adaptive',
      healthy: false,
      memberEvents: true,
      listenerStatus: true,
      sourceGap: true,
    });
    recordWorkspaceAuthorityRevocationClear('adaptive', 2.5);

    const text = await register.metrics();
    expect(text).toContain(
      'open_design_workspace_authority_decisions_total{mode="legacy",source="cache",reason="lease_hit",outcome="allow"} 1',
    );
    expect(text).toContain(
      'open_design_workspace_authority_suppressed_requests_total{mode="legacy",source="directory",reason="lease_hit"} 1',
    );
    expect(text).toContain(
      'open_design_workspace_authority_invalidations_total{mode="adaptive",source="current",reason="auth_reject"} 1',
    );
    expect(text).toContain(
      'open_design_workspace_authority_realtime_transitions_total{mode="adaptive",health="unhealthy",member_events="present",listener_status="present",source_gap="yes"} 1',
    );
    expect(text).toContain('open_design_workspace_authority_age_ms_bucket{');
    expect(text).toContain('open_design_workspace_authority_revocation_clear_ms_bucket{');
  });
});
