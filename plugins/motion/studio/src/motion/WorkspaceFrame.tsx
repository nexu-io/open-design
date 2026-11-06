import { createContext, useContext, useEffect, useState, useRef, useCallback, lazy, Suspense, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import { ConnectionDialog } from './ConnectionDialog';
import { MotionIcon } from './icons';
import { useWorkspace } from './useWorkspace';
import { ThemeToggle } from '../components/ThemeToggle';
import { LanguageMenu } from '../i18n/LanguageMenu';
import { workspacePresentation } from '../../../shared/workspace-url';

const ModelSettings = lazy(() => import('./ModelSettings').then(module => ({ default: module.ModelSettings })));

type WorkspaceChrome = {
  workspace: ReturnType<typeof useWorkspace>;
  switchingDisabled: boolean;
  saveState: string;
  openLibrary: () => void;
  openConnections: () => void;
  openModelSettings: () => void;
  toggleSidebar: () => void;
  sidebarOpen: boolean;
  registerEditor: (guard: EditorGuard | null) => void;
  beforeViewChange: () => Promise<void>;
};
export type EditorGuard = { waitForSaves: () => Promise<void>; blocked: boolean; saveState: string; message: string };
const WorkspaceChromeContext = createContext<WorkspaceChrome | null>(null);
export const useOptionalWorkspaceChrome = () => useContext(WorkspaceChromeContext);
export function useWorkspaceChrome() {
  const value = useContext(WorkspaceChromeContext);
  if (!value) throw new Error('Workspace controls require WorkspaceFrame');
  return value;
}

export function WorkspaceFrame({ children, waitForSaves, projectId, sessionId, blocked = false, message = '', saveState = '' }: {
  children: ReactNode; waitForSaves: () => Promise<void>; projectId?: string; sessionId?: string; blocked?: boolean; message?: string; saveState?: string;
}) {
  const { t } = useI18n();
  const presentation = workspacePresentation(location.search);
  const guard = useRef<EditorGuard | null>(null);
  const [editorState, setEditorState] = useState<Pick<EditorGuard, 'blocked' | 'saveState' | 'message'> | null>(null);
  const registerEditor = useCallback((value: EditorGuard | null) => {
    guard.current = value;
    setEditorState(previous => previous?.blocked === value?.blocked && previous?.saveState === value?.saveState && previous?.message === value?.message ? previous : value);
  }, []);
  const beforeViewChange = useCallback(async () => {
    if (guard.current?.blocked) throw new Error(guard.current.message || t('Working…'));
    await (guard.current?.waitForSaves ?? waitForSaves)();
  }, [waitForSaves, t]);
  const workspace = useWorkspace(beforeViewChange, projectId, sessionId);
  const [connectionSection, setConnectionSection] = useState<'setup' | 'templates'>(() => new URLSearchParams(location.search).get('templates') === '1' ? 'templates' : 'setup');
  const [connectionsOpen, setConnectionsOpen] = useState(() => new URLSearchParams(location.search).get('panel') === 'connections' || new URLSearchParams(location.search).get('templates') === '1');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [modelsOpen, setModelsOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => { try { return !presentation.sidebar || localStorage.getItem('motion.workspace.sidebar.v1') === 'collapsed'; } catch { return !presentation.sidebar; } });
  const [narrow, setNarrow] = useState(() => window.matchMedia('(max-width: 760px)').matches);
  const switchingDisabled = workspace.busy || blocked || Boolean(editorState?.blocked) || !workspace.status;
  const notice = workspace.error || message || editorState?.message;
  const value: WorkspaceChrome = { workspace, switchingDisabled, saveState: workspace.busy ? t('Working…') : editorState?.saveState || saveState, registerEditor, beforeViewChange,
    openLibrary: () => { workspace.clearError(); setConnectionSection('templates'); setConnectionsOpen(true); },
    openConnections: () => { setConnectionSection('setup'); setConnectionsOpen(true); },
    openModelSettings: () => setModelsOpen(true),
    toggleSidebar: () => {
      const isNarrow = window.matchMedia('(max-width: 760px)').matches;
      setNarrow(isNarrow);
      if (isNarrow) setSidebarOpen(open => !open); else toggleCollapsed();
    }, sidebarOpen: narrow ? sidebarOpen : !collapsed };
  useEffect(() => {
    const media = window.matchMedia('(max-width: 760px)');
    const update = () => { setNarrow(media.matches); if (!media.matches) setSidebarOpen(false); };
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!sidebarOpen) return;
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setSidebarOpen(false); };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [sidebarOpen]);
  function toggleCollapsed() {
    setCollapsed(previous => { const next = !previous; try { localStorage.setItem('motion.workspace.sidebar.v1', next ? 'collapsed' : 'expanded'); } catch {} return next; });
  }
  return <WorkspaceChromeContext.Provider value={value}>
    <div className="motion-workspace" data-embedded={presentation.embedded} data-collapsed={collapsed} data-mobile-open={sidebarOpen}>
      {sidebarOpen && <button className="motion-sidebar-backdrop" aria-label={t('Close conversation list')} onClick={() => setSidebarOpen(false)} />}
      <WorkspaceSidebar currentId={sessionId ?? projectId} close={() => setSidebarOpen(false)} />
      <div className="motion-workspace-content">
        {notice && <div className="motion-workspace-notice" role="alert"><span>{notice}</span>{workspace.error && <button className="motion-icon-button" aria-label={t('Dismiss')} onClick={workspace.clearError}><MotionIcon name="close" /></button>}</div>}
        {children}
      </div>
    </div>
    {connectionsOpen && <ConnectionDialog open section={connectionSection} busy={switchingDisabled} error={workspace.error} onClose={() => setConnectionsOpen(false)} onOpen={id => { if (!switchingDisabled) void (sessionId ? workspace.createArtifact(sessionId, id) : workspace.startSession(undefined, id)); }} />}
    {modelsOpen && <Suspense fallback={null}><ModelSettings onClose={() => setModelsOpen(false)} /></Suspense>}
  </WorkspaceChromeContext.Provider>;
}

