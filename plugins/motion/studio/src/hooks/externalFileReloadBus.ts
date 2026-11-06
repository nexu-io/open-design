type ExternalFileReloadListener = (path: string) => void;

const listeners = new Set<ExternalFileReloadListener>();

export function addExternalFileReloadListener(listener: ExternalFileReloadListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyExternalFileReload(path: string): void {
  for (const listener of listeners) {
    try {
      listener(path);
    } catch {
      // A stale SDK owner must not prevent sibling owners from reloading.
    }
  }
}
