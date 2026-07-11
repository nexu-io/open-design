// Local-storage adapter for the chat-panel-width preference. SSR-guarded
// (`typeof window === 'undefined'`) so the slice that calls through the port
// stays DOM-free (ADR 0002).
import {
  CHAT_PANEL_WIDTH_STORAGE_KEY,
  DEFAULT_CHAT_PANEL_WIDTH,
  clampPreferredChatPanelWidth,
} from '../../features/project-view';

export function readSavedChatPanelWidth(): number {
  if (typeof window === 'undefined') return DEFAULT_CHAT_PANEL_WIDTH;
  try {
    const raw = window.localStorage.getItem(CHAT_PANEL_WIDTH_STORAGE_KEY);
    const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
    return Number.isFinite(parsed)
      ? clampPreferredChatPanelWidth(parsed)
      : DEFAULT_CHAT_PANEL_WIDTH;
  } catch {
    return DEFAULT_CHAT_PANEL_WIDTH;
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
