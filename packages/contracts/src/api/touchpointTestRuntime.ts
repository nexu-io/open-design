/** The only scenario accepted by the test touchpoint runtime. */
export type TestRuntimeScenario = 'realtime';

/** Server-computed placement of the current time in a test deployment window. */
export type TestRuntimeScheduleState = 'before' | 'active' | 'ended';

/** Body for POST /api/touchpoints/test-runtime/context. */
export interface TestRuntimeContextRequest {
  deploymentId: string;
  scenario: TestRuntimeScenario;
}

/** Context established for a test deployment. */
export interface TestRuntimeContext extends TestRuntimeContextRequest {
  testerMemberId?: string;
  updatedAt: string;
}

/** Server-authoritative clock and deployment-window bounds, serialized as ISO-8601 strings. */
export interface TestRuntimeTiming {
  serverTime: string;
  startsAt: string;
  endsAt: string;
  authorizationExpiresAt: string;
}

/**
 * A test-runtime decision. Content and action shapes remain owned by their
 * consuming UI component; this contract owns the exact shared wire fields.
 */
export interface TestRuntimeDecision<Content = unknown, StaticActions = unknown>
  extends TestRuntimeTiming {
  deploymentId: string;
  activityId?: string;
  snapshotHash?: string;
  artifactHash?: string;
  manifestHash?: string;
  placementKey: string;
  requiredCapabilities: string[];
  content: Content;
  staticActions: StaticActions;
  testContext: TestRuntimeContext & {
    scheduleState: TestRuntimeScheduleState;
  };
}

/** Body for POST test-deployments/:deploymentId/acceptances. */
export interface TestRuntimeAcceptanceRequest {
  placementKey: string;
  hostVersion: string;
  locale: string;
  scenario: TestRuntimeScenario;
  evidence: string;
}
