import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { sessionInstruction } from '../../../shared/conversation';
import type { SessionDetail, SessionArtifact } from '../../../shared/session';
import type { GalleryTemplate } from '../../../shared/catalog';
import { useI18n } from '../i18n/I18n';
import { MotionIcon } from './icons';
import { motionApi } from './useWorkspace';
import { sessionHref } from './workspaceRouting';
import { useWorkspaceChrome } from './WorkspaceFrame';
import { ModePicker } from './ModePicker';

function useDraft(key: string) {
  const [draft, setDraft] = useState(() => { try { return localStorage.getItem(key) || ''; } catch { return ''; } });
  function update(value: string) { setDraft(value); try { if (value) localStorage.setItem(key, value); else localStorage.removeItem(key); } catch {} }
  return [draft, update] as const;
}
function submitShortcut(event: KeyboardEvent<HTMLTextAreaElement>) {
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
}

export function HomeComposer({ template, onClear }: { template?: GalleryTemplate; onClear: () => void }) {
  const { t } = useI18n();
  const { workspace, switchingDisabled, openConnections } = useWorkspaceChrome();
  const [draft, setDraft] = useDraft('motion.home.draft.v1');
  return <div className="motion-home-composer"><form className="motion-composer" onSubmit={event => { event.preventDefault(); if ((draft.trim() || template) && !switchingDisabled) void workspace.startSession(draft.trim() || undefined, template?.id); }}>
    {template && <div className="motion-selected-template"><MotionIcon name="film" /><span>{template.title}</span><button type="button" className="motion-icon-button" aria-label={t('Remove template')} onClick={onClear}><MotionIcon name="close" size={13} /></button></div>}
    <textarea id="home-creative-request" maxLength={8000} aria-label={t('Creative request')} placeholder={t('Describe your video…')} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={submitShortcut} disabled={workspace.busy} />
    <div className="motion-composer-tools"><ModePicker /><button type="button" className="motion-button motion-button-quiet" onClick={() => document.getElementById('home-template-title')?.scrollIntoView({ behavior: 'smooth' })}><MotionIcon name="grid" />{t('Templates')}</button><button type="button" className="motion-button motion-button-quiet" onClick={openConnections}><MotionIcon name="plug" />{t('Connect Agent')}</button><button className="motion-button motion-button-primary motion-composer-submit" disabled={switchingDisabled || (!draft.trim() && !template)}><MotionIcon name="arrow-up" /><span>{t('Start conversation')}</span></button></div>
  </form></div>;
}

export function ProjectConversation({ sessionId, onOpenArtifact }: { sessionId: string; onOpenArtifact: (artifact: SessionArtifact) => void }) {
  const { t, formatDate } = useI18n();
  const { workspace, openConnections, switchingDisabled } = useWorkspaceChrome();
  const [conversation, setConversation] = useState<SessionDetail | null>(null);
  const [draft, setDraft] = useDraft(`motion.conversation.draft.v1:${sessionId}`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, retry] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [manualCopy, setManualCopy] = useState('');
  const sending = useRef(false);
  const pending = useRef<{ id: string; content: string } | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const artifacts = workspace.session?.artifacts ?? conversation?.artifacts ?? [];
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    setError('');
    async function refresh() {
      try {
        const data = await motionApi<SessionDetail>(`/sessions/${sessionId}`, { signal: controller.signal });
        if (!controller.signal.aborted) setConversation(previous => !previous || previous.messages.length <= data.messages.length ? data : previous);
      } catch (err) { if (!controller.signal.aborted) setError((err as Error).message); }
      if (!controller.signal.aborted) timer = setTimeout(refresh, 1800);
    }
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [sessionId, attempt]);
  useEffect(() => { scroll.current?.scrollTo?.({ top: scroll.current.scrollHeight }); }, [conversation?.messages.length]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (sending.current || switchingDisabled || !conversation || !draft.trim()) return;
    sending.current = true; setBusy(true); setError(''); setFeedback('');
    const content = draft.trim();
    if (pending.current?.content !== content) pending.current = { id: crypto.randomUUID(), content };
    try {
      const data = await motionApi<SessionDetail>(`/sessions/${sessionId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current) });
      setConversation(data); setDraft(''); pending.current = null;
    } catch (err) { setError((err as Error).message); }
    finally { sending.current = false; setBusy(false); }
  }
  async function copy(content: string) {
    const projectId = artifacts.find(item => item.projectId === workspace.status?.projectId)?.projectId ?? artifacts[0]?.projectId;
    const instruction = sessionInstruction(new URL(sessionHref(sessionId, projectId), location.origin).href, sessionId, content);
    setManualCopy(''); setFeedback('');
    try { await navigator.clipboard.writeText(instruction); setFeedback(t('Copied for Agent')); }
    catch { setManualCopy(instruction); }
  }
  return <>
    <div className="motion-conversation-scroll" ref={scroll}>
      {conversation?.messages.map(message => <article className="motion-conversation-message" data-role={message.role} key={message.id}>
        <div className="motion-conversation-message-meta"><span>{message.role === 'assistant' ? 'Agent' : t('You')}</span><time>{formatDate(message.createdAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div>
        <p>{message.content}</p>{message.role === 'user' && <button className="motion-button motion-button-quiet" onClick={() => void copy(message.content)}><MotionIcon name="copy" size={13} />{t('Copy for Agent')}</button>}
      </article>)}
      {conversation && artifacts.map(artifact => <button className="motion-conversation-project" key={artifact.id} disabled={switchingDisabled} onClick={() => onOpenArtifact(artifact)}><MotionIcon name="film" /><span><strong>{artifact.title}</strong><small>Motion</small></span><MotionIcon name="arrow-up-right" size={14} /></button>)}
      {conversation && !artifacts.length && <button className="motion-button" disabled={switchingDisabled} onClick={() => void workspace.createArtifact(sessionId)}><MotionIcon name="plus" />{t('Create artifact')}</button>}
      {!conversation && !error && <p className="motion-conversation-status" role="status">{t('Loading conversation…')}</p>}
      {error && <div className="motion-conversation-status" role="alert">{error}{!conversation && <button className="motion-button" onClick={() => retry(value => value + 1)}>{t('Retry')}</button>}</div>}
      {feedback && <p className="motion-conversation-status" role="status">{feedback}</p>}
      {manualCopy && <textarea className="motion-manual-copy" aria-label={t('Agent instruction')} readOnly value={manualCopy} onFocus={event => event.target.select()} />}
    </div>
    <form className="motion-composer motion-conversation-composer" onSubmit={event => void save(event)}>
      <textarea maxLength={8000} aria-label={t('Creative request')} placeholder={t('Describe a change…')} value={draft} onChange={event => setDraft(event.target.value)} onKeyDown={submitShortcut} disabled={busy} />
      <div className="motion-composer-tools"><ModePicker /><button type="button" className="motion-button motion-button-quiet" onClick={openConnections}><MotionIcon name="plug" />Agent</button><button className="motion-icon-button motion-composer-submit" aria-label={t('Save request')} title={t('Save request')} disabled={busy || switchingDisabled || !conversation || !draft.trim()}><MotionIcon name="arrow-up" /></button></div>
    </form>
  </>;
}
