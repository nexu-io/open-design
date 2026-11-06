import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useI18n } from '../i18n/I18n';
import type { SessionArtifact } from '../../../shared/session';
import { ProjectConversation } from './ProjectConversation';
import { browserGeometry, browserKey, browserReducer, browserUrl, initialBrowser, type BrowserAction, type BrowserTab } from './artifactBrowser';
import { useWorkspaceChrome, WorkspaceMenuButton } from './WorkspaceFrame';
import { MotionIcon } from './icons';
import { usePlayerStore } from '../player/store/playerStore';
import { sessionPath, workspacePresentation } from '../../../shared/workspace-url';
import { artifactViewers } from '../../../shared/session';
import { ArtifactViewActive } from './ArtifactViewState';
import { WebBrowser, browserEndpoint, browserRequest, type WebBrowserHandle } from './WebBrowser';
import type { WebPageState } from '../../../shared/browser';

export function MotionSessionFrame({ children, sessionId, projectId }: { children: ReactNode; sessionId: string; projectId?: string }) {
  const { workspace } = useWorkspaceChrome();
  const session = workspace.session;
  return session ? <SessionBrowser key={sessionId} sessionId={sessionId} projectId={projectId} artifacts={session.artifacts}>{children}</SessionBrowser> : null;
}

function SessionBrowser({ children, sessionId, projectId, artifacts }: { children: ReactNode; sessionId: string; projectId?: string; artifacts: SessionArtifact[] }) {
  const { t } = useI18n();
  const { workspace, switchingDisabled, beforeViewChange } = useWorkspaceChrome();
  const presentation = workspacePresentation(location.search);
  const [state, setState] = useState(() => {
    let saved: string | null = null; try { saved = localStorage.getItem(browserKey(sessionId)); } catch {}
    const url = new URL(location.href), forceOpen = url.searchParams.has('openArtifact');
    const initial = initialBrowser(artifacts, projectId ?? '', saved, forceOpen || presentation.embedded);
    return !presentation.conversation && initial.tabs.length ? { ...initial, conversationOpen: false, browserOpen: true } : initial;
  });
  const [width, setWidth] = useState(window.innerWidth);
  const [error, setError] = useState(() => { try { return sessionStorage.getItem(`opendesign.session-error:${sessionId}`) || ''; } catch { return ''; } });
  const [address, setAddress] = useState('');
  const [addressFocused, setAddressFocused] = useState(false);
  const webBrowser = useRef<WebBrowserHandle>(null);
  const [webPage, setWebPage] = useState<(WebPageState & { tabId: string }) | null>(null);
  const element = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; width: number } | null>(null);
  const acting = useRef(false);
  const geometry = browserGeometry(width, state);
  const active = state.tabs.find(tab => tab.id === state.activeId);
  const activeArtifact = active?.kind === 'artifact' ? artifacts.find(item => item.id === active.artifactId) : undefined;
  const canonicalAddress = active?.kind === 'web' ? active.url : activeArtifact ? `${artifactViewers[activeArtifact.kind].scheme}://${activeArtifact.projectId}` : '';
  const externalAddress = active?.kind === 'web' ? active.url : activeArtifact ? sessionPath(sessionId, activeArtifact.projectId, { embedded: true }) : undefined;
  const editorVisible = geometry.showBrowser && activeArtifact?.projectId === projectId;
  useEffect(() => {
    if (!editorVisible && usePlayerStore.getState().isPlaying) usePlayerStore.getState().requestPlayback(false);
  }, [editorVisible]);
  const dispatch = useCallback((action: BrowserAction) => setState(previous => {
    const next = browserReducer(previous, action);
    if (!presentation.embedded) { try { localStorage.setItem(browserKey(sessionId), JSON.stringify(next)); } catch {} }
    return next;
  }), [sessionId, presentation.embedded]);
  useEffect(() => {
    const url = new URL(location.href); if (url.searchParams.has('openArtifact')) { url.searchParams.delete('openArtifact'); history.replaceState(null, '', url); }
    if (!presentation.embedded) { try { localStorage.setItem(browserKey(sessionId), JSON.stringify(state)); } catch {} }
    try { sessionStorage.removeItem(`opendesign.session-error:${sessionId}`); } catch {}
    // Initial state is captured once per session; later actions persist before any navigation.
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const node = element.current!; const measure = () => setWidth(node.getBoundingClientRect().width);
    measure(); const observer = new ResizeObserver(measure); observer.observe(node); return () => observer.disconnect();
  }, []);
  useEffect(() => { setAddress(canonicalAddress); setAddressFocused(false); }, [active?.id, canonicalAddress]);
  useEffect(() => {
    element.current?.querySelector<HTMLElement>('.motion-browser-tab[data-active="true"]')?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [active?.id]);
  async function change(action: BrowserAction) {
    if (acting.current || switchingDisabled) return;
    acting.current = true; setError('');
    try {
      await beforeViewChange();
      const next = browserReducer(state, action), tab = next.tabs.find(item => item.id === next.activeId);
      const artifact = tab?.kind === 'artifact' ? artifacts.find(item => item.id === tab.artifactId) : undefined;
      if (next.browserOpen && artifact && artifact.projectId !== projectId) {
        try { localStorage.setItem(browserKey(sessionId), JSON.stringify(next)); } catch {}
        const opened = await workspace.openSession(sessionId, artifact.projectId);
        if (!opened) { try { localStorage.setItem(browserKey(sessionId), JSON.stringify(state)); } catch {} }
        return;
      }
      if (action.type === 'close' && state.tabs.find(tab => tab.id === action.id)?.kind === 'web') await browserRequest(browserEndpoint(sessionId, action.id), undefined, 'DELETE');
      dispatch(action);
    } catch (err) { setError((err as Error).message); }
    finally { acting.current = false; }
  }
  async function openArtifact(artifact: SessionArtifact) {
    await change({ type: 'artifact', artifactId: artifact.id, id: crypto.randomUUID() });
  }
  async function activate(tab: BrowserTab) {
    await change({ type: 'activate', id: tab.id });
  }
  async function navigate() {
    try {
      const motion = artifacts.find(item => address === `${artifactViewers[item.kind].scheme}://${item.projectId}`);
      if (motion) { void openArtifact(motion); return; }
      const url = new URL(browserUrl(address));
      if (url.origin === location.origin && (url.searchParams.has('project') || url.hash.startsWith('#project/'))) {
        const artifact = artifacts.find(item => item.projectId === url.searchParams.get('project') || url.hash.split(/[/?]/)[1] === item.projectId);
        if (!artifact) throw new Error(t('This artifact belongs to another conversation.'));
        void openArtifact(artifact); return;
      }
      // Never embed this application inside itself; same-origin links use a real browser tab.
      if (url.origin === location.origin && (url.pathname === '/' || url.pathname === '/studio/')) throw new Error(t('Open a website or choose a conversation artifact.'));
      if (active?.kind === 'web') await webBrowser.current?.command('navigate', url.href);
      else await change({ type: 'navigate', url: url.href, id: crypto.randomUUID() });
      (document.activeElement as HTMLElement)?.blur();
    } catch (err) { setError((err as Error).message); }
  }
  async function browserCommand(action: 'back' | 'forward' | 'reload' | 'stop') {
    try {
      if (active?.kind === 'web') await webBrowser.current?.command(action);
      else if (activeArtifact && action === 'reload') { await beforeViewChange(); location.reload(); }
    } catch (reason) { setError((reason as Error).message); }
  }
  const newTab = () => void change({ type: 'new', id: crypto.randomUUID() });
  const openBrowser = () => state.tabs.length ? void change({ type: 'browser', open: true }) : newTab();
  const title = (tab: BrowserTab) => tab.kind === 'artifact' ? artifacts.find(item => item.id === tab.artifactId)?.title || t('Artifact') : tab.kind === 'web' ? tab.title || new URL(tab.url).hostname : t('New tab');
  return <div className="motion-session-workspace" data-embedded={presentation.embedded} ref={element} onKeyDown={event => {
    // Native editor shortcuts must not edit a hidden artifact while chatting or browsing.
    if (!(event.target as Element).closest('.motion-artifact-editor:not([hidden])')) event.stopPropagation();
  }}>
    {error && <div className="motion-workspace-notice" role="alert">{error}<button className="motion-icon-button" aria-label={t('Dismiss')} onClick={() => setError('')}><MotionIcon name="close" /></button></div>}
    <div className="motion-session-body">
      <aside className="motion-conversation" data-full={!geometry.showBrowser} aria-label={t('Conversation')} hidden={!geometry.showConversation} style={{ width: geometry.narrow || !geometry.showBrowser ? '100%' : geometry.conversationWidth }}>
        <header className="motion-conversation-header"><WorkspaceMenuButton /><SessionTitle /><div>{(!state.browserOpen || geometry.narrow) && <button className="motion-icon-button" aria-label={t('Open browser')} title={t('Open browser')} onClick={openBrowser}><MotionIcon name="monitor" /></button>}</div></header>
        <ProjectConversation key={sessionId} sessionId={sessionId} onOpenArtifact={openArtifact} />
      </aside>
      <div className="motion-conversation-resizer" hidden={geometry.narrow || !geometry.showConversation || !geometry.showBrowser} role="separator" tabIndex={0} aria-label={t('Conversation width')} aria-orientation="vertical" aria-valuemin={280} aria-valuemax={Math.min(480, width * .42)} aria-valuenow={geometry.conversationWidth}
        onDoubleClick={() => dispatch({ type: 'width', value: 340 })} onKeyDown={event => { if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') { event.preventDefault(); dispatch({ type: 'width', value: geometry.conversationWidth + (event.key === 'ArrowLeft' ? -20 : 20) }); } }}
        onPointerDown={event => { if (event.button !== 0) return; event.preventDefault(); drag.current = { x: event.clientX, width: geometry.conversationWidth }; event.currentTarget.setPointerCapture(event.pointerId); }}
        onPointerMove={event => { if (drag.current) dispatch({ type: 'width', value: Math.min(width * .42, drag.current.width + event.clientX - drag.current.x) }); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <section className="motion-artifact-browser" aria-label={t('Artifact browser')} hidden={!geometry.showBrowser}>
        <div className="motion-browser-tabbar" hidden={presentation.embedded}>{!geometry.showConversation && !presentation.embedded && <WorkspaceMenuButton />}<div className="motion-browser-tabs" role="tablist" aria-label={t('Browser tabs')}>
          {state.tabs.map(tab => <div className="motion-browser-tab" data-active={state.activeId === tab.id} key={tab.id}><button role="tab" id={`tab-${tab.id}`} aria-controls="artifact-browser-content" aria-selected={state.activeId === tab.id} onClick={() => void activate(tab)} disabled={switchingDisabled}><MotionIcon name={tab.kind === 'artifact' ? 'film' : 'globe'} size={13} /><span>{title(tab)}</span></button><button className="motion-icon-button" aria-label={t('Close {title}', { title: title(tab) })} disabled={switchingDisabled} onClick={() => void change({ type: 'close', id: tab.id })}><MotionIcon name="close" size={12} /></button></div>)}
        </div><button className="motion-icon-button motion-browser-new-tab" aria-label={t('New tab')} title={t('New tab')} disabled={switchingDisabled || state.tabs.length >= 30} onClick={newTab}><MotionIcon name="plus" size={15} /></button><div className="motion-browser-window-actions"><button className="motion-icon-button" aria-label={t(geometry.showConversation ? 'Expand browser' : 'Show conversation')} title={t(geometry.showConversation ? 'Expand browser' : 'Show conversation')} disabled={switchingDisabled} onClick={() => void change({ type: 'conversation', open: !geometry.showConversation })}><MotionIcon name={geometry.showConversation ? 'maximize' : geometry.narrow ? 'message' : 'minimize'} /></button><button className="motion-icon-button" aria-label={t('Close browser')} title={t('Close browser')} disabled={switchingDisabled} onClick={() => void change({ type: 'browser', open: false })}><MotionIcon name="close" /></button></div></div>
        <form className="motion-browser-address" hidden={presentation.embedded} onSubmit={event => { event.preventDefault(); void navigate(); }}>
          <div className="motion-browser-navigation">
            <button type="button" className="motion-icon-button" aria-label={t('Back')} title={t('Back')} disabled={active?.kind !== 'web' || webPage?.tabId !== active.id || !webPage.canGoBack} onClick={() => void browserCommand('back')}><MotionIcon name="arrow-left" size={15} /></button>
            <button type="button" className="motion-icon-button" aria-label={t('Forward')} title={t('Forward')} disabled={active?.kind !== 'web' || webPage?.tabId !== active.id || !webPage.canGoForward} onClick={() => void browserCommand('forward')}><MotionIcon name="arrow-right" size={15} /></button>
            <button type="button" className="motion-icon-button" aria-label={t(webPage?.tabId === active?.id && webPage?.loading ? 'Stop loading' : 'Reload page')} title={t('Reload page')} disabled={!active || active.kind === 'new' || switchingDisabled} onClick={() => void browserCommand(webPage?.tabId === active?.id && webPage?.loading ? 'stop' : 'reload')}><MotionIcon name={webPage?.tabId === active?.id && webPage?.loading ? 'close' : 'refresh'} size={15} /></button>
          </div>
          <div className="motion-browser-location"><MotionIcon name={activeArtifact ? 'film' : 'globe'} size={14} /><input aria-label={t('Browser address')} placeholder={t('Enter a URL…')} spellCheck={false} value={activeArtifact && !addressFocused && address === canonicalAddress ? activeArtifact.title : address} onChange={event => setAddress(event.target.value)} onFocus={event => { setAddressFocused(true); const input = event.currentTarget; requestAnimationFrame(() => input.select()); }} onBlur={() => setAddressFocused(false)} onKeyDown={event => { if (event.key === 'Escape') { setAddress(canonicalAddress); event.currentTarget.blur(); } }} />
            {activeArtifact && !addressFocused && address === canonicalAddress && <span className="motion-browser-kind">{artifactViewers[activeArtifact.kind].title}</span>}
            {(addressFocused || address !== canonicalAddress) && <button className="motion-icon-button" aria-label={t('Go')} disabled={!address.trim() || switchingDisabled}><MotionIcon name="arrow-right" /></button>}
          </div>
          {externalAddress && <a className="motion-icon-button" href={externalAddress} target="_blank" rel="noopener noreferrer" aria-label={t('Open in browser')} title={t('Open in browser')}><MotionIcon name="arrow-up-right" /></a>}
        </form>
        <div className="motion-browser-content" id="artifact-browser-content" role="tabpanel" aria-labelledby={active ? `tab-${active.id}` : undefined}>
          <div className="motion-artifact-editor" inert={!editorVisible} hidden={!activeArtifact || activeArtifact.projectId !== projectId}><ArtifactViewActive.Provider value={editorVisible}>{children}</ArtifactViewActive.Provider></div>
          {active?.kind === 'web' && geometry.showBrowser && <WebBrowser key={active.id} ref={webBrowser} sessionId={sessionId} tabId={active.id} url={active.url} onState={page => {
            setWebPage({ ...page, tabId: active.id });
            if (/^https?:/.test(page.url) && (page.url !== active.url || page.title !== active.title)) dispatch({ type: 'page', id: active.id, url: page.url, title: page.title });
          }} />}
          {active?.kind === 'new' && <div className="motion-browser-new"><h2>{t('Artifacts')}</h2>{artifacts.map(artifact => <button className="motion-conversation-project" key={artifact.id} onClick={() => void openArtifact(artifact)}><MotionIcon name="film" /><span><strong>{artifact.title}</strong><small>{artifactViewers[artifact.kind].title}</small></span><MotionIcon name="arrow-up-right" /></button>)}<button className="motion-button" disabled={switchingDisabled} onClick={() => void workspace.createArtifact(sessionId)}><MotionIcon name="plus" />{t('New artifact')}</button></div>}
        </div>
      </section>
    </div>
  </div>;
}

function SessionTitle() {
  const { t } = useI18n(); const { workspace, switchingDisabled } = useWorkspaceChrome();
  const [editing, setEditing] = useState(false), [title, setTitle] = useState(''); const session = workspace.session!;
  return editing ? <form className="motion-project-rename" onSubmit={async event => { event.preventDefault(); if (await workspace.renameSession(session.id, title)) setEditing(false); }}><input autoFocus maxLength={100} aria-label={t('Conversation name')} value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === 'Escape') setEditing(false); }} /><button className="motion-icon-button" aria-label={t('Save conversation name')} disabled={switchingDisabled || !title.trim()}><MotionIcon name="check" /></button><button type="button" className="motion-icon-button" aria-label={t('Cancel')} onClick={() => setEditing(false)}><MotionIcon name="close" /></button></form> : <button className="motion-session-title" title={t('Rename conversation')} disabled={switchingDisabled} onClick={() => { setTitle(session.title); setEditing(true); }}><MotionIcon name="message" /><strong>{session.title}</strong><MotionIcon name="edit" size={12} /></button>;
}
