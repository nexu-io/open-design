// Recently-opened file tracking for the Quick Switcher (Cmd/Ctrl+P).
// Scoped per-project so each project keeps its own list. localStorage is
// the right home: recents are a UX nicety, not source-of-truth state, and
// keeping them client-side avoids a daemon round-trip on every open.

const PREFIX = 'od:qs-recents:';
export const RECENTS_LIMIT = 6;

function key(projectId: string): string {
  return `${PREFIX}${projectId}`;
}

export function readRecents(projectId: string): string[] {
  try {
    const raw = localStorage.getItem(key(projectId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function pushRecent(projectId: string, name: string): void {
  try {
    const prev = readRecents(projectId);
    const next = [name, ...prev.filter((p) => p !== name)].slice(0, RECENTS_LIMIT);
    localStorage.setItem(key(projectId), JSON.stringify(next));
  } catch {
    // Quota exceeded or private mode — recents are best-effort, drop silently.
  }
}
