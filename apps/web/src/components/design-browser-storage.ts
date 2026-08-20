import type { BrowserViewportId } from './design-browser-tools';

/** Persisted visit list for Design Browser, scoped per project. */
export type BrowserHistoryEntry = {
  iconUrl?: string;
  title: string;
  url: string;
  lastVisitedAt: number;
  visitCount: number;
};

export const DESIGN_BROWSER_HISTORY_LIMIT = 80;

export function designBrowserHistoryStorageKey(projectId: string): string {
  return `od:design-browser:${projectId}:history:v1`;
}

export function designBrowserViewportStorageKey(projectId: string): string {
  return `od:design-browser:${projectId}:viewport:v1`;
}

/** Drop per-project Design Browser localStorage after a successful project delete. */
export function removeDesignBrowserProjectCache(projectId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(designBrowserHistoryStorageKey(projectId));
    window.localStorage.removeItem(designBrowserViewportStorageKey(projectId));
  } catch {
    // Ignore private-mode/quota errors; the cache entry is best-effort.
  }
}

export function isHistoryEntry(value: unknown): value is BrowserHistoryEntry {
  if (typeof value !== 'object' || value == null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.url === 'string' &&
    typeof record.title === 'string' &&
    typeof record.lastVisitedAt === 'number' &&
    typeof record.visitCount === 'number' &&
    (record.iconUrl === undefined || typeof record.iconUrl === 'string')
  );
}

export function loadHistory(projectId: string): BrowserHistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(designBrowserHistoryStorageKey(projectId));
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(isHistoryEntry)
      .sort((left, right) => right.lastVisitedAt - left.lastVisitedAt)
      .slice(0, DESIGN_BROWSER_HISTORY_LIMIT);
  } catch {
    return [];
  }
}

export function saveHistory(projectId: string, history: BrowserHistoryEntry[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      designBrowserHistoryStorageKey(projectId),
      JSON.stringify(history.slice(0, DESIGN_BROWSER_HISTORY_LIMIT)),
    );
  } catch {
    // Ignore storage quota and private-mode failures.
  }
}

function isBrowserViewportId(value: unknown): value is BrowserViewportId {
  return value === 'desktop' || value === 'tablet' || value === 'mobile';
}

export function loadBrowserViewport(projectId: string): BrowserViewportId {
  if (typeof window === 'undefined') return 'desktop';
  try {
    const stored = window.localStorage.getItem(designBrowserViewportStorageKey(projectId));
    return isBrowserViewportId(stored) ? stored : 'desktop';
  } catch {
    return 'desktop';
  }
}

export function saveBrowserViewport(projectId: string, viewport: BrowserViewportId) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(designBrowserViewportStorageKey(projectId), viewport);
  } catch {
    // Ignore storage quota and private-mode failures.
  }
}
