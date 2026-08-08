import type { WorkspaceCollabContext } from '@open-design/contracts';
import type {
  TrackingCountBucket,
  TrackingWorkspaceDimensions,
  TrackingWorkspacePage,
} from '@open-design/contracts/analytics';

/** Convert product context to the bounded, PII-free Workspace dimensions. */
export function workspaceAnalyticsDimensions(
  context: WorkspaceCollabContext | null | undefined,
): TrackingWorkspaceDimensions {
  if (!context) return {};
  const plan = context.planId?.trim().toLowerCase();
  const planBucket = !plan || plan === 'free' ? 'free' : 'paid';
  const isSeatFull = context.seatSummary?.isSeatFull;
  return {
    workspace_key: context.workspaceId,
    workspace_type: context.workspaceType,
    workspace_role: context.role,
    workspace_lifecycle: context.lifecycleState,
    billing_state: context.billingState,
    plan_bucket: planBucket,
    provider_mode: context.providerMode,
    seat_state: isSeatFull == null ? 'unknown' : isSeatFull ? 'full' : 'available',
    $groups: { workspace: context.workspaceId },
  };
}

export function countBucket(count: number): TrackingCountBucket {
  if (count <= 0) return '0';
  if (count === 1) return '1';
  if (count <= 5) return '2_5';
  if (count <= 10) return '6_10';
  return '11_plus';
}

export function entryViewToTracking(view: string): TrackingWorkspacePage {
  switch (view) {
    case 'community':
      return 'community';
    case 'drafts':
      return 'drafts';
    case 'all-projects':
      return 'all_projects';
    case 'design-systems':
      return 'design_systems';
    case 'plugins':
      return 'plugins';
    default:
      return 'home';
  }
}

export function stableAnalyticsErrorCode(status?: number): string {
  if (!status) return 'network_error';
  if (status === 401) return 'unauthorized';
  if (status === 403) return 'forbidden';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  if (status === 429) return 'rate_limited';
  return status >= 500 ? 'server_error' : 'request_failed';
}
