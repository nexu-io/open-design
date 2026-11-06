import type { SessionArtifact } from '../../../shared/session';
import { webAddress } from '../../../shared/browser';

export type BrowserTab = { id: string; kind: 'artifact'; artifactId: string } | { id: string; kind: 'web'; url: string; title?: string } | { id: string; kind: 'new' };
export type BrowserState = { tabs: BrowserTab[]; activeId: string | null; browserOpen: boolean; conversationOpen: boolean; conversationWidth: number; surface: 'conversation' | 'browser' };
export type BrowserAction = { type: 'new'; id: string } | { type: 'activate' | 'close'; id: string } | { type: 'artifact'; artifactId: string; id: string } | { type: 'navigate'; url: string; id?: string } | { type: 'page'; id: string; url: string; title: string } | { type: 'browser' | 'conversation'; open: boolean } | { type: 'width'; value: number } | { type: 'surface'; value: BrowserState['surface'] };
export const browserKey = (id: string) => `opendesign.artifact-browser.v1:${id}`;

export const browserUrl = webAddress;
export function initialBrowser(artifacts: SessionArtifact[], projectId: string, saved?: string | null, forceOpen = false): BrowserState {
  const artifact = artifacts.find(item => item.projectId === projectId) ?? artifacts[0];
  let state: BrowserState = { tabs: artifact ? [{ id: artifact.id, kind: 'artifact', artifactId: artifact.id }] : [], activeId: artifact?.id ?? null, browserOpen: Boolean(artifact), conversationOpen: true, conversationWidth: 340, surface: 'browser' };
  try {
    const value = JSON.parse(saved || 'null');
    if (value && Array.isArray(value.tabs)) {
      const seen = new Set<string>();
      const tabs = value.tabs.filter((tab: BrowserTab) => {
        if (!tab || typeof tab.id !== 'string' || seen.has(tab.id)) return false;
        seen.add(tab.id);
        if (tab.kind === 'artifact') return artifacts.some(item => item.id === tab.artifactId);
        if (tab.kind === 'new') return true;
        try { return tab.kind === 'web' && browserUrl(tab.url) === tab.url; } catch { return false; }
      }).slice(0, 30);
      state = { ...state, tabs, activeId: tabs.some((tab: BrowserTab) => tab.id === value.activeId) ? value.activeId : tabs[0]?.id ?? null, browserOpen: value.browserOpen !== false && tabs.length > 0, conversationOpen: value.conversationOpen !== false, surface: value.surface === 'conversation' ? 'conversation' : 'browser', conversationWidth: Number.isFinite(value.conversationWidth) ? Math.max(280, Math.min(480, value.conversationWidth)) : 340 };
    }
  } catch { /* A damaged browser preference must not hide the conversation. */ }
  const active = state.tabs.find(tab => tab.id === state.activeId);
  if (artifact && (forceOpen || (state.browserOpen && active?.kind === 'artifact' && active.artifactId !== artifact.id))) state = browserReducer(state, { type: 'artifact', artifactId: artifact.id, id: artifact.id });
  if (!state.browserOpen) state.conversationOpen = true;
  return state;
}
export function browserReducer(state: BrowserState, action: BrowserAction): BrowserState {
  switch (action.type) {
    case 'new': return state.tabs.length >= 30 || state.tabs.some(tab => tab.id === action.id) ? state : { ...state, tabs: [...state.tabs, { id: action.id, kind: 'new' }], activeId: action.id, browserOpen: true, surface: 'browser' };
    case 'activate': return state.tabs.some(tab => tab.id === action.id) ? { ...state, activeId: action.id, browserOpen: true, surface: 'browser' } : state;
    case 'close': {
      const index = state.tabs.findIndex(tab => tab.id === action.id), tabs = state.tabs.filter(tab => tab.id !== action.id);
      if (index < 0) return state;
      return { ...state, tabs, activeId: state.activeId === action.id ? tabs[Math.min(index, tabs.length - 1)]?.id ?? null : state.activeId, browserOpen: tabs.length > 0 && state.browserOpen, conversationOpen: tabs.length ? state.conversationOpen : true };
    }
    case 'artifact': {
      const existing = state.tabs.find(tab => tab.kind === 'artifact' && tab.artifactId === action.artifactId);
      if (existing) return browserReducer(state, { type: 'activate', id: existing.id });
      const active = state.tabs.find(tab => tab.id === state.activeId);
      const replace = active && (active.kind === 'new' || state.tabs.length >= 30);
      const tab: BrowserTab = { id: replace ? active.id : action.id, kind: 'artifact', artifactId: action.artifactId };
      return { ...state, tabs: replace ? state.tabs.map(item => item.id === active.id ? tab : item) : [...state.tabs, tab], activeId: tab.id, browserOpen: true, surface: 'browser' };
    }
    case 'navigate': {
      const active = state.tabs.find(tab => tab.id === state.activeId);
      if (active?.kind === 'artifact' || !active) {
        if (!action.id || state.tabs.length >= 30) return state;
        return { ...state, tabs: [...state.tabs, { id: action.id, kind: 'web', url: browserUrl(action.url) }], activeId: action.id, browserOpen: true, surface: 'browser' };
      }
      return { ...state, tabs: state.tabs.map(tab => tab.id === state.activeId ? { id: tab.id, kind: 'web', url: browserUrl(action.url) } : tab), browserOpen: true, surface: 'browser' };
    }
    case 'page': return { ...state, tabs: state.tabs.map(tab => tab.id === action.id && tab.kind === 'web' ? { ...tab, url: browserUrl(action.url), title: action.title.slice(0, 300) } : tab) };
    case 'browser': return { ...state, browserOpen: action.open && state.tabs.length > 0, conversationOpen: !action.open || !state.tabs.length ? true : state.conversationOpen, surface: action.open ? 'browser' : 'conversation' };
    case 'conversation': return { ...state, conversationOpen: action.open || !state.browserOpen, surface: action.open ? 'conversation' : 'browser' };
    case 'width': return { ...state, conversationWidth: Math.max(280, Math.min(480, action.value)) };
    case 'surface': return { ...state, surface: action.value };
  }
}
export function browserGeometry(width: number, state: BrowserState) {
  const narrow = width < 900;
  return { narrow, conversationWidth: Math.max(280, Math.min(480, width * .42, state.conversationWidth)), showConversation: state.conversationOpen && (!state.browserOpen || !narrow || state.surface === 'conversation'), showBrowser: state.browserOpen && (!state.conversationOpen || !narrow || state.surface === 'browser') };
}
