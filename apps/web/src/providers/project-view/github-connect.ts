// Transport + browser-bridge home for the "Connect your repo" CTA's GitHub
// connector status. The connector status endpoint is generic (owned by
// `providers/registry`); this file narrows it to the boolean the CTA needs
// and adds the focus/visibility bridge that keeps it fresh across the
// Connectors dialog / an external OAuth popup neither of which this project
// view controls.
import { fetchConnectorStatuses } from '../registry';

/**
 * Whether the GitHub connector is currently connected. Best-effort: resolves
 * `false` on any transport failure (mirrors `fetchConnectorStatuses`'s own
 * best-effort contract), never rejects.
 */
export async function fetchGithubConnectorConnected(options?: {
  signal?: AbortSignal;
}): Promise<boolean> {
  const statuses = await fetchConnectorStatuses(options);
  return statuses.github?.status === 'connected';
}

/**
 * Bridge for the browser signals that can flip GitHub's connected status
 * behind our back. Fires `onTrigger` on window focus and tab
 * visibility-change; returns an unsubscribe. SSR/no-window safe.
 */
export function subscribeGithubConnectRefreshTriggers(onTrigger: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('focus', onTrigger);
  document.addEventListener('visibilitychange', onTrigger);
  return () => {
    window.removeEventListener('focus', onTrigger);
    document.removeEventListener('visibilitychange', onTrigger);
  };
}