function ModelSettingsButton() {
  const { t } = useI18n();
  const { openModelSettings } = useWorkspaceChrome();
  return <button className="motion-icon-button" aria-label={t('Model settings')} title={t('Model settings')} onClick={openModelSettings}><MotionIcon name="sliders" /></button>;
}

function WorkspaceSidebar({ currentId, close }: { currentId?: string; close: () => void }) {
  const { t, formatDate } = useI18n();
  const { workspace, switchingDisabled, openConnections } = useWorkspaceChrome();
  const [query, setQuery] = useState('');
  const sessions = workspace.sessions ?? workspace.projects;
  const filtered = sessions.filter(project => project.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <aside className="motion-sidebar" aria-label={t('Workspace navigation')}>
    <div className="motion-sidebar-brand">
      <button className="motion-brand" disabled={switchingDisabled} onClick={() => void workspace.home()} aria-label={t('OpenDesign home')} title={t('OpenDesign home')}>
        <span className="motion-brand-mark"><MotionIcon name="layers" size={18} /></span><strong>OpenDesign</strong>
      </button>
      <button className="motion-icon-button motion-sidebar-close" onClick={close} aria-label={t('Close conversation list')}><MotionIcon name="close" /></button>
    </div>
    <button className="motion-button motion-button-primary motion-sidebar-new" title={t('New conversation')} disabled={switchingDisabled} onClick={() => void workspace.startSession()}><MotionIcon name="plus" /><span>{t('New conversation')}</span></button>
    <nav className="motion-sidebar-nav" aria-label={t('Main navigation')}>
      <button aria-current={!currentId ? 'page' : undefined} title={t('Home')} disabled={switchingDisabled} onClick={() => { if (currentId) void workspace.home(); else close(); }}><MotionIcon name="home" /><span>{t('Home')}</span></button>
      <button title={t('Connect Agent')} onClick={openConnections}><MotionIcon name="plug" /><span>{t('Connect Agent')}</span></button>
    </nav>
    <div className="motion-session-heading"><span>{t('Sessions')}</span><span>{sessions.length}</span></div>
    <label className="motion-session-search"><MotionIcon name="search" /><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Search conversations…')} aria-label={t('Search conversations')} /></label>
    <nav className="motion-session-list" aria-label={t('Conversation list')}>
      {!workspace.status && !workspace.error && <p className="motion-session-empty" role="status">{t('Loading conversations…')}</p>}
      {workspace.status && !filtered.length && <p className="motion-session-empty">{t(query ? 'No matching conversations' : 'Create your first conversation')}</p>}
      {filtered.map(project => <button key={project.id} className="motion-session" aria-current={currentId === project.id ? 'page' : undefined}
        title={project.title} disabled={switchingDisabled} onClick={() => { if (project.id === currentId) close(); else void workspace.openSession(project.id); }}>
        <MotionIcon name="message" /><span><strong>{project.title}</strong><small>{project.openedAt || project.createdAt ? formatDate((project.openedAt || project.createdAt)!, { month: 'short', day: 'numeric' }) : t('Local project')}</small></span>
      </button>)}
    </nav>
    <footer className="motion-sidebar-footer">
      <div className="motion-sidebar-identity"><MotionIcon name="folder" /><span><strong>{t('My workspace')}</strong><small>{t('Saved on this device')}</small></span></div>
      <div className="motion-sidebar-settings"><ModelSettingsButton /><ThemeToggle /><LanguageMenu /></div>
    </footer>
  </aside>;
}

export function WorkspaceMenuButton() {
  const { t } = useI18n();
  const { toggleSidebar, sidebarOpen } = useWorkspaceChrome();
  return <button className="motion-icon-button motion-workspace-menu" onClick={toggleSidebar} aria-expanded={sidebarOpen} title={t(sidebarOpen ? 'Collapse conversation list' : 'Open conversation list')} aria-label={t(sidebarOpen ? 'Collapse conversation list' : 'Open conversation list')}><MotionIcon name="sidebar" size={16} /></button>;
}
