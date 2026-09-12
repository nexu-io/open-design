import { useSyncExternalStore } from 'react';

export type ChromeViewMode = 'preview' | 'source';

interface ChromeViewState {
  /** What the row is showing right now, published by the viewer that owns 代码. */
  mode: ChromeViewMode;
  /** True while an open viewer is portaling the real 代码 tab into the row —
   *  i.e. `mode` is a real report about a surface, not the store's idle
   *  default. When it is false the row draws its own collapsed 代码 tab, so
   *  the strip always holds the same three and switching panes never makes
   *  one disappear. */
  owned: boolean;
  /**
   * A view the row has asked for that no viewer has taken yet.
   *
   * It WAITS rather than fires, because the ask usually arrives before its
   * audience: clicking 代码 from 设计文件 both requests source view and
   * switches panes, and the viewer that must obey only mounts afterwards. A
   * signal keyed on "did this change since I mounted" is invisible to a
   * component that mounts after it — which is exactly why that click kept
   * landing on 预览. The owning viewer consumes this whenever it arrives.
   */
  pending: ChromeViewMode | null;
}

/**
 * The one selection shared by the workspace row's 预览 and 代码 tabs.
 *
 * They are two views of ONE surface, but two components draw them: 预览 is a
 * tab FileWorkspace renders, 代码 is portaled into the same row by the open
 * FileViewer (see APP_CHROME_VIEW_TABS_ID). Neither could see the other, which
 * broke the row's discrete rule two ways — both tabs carried a label at once,
 * and clicking 预览 left the viewer sitting in source mode, so 代码 stayed
 * expanded beside an active 预览.
 *
 * So the state lives here and travels both ways: the viewer PUBLISHES the view
 * it switched to, and the row REQUESTS one.
 */
let state: ChromeViewState = { mode: 'preview', owned: false, pending: null };
const listeners = new Set<() => void>();

function emit(next: ChromeViewState): void {
  state = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The viewer that owns the row's 代码 tab, reporting which view it is on. */
export function publishChromeViewMode(mode: ChromeViewMode): void {
  // `owned` has to be part of the guard: a viewer that mounts already on 预览
  // publishes the value the store idles at, and an early return there would
  // leave the row thinking no one owns the pair.
  if (state.mode === mode && state.owned) return;
  emit({ ...state, mode, owned: true });
}

/** The row asking for a view. Held until a viewer owns the pair and takes it. */
export function requestChromeViewMode(mode: ChromeViewMode): void {
  if (state.pending === mode) return;
  emit({ ...state, pending: mode });
}

/**
 * The owning viewer taking the row's outstanding request, once. Returns null
 * when there is nothing to act on, so the caller can no-op cheaply.
 */
export function consumeChromeViewModeRequest(): ChromeViewMode | null {
  const pending = state.pending;
  if (pending === null) return null;
  emit({ ...state, pending: null });
  return pending;
}

/** No viewer owns the row's 代码 tab any more: the row draws its own again,
 *  collapsed, and 预览 takes the label back. A request still in flight is left
 *  alone — the viewer that answers it may not have mounted yet. */
export function resetChromeViewMode(): void {
  if (!state.owned && state.mode === 'preview') return;
  emit({ ...state, mode: 'preview', owned: false });
}

function snapshot(): ChromeViewState {
  return state;
}

const SERVER_SNAPSHOT: ChromeViewState = { mode: 'preview', owned: false, pending: null };

function useChromeViewState(): ChromeViewState {
  return useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
}

/** Which view the row is on — what the labels follow. */
export function useChromeViewMode(): ChromeViewMode {
  return useChromeViewState().mode;
}

/** True while an open viewer is portaling the real 代码 tab into the row. */
export function useChromeViewOwned(): boolean {
  return useChromeViewState().owned;
}

/** The row's outstanding request, for the viewer that owns the 代码 tab. */
export function usePendingChromeViewMode(): ChromeViewMode | null {
  return useChromeViewState().pending;
}
