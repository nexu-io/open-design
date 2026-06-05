export const CONNECTOR_CALLBACK_MESSAGE_TYPE = 'open-design:connector-connected';
export const CONNECTORS_CHANGED_EVENT = 'open-design:connectors-changed';

export function notifyConnectorsChanged(): void {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new CustomEvent(CONNECTORS_CHANGED_EVENT));
  } catch {
    window.dispatchEvent(new Event(CONNECTORS_CHANGED_EVENT));
  }
}

export function listenForConnectorsChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  let scheduled = false;
  let active = true;
  const scheduleListener = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      if (!active) return;
      listener();
    });
  };
  window.addEventListener(CONNECTORS_CHANGED_EVENT, scheduleListener);
  return () => {
    active = false;
    window.removeEventListener(CONNECTORS_CHANGED_EVENT, scheduleListener);
  };
}
