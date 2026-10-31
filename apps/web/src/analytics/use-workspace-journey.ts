import { useEffect, useRef } from 'react';
import type { WorkspaceJourneySurfaceProps } from '@open-design/contracts/analytics';
import { useAnalytics } from './provider';
import { trackWorkspaceJourneyClick, trackWorkspaceJourneyView } from './events';

/** One visible instance, even under StrictMode or background context refreshes.
 * Hiding/reopening or changing workspace starts a new instance. */
export function useWorkspaceJourney(
  props: Omit<WorkspaceJourneySurfaceProps, 'surface_instance_id'>,
  visible = true,
) {
  const { track } = useAnalytics();
  const instance = useRef<{ key: string; id: string; viewed: boolean } | null>(null);
  const key = visible ? JSON.stringify([props.area, props.workspace_key, props.reason, props.run_id]) : '';
  if (!key) instance.current = null;
  else if (instance.current?.key !== key) instance.current = { key, id: crypto.randomUUID(), viewed: false };
  const id = instance.current?.id ?? '';
  const latest = useRef(props); latest.current = props;
  useEffect(() => {
    if (!instance.current || instance.current.viewed || !visible) return;
    instance.current.viewed = true;
    trackWorkspaceJourneyView(track, { ...latest.current, ...(latest.current.reason ? { block_id: instance.current.id } : {}), surface_instance_id: instance.current.id });
  }, [key, visible, track]);
  return {
    id,
    click(element: 'invite_teammates' | 'close' | 'upgrade' | 'return_personal_workspace') {
      if (visible) trackWorkspaceJourneyClick(track, { ...props, ...(props.reason ? { block_id: id } : {}), surface_instance_id: id, element });
    },
  };
}
