// Browser-side bridge for the connector OAuth flow. Trusts the popup callback
// origin, persists which connectors are mid-authorization across reloads, and
// owns the two browser subscriptions the OAuth flow needs (the popup callback
// message + the mid-authorization status poll). This lives in providers/ rather
// than a feature file because it touches `window`/`sessionStorage`; the slice
// reaches every one of these through an injected port, so its hooks stay
// DOM-free and unit-testable with a fake.
import { CONNECTOR_CALLBACK_MESSAGE_TYPE } from '../../components/connectors-events';

// Re-exported through the memory provider barrel so the slice's dependencies.ts
// binds a single transport/side-effect home instead of importing shared
// component utils directly.
export { notifyConnectorsChanged } from '../../components/connectors-events';

const MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY = 'od:memory:pending-connector-auth';

/** How often to re-poll connector statuses while an authorization is in flight. */
const CONNECTOR_AUTH_POLL_INTERVAL_MS = 2_000;

export function isTrustedConnectorCallbackOrigin(origin: string): boolean {
  const expectedOrigin = typeof window === 'undefined' ? '' : window.location.origin;
  if (origin === expectedOrigin) return true;
  try {
    const url = new URL(origin);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
    return (
      url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]'
      || url.hostname === '::1'
    );
  } catch {
    return false;
  }
}

export function readPendingConnectorAuthIds(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = window.sessionStorage.getItem(MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === 'string' && id.trim().length > 0));
  } catch {
    return new Set();
  }
}

export function writePendingConnectorAuthIds(ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    if (ids.size === 0) {
      window.sessionStorage.removeItem(MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY);
      return;
    }
    window.sessionStorage.setItem(
      MEMORY_CONNECTOR_PENDING_AUTH_STORAGE_KEY,
      JSON.stringify([...ids]),
    );
  } catch {
    // Session storage can be blocked; the in-memory state still works.
  }
}

/**
 * Subscribe to the OAuth popup's success callback. The popup posts a message on
 * completion; we ignore anything that isn't the expected message type from a
 * trusted callback origin, then invoke `onCallback` (typically a status
 * refresh). Returns an unsubscribe.
 */
export function subscribeConnectorCallback(onCallback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onMessage = (event: MessageEvent) => {
    const data = event.data;
    if (!data || typeof data !== 'object') return;
    if ((data as { type?: unknown }).type !== CONNECTOR_CALLBACK_MESSAGE_TYPE) return;
    if (!isTrustedConnectorCallbackOrigin(event.origin)) return;
    onCallback();
  };
  window.addEventListener('message', onMessage);
  return () => window.removeEventListener('message', onMessage);
}

/**
 * Poll connector statuses while an authorization is mid-flight: on a fixed
 * interval and whenever the window regains focus (the user finished the popup
 * and tabbed back). The caller gates this on there being pending auth ids.
 * Returns an unsubscribe that tears both listeners down.
 */
export function subscribeConnectorStatusPolling(onTick: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const interval = window.setInterval(onTick, CONNECTOR_AUTH_POLL_INTERVAL_MS);
  const onFocus = () => onTick();
  window.addEventListener('focus', onFocus);
  return () => {
    window.clearInterval(interval);
    window.removeEventListener('focus', onFocus);
  };
}
