import type { CSSProperties } from 'react';

/*
 * The project split's chat-column geometry, shared by every surface that
 * draws the `.split` grid for a project: ProjectView and the optimistic
 * creation frame that stands in for it between a Home send and the daemon's
 * create response (OPEND-2617 / 2614).
 *
 * OPEND-3207: the two surfaces used to size the column from different
 * sources. The pending frame left `.split` on its stylesheet default while
 * ProjectView resolved the saved width, or the equal split of the container,
 * only after it mounted — so the column moved once the real view arrived.
 * Everything that decides the width now lives here, and both surfaces resolve
 * it the same way from the same inputs.
 */

export const CHAT_PANEL_WIDTH_STORAGE_KEY = 'open-design.project.chatPanelWidth';
export const DEFAULT_CHAT_PANEL_WIDTH = 460;
export const MIN_CHAT_PANEL_WIDTH = 345;
export const FALLBACK_MAX_CHAT_PANEL_WIDTH = 720;
export const MIN_WORKSPACE_PANEL_WIDTH = 400;
export const SPLIT_RESIZE_HANDLE_WIDTH = 4;

const MIN_NORMAL_SPLIT_WIDTH =
  MIN_CHAT_PANEL_WIDTH + SPLIT_RESIZE_HANDLE_WIDTH + MIN_WORKSPACE_PANEL_WIDTH;

/**
 * The stylesheet's own fallback for a `.split` that carries no inline width
 * (see the `@property` registration in shell.css). Kept in one place so a
 * surface that has not measured yet still starts from the same number the
 * stylesheet would paint.
 */
export const STYLESHEET_SPLIT_CHAT_PANEL_WIDTH = DEFAULT_CHAT_PANEL_WIDTH;

export interface SavedChatPanelWidth {
  width: number;
  /** True when the user dragged the handle at some point: their width wins
   * over the equal-split default at every container size. */
  customized: boolean;
}

export function workspacePanelMinWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return MIN_WORKSPACE_PANEL_WIDTH;
  return splitWidth < MIN_NORMAL_SPLIT_WIDTH ? 0 : MIN_WORKSPACE_PANEL_WIDTH;
}

export function maxChatPanelWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return FALLBACK_MAX_CHAT_PANEL_WIDTH;
  const workspaceMinWidth = workspacePanelMinWidthForSplit(splitWidth);
  const viewportAwareMax = splitWidth - SPLIT_RESIZE_HANDLE_WIDTH - workspaceMinWidth;
  // Keep the established 720px drag ceiling on ordinary windows, widening it
  // only as far as the equal split on larger project workspaces. That makes
  // 1:1 reachable without letting the chat drag past and dominate preview.
  const equalSplitWidth = Math.floor((splitWidth - SPLIT_RESIZE_HANDLE_WIDTH) / 2);
  const responsiveMax = Math.max(FALLBACK_MAX_CHAT_PANEL_WIDTH, equalSplitWidth);
  return Math.max(0, Math.min(responsiveMax, Math.floor(viewportAwareMax)));
}

export function clampPreferredChatPanelWidth(width: number): number {
  return Math.max(MIN_CHAT_PANEL_WIDTH, Math.round(width));
}

export function clampChatPanelWidth(
  width: number,
  maxWidth = FALLBACK_MAX_CHAT_PANEL_WIDTH,
): number {
  const effectiveMax = Math.max(0, Math.floor(maxWidth));
  const effectiveMin = Math.min(MIN_CHAT_PANEL_WIDTH, effectiveMax);
  return Math.min(effectiveMax, Math.max(effectiveMin, Math.round(width)));
}

export function defaultChatPanelWidthForSplit(splitWidth: number): number {
  if (!Number.isFinite(splitWidth) || splitWidth <= 0) return DEFAULT_CHAT_PANEL_WIDTH;
  const equalHalf = (splitWidth - SPLIT_RESIZE_HANDLE_WIDTH) / 2;
  return clampChatPanelWidth(equalHalf, maxChatPanelWidthForSplit(splitWidth));
}

export function workspacePanelTrackForMinWidth(workspacePanelMinWidth: number): string {
  return workspacePanelMinWidth === 0
    ? 'minmax(0, 1fr)'
    : `minmax(${workspacePanelMinWidth}px, 1fr)`;
}

