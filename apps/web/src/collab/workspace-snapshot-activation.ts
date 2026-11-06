import { useCallback, useEffect, useRef } from 'react';

export const WORKSPACE_SNAPSHOT_FALLBACK_MS = 250;

interface WorkspaceSnapshotActivationOptions {
  enabled: boolean;
  identity: string;
  refresh: () => void;
}

/**
 * Let a Team surface's first SSE activation own its initial authoritative
 * snapshot. If the stream is unavailable, a short fallback keeps old shells
 * usable. An activation after the fallback always starts a fresh read: joining
 * the fallback is unsafe because its server-side snapshot may predate the SSE
 * open even while its browser Promise is still pending.
 */
export function useWorkspaceSnapshotActivation({
  enabled,
  identity,
  refresh,
}: WorkspaceSnapshotActivationOptions): () => void {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const lifecycleRef = useRef<{
    identity: string;
    activated: boolean;
  } | null>(null);

  useEffect(() => {
    if (!enabled) {
      lifecycleRef.current = null;
      return;
    }
    const lifecycle = { identity, activated: false };
    lifecycleRef.current = lifecycle;
    const timer = window.setTimeout(() => {
      if (lifecycleRef.current !== lifecycle || lifecycle.activated) return;
      refreshRef.current();
    }, WORKSPACE_SNAPSHOT_FALLBACK_MS);
    return () => {
      window.clearTimeout(timer);
      if (lifecycleRef.current === lifecycle) lifecycleRef.current = null;
    };
  }, [enabled, identity]);

  return useCallback(() => {
    const lifecycle = lifecycleRef.current;
    if (!lifecycle || lifecycle.identity !== identity) return;
    lifecycle.activated = true;
    refreshRef.current();
  }, [identity]);
}
