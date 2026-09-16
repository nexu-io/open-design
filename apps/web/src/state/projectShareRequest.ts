import { useSyncExternalStore } from 'react';

type ShareRequest = { projectId: string; fileName: string };
let pending: ShareRequest | null = null;
const listeners = new Set<() => void>();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
};
const snapshot = () => pending;
const serverSnapshot = () => null;

/** Retain the request across project navigation until its viewer mounts. */
export function requestProjectShare(projectId: string, fileName: string) {
  pending = { projectId, fileName };
  listeners.forEach((listener) => listener());
}
export function clearProjectShareRequest(request: ShareRequest) {
  if (pending !== request) return;
  pending = null;
  listeners.forEach((listener) => listener());
}
export function useProjectShareRequest() {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
