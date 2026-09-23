import { useEffect, useState } from 'react';
import { fetchVelaLoginStatus } from '../../providers/daemon';
import { currentWorkspaceAccountGeneration } from '../../collab/workspace-identity';
import { AMR_LOGIN_STATUS_EVENT, isAmrSessionAuthenticated } from '../amrLoginPolling';

/** Existing login projection's user.id is the app account id, never a workspace membership. */
export function useShareGuideAppUserId() {
  const generation = currentWorkspaceAccountGeneration();
  const [account, setAccount] = useState<{ generation: number; appUserId: string | null } | null>(null);
  useEffect(() => {
    let request = 0;
    let disposed = false;
    const refresh = () => {
      const attempt = ++request;
      const startedGeneration = currentWorkspaceAccountGeneration();
      setAccount(null);
      void fetchVelaLoginStatus().then(status => {
        if (disposed || attempt !== request || startedGeneration !== currentWorkspaceAccountGeneration()) return;
        const id = isAmrSessionAuthenticated(status) ? status?.user?.id?.trim() : null;
        setAccount({ generation: startedGeneration, appUserId: id || null });
      }).catch(() => {
        if (!disposed && attempt === request) setAccount(null);
      });
    };
    refresh();
    window.addEventListener(AMR_LOGIN_STATUS_EVENT, refresh);
    return () => { disposed = true; ++request; window.removeEventListener(AMR_LOGIN_STATUS_EVENT, refresh); };
  }, [generation]);
  return account?.generation === generation ? account.appUserId : null;
}