export function readSavedChatPanelWidth(): SavedChatPanelWidth {
  if (typeof window === 'undefined') {
    return { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false };
  }
  try {
    const raw = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed)
      ? { width: clampPreferredChatPanelWidth(parsed), customized: true }
      : { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false };
  } catch {
    return { width: DEFAULT_CHAT_PANEL_WIDTH, customized: false };
  }
}

export function saveChatPanelWidth(width: number): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CHAT_PANEL_WIDTH_STORAGE_KEY,
      String(clampPreferredChatPanelWidth(width)),
    );
  } catch {
    // localStorage can be unavailable in hardened browser contexts.
  }
}

export interface ProjectSplitLayout {
  chatPanelWidth: number;
  chatPanelMaxWidth: number;
  workspacePanelMinWidth: number;
  workspacePanelTrack: string;
}

/**
 * The chat-column width a project split shows for a container of
 * `splitWidth` pixels, given the user's saved preference.
 *
 * Invariant: every surface that paints a project's `.split` — ProjectView and
 * the creation frame that precedes it — must resolve its first-paint width
 * through this function with the same inputs, so the column does not move
 * when one surface hands over to the other (OPEND-3207). A saved width wins
 * at every container size; otherwise the column takes the equal split,
 * clamped to what the container allows.
 */
export function resolveProjectSplitLayout(
  splitWidth: number,
  saved: SavedChatPanelWidth,
): ProjectSplitLayout {
  const workspacePanelMinWidth = workspacePanelMinWidthForSplit(splitWidth);
  const chatPanelMaxWidth = maxChatPanelWidthForSplit(splitWidth);
  const preferredWidth = saved.customized
    ? saved.width
    : defaultChatPanelWidthForSplit(splitWidth);
  return {
    chatPanelWidth: clampChatPanelWidth(preferredWidth, chatPanelMaxWidth),
    chatPanelMaxWidth,
    workspacePanelMinWidth,
    workspacePanelTrack: workspacePanelTrackForMinWidth(workspacePanelMinWidth),
  };
}

export type ProjectSplitStyle = CSSProperties & {
  '--project-chat-panel-width': string;
  '--project-chat-handle-width': string;
  '--project-workspace-panel-track': string;
};

export function projectSplitClassName(workspaceFocused: boolean): string {
  return workspaceFocused ? 'split split-focus' : 'split';
}

export function projectSplitStyle(
  workspaceFocused: boolean,
  chatPanelWidth: number,
  workspacePanelTrack: string,
): ProjectSplitStyle | undefined {
  if (workspaceFocused) return undefined;
  return {
    '--project-chat-panel-width': `${chatPanelWidth}px`,
    '--project-chat-handle-width': `${SPLIT_RESIZE_HANDLE_WIDTH}px`,
    '--project-workspace-panel-track': workspacePanelTrack,
  };
}

/**
 * Write the split's three grid custom properties directly on the element.
 *
 * The grid is always driven by
 * `var(--project-chat-panel-width) var(--project-chat-handle-width) var(--project-workspace-panel-track)`
 * declared once on `.split` (shell.css), and the two width properties are
 * registered as animatable, so a plain property write is all a live resize
 * or a collapse/expand needs to animate.
 *
 * `animate: false` is for a surface's FIRST measured write. The measurement
 * that feeds it (`clientWidth`) has already forced a style pass with the
 * element's provisional width, so a bare write afterwards would start the
 * 200ms `.split` transition from that provisional value — the column would be
 * seen sliding into place on mount. The write is committed under
 * `.split-settling` (transition: none), flushed, and the class removed, so the
 * next style pass sees the final width with nothing to animate from.
 */
export function writeProjectSplitLayout(
  split: HTMLElement,
  chatPanelWidth: number,
  workspacePanelTrack: string,
  options: { animate?: boolean } = {},
): void {
  const settle = options.animate === false;
  if (settle) split.classList.add('split-settling');
  split.style.setProperty('--project-chat-panel-width', `${chatPanelWidth}px`);
  split.style.setProperty('--project-chat-handle-width', `${SPLIT_RESIZE_HANDLE_WIDTH}px`);
  split.style.setProperty('--project-workspace-panel-track', workspacePanelTrack);
  if (settle) {
    // Flush the settled style pass before the class comes off; without the
    // read the add + remove collapse into one pass and the transition runs.
    void split.offsetWidth;
    split.classList.remove('split-settling');
  }
}
