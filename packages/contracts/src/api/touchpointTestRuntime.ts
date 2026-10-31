/** The only scenario accepted by the test touchpoint runtime. */
export type TestRuntimeScenario = 'realtime';

/**
 * One bounded page of GET /api/touchpoints/test-runtime/deployments.
 * Follow the opaque cursor until null before treating the catalog as complete.
 * Legacy servers omit nextCursor: their single page has unknown completeness.
 * Catalog metadata never grants runtime display authority.
 */
export interface TestRuntimeDeploymentCatalogPage<Deployment = unknown> {
  deployments: Deployment[];
  nextCursor?: string | null;
}

/** Server-computed placement of the current time in a test deployment window. */
export type TestRuntimeScheduleState = 'before' | 'active' | 'ended';

/** Body for POST /api/touchpoints/test-runtime/context. */
export interface TestRuntimeContextRequest {
  deploymentId: string;
  scenario: TestRuntimeScenario;
}

/** Server-issued immutable identity; the token is an identity, never a credential. */
export interface TestRuntimeContextIdentity {
  /** Stable versioned deployment/authenticated tester/realtime identity. */
  contextId: string;
  /** Decimal immutable deployment activityRevision, never a timestamp or client counter. */
  generation: string;
  /** Versioned digest binding the identity and complete immutable snapshot facts. */
  contextToken: string;
}

/**
 * Context acquired from the server. All three identity fields negotiate immutable
 * mode; their absence negotiates legacy updatedAt matching. Partial bundles are
 * invalid. updatedAt remains on both wires for old clients, not immutable identity.
 */
export type TestRuntimeContext = TestRuntimeContextRequest & { updatedAt: string } & (
  | (TestRuntimeContextIdentity & { testerMemberId: string })
  | { testerMemberId?: string; contextId?: never; generation?: never; contextToken?: never }
);

/** Additive GET runtime/test query. Old clients may omit the identity token. */
export interface TestRuntimeQuery {
  deploymentId: string;
  placementKey: string;
  locale: string;
  contextToken?: string;
}

/**
 * HTTP 409 after authentication, availability and withdrawal checks. Metadata
 * is scoped to the authenticated tester and current deployment; it grants no
 * display authority. Reacquire through POST context before requesting decisions.
 */
export interface TestRuntimeContextMismatch {
  error: 'test_context_mismatch';
  reason: 'context_token_mismatch';
  testContext: TestRuntimeContextRequest & { updatedAt: string; testerMemberId: string } & TestRuntimeContextIdentity;
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
