import { useEffect, useRef } from 'react';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { TrackingWorkspacePage } from '@open-design/contracts/analytics';
import { useAnalytics } from './provider';
import { trackWorkspaceSurfaceView } from './events';
import { workspaceAnalyticsDimensions } from './workspace';
import { observeAnalytics } from './observe';

/** An authorized workspace actually rendered in a visible client window.
 * This is an exposure, never a claim that a new membership was created. */
export function useWorkspaceContentView({ context, pageName, active, ready }: {
  context: WorkspaceCollabContext | null;
  pageName: TrackingWorkspacePage;
  active: boolean;
  ready: boolean;
}): void {
  const { track } = useAnalytics();
  const lastView = useRef<string | null>(null);
  const eligible = active && ready && context?.memberStatus === 'active'
    && context.lifecycleState !== 'deleted'
    && Boolean(context.workspaceId.trim()) && Boolean(context.workspaceMemberId.trim());
  const key = eligible ? JSON.stringify([context!.workspaceId, context!.workspaceMemberId, pageName]) : null;
  const latest = useRef({ context, pageName });
  latest.current = { context, pageName };
  useEffect(() => {
    if (!key) {
      // A background refresh is not another visit. Leaving the content or
      // changing the verified member/page will start a new exposure.
      if (!active) lastView.current = null;
      return;
    }
    const expose = () => {
      if (document.visibilityState !== 'visible' || lastView.current === key) return;
      lastView.current = key;
      observeAnalytics(() => trackWorkspaceSurfaceView(track, {
        ...workspaceAnalyticsDimensions(latest.current.context),
        page_name: latest.current.pageName,
        area: 'workspace_content',
        surface_instance_id: crypto.randomUUID(),
      }));
    };
    expose();
    document.addEventListener('visibilitychange', expose);
    return () => document.removeEventListener('visibilitychange', expose);
  }, [key, active, track]);
}
