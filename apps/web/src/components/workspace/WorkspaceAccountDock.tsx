import { useCallback, useRef, useSyncExternalStore } from 'react';
import styles from './WorkspaceAccountDock.module.css';

type Placement = 'download' | 'fallback';
const hosts = new Map<HTMLElement, Placement>();
const listeners = new Set<() => void>();

function getHost(): HTMLElement | null {
  let fallback: HTMLElement | null = null;
  for (const [host, placement] of hosts) {
    if (placement === 'download') return host;
    fallback = host;
  }
  return fallback;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useWorkspaceAccountDock(): HTMLElement | null {
  return useSyncExternalStore(subscribe, getHost, () => null);
}

/** Keep billing mounted when the active viewer or workspace view changes. */
export function WorkspaceAccountDock({ placement }: { placement: Placement }) {
  const ownHost = useRef<HTMLElement | null>(null);
  const register = useCallback((host: HTMLDivElement | null) => {
    if (ownHost.current) hosts.delete(ownHost.current);
    ownHost.current = host;
    if (host) hosts.set(host, placement);
    for (const listener of listeners) listener();
  }, [placement]);
  return <div ref={register} className={styles.dock} data-testid={`workspace-account-dock-${placement}`} />;
}
