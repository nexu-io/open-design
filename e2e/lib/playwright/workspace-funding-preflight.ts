import type { WorkspaceBillingPreflight, WorkspaceBillingResponse } from '@open-design/contracts';

/** Validate the real scoped funding precondition before any UI business step. */
export function requireScopedFundingPreflight(
  body: WorkspaceBillingResponse,
  expected: { workspaceId: string; workspaceMemberId: string; modelId: string },
): WorkspaceBillingPreflight {
  const preflight = body.preflight;
  if (!preflight || preflight.schemaVersion !== 1 || preflight.workspaceId !== expected.workspaceId
    || preflight.workspaceMemberId !== expected.workspaceMemberId
    || preflight.modelId !== expected.modelId) {
    throw new Error('Funding preflight does not match the required workspace/member/model');
  }
  // Shared wallet authority belongs to the versioned billing response, not
  // an optional upstream extension absent from WorkspaceBillingPreflight.
  const wallet = body.workspaceBalance;
  if (!wallet || wallet.billingScopeVersion !== 2
    || wallet.workspaceId !== expected.workspaceId
    || wallet.workspaceMemberId !== expected.workspaceMemberId
    || preflight.codingPlan?.workspaceId !== expected.workspaceId) {
    throw new Error('Funding precondition requires the exact workspace/member v2 wallet and plan');
  }
  return preflight;
}
